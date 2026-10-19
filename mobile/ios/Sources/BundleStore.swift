import Foundation

/// Authoritative local state. No CloudKit, accounts, or key material in source.
final class BundleStore {
    static let limit = 32 * 1024 * 1024
    private let file: URL
    private var readFailed = false
    init(directory: URL? = nil) throws {
        var folder = try directory ?? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("BankeCommunity", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try folder.setResourceValues(values)
        file = folder.appendingPathComponent("community-bundle.json")
    }
    private func validate(_ text: String) throws -> Data {
        guard let bytes = text.data(using: .utf8), bytes.count <= Self.limit,
              let value = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              value["version"] as? Int == 1, value["state"] is [String: Any], value["baseline"] is [String: Any] else {
            throw NSError(domain: "BankeStorage", code: 1)
        }
        return bytes
    }
    private func refuseLink() throws {
        if (try? FileManager.default.destinationOfSymbolicLink(atPath: file.path)) != nil { throw NSError(domain: "BankeStorage", code: 2) }
    }
    func read() throws -> String? {
        do {
            try refuseLink()
            guard FileManager.default.fileExists(atPath: file.path) else { return nil }
            let input = try FileHandle(forReadingFrom: file)
            defer { try? input.close() }
            let bytes = try input.read(upToCount: Self.limit + 1) ?? Data()
            guard bytes.count <= Self.limit, let text = String(data: bytes, encoding: .utf8) else { throw NSError(domain: "BankeStorage", code: 3) }
            _ = try validate(text)
            return text
        } catch { readFailed = true; throw error }
    }
    func save(_ text: String) throws {
        guard !readFailed else { throw NSError(domain: "BankeStorage", code: 4) }
        try refuseLink()
        let bytes = try validate(text)
        try bytes.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
