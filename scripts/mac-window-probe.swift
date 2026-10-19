import Foundation
import CoreGraphics
let pid = Int32(CommandLine.arguments[1])!
let windows = CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID) as? [[String: Any]] ?? []
let own = windows.filter { ($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == pid }.map { item -> [String: Any] in
 return ["layer": item[kCGWindowLayer as String] ?? 0, "onscreen": item[kCGWindowIsOnscreen as String] ?? false, "bounds": item[kCGWindowBounds as String] ?? [:]]
}
let data = try JSONSerialization.data(withJSONObject: own)
print(String(data: data, encoding: .utf8)!)
