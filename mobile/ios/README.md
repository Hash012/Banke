# 半刻 iPhone 社区版源码

与现有 Android 社区版共用 ../web 的手机 UI、空白 seed 和协议 1 加密同步。原生 Swift/UIKit/WKWebView 仅负责受限 LAN 请求和原子本地存储，没有账号或云服务。

本轮按用户确认只提供可自行签名源码。没有 Apple 开发者签名的 IPA 不能当作普通 iPhone 安装包；不以模拟器包冒充真机版。

## 在自己的 Mac 上运行

1. 克隆完整仓库并打开 mobile/ios/BankeCommunity.xcodeproj。
2. 在 Xcode 的 Signing & Capabilities 选择自己的 Personal Team 或开发团队。团队配置仅留自己的 Mac，不提交证书或私钥。若 bundle ID 被占用，为自己的构建使用独立 bundle ID。
3. 选择 iPhone 设备或 iOS 模拟器运行 BankeCommunity。真机需完成 Apple 要求的设备信任/开发者模式设置。
4. 首次不需要电脑即可保存日程。同步时允许“本地网络”权限，输入社区版电脑显示的地址，在两端核对八位数字并在电脑允许连接。

代码要求 iOS 15+；实际最低系统兼容与真实手机同步仍需在目标设备验证。正式 TestFlight/App Store 分发需具备对应 Apple 开发者条件并按 Apple 流程签名提交。本仓库不请求或上传你的 Apple 账号、签名密钥。

## 构建与边界

在仓库根目录执行 `python3 scripts/build_ios.py --simulator` 构建模拟器应用；`--device` 编译未签名的设备目标，仅校验源代码，不生成冒称可安装的 IPA。`--test` 在独立模拟器运行实际 WKWebView 和原生存储测试。最终结果见 docs/APPLE.md。

App 的 community-bundle.json 在自身 Application Support/BankeCommunity 内原子保存，包含日程与配对；目录排除系统云备份。数据损坏不自动覆盖。仅打包内主页面可调用桥接，不打开外部网站，不取消电脑端 Origin/CORS 校验，不重定向 LAN 请求。同步需 App 前台，不承诺锁屏持续后台同步。
