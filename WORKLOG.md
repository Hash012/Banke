# 开源通用版工作记录

## 2026-10-19：明确交付目标

- 用户确认：开源版必须与已实测正式版 1.3.2 的 UI、功能相同，只去除私人日程。此前按旧 README 保留 Go 普通窗口的方案已停止，不将其测试作为本版验收。
- 现有仓库已在本机 .local 完整备份，保留原提交记录。后续所有源码、工具、证据和构建位于本仓库；私人版未覆盖。
- 按白名单引入正式版应用代码与手机网页，排除私人 seed、真实 fixture、安装器和运行数据。替换为动态当前周空白 seed，测试仅使用合成安排。
- 新桌面应用 ID 为 org.banke.community.desktop，数据目录 BankeCommunity；手机为 org.banke.community.mobile，独立签名，可与原应用并存。另隔离开机启动项，测试参数拒绝保护目录。

## 构建与实测

- Windows 原生环境 10.0.26200，官方 Electron 44.9.0 摘要验证后构建；使用标准 electron-builder/NSIS，未复用私人安装器。
- Android 从公开 Java 编译；官方 SDK 35 / Build Tools 35.0.0 的下载摘要通过，官方 apksigner 和 aapt 验证通过。新签名仅保存在本机 .local。
- npm test：56 项，55 通过、0 失败、1 项因主机符号链接权限跳过。此结果不替代界面验收。
- 实际普通窗口显示相同 UI，初始安排为零。实际文件选择器 + 真实 Electron：导入预览、取消不改字节、确认前自动备份、错误 JSON 不覆盖、并发修订拒绝均通过。
- 真实 Windows 指针完成十轮桌面固定/返回；检查日志无 1400、preload 错误或渲染进程退出。前一轮因其他窗口遮挡安全停止，保留记录，未算作通过。另修正了报告脚本 UTF-8 读取与数组计数问题。
- 实际 TCP 同步启停通过。受控端口 50554 保持占用，47831 无法由测试进程绑定；应用回退成功，不结束占用者。一次重启监听从 57167 改用 57176，记录实际端口，未宣称各次都相同，也未确定原端口归属。
- 完整安装器已在独立测试路径实际执行，退出 0；安装后程序版本 1.3.2.0，ASAR 与候选一致。私人正式版程序及日程摘要未变化。
- 用户协助：新手机 APK UI 相同，首次空白；未连接电脑时成功新增并保存。后续双向、离线恢复和安装后覆盖测试另更新测试矩阵。


## 安装版与手机最终验收

- 实际执行标准 NSIS /S 安装到独立目录，核对已运行路径、版本 1.3.2.0 与 app.asar；未使用私人安装器。安装后系统文件选择器导入取消、提交、自动备份通过，十轮固定/返回和实际 Win+D 通过。
- 手机 Banke Community 与私人版/旧通用版并存。用户确认相同 UI、空白初始日程，以及未连接电脑时本地保存。两端八位数字一致后配对成功；未记录数字或密钥。实际新增在周一，保留实际时间而不冒称完成建议的周日测试。
- 真实 UI 将唯一合成安排改名，手机收到；手机断 Wi-Fi 改到 19:40–20:00、备注“离线回连”，恢复后电脑存档与手机一致。用户强行停止新通用版并重开后，无需重新配对，数据保留且同步成功。
- 正常退出后备份测试数据，再次执行同一完整安装包；安装前后 schedule.json 和 sync-state.json 字节不变。重开继续同一端口、手机同步成功。用户确认桌面模式物理触控板“显示桌面”手势后仍展开且有测试安排。
- 实际安装程序连续三次正常退出/冷启动，均有无遮挡原生窗口截图，日程/配对保留。完整便携 ZIP 独立解压实际启动为空白周计划，正常退出；应用 ASAR 与安装版一致。
- 使用真实安装界面删除唯一临时安排，配对保留；用户确认手机端删除同步成功。未删除其他应用中的任何安排。

## 独立构建、来源和发布边界

- 从白名单复制公开源码到全新独立目录，执行 npm ci --offline（预缓存官方 Electron ZIP）、npm test、npm run pack:win；重建 app.asar 与实测发行包摘要一致。随后修正运行时安装器的提取完成标记并单独复测成功，防止中断解压被当作完整安装。
- Android 使用官方 SDK/Build Tools 再从 Java 新建独立编译目录，官方签名校验通过，与实测 APK 的 11 个 DEX/manifest/资源/网页成员逐项一致、相同签名身份。ZIP 时间戳可能导致完整 APK 摘要不同，保留用户已实测的原成品。
- 生产 ASAR 与当前 26 个应用源码文件逐项相同，排除 diagnostic-main、测试和运行数据。源码白名单审计与打包脚本排除签名/存档；一次性私人 seed 指纹对比未发现真实 ID/长备注进入公开源码，未输出其内容。
- 本机工具仅修正过遮挡检测、UTF-8、JSON 数组计数和 OrderedDictionary 输出问题；这些报告问题未伪记为应用故障。便携测试的退出步骤由无匹配按钮改为原生窗口正常关闭，并实际确认退出。
- 常用实执行命令：npm test；npm run dist:win；node scripts/verify_desktop.cjs；python scripts/build_android.py（本机固定签名路径仅 .local）；powershell -File scripts/test-banke-installed-ui.ps1；powershell -File scripts/test-community-cold-start.ps1；powershell -File scripts/test-community-portable.ps1；powershell -File scripts/delete-installed-test.ps1；python scripts/audit_public.py；python scripts/package_release.py。
- 保留正式版的窗口表面先 showInactive 再 SetParent，以及 closed 回调避免访问已销毁 webContents 的修复。不将截图当作 GPU/WorkerW 根因证据，不单独改版本号出包。未发现需要另改这些已修复模块的实机失败。
- 当前只更新本地仓库和成品；未提交、推送或创建 GitHub Release。大 Windows 包留在 dist，需作为 Releases 附件分发。已移除当前下载位置的旧 Go/Mac 包，原文件留 .local 备份。未测项目完整列于 docs/TESTING.md。
## 授权公开发布与真实演示

- 用户明确要求“请提交并发布”，并要求 README 嵌入真实社区版视频或真实效果图片。此授权覆盖审阅后的合成演示媒体，不包括私人数据、密钥或原始桌面截图。
- 已通过本机 Git 凭据管理器验证 Hash012/Banke 的推送/发布权限；凭据仅在内存中使用。git fetch origin --tags 后本地与远端 main 一致，未发现他人新提交，v1.3.2 尚不存在。
- 创建独立演示目录和四条合成安排，实际安装程序经 UI Automation 完成列表、编辑、保存、返回周计划。原生 PrintWindow 录制 84 帧 / 16.8 秒 H.264，零空白/遗漏帧，抽帧目视确认。未连接手机、未更改私人课表或配对。
- 首两次录制脚本因屏幕遮挡或桌面子窗口定位失败而废弃；改用只捕获自身窗口的 PrintWindow，未移除应用功能。录制编码器使用本机 Windows Media Foundation 的 H.264；没有安装远控工具或额外编解码器。
- 仅将审核后的 GIF、应用截图与媒体来源说明纳入公开源码，完整 MP4 放 Release。README 用内嵌 GIF 预览链接 MP4，并更新为本轮直接下载地址。原始尝试、录制脚本和运行数据仍仅 .local 保存。
- 发布顺序：最终源码/附件审计与校验 → 提交及标签推送 → 草稿完整上传并核对摘要 → 公开发布 → 不带凭据重新下载核验。公开结果以实际 GitHub 页面为准，不以计划文字代替。
- 暂存检查将原生 CRLF 的 CR 误报为行尾空白；增加 .gitattributes 明确保留已核验源文件字节并允许 CRLF，仍检查实际行尾空格/文件尾空行。只移除一处测试文件末尾多余空行；应用源码和已测 ASAR 不变。

## 公开发布完成

- git commit 创建 cdaabc6；git push --atomic origin main refs/tags/v1.3.2 成功，未覆盖远端提交或改写已有标签。
- GitHub Actions 39259904664 的 Windows、Android 两项均 success，公开源码在远端实际构建通过。
- 本机发布辅助脚本执行 upload，六个附件均收到与本机一致的服务器 digest；确认完整后才 publish。期间修正辅助脚本从 stdin 执行时的目录解析，以及草稿更新说明后观察到 tag_name 变成 untagged 的元数据问题；校验拦截后，使用固定 Release ID 和显式完整字段恢复原有 v1.3.2 标签发布。未发布错误标签、未改应用包、未改写 Git 标签，历史 v1.1.0 未改动。
- 最终 Release ID 417321329，tag_name v1.3.2，draft false，Latest 为本版。执行 verify-public，完全不带凭据重新下载安装器、完整 ZIP、APK、源码 ZIP、MP4 和校验清单，六项 SHA-256 全部与本机一致。
- 公开 README 的 HTML 确有内嵌真实 GIF 与完整 MP4 链接；公开图片/README 原文与本机审阅版本一致。MP4 的 84 帧均解码通过；GIF 优化合并静止帧后 15 帧、仍为 16.8 秒，未将帧合并误记为画面遗漏。
- 录制用的两个独立演示进程均已通过界面正常退出，未结束其他进程。所有本地原始运行数据、发布凭据和签名保持未上传。
- 发布后只补交文档验收结果，使用 [skip ci] 避免对未改应用重复构建；v1.3.2 标签及已验证附件保持原字节。完整公开结果记录在 docs/PUBLISHED.md，本地逐项下载凭据仅留 .local/release-public-verification.json（不含认证信息）。
## Apple 测试版开发与授权

- 用户要求补充 macOS 和 iPhone；随后明确没有 Mac/Apple 开发者条件，选择先发布 Mac 测试版及可自行签名 iOS 源码。现有 v1.3.2 稳定标签和 Windows/Android 附件不变。
- 在 apple-preview-1.3.2 分支修改；旧源码已本机备份。macOS 使用独立 NSView/NSWindow 原生桌面层，普通编辑窗口不嵌入其他进程；尚未把此设计记为实机通过。
- npm test 仍为 55 通过、0 失败、1 跳过。原生 Apple Silicon 构建、源码逐项校验已通过；第一轮 Mac 打包应用运行测试过早读取初始化前的空状态而失败。修正测试等待真正 rendererReady/BankeView 后重新运行，不把编译成功当作运行成功。
- iOS 原生源码使用相同 mobile/web 与协议，增加同步保存的 WK 桥、原子存储和受限私网 URLSession；尚待 Xcode 编译、模拟器真实 WKWebView 运行。未生成、上传 Apple 证书或密钥。- Mac 复测 run 39263818991：Intel 与 Apple Silicon 均 success；实际 .app 编辑保存、五轮原生桌面层级/返回、正常重启保留数据全部通过。仍不是用户物理 Mac/Mission Control 验收。
- 将测试包改为无开发者身份的 ad-hoc 签名，并增加 codesign --verify --deep --strict 检查；不称为 Apple 签名或公证。为明确指定的合成证据目录允许上传隐藏路径，未开放 .local 整体上传。该打包变化需要重新原生运行验证。- iOS 首轮在确定性工程检查阶段停止：ElementTree 在 Windows 将 scheme 的换行转换为 CRLF，Mac 重生成产生差异，尚未进入 Swift 编译。改为显式写入 UTF-8 字节和 LF，保留严格 diff 检查重新跑。
- 添加 Xcode 用户状态、Apple 私钥/描述文件的忽略与公开包拒绝规则，不发布个人团队配置。
- Windows 共享入口回归前备份旧合成测试目录；首轮真实指针切换六轮通过，随后因其他窗口遮挡安全停止，不记十轮通过。后续改为不与其他需要审批的操作并行做图形测试。