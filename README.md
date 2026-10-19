# 半刻 Banke · 通用空白日程

**1.1.0 · 开源预览版 · 本机优先 · 同一 Wi-Fi 同步 · MIT**

从零条日程开始的七天周计划。工作、学习、课程、生活和休息都可以安排进去；每半小时一格，也保留 09:15、19:40 等准确分钟。

**不包含任何人的课程、地点、私人备份、设备凭据或签名私钥。不会自动读取或覆盖旧私人版的数据。**

> 发布状态：已在 Linux 构建环境完成源码构建、模型/接口/界面集成检查。Windows、Android、macOS 安装文件是**供试用的预览构建**，尚未在这四个平台的真实设备上完成验收。iOS 只有待签名的 Xcode 工程，不提供可任意安装的 IPA。不要把“编译成功”当作“所有设备都已验证”。具体见 [测试记录](docs/TESTING.md)。
>
> 同步安全：本版默认是 **HTTP + 配对授权，不是加密通信**。只适合你信任的私人 Wi-Fi。不要在公共/不可信网络上使用，不要把端口映射到互联网。云同步和锁屏后台持续同步不在本版范围内。

## 下载哪个文件

点击下表直接下载：Windows 为可直接运行的便携版 EXE（没有安装向导），Android 为可安装的 APK，均无需解压。Mac 当前仍提供 ZIP，尚未提供 DMG/PKG 安装包。GitHub 的“Code → Download ZIP”下载的是源码。

| 平台 | 直接下载 |
| --- | --- |
| Windows 10/11 x64 | [下载 Windows 程序（EXE）](https://github.com/Hash012/Banke/releases/download/v1.1.0/Banke-Windows.exe) |
| Android 8+，及仍兼容 APK 的鸿蒙 | [下载 Android 安装包（APK）](https://github.com/Hash012/Banke/releases/download/v1.1.0/Banke-Android.apk) |
| Apple Silicon Mac | [下载 Apple Silicon 版（ZIP，需解压）](https://github.com/Hash012/Banke/releases/download/v1.1.0/Banke-Mac-arm64.zip) |
| Intel Mac | [下载 Intel 版（ZIP，需解压）](https://github.com/Hash012/Banke/releases/download/v1.1.0/Banke-Mac-intel.zip) |
| iPhone / iPad | 暂无可直接安装的下载，见下方说明 |
| 源码 | [下载源码（ZIP）](https://github.com/Hash012/Banke/releases/download/v1.1.0/Banke-Source.zip) |

[发布详情](https://github.com/Hash012/Banke/releases/tag/v1.1.0) · [下载文件 SHA-256 校验清单](https://github.com/Hash012/Banke/releases/download/v1.1.0/SHA256SUMS.txt)

直接下载的 EXE/APK 请与上述 Release 校验清单核对；仓库根目录的 `SHA256SUMS.txt` 校验的是原始 ZIP 文件。

以下为原始压缩包内容和平台要求：

| 系统 | 交付文件 | 使用方式和限制 |
| --- | --- | --- |
| Windows 10/11 x64 | `Banke-Windows.zip` 内的 `Banke-Windows.exe` | 原生 Win32 便携程序，解压后双击；不需要浏览器、Python、Node 或 Go。未配置发布者代码签名。 |
| Android 8+，及仍兼容 APK 的鸿蒙 | `Banke-Android.zip` 内的 `Banke-Android.apk` | 本地 WebView 应用，已做 APK v2 签名；要求系统 WebView 支持现代 JavaScript/dialog。应用 ID 为 `org.banke.generic.sync`。不是鸿蒙 NEXT 原生 HAP。 |
| Apple Silicon Mac | `Banke-Mac-arm64.zip` 内的 `Banke.app` | macOS 13+，解压后移到“应用程序”；AppKit + WKWebView 独立窗口，内置本地 Go 服务。 |
| Intel Mac | `Banke-Mac-intel.zip` 内的 `Banke.app` | 同上，选择 Intel/amd64 架构，不要与 ARM 版混用。 |
| iPhone / iPad | `apple/BankeGeneric.xcodeproj` | iOS 16+；需在 Mac 上使用 Xcode 和自己的签名构建、安装或通过 TestFlight 分发。当前没有签名 IPA、App Store 页面或 TestFlight 邀请。 |
| iPhone 临时使用 | 用 Safari 打开电脑显示的局域网地址 | 能在电脑开着时编辑和同步。它是局域网页面，**不是已安装的原生 iOS App；HTTP 页面不保证离线启动**。 |
| 全部源码 | `Banke-Source.zip` | 包含本 README、所有应用代码、同步服务、打包工具、测试、许可证和 GitHub 工作流。 |

Mac 预览包没有 Developer ID 签名/公证。系统可能阻止打开；正式对外分发前，请在 Mac 上按 [构建与签名](docs/BUILD.md) 完成签名和公证。不要通过关闭整个系统的安全保护来安装。

## Windows：先恢复一个正常窗口

如果旧版还在桌面上显示一大片白色区域，先在任务管理器中退出旧 `Banke.exe`，再打开新的 `Banke-Windows.exe`。两者是不同的程序/数据目录。

这个版本**没有** Electron、WorkerW、SetParent、壁纸挂载、窗口置顶或隐藏任务栏的代码。它是普通 Windows 窗口，可拖到屏幕右侧、缩放并固定到任务栏；**按 Win+D 仍会像其他普通窗口一样最小化**。此前“贴在壁纸层、不随显示桌面最小化”的效果没有在本版继续提供。

点击表格空格新增，点击已有安排在下方编辑，点击“保存安排”提交。重叠安排的名称会同时显示；多次点击同一格可切换编辑对象。支持只修改/删除当前周、完成标记、JSON 导出/导入及修改第 1 周的周一日期。Windows 原生表格的外观与手机/Web 界面不同，深色主题与图形统计主要在 Web/手机/Mac 界面提供。

## 第一次手机—电脑配对

1. **两端使用本通用同步版 1.1.0**。旧通用版 1.0、旧私人版不使用这个协议，不能直接配对。
2. 手机、电脑连接同一个能够互相访问的私人 Wi-Fi。电脑打开半刻。
3. Windows 点击“手机同步”；Mac 点击顶部“设备同步”，再点击“开启局域网同步”。电脑显示 IPv4 地址和**六位数字**，配对码两分钟内有效、使用一次。
4. 手机打开“设备同步”，填写电脑显示的完整地址，例如 `http://192.168.1.5:47833`，输入六位配对码和手机名称，再点击“配对电脑”。
5. 返回日程，等到“已同步”。先做一条测试安排，确认两端都能看到，再录入重要内容。

为另一部手机生成新配对码即可。电脑每次重启软件后，局域网监听默认关闭；再次点击开启共享即可，原来的手机配对令牌仍保留，通常无需重新输入配对码。

**自动同步的条件：**电脑与半刻保持运行，局域网共享已开启，手机 App/页面在前台，网络互通。编辑后会尝试同步；前台每约三秒检查一次。编辑弹窗未保存时暂不刷新它，避免覆盖正在输入的草稿。

电脑关机、退出软件或断网时，手机仍可保存本机修改；连接恢复后继续同步。手机系统可能在切后台或锁屏后暂停应用，重新打开后继续同步，**不承诺锁屏时实时同步**。没有移动网络跨网同步、云端账号或手机互联发现服务。

### 同步怎么保护数据

- 初次配对执行合并，**空白手机不会清空电脑**。两端都有内容且第 1 周起点不同时，停止合并并提示，避免整体日期错位。
- 不同记录、同一记录的不同字段尽可能合并。同一字段冲突保留一个明确提示的副本；删除与修改冲突保留修改，不默默吞掉内容。
- 日程、适用周次、起点日期和完成标记同步；查看的周次、显示时段、主题保留在各自设备。
- 断线、无效回复、数据损坏或保存失败，不显示“已同步”。电脑存档写入成功后才确认请求。
- 电脑保存上一份有效 `.previous` 文件。客户端配对、导入、清空等操作前会保留最多五份本机安全副本；备份菜单中可恢复上一份。
- **导入/清空后产生的删除也会同步到其他设备。同步不是备份。**改动前先导出独立 JSON，重要日程另存一份。

## 备份、迁移与存档位置

标准 JSON 备份保持 `version:1`、`semesterStart`、`events` 等字段，可导入符合校验的旧半刻 JSON（最多第 52 周）。不会导出配对令牌。旧版升级请先导出 JSON，再显式导入；新应用不会扫描旧目录。

| 位置 | 文件/存储 |
| --- | --- |
| Windows | `%APPDATA%\BankeGenericSync\schedule-sync.json` 与 `.previous` |
| Mac | `~/Library/Application Support/BankeGenericSync/schedule-sync.json` 与 `.previous` |
| Android / iOS | 独立应用的私有 WebView/WKWebView 网站数据；卸载或清理应用数据会删除它 |
| 网页 | 当前浏览器、当前来源的 localStorage。换浏览器/设备/来源不会自动共享 |

Android 预览宿主不申请共享存储权限：导出提供可复制的完整 JSON；请在文本框长按全选复制并保存到安全位置。也可用“粘贴 JSON”导入。Apple 原生工程提供系统分享面板；Mac 提供保存对话框。系统文件选择器未弹出时可使用“粘贴 JSON”入口。

不要把 `schedule-sync.json` 当成普通日程备份公开发布；它包含日程空间信息和配对令牌哈希。恢复 `.previous` 前先退出程序并复制现有文件。损坏存档不会自动以空白覆盖。

## 下载或连接失败怎么检查

**下载失败，不等于软件安装失败。**优先下载 ZIP，保存后完整解压；不要把 GitHub HTML 页面改名成 EXE/APK，也不要把源码 ZIP 当安装包。

- 下载大小为 0、浏览器提示“文件不可用/链接过期”：重新取得该版本的 Releases 下载文件。聊天附件链接不适合作为长期公开下载地址。
- 安装时提示发布者/来源不明：本预览构建尚未取得 Windows/Mac 发行者信任；先核对 SHA-256 和来源。不要关闭全局安全防护。
- Android 提示“解析包失败”：确认是真正的 `.apk`，不是未解压的 ZIP、错误网页或截断下载；核对 Android/WebView 版本。鸿蒙 NEXT 不支持该 APK。
- 手机连不上：地址必须是电脑 Wi-Fi 的 IPv4，不是手机自己的地址、`127.0.0.1`、VPN/虚拟网卡地址。地址变化时使用“更新电脑地址”。
- Windows 防火墙和 macOS 本地网络/传入连接授权需要允许可信网络中的半刻。不要为所有公共网络开放。
- 校园网、访客 Wi-Fi、路由器“AP/客户端隔离”可能阻止两台同网设备互通；改用可互通的私人网络再测试。
- “端口被占用”：关闭另一份半刻/同步服务，不要启动两份写同一个数据目录的程序。程序用操作系统文件锁防止重复写入。
- `PLAN_START_CONFLICT`：先备份，将两端设置中的第 1 周日期调整一致，再同步。

校验示例：

```powershell
Get-FileHash .\Banke-Windows.exe -Algorithm SHA256
```

```sh
shasum -a 256 Banke-Mac-arm64.zip       # macOS
python3 scripts/check_downloads.py /path/to/downloads/SHA256SUMS.txt
```

校验只能检测文件是否与发布版本一致，不能代替发布者身份验证或真机测试。

## 源码结构

```text
cmd/windows/       原生 Win32 日程窗口（Go，无浏览器依赖）
cmd/mac/           AppKit + WKWebView 独立窗口（C/公开 ObjC runtime API）
cmd/server/        同步服务命令行入口（Go 标准库）
internal/planner/  共享模型、校验、三方合并
internal/syncserver/ HTTP 授权、一次性配对、存档和跨进程锁
web/               共同的空白日程界面、PWA、同步控制器
android/           Android Studio/Gradle Java 宿主完整工程
apple/             iPhone/iPad 的 SwiftUI + WKWebView Xcode 工程
scripts/           构建、复制资源、打包、校验及 UI 测试启动器
tools/             可读 DEX 源码/编码器、二进制资源、APK v2 签名/校验工具
tests/             Node/浏览器测试；Go 测试与实现放在相邻目录
docs/              协议、安全、平台构建、验收与 GitHub 发布说明
.github/           CI、发布草稿工作流、问题模板与依赖更新配置
```

没有把旧 APK 中的未知 `classes.dex` 塞进新安装包。此处提供 Android Java 宿主及对应的可读符号化指令源。当前离线环境的 APK 由公开的 `tools/` 编码器生成；GitHub 构建流程另外使用官方 SDK 编译 Java、运行 `apksigner verify`。详见 [构建说明](docs/BUILD.md)。

## 从源码开始（开发者）

基本日程和服务不依赖 npm。安装仍受支持的 Go 稳定版（源码语法要求 Go 1.23+），运行：

```sh
go test ./...
go run ./cmd/server
```

第二行会启动本机服务并打开浏览器；它是**开发/命令行使用方式**，不是 Windows 原生 EXE 必须做的步骤。默认只监听本机，打开页面后显式开启局域网共享。

Windows、Android、Mac、iPhone 构建、APK 稳定签名和 Apple 签名步骤见 [docs/BUILD.md](docs/BUILD.md)。

## 发布到你自己的 GitHub

解压 `Banke-Source.zip`，进入包含本 README 的 `banke/` 文件夹。只上传源码目录，不要把私人签名备份或自己的日程一起提交。

```sh
git init -b main
git add .
git commit -m "Initial open-source Banke planner"
gh auth login
gh repo create banke --public --source=. --remote=origin --push
```

不使用 GitHub CLI 时，也可新建空仓库并按 GitHub 提示添加 remote、推送。本项目没有替你创建远程仓库，也没有在你的账号中执行过 CI。

工作流会做模型测试、界面集成、Windows 原生启动冒烟测试、Android SDK 构建/签名验证、Mac 原生窗口加载测试和 iOS 模拟器目标编译。推送 `v*` 标签后，在测试通过、Android 稳定签名 Secrets 已配置的条件下，创建**待审核的 Release 草稿**。它不自动宣称软件已完成手机真机验收，也不生成无需 Apple 签名的 IPA。

详见 [GitHub 发布步骤](docs/GITHUB_RELEASE.md)。正式发布前完成 [验收清单](docs/RELEASE_CHECKLIST.md)。

## 功能边界

这是个人日程工具，不是多人协作权限系统。同一电脑日程空间中，所有已配对设备都有编辑权限。最多 20 台已配对设备；目前支持批量撤销，不提供单设备角色管理。

同步只接受私有 IPv4，不提供自动发现、IPv6、DNS 主机名或互联网远程访问。静态 HTTPS PWA 可离线使用，但浏览器可能阻止它访问 HTTP 局域网；**把 `web/` 部署到 GitHub Pages 并不等于获得可直接使用的跨设备云同步**。iPhone 当前即用入口是电脑运行期间的 LAN 页面；真正的离线 iOS App 必须安装签名后的原生工程。

## 许可证与贡献

应用代码和原创图标采用 [MIT](LICENSE)。Go 运行库的版权/许可证见 [third_party](third_party/)；系统 WebView、Apple 框架和构建工具由各平台提供，不作为本项目源码重新许可。欢迎报告可复现的问题，但请删除个人日程、IP、配对令牌及私钥。见 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [SECURITY.md](SECURITY.md)。
