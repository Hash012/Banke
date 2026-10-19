import XCTest
import UIKit
import WebKit
@testable import BankeCommunity

@MainActor
final class IOSAppSmokeTests: XCTestCase {
    private var host: PlannerViewController!
    override func setUp() async throws {
        for _ in 0..<100 {
            host = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }.compactMap { $0.rootViewController as? PlannerViewController }.first
            if host?.webView != nil { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTAssertNotNil(host?.webView)
        try await wait("!!window.BankeHost && document.getElementById('app').getAttribute('aria-busy') === 'false'")
    }
    private func js(_ source: String) async throws -> Any? {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Any?, Error>) in
            host.webView.callAsyncJavaScript("return await (" + source + ");", arguments: [:], in: nil, in: .page) { result in
                switch result {
                case .success(let value): continuation.resume(returning: value)
                case .failure(let error): continuation.resume(throwing: error)
                }
            }
        }
    }
    private func wait(_ source: String, seconds: Int = 18) async throws {
        let deadline = Date().addingTimeInterval(TimeInterval(seconds))
        while Date() < deadline {
            if (try? await js(source)) as? Bool == true { return }
            try await Task.sleep(nanoseconds: 200_000_000)
        }
        XCTFail("Actual WKWebView condition timed out")
        throw NSError(domain: "BankeSmoke", code: 1)
    }
    private func evidenceFolder() throws -> URL {
        let folder = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("AppleSmokeProof")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }
    private func snapshot(_ name: String) async throws {
        let image: UIImage = try await withCheckedThrowingContinuation { continuation in
            host.webView.takeSnapshot(with: nil) { image, error in
                if let image = image { continuation.resume(returning: image) }
                else { continuation.resume(throwing: error ?? NSError(domain: "BankeSnapshot", code: 1)) }
            }
        }
        guard let data = image.pngData() else { throw NSError(domain: "BankeSnapshot", code: 2) }
        try data.write(to: evidenceFolder().appendingPathComponent(name + ".png"))
    }
    func testNativeStorageAndNetworkGuards() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("banke-store-test-" + UUID().uuidString)
        let store = try BundleStore(directory: folder)
        let valid = "{\"version\":1,\"state\":{},\"baseline\":{}}"
        try store.save(valid)
        XCTAssertThrowsError(try store.save("invalid"))
        XCTAssertEqual(try store.read(), valid)
        for url in ["http://127.0.0.1:80/banke/v1/info", "http://8.8.8.8:80/banke/v1/info", "https://192.168.1.2:80/banke/v1/info", "http://192.168.1.2:80/other", "http://user@192.168.1.2:80/banke/v1/info", "http://192.168.1.2:80/banke/v1/info?x=1"] {
            XCTAssertThrowsError(try LANTransport.endpoint(url, method: "GET"))
        }
        XCTAssertNoThrow(try LANTransport.endpoint("http://192.168.1.2:47831/banke/v1/info", method: "GET"))
        XCTAssertThrowsError(try LANTransport.endpoint("http://192.168.1.2:47831/banke/v1/message", method: "GET"))
    }
    func testRealWebViewOfflinePersistenceAndEncryptedRoundtrip() async throws {
        let initialCount = try await js("window.BankeHost.loadState().state.events.length") as? Int
        let webCrypto = try await js("!!crypto.subtle") as? Bool
        XCTAssertEqual(initialCount, 0)
        XCTAssertEqual(webCrypto, true, "Actual WKWebView must support the shared encrypted protocol")
        try await snapshot("ios-initial-blank")
        _ = try await js("(()=>{document.getElementById('addEvent').click();document.getElementById('eventTitle').value='iOS simulator smoke';document.getElementById('eventStart').value='19:40';document.getElementById('eventEnd').value='20:00';document.getElementById('eventWeeks').value='1';document.getElementById('saveEvent').click();return true;})()")
        try await wait("window.BankeHost.loadState().state.events.length===1")
        try await snapshot("ios-offline-saved")
        host.webView.reload()
        try await wait("!!window.BankeHost && window.BankeHost.loadState().ok && window.BankeHost.loadState().state.events.length===1 && document.getElementById('app').getAttribute('aria-busy')==='false'")
        let source = Bundle(for: Self.self).url(forResource: "apple-test-config", withExtension: "json")!
        let runtime = try JSONSerialization.jsonObject(with: Data(contentsOf: source)) as! [String: Any]
        var paired = false
        if let address = runtime["address"] as? String, !address.isEmpty {
            let literal = String(data: try JSONSerialization.data(withJSONObject: address, options: [.fragmentsAllowed]), encoding: .utf8)!
            let pairedOK = try await js("(async()=> (await window.BankeHost.pair(" + literal + ")).ok)()") as? Bool
            XCTAssertEqual(pairedOK, true)
            try await wait("(async()=> {await window.BankeHost.syncNow();const s=await window.BankeHost.getSyncStatus();return s.paired&&s.phase==='connected';})()", seconds: 30)
            try await wait("(async()=> {await window.BankeHost.syncNow();return window.BankeHost.loadState().state.events[0].title==='iOS desktop roundtrip';})()", seconds: 25)
            paired = true
        }
        let result: [String: Any] = ["nativeWKWebView": true, "blankFirstRun": true, "offlineUISave": true, "diskPersistenceAfterWebViewReload": true, "webCryptoAvailable": true, "actualEncryptedDesktopRoundtrip": paired, "scope": "iOS Simulator; not a physical iPhone"]
        try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys]).write(to: evidenceFolder().appendingPathComponent("ios-results.json"))
    }
}
