# 半刻 Banke · 把日子安排得刚刚好

**Windows / Android 1.3.4 · 文本识别导入 · 莲花桌宠 · 默认空白日程 · MIT**

桌面端保留周计划、课程与安排、待核对、分钟精度、撤销、JSON/CSV/HTML 导出、备份导入、打印、桌面右半屏挂件、返回普通窗口、任务栏/托盘和局域网加密同步。手机版使用同一正式版的手机界面，可先离线编辑，再与电脑配对同步。

通用版只移除了私人初始课表和个性化数据，并分离应用标识、存档、配对与开机启动项。首次打开没有课程，不扫描、不读取、不迁移私人版的数据。

## 文本识别导入

Windows 左栏点击 **文本识别导入**；手机在顶部点击同名按钮。粘贴文字，点击“识别并预览”，可逐条修改名称、星期、起止时间、周次、类型和地点，勾选后确认导入。取消预览不会写入日程。

```text
第1-16周（单周）
周一、周三 09:00-10:00 数学 @A楼
明天下午三点到五点 项目讨论
周五 写报告（时间待定）
```

支持中文或数字时间、明确日期、今天／明天／后天、本周／下周、多个星期及单双周。相对日期按北京时间计算；未写周次暂用当前查看周，并标记待核对。复杂自然语言可能识别不全，请检查预览。

- 时间完整但有疑点：加入日程表，同时显示在“待核对”；核实后可清除标记。
- 缺名称、日期、起止时间或有效周次：只保留待补全草稿，不编造时间占用网格；在“待核对”补齐并预览后加入。
- 同名、同星期、同时间、同地点的重复周次自动跳过；只补上尚未存在的周次。
- 草稿仅保存在当前设备，补齐成为日程后按原配对同步。电脑版草稿独立存储；手机草稿保存在应用 WebView 本地存储。

本版采用**离线规则解析**，不调用人工智能，不发送输入内容，不需要 DeepSeek API Key；暂不提供 DeepSeek 配置。

![文本导入：真实 Windows 原生窗口中的合成预览](docs/media/text-import-desktop.png)

## 莲花桌宠 · 念念相续

Windows 1.3.3 新增禅意莲花桌宠。点击右上角 **❀** 或桌面菜单中的“莲花桌宠与提醒”，勾选开启后保存。开始、结束提醒可分别开关，分别设置提前 **0–1440 分钟**，默认开始前 **5 分钟**、结束前 **1 分钟**；0 表示准时提醒。

莲花可拖动并记住位置，透明区域可点击穿透，也可单独选择是否悬浮在其他窗口上方。提醒按真实日期与适用周次触发，跳过已完成安排，多条提醒逐条确认，退出重开不会重复提醒。设置仅保存在当前电脑版；半刻运行时才提醒。原桌面右半屏日程挂件继续保留。

![Windows 1.3.3 莲花桌宠“念念相续”，真实打包程序内的合成提醒截图](docs/media/lotus-desktop.png)

截图来自本机 Windows 运行实际打包程序，日程为合成记录；不是私人日程。升级前正常退出旧版，再运行完整安装包，已有通用版日程和配对保留。实测方式与未测项目见 [TESTING](docs/TESTING.md)。

## 真实使用演示

下方是 **Windows 实际安装的社区版 1.3.2** 的操作动图；点击可打开完整 MP4 视频。演示日程全部为合成示例，首次安装仍为空白。展示：周计划 → 课程列表 → 修改安排 → 保存后返回周计划。

[![半刻社区版实机操作演示，点击打开完整视频](docs/media/community-demo.gif)](https://github.com/Hash012/Banke/releases/download/v1.3.2/Banke-Community-Demo-1.3.2.mp4)

[观看或下载完整视频（16.8 秒，无音轨）](https://github.com/Hash012/Banke/releases/download/v1.3.2/Banke-Community-Demo-1.3.2.mp4) · [查看真实截图](docs/media/community-desktop.png) · [录制来源](docs/media/README.md)

## 下载与安装

从 [v1.3.4 正式下载页](https://github.com/Hash012/Banke/releases/tag/v1.3.4) 获取新版 Windows 完整安装包，或点击下表直接下载。本次同步更新 Windows 和 Android；Android 沿用稳定签名，保留原应用数据。校验与实测边界见 [发布记录](docs/RELEASE.md)。**旧 v1.1.0 Release 是不同界面、不同协议的 Go 预览版，不是此版本；不要混装配对。**

| 文件 | 用途 |
| --- | --- |
| [Banke-Community-Setup-1.3.4-x64.exe](https://github.com/Hash012/Banke/releases/download/v1.3.4/Banke-Community-Setup-1.3.4-x64.exe) | Windows 10/11 x64 完整离线安装包，含文本导入与莲花桌宠；不需要浏览器、Node、Python 或 Go；可选择安装目录 |
| [Banke-Community-1.3.4-Windows-x64.zip](https://github.com/Hash012/Banke/releases/download/v1.3.4/Banke-Community-1.3.4-Windows-x64.zip) | Windows 完整便携包；完整解压后启动 `BankeCommunity.exe` |
| [Banke-Community-Android-1.3.4.apk](https://github.com/Hash012/Banke/releases/download/v1.3.4/Banke-Community-Android-1.3.4.apk) | Android 8+、仍兼容 APK 的 HarmonyOS；不是 HarmonyOS NEXT 原生 HAP |
| [Banke-Source.zip](https://github.com/Hash012/Banke/releases/download/v1.3.4/Banke-Source.zip) | 1.3.4 完整公开源码与构建、测试说明 |
| [SHA256SUMS.txt](https://github.com/Hash012/Banke/releases/download/v1.3.4/SHA256SUMS.txt) | 1.3.4 Windows、Android 与源码成品 SHA-256 校验清单 |

Windows 包超过 GitHub 普通文件大小上限，应作为 Releases 附件分发；不要提交大 EXE、拆包让用户拼接，或把 Git LFS 指针当成可执行程序。代码仓库直接包含可构建源码。Windows 未配置发布者代码签名。

macOS 与 iPhone 的补充状态见下方 Apple 测试版；其附件仍为 1.3.2 独立预览，尚未包含本次莲花桌宠实机验收。仓库根目录 `Banke-Source.zip` 为 1.3.4 源码快照，Android 签名保持不变，根目录 `Banke-Android.apk` 为 1.3.4。

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
