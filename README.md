# 半刻 Banke · 把日子安排得刚刚好

**1.3.2 通用版 · 与已验收正式版相同的 UI 和功能 · 默认空白日程 · MIT**

桌面端保留周计划、课程与安排、待核对、分钟精度、撤销、JSON/CSV/HTML 导出、备份导入、打印、桌面右半屏挂件、返回普通窗口、任务栏/托盘和局域网加密同步。手机版使用同一正式版的手机界面，可先离线编辑，再与电脑配对同步。

通用版只移除了私人初始课表和个性化数据，并分离应用标识、存档、配对与开机启动项。首次打开没有课程，不扫描、不读取、不迁移私人版的数据。

## 真实使用演示

下方是 **Windows 实际安装的社区版 1.3.2** 的操作动图；点击可打开完整 MP4 视频。演示日程全部为合成示例，首次安装仍为空白。展示：周计划 → 课程列表 → 修改安排 → 保存后返回周计划。

[![半刻社区版实机操作演示，点击打开完整视频](docs/media/community-demo.gif)](https://github.com/Hash012/Banke/releases/download/v1.3.2/Banke-Community-Demo-1.3.2.mp4)

[观看或下载完整视频（16.8 秒，无音轨）](https://github.com/Hash012/Banke/releases/download/v1.3.2/Banke-Community-Demo-1.3.2.mp4) · [查看真实截图](docs/media/community-desktop.png) · [录制来源](docs/media/README.md)

## 下载与安装

从 [v1.3.2 正式下载页](https://github.com/Hash012/Banke/releases/tag/v1.3.2) 获取完整安装包，或点击下表直接下载。校验与实测边界见 [发布记录](docs/RELEASE.md)。**旧 v1.1.0 Release 是不同界面、不同协议的 Go 预览版，不是此版本；不要混装配对。**

| 文件 | 用途 |
| --- | --- |
| [Banke-Community-Setup-1.3.2-x64.exe](https://github.com/Hash012/Banke/releases/download/v1.3.2/Banke-Community-Setup-1.3.2-x64.exe) | Windows 10/11 x64 完整离线安装包，内含运行时，不需要浏览器、Node、Python 或 Go；可选择安装目录 |
| [Banke-Community-1.3.2-Windows-x64.zip](https://github.com/Hash012/Banke/releases/download/v1.3.2/Banke-Community-1.3.2-Windows-x64.zip) | Windows 完整便携包；完整解压后启动 `BankeCommunity.exe` |
| [Banke-Community-Android-1.3.2.apk](https://github.com/Hash012/Banke/releases/download/v1.3.2/Banke-Community-Android-1.3.2.apk) | Android 8+、仍兼容 APK 的 HarmonyOS；不是 HarmonyOS NEXT 原生 HAP |
| [Banke-Source.zip](https://github.com/Hash012/Banke/releases/download/v1.3.2/Banke-Source.zip) | 完整公开源码与构建、测试说明 |
| [SHA256SUMS.txt](https://github.com/Hash012/Banke/releases/download/v1.3.2/SHA256SUMS.txt) | 成品 SHA-256 校验清单 |

Windows 包超过 GitHub 普通文件大小上限，应作为 Releases 附件分发；不要提交大 EXE、拆包让用户拼接，或把 Git LFS 指针当成可执行程序。代码仓库直接包含可构建源码。Windows 未配置发布者代码签名。

macOS 与 iPhone 的补充状态见下方 Apple 测试版；Windows/Android 稳定版继续使用上表附件。仓库根目录 `Banke-Source.zip` 保留稳定版源码快照，Apple 源码从独立测试发行下载。

## Apple 测试版

[Apple 预览发行页](https://github.com/Hash012/Banke/releases/tag/v1.3.2-apple-preview.1) · [Apple 构建与验收](docs/APPLE.md) · [iPhone 自行签名说明](mobile/ios/README.md)

| 平台 | 下载 | 状态 |
| --- | --- | --- |
| Mac Apple Silicon（M 系列） | [DMG](https://github.com/Hash012/Banke/releases/download/v1.3.2-apple-preview.1/Banke-Community-1.3.2-macOS-arm64-preview.dmg) / [ZIP](https://github.com/Hash012/Banke/releases/download/v1.3.2-apple-preview.1/Banke-Community-1.3.2-macOS-arm64-preview.zip) | 原生 arm64 构建机运行通过；测试版 |
| Mac Intel | [DMG](https://github.com/Hash012/Banke/releases/download/v1.3.2-apple-preview.1/Banke-Community-1.3.2-macOS-x64-preview.dmg) / [ZIP](https://github.com/Hash012/Banke/releases/download/v1.3.2-apple-preview.1/Banke-Community-1.3.2-macOS-x64-preview.zip) | 原生 Intel 构建机运行通过；测试版 |
| iPhone | [完整 Xcode 源码](https://github.com/Hash012/Banke/releases/download/v1.3.2-apple-preview.1/Banke-Community-Apple-Source-1.3.2-preview.1.zip) | 在自己的 Mac/Xcode 选择团队签名安装；本轮不提供可直接安装的 IPA |

Mac 包使用 ad-hoc 完整性签名，未经过 Developer ID 签名或 Apple 公证，首次下载可能被系统拦截。确认来源和摘要后，可参照 [Apple 官方说明](https://support.apple.com/zh-cn/102445) 对单个 App 选择“仍要打开”。安装时将 App 拖入“应用程序”，保留本机日程目录。构建目标为 macOS 12+，目前原生运行验证为 macOS 15；个人设备、Mission Control/触控板、登录启动和 Gatekeeper 首次打开仍待验证。

下图为原生 macOS 构建机运行实际打包 App 的内部截图，初始日程为空；截图来源和测试边界见 [Apple 验收](docs/APPLE.md)。

![macOS 社区版原生运行截图（CI 内部窗口截图）](docs/media/macos-native-ci.png)

## 独立数据与并存

| 应用 | 数据与身份 |
| --- | --- |
| Windows 通用版 | `%APPDATA%\BankeCommunity`；程序 `BankeCommunity.exe`；应用 ID `org.banke.community.desktop` |
| macOS 通用版 | `~/Library/Application Support/BankeCommunity`；应用 ID `org.banke.community.desktop` |
| iOS 源码版 | 应用 ID `org.banke.community.ios`；自身沙盒内原子本地存储，排除系统云备份 |
| Android 通用版 | 应用 ID `org.banke.community.mobile`；日程和配对保存在该应用独立的私有文件中 |
| 私人版 | 保持自己的安装、数据和配对，不会被通用版自动导入或覆盖 |
| 旧 Go 预览版 | 不同应用与协议；不是原地覆盖升级，需用户显式导出 JSON 后再选择导入 |

升级或卸载 Windows 通用版不会主动清理日程。不要手动删除 AppData、手机应用数据或配对文件来排查故障。同步不是备份；重要编辑前请导出独立 JSON。Windows 导入会先预览、独立备份当前日程，再检查修订号提交；取消、错误文件或预览后有新编辑时不覆盖。

## 手机同步

1. 安装本通用版电脑端和手机端，两端连接可互通的可信私人 Wi-Fi。Mac/iPhone 先阅读上方测试版说明；首次连接允许系统本地网络权限。
2. 电脑打开“手机自动同步”，开启局域网同步，再点击“允许新手机配对 · 2 分钟”。
3. 手机填写电脑显示的完整 IPv4 地址，点击连接。地址应包含实际端口，不要固定抄写旧地址。
4. 在两台设备上核对八位数字一致，再在电脑允许连接。不要把数字或密钥发给别人。
5. 手机保持半刻在前台。编辑先保存本机，再自动双向同步；断网时继续本地保存，恢复连接后补同步。

使用与正式版相同的协议 1：P-256 配对、HKDF 派生密钥、AES-256-GCM 消息及持久化序列号。保留本机/局域网与授权边界，不开放浏览器 CORS，也不关闭防火墙。只在可信局域网使用，不提供公网、云账号或锁屏后台实时同步保证。

电脑会记忆成功端口；若端口已被占用或系统保留，会选择其他可用端口并显示实际地址，不结束占用者。此时在手机更新电脑地址即可，保留原配对。IP 地址或端口变化后旧地址不会自动发现。

## 构建与验证

```powershell
npm ci
npm test
npm start
npm run dist:win
```

构建需要 Node 22.12+ 和联网；使用锁文件固定依赖。首次 `npm ci` 下载官方 Electron 并核对 npm 包内 SHA-256。Windows 普通用户运行成品无需这些开发工具。Android 的官方 SDK/Java 构建与签名方法见 [BUILD](docs/BUILD.md)。

测试结果区分逻辑回归、真实 Electron/Win32、实际完整安装和用户协助的手机测试。单元测试或解包通过不代表实机通过。参见 [TESTING](docs/TESTING.md)、[WORKLOG](WORKLOG.md) 和 [安全说明](SECURITY.md)。