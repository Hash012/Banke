import UIKit
import WebKit

private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: PlannerViewController?
    init(_ target: PlannerViewController) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) { target?.receive(message) }
}

final class PlannerViewController: UIViewController, WKUIDelegate, WKNavigationDelegate {
    private(set) var webView: WKWebView!
    private var entry: URL?
    private var store: BundleStore?
    private var network: LANTransport?
    deinit { network?.stop() }
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.965, green: 0.961, blue: 0.941, alpha: 1)
        do { store = try BundleStore() } catch { showFailure("无法访问手机存储，原日程未修改。"); return }
        guard let web = Bundle.main.url(forResource: "web", withExtension: nil),
              let bridge = Bundle.main.url(forResource: "bridge", withExtension: "js"),
              let source = try? String(contentsOf: bridge, encoding: .utf8) else { showFailure("安装资源不完整，请重新从原来源安装；不要清理手机数据。"); return }
        entry = web.appendingPathComponent("index.html").standardizedFileURL
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.userContentController.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController.add(WeakMessageHandler(self), name: "banke")
        webView = WKWebView(frame: .zero, configuration: config)
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor), webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        webView.loadFileURL(entry!, allowingReadAccessTo: web)
    }
    private func trusted(_ frame: WKFrameInfo) -> Bool {
        guard frame.isMainFrame, let url = frame.request.url, url.isFileURL,
              url.query == nil, url.host == nil || url.host == "" || url.host == "localhost", let entry = entry else { return false }
        return url.standardizedFileURL.path == entry.path
    }
    private func json(_ value: Any) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]), let text = String(data: data, encoding: .utf8) else { return "null" }
        return text.replacingOccurrences(of: "\u{2028}", with: "\\u2028").replacingOccurrences(of: "\u{2029}", with: "\\u2029")
    }
    private func showFailure(_ message: String) {
        let label = UILabel()
        label.text = message
        label.numberOfLines = 0
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([label.centerYAnchor.constraint(equalTo: view.centerYAnchor), label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24), label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24)])
    }
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        guard prompt == "__banke_community_native_v1__", trusted(frame), let store = store,
              let raw = defaultText?.data(using: .utf8), raw.count <= BundleStore.limit + 1024,
              let call = try? JSONSerialization.jsonObject(with: raw) as? [String: Any], let operation = call["operation"] as? String else { completionHandler(nil); return }
        do {
            switch operation {
            case "load": completionHandler(try store.read() ?? "")
            case "save":
                guard let value = call["value"] as? String else { throw NSError(domain: "BankeBridge", code: 1) }
                try store.save(value)
                completionHandler(json(["ok": true]))
            case "device": completionHandler(UIDevice.current.model)
            default: completionHandler(nil)
            }
        } catch { completionHandler(json(["ok": false, "error": "无法读取或保存手机日程，原文件已保留。请先保留备份再重试。"] )) }
    }
    func receive(_ message: WKScriptMessage) {
        guard message.name == "banke", trusted(message.frameInfo), let body = message.body as? [String: String], let id = body["id"], let text = body["text"] else { return }
        if network == nil { network = LANTransport { [weak self] id, result in DispatchQueue.main.async { self?.deliver(id: id, result: result) } } }
        network?.request(id: id, payload: text)
    }
    private func deliver(id: String, result: [String: Any]) {
        guard let webView = webView, let url = webView.url, url.isFileURL, url.standardizedFileURL.path == entry?.path else { return }
        webView.evaluateJavaScript("window.__bankeNativeResult && window.__bankeNativeResult(" + json(id) + "," + json(json(result)) + ")", completionHandler: nil)
    }
    func becameActive() { webView?.evaluateJavaScript("window.dispatchEvent(new Event('banke:active'))", completionHandler: nil) }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard action.targetFrame?.isMainFrame == true, let url = action.request.url, url.isFileURL, url.query == nil, url.standardizedFileURL.path == entry?.path else { decisionHandler(.cancel); return }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, createWebViewWith config: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { return nil }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { showFailure("手机界面未能载入，原日程已保留。请重新打开半刻。") }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }
}
