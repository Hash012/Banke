import Foundation

/// Only native, bounded private-IPv4 protocol-1 traffic. Browser CORS stays shut.
final class LANTransport: NSObject, URLSessionDataDelegate, URLSessionTaskDelegate {
    static let limit = 40 * 1024 * 1024
    struct Pending {
        let id: String
        var data = Data()
        var status = 0
        var failure: String?
    }
    private let lock = NSLock()
    private var pending: [Int: Pending] = [:]
    private var session: URLSession!
    private let deliver: (String, [String: Any]) -> Void
    init(deliver: @escaping (String, [String: Any]) -> Void) {
        self.deliver = deliver
        super.init()
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 8
        config.timeoutIntervalForResource = 9
        config.waitsForConnectivity = false
        config.httpMaximumConnectionsPerHost = 2
        config.httpCookieStorage = nil
        config.urlCredentialStorage = nil
        config.urlCache = nil
        config.connectionProxyDictionary = [:]
        let queue = OperationQueue()
        queue.maxConcurrentOperationCount = 1
        session = URLSession(configuration: config, delegate: self, delegateQueue: queue)
    }
    static func endpoint(_ text: String, method: String) throws -> URL {
        guard let c = URLComponents(string: text), c.scheme == "http", c.user == nil, c.password == nil,
              c.query == nil, c.fragment == nil, let host = c.host, let port = c.port, (1...65535).contains(port),
              ["GET", "POST"].contains(method),
              ["/banke/v1/info", "/banke/v1/pair/request", "/banke/v1/message"].contains(c.percentEncodedPath),
              (method == "GET") == (c.path == "/banke/v1/info") else { throw URLError(.badURL) }
        let parts = host.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 4 else { throw URLError(.badURL) }
        let octets = parts.compactMap { Int($0) }
        guard octets.count == 4, octets.allSatisfy({ (0...255).contains($0) }),
              zip(parts, octets).allSatisfy({ String($0.0) == String($0.1) }),
              octets[0] == 10 || octets[0] == 192 && octets[1] == 168 || octets[0] == 172 && (16...31).contains(octets[1]),
              let url = c.url else { throw URLError(.badURL) }
        return url
    }
    func request(id: String, payload: String) {
        guard id.range(of: "^[a-f0-9]{40}$", options: .regularExpression) != nil else { return }
        do {
            guard let bytes = payload.data(using: .utf8), bytes.count <= Self.limit + 2 * 1024 * 1024,
                  let value = try JSONSerialization.jsonObject(with: bytes) as? [String: String],
                  let address = value["url"], let method = value["method"] else { throw URLError(.badURL) }
            var request = URLRequest(url: try Self.endpoint(address, method: method), cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
            request.httpMethod = method
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            if method == "POST" {
                let body = Data((value["body"] ?? "").utf8)
                guard body.count <= Self.limit else { throw URLError(.dataLengthExceedsMaximum) }
                request.httpBody = body
                request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
            }
            lock.lock()
            guard pending.count < 6 else { lock.unlock(); throw URLError(.resourceUnavailable) }
            let task = session.dataTask(with: request)
            pending[task.taskIdentifier] = Pending(id: id)
            lock.unlock()
            task.resume()
        } catch { deliver(id, ["ok": false, "error": "暂时无法连接电脑，本机编辑已保留。请检查同一 Wi-Fi 与本地网络权限。"] ) }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        lock.lock()
        if pending[dataTask.taskIdentifier] != nil {
            pending[dataTask.taskIdentifier]?.status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if response.expectedContentLength > Int64(Self.limit) { pending[dataTask.taskIdentifier]?.failure = "电脑响应超过大小限制，未改动手机日程。" }
        }
        let tooLarge = response.expectedContentLength > Int64(Self.limit)
        lock.unlock()
        completionHandler(tooLarge ? .cancel : .allow)
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        lock.lock()
        var tooLarge = false
        if var item = pending[dataTask.taskIdentifier] {
            if item.data.count + data.count > Self.limit { item.failure = "电脑响应超过大小限制，未改动手机日程。"; tooLarge = true }
            else { item.data.append(data) }
            pending[dataTask.taskIdentifier] = item
        }
        lock.unlock()
        if tooLarge { dataTask.cancel() }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        lock.lock()
        let item = pending.removeValue(forKey: task.taskIdentifier)
        lock.unlock()
        guard let item = item else { return }
        if let failure = item.failure { deliver(item.id, ["ok": false, "error": failure]); return }
        guard error == nil, let body = String(data: item.data, encoding: .utf8) else {
            deliver(item.id, ["ok": false, "error": "暂时无法连接电脑，本机编辑已保留；请检查本地网络权限。"]); return
        }
        let ok = (200...299).contains(item.status)
        var result: [String: Any] = ["ok": ok, "status": item.status, "body": body]
        if !ok { result["error"] = "电脑返回状态 " + String(item.status) }
        deliver(item.id, result)
    }
    func stop() { session.invalidateAndCancel() }
}
