# Apple 测试版（准备中）

用户已确认没有 Mac 和 Apple 开发者签名条件，本轮目标为 Mac 测试版与可自行签名的 iOS 源码。既有 Windows/Android v1.3.2 稳定发行保持原字节。

macOS 使用同一 Electron 界面及空白初始日程，分别构建 Apple Silicon、Intel 的 DMG/ZIP。原生桌面层使用自身 NSView 对应的 NSWindow 桌面级别，不把窗口置顶；普通窗口独立保留，固定失败可返回。尚待原生 macOS 构建与运行验证，不将此段设计写成通过。

iOS 源码和 Xcode 构建/模拟器验收继续补充。本机 Windows 不具备 Xcode，不声称完成用户 Apple 设备实测。无开发者签名时不提供冒充可直接安装的 IPA，不自动上传 Apple 凭据或密钥。
