# 通用版验收

## 2026-10-20：README 文字核对

按用户要求将正文改为完整、连贯的段落，保留所有 27 个原有链接目标。本地核对已确认图片和文档引用存在，两个文字导入示例能由当前解析器正确识别；公开源码白名单审计和 git diff --check 通过。本轮为文案调整，没有重新构建程序或重跑界面验收，应用测试结果仍按以下各节的实际范围记录。

## 2026-10-20：独立私有手机新应用

用户要求在缺旧签名的情况下开发新应用。本机生成可安装的 `dist/private-mobile-new-1.3.4/Banke-Private-New-Android-1.3.4.apk`，名称“半刻私有版·新”、包名 `cn.banke.personal.mobile`、版本 1.3.4／134；不覆盖旧私有版或通用版。Android 原生 Java 与完整网页源码保存在 `.local/private-mobile/personal-app`，固定签名与本机备份独立保存；交付源码 ZIP 和校验清单不含密钥。未上传新私有成品、工程、签名或测试数据。

- 官方 javac／D8／aapt2／zipalign 构建、apksigner v2／v3 校验通过；aapt 确认新身份、标签和 Activity。12 个 APK 网页资源逐字节匹配工程，首次空白，无旧 APK 课表或存档。APK SHA-256 `f8d171e7d436ff3a39d29c20d6e32d1ca44eecc26bd65fc2e16dcac02ed4c3b5`。
- 新应用证书 SHA-256 `5bcd36e287e84e8c208d08b93b6ca31f7b75e0c59ecf347a8d319a4e8652d765`，与旧私有及通用身份不同，固定本机签名双份字节一致；旧私有 APK SHA 未变。源码 ZIP 20 个文件、CRC 及签名排除项通过。`validation.json` 与 SHA256SUMS.txt 同目录。
- 无 Computer Use。Windows 原生 Electron 手机宽度窗口运行 APK 中实际解出的页面，使用合成文件存储桥；私有新版提示、离线文本导入、待补全、重载保存、移除计数、返回键释放 inert、无横向溢出通过，截图已目视核对。证据 `.local/text-mobile-personal-1792460896719/result.json`。这不是 Android 安装或触摸验收。
- 实际新 APK 的 adapter／WebCrypto 与私有电脑版同步服务代码、临时随机端口 HTTP 服务在独立合成目录往返：两端八位数字相同、允许新配对、手机离线导入与电脑原有合成记录合并、缺时间草稿仅留手机、电脑改名回传、adapter 重载后配对和日程保留均通过。证据 `.local/personal-sync-1792460983054/result.json`。原生传输桥为 Node 测试替身；虽然经过本机内网接口，仍不等于手机 Wi-Fi 真机验收。没有连接实际用户服务、改动正式数据或原配对。
- 初次集成测试桥把宿主 JSON 对象送给 VM 的严格原型校验器，导致模拟保存失败，后续断言拿到 undefined；改用宿主同 realm 的校验器后通过。修复的是测试桥，生产 Java／网页逻辑未因此放宽。
- 原通用版默认构建回归：真实重编、身份仍为 `org.banke.community.mobile`、稳定证书与资源校验通过；验证 APK 仅在 `.local/personal-apk-native-test`，已发布 1.3.4 附件和根目录 APK 未替换。`npm test` 73 项，72 通过、1 符号链接权限跳过。
- 交付工程的 BUILD.ps1 已实际重建成功，使用原新私有签名，不生成替代密钥；重建后包名、版本、Activity、资源及证书摘要仍相同。生成物只留工程自己的 dist，交付主 APK 未替换。证书摘要保护与本机签名备份可供后续同身份升级；未冒称已完成 Android 覆盖安装验收。

2026-10-20 用户在收到新私有手机版 APK 与安装配对步骤后回复“已测试通过”，据此记录为用户实机验收通过。用户未逐项说明设备型号、系统版本或测试步骤，不单独声称权限弹窗、软键盘、后台同步等每项均已覆盖。工具没有操作手机，之前的 Windows／合成测试证据仍按原范围保留。

旧手机未同步的编辑应先同步至私有电脑版，再在新应用手动配对，完成后点“回到今天”。旧应用保留作对照，不自动迁移数据。

## 2026-10-20：1.3.4 文本导入验收

无 Computer Use。Windows 原生 Electron 运行两版源码的真实渲染器／preload／IPC；DOM 自动化与内部截图不等于物理输入或 Android 真机验收。

- `npm test`：73 项，72 通过、0 失败、1 因符号链接权限跳过。新增 9 项覆盖中文时间、日期与参考周、单双周、多星期、缺字段／非法日期／跨日草稿、重复和部分覆盖周次、大小限制、损坏与失败保存、独立原子存储及两端模块一致。
- 两版原生源码：预览前未写日程；2 条有效日程、1 条待补全；待核对计数、重复默认跳过、草稿补全、取消、真实草稿路径写入失败保留预览、恢复后重试、WorkerW 挂件入口及正常退出通过。冷启动后 3 条日程与 1 条草稿恢复，零渲染／preload 错误。
- 证据：`.local/lotus-native-1792428449298/{community,private}/text-{live,cold}/result.json` 与内部截图。私有测试副本使用公开空白 seed，不把真实课表或真实存档作为 fixture。
- 两版手机页面：原生 Windows Electron 手机宽度运行实际 mobile adapter，文件存储桥接为明确标注的合成测试桥；导入、无横向溢出、重载草稿恢复、返回键释放 inert 通过。最终证据 `.local/text-mobile-community-1792428670785`、`.local/text-mobile-private-1792428675342`。这些结果不代表 Android 真机安装／软键盘／物理触摸／新功能跨设备同步已验收。
- 手机测试入口最初过早 capturePage 出现 UnknownVizError；显式显示／invalidate 并等待绘制后消失。随后测试注入多行文本转义错误，修正为 JSON 字面量后两版通过。这两项为验收脚本问题，未用失败结果宣称通过。
- 用户提供私有 APK 原件存入 `.local/private-mobile/original`；更新后的私有 web 资源存入 `.local/private-mobile/text-import-assets/web`。缺原签名私钥与 Android 原生工程，不生成改签私有升级 APK。原 APK 不是签名私钥。

复测：`node scripts/prepare-lotus-native.cjs` 后用 Windows 原生 Electron 运行 `scripts/verify-text-import-native.cjs --suite=<目录> --edition=community|private`，再带 `--cold` 验证恢复；`python scripts/prepare-text-import-mobile.py` 准备忽略目录，再用原生 Electron 运行 `scripts/verify-text-import-mobile.cjs --edition=community|private`。所有新测试仅写独立合成目录。

最终审阅补充：明确周次与“下周”矛盾时不猜周次，转待补全；增加回归断言并重建两版最终包。最终完整 EXE 通过预览、补全、重复、矛盾周次预览与冷启动，证据 `.local/text-packaged-community-1792429594165`、`.local/text-packaged-private-1792429594093`。最终手机页面证据 `.local/text-mobile-community-1792429594287`、`.local/text-mobile-private-1792429589861`，另验证移除草稿即时刷新计数。

私有版已按授权原位更新最终 1.3.4：先正常退出并完整冷备程序与 66 个数据文件，替换并校验 145 个程序文件，原卸载器、快捷方式及桌宠设置保留。备份 `.local/private-upgrade-134-20261020-010659`；正常真实数据路径重开，日程字节、完成项、服务身份和原配对密钥保留，UIA／Win32 确认莲花及最新文案。实际安装版左栏导入空弹窗已通过 UIA 打开／关闭，不加入合成日程；随后恢复原桌面模式。

首次 CloseMainWindow 未退出桌面模式，保护逻辑中止，未替换文件；改为已核实路径／PID／普通编辑器 HWND 的 WM_CLOSE 正常退出，没有强杀未知进程。首次 UIA 在桌面挂件隐藏左栏找不到入口，未发送导入；经应用原单实例恢复普通窗口后定位成功。最终数据保留核验再次通过。

Android 1.3.4 已由公开 Java 与网页源码构建，官方 apksigner 验证通过；与旧 1.3.2 APK 的证书 SHA-256 相同，`8f25b2b3b02225fbd0860acaeb16b08be15a3140fbc7f247c08e010525002b40`。APK 内网页逐字节匹配，空 seed 保持。没有换签，私钥未上传。

最终完整 NSIS 在独立目录真实新装、从 1.3.3 覆盖升级均成功，各 147 个文件核对一致；原社区版注册、快捷方式恢复，真实程序、日程及配对摘要不变。记录 `.local/community134-install-20261020-010935/result.json`。新装／升级后的实际程序分别通过真实导入、补全、重复跳过、矛盾周次与冷启动恢复，证据 `.local/text-packaged-community-1792429912655`、`.local/text-packaged-community-1792429915465`。

完整便携 ZIP 独立解压后真实 EXE 同样通过，证据 `.local/text-packaged-community-1792429915187`。两版 ASAR 与各自源代码分别 40／38 个应用文件逐字节一致，ZIP 与运行目录分别 146／145 个文件一致、CRC 通过；没有诊断入口、测试、fixture、`.local`。报告 `.local/release134-artifact-audit.json`。公开源码白名单审计通过，用户的 `image.png` 未打包或提交。

本轮 Android 真机、软键盘、物理手势、新功能跨设备同步、Mac/iPhone、锁屏、睡眠唤醒、长期运行与 DeepSeek 未测；本功能不调用 DeepSeek。发布与公开下载核验在 PUBLISHED.md 记录。

发布后核验：v1.3.4 已公开为 Latest，6 个附件均经 GitHub 服务器摘要及无认证完整下载校验；公开 README 和两张功能图片逐字节一致。源码提交 `9cb89d364d6254504253741d18232eadd69d68a6` 的 Actions `39292302233` completed／success。没有把 CI 临时签名 APK 作为正式升级包；私人资源、用户截图、运行数据及签名未上传。

## 2026-10-20：1.3.3 正式发行前验收

用户明确授权私有版原位更新、通用版发布及 README 同步。电脑版版本统一为 1.3.3，Android 保留已发布原签名 1.3.2；手机网页、空 seed 与协议未改。无 Computer Use，实际方式继续为原生 Windows Electron、Win32、Windows UI Automation 与仅测试实例的本地 CDP。

| 项目 | 本轮真实结果 |
| --- | --- |
| 逻辑／打包 | 64 项回归：63 通过、0 失败、1 主机符号链接权限跳过；私有新增 8 项通过。两版 1.3.3 ASAR 与各自源代码核对，通用版 35 个应用源文件一致、空 seed 与生产排除项通过。 |
| 1.3.3 完整程序 | 通用／私有实际 EXE 均在全新合成目录运行；设置、开始／结束气泡、改名更新、各两轮固定／返回、正常退出重开，提前窗口内不重复且文案正确。证据 `.local/lotus-packaged-community-1792426486274`、`.local/lotus-packaged-private-1792426492042`。 |
| NSIS 真新装／升级 | 实际运行本次完整安装器，新装及原稳定安装器 1.3.2 → 1.3.3 升级均成功，分别 147 个安装文件与构建运行目录一致。先备份并隔离仅通用版安装登记，防止 NSIS 去卸载原安装；最后恢复登记、快捷方式，真实通用版日程／配对文件摘要和原程序不变。记录 `.local/community133-install-20261020-002038/result.json`。 |
| 安装后真实界面 | 新装及升级后的原样程序分别全新合成状态运行，真实提醒、改名气泡、各两轮固定／返回和退出重开通过。证据 `.local/lotus-packaged-community-1792426992594`、`.local/lotus-packaged-community-1792426998361`。仅用本地 CDP 激活真实 DOM／IPC，不替代手机或物理手势。 |
| 私有版正式更新 | 按用户授权正常退出原程序，完整冷备程序与 64 个数据文件后，逐项更新原安装位置 145 个运行文件，保留原卸载器与快捷方式并更新登记版本。真实数据在程序替换期间全部摘要不变，仅新增／开启莲花设置。正常数据路径启动，无调试端口；Win32／UIA 确认莲花和“念念相续”可见，默认开始前 5／结束前 1。 |
| 私有版存档保留 | 默认数据启动后再次只读核对：30 条日程、完成标记、schedule.json 字节、服务器身份、1 台设备的原配对密钥均保留。只记录布尔值和计数；未截图／打印私人日程、配对或密钥。证据 `.local/private-133-preservation.json`、`.local/private-133-ui-result.json`；冷备 `.local/private-upgrade-133-20261020-001638`。这不是本轮真实手机双向同步测试。 |
| README 媒体 | 新莲花图来自 1.3.3 通用完整程序的合成提醒内部截图，经目视核对；不是私有版截图。旧 1.3.2 视频明确保留原日期／版本。 |
| 公开归档 | 白名单149文件，源码ZIP全新提取后的64项回归同样63通过／1权限跳过；通用ZIP 146运行文件全部与实测目录一致，CRC通过；安装器／ZIP／源码摘要随版本校验清单生成。未将此归档／单元检查当作界面或安装验收。 |

预检曾将 Windows 四段 ProductVersion `1.3.3.0` 与三段版本字符串直接比较而中止，尚未改动正式程序；修正为同时检查 FileVersion `1.3.3`、ProductVersion `1.3.3.0` 后继续。只读 UIA 辅助脚本首次因 Windows PowerShell 默认编码未解析中文标题，添加 UTF-8 BOM 后成功；不是应用启动故障。

新装／升级后的真实运行不是仅解包验证。旧版 1.3.2 Lotus-Preview 的拖动／穿透记录在下方保留，本轮未再把这两项计作 1.3.3 新的物理手势实测。未测：本轮真实手机双向、Win+D／触控板与桌宠共存、安装器交互向导／卸载、多屏／动态 DPI、实际睡眠、Explorer 重启、长期运行、Mac。公开发布、匿名下载和 CI 结果在执行后记录于 PUBLISHED.md；不得把本节本机通过当作已发布。

发布后补记：v1.3.3已公开、Latest已确认，五个附件匿名完整下载逐项SHA-256一致，公开README及莲花图与本机一致；详情见 [PUBLISHED](PUBLISHED.md)。记录时CI run39285541503仍queued，未将排队计为通过。

## 2026-10-19 至 20：莲花桌宠本机开发预览

本节仅记录本次桌宠开发。稳定发行附件与下方原 1.3.2 验收记录保留；本次未发布、未覆盖正式安装、未构建新 NSIS 安装器。通用版与用户指定的私有版源码均已接入同一提醒模块，文案按用户要求为“半刻 · 念念相续”。开始／结束提前量分别设置，默认 5／1 分钟，支持 0–1440；首次默认关闭。

Windows 原生 10.0.26200、Electron 44.9.0。本会话无 Computer Use；实际使用真实 Electron DOM／IPC、Win32 `SetCursorPos`／`mouse_event`／`WindowFromPoint`／`PrintWindow`，以及仅限测试程序的本地 CDP。DOM 激活不等于物理鼠标，PrintWindow／内部截图不等于无遮挡桌面最终合成证据。手机与物理手势未由工具操作。

| 项目 | 实际结果与边界 |
| --- | --- |
| 通用版逻辑回归 | `npm test`：64 项，63 通过、0 失败、1 因符号链接权限跳过；含新增 8 项提醒测试。子框架／陌生来源不可使用新增设置 IPC。 |
| 私有版新增提醒测试 | `node --test .../tests/lotus-reminders.test.cjs`：8 项通过。未使用其私人 seed 或既有私人 fixture 作为新测试数据。 |
| 日历语义 | 测试覆盖真实周次、分钟、显示第 24 周不影响真实提醒、周日 24:00、24 小时提前量、DST 本地时间、已完成跳过、删除／改时、同时多条、写入失败不展示无记录提醒、损坏设置原样保留。 |
| 两版源码原生运行 | 独立合成空白数据起步，真实设置表单开启、试播、真实时钟跨越提醒时刻；开始／结束同时触发并逐条确认，已完成安排不提醒，各三轮真实 WorkerW 固定／返回。挂件 `alwaysOnTop=false`；桌宠悬浮可单独切换。 |
| 原生拖动与穿透 | 两版均由受 PID／HWND／命中保护的 Win32 真实指针拖动成功；透明角落 `WindowFromPoint` 命中非桌宠；正常退出。截图已目视核对。通用版第一次拖动测试发现 CSS 拖动区不发 DOM 鼠标事件，修复后通过；私有版另一次命中保护中止，未发送点击，后续重试通过。 |
| 冷启动 | 设置保留；最终私有版原生冷启动验证“念念相续”。曾有测试把同一合成安排稍后的新结束提醒误认作重复，修正断言后通过，此为测试问题。 |
| 实际完整便携程序 | 两版均真实运行本次 `dist` 中的打包 EXE，显式隔离目录，预写合成空日程；真实设置表单、开始／结束气泡、改名后气泡更新、各两轮固定／返回、正常退出／重开；在提前提醒窗口仍有效时无重复提醒，最新文案正确。使用本地 CDP 激活真实 DOM／IPC，未替换桥接。 |
| 打包与隐私 | 输出独立 Lotus-Preview ZIP；ASAR 对比应用源码、检查排除诊断入口／tests／fixture／`.local`，ZIP 与运行目录逐文件比对及 CRC，校验清单在各预览目录。通用版桌面／手机 seed 仍为空，mobile 未改。私有包仅本机保留，不进入公开附件。 |

首轮直接在工具沙箱启动 Electron 时，运行时目录 ACL 导致进程在加载应用前中止，出现用户截图中的 0x80000003 错误框；改为已授权的 Windows 原生环境执行同一测试后启动通过。只结束了该轮已知测试进程，没有修改系统 ACL、关闭 Chromium 沙箱或防火墙。私有构建最初把相对配置路径按 projectDir 解析而 ENOENT，改用绝对配置路径后成功。

源码原生证据：`.local/lotus-native-1792425018552/{community,private}`，`live/result.json`、`community/cold-hit-fix/native-input-result.json`、`private/cold-final/native-input-result.json`。最终打包实测：`.local/lotus-packaged-community-1792425804710/result.json` 与 `.local/lotus-packaged-private-1792425809518/result.json`；包核对报告 `.local/lotus-artifact-audit.json`。原始截图、测试存档、指针记录均只在 `.local`，不提交。

复测入口：先 `node scripts/prepare-lotus-native.cjs` 建立两版源码的隔离合成副本；用 Windows 原生 Electron 运行 `verify-lotus-native.cjs --suite=<新目录> --edition=community|private --phase=live|cold`，冷启动指针测试额外传 `--interaction`，再运行 `test-lotus-input.ps1 -Evidence <相应冷启动证据目录>`。完整包验证为 `node scripts/verify-lotus-packaged.cjs community`／`private`，测试脚本自行生成全新数据目录；所有输出均在本仓库 `.local`。在工具沙箱直接启动可能重现上述环境 ACL 障碍，不能把这种启动中止计作通过。

本次未测：新安装器／覆盖安装、手机配对及同步实机回归、Win+D／物理显示桌面手势与桌宠共存、多屏／动态 DPI、实际睡眠唤醒、Explorer 重启、长期后台运行、锁屏、Mac。睡眠过期规则和 DST 是逻辑测试，不是设备验收。半刻退出或关机不提供提醒。未读取、迁移或删除真实日程／配对，未改签名，未推送、发布或上传。

日期：2026-10-19。Windows 原生 10.0.26200，同一台实际电脑；手机步骤由用户在真实 HarmonyOS 设备协助。本会话无 Computer Use，桌面使用已获授权的 Win32、Windows UI Automation、真实 Electron 日志和窗口截图，未声称由工具直接控制手机或物理触控板。

| 项目 | 实际结果与证据边界 |
| --- | --- |
| 初始空白、相同 UI | PASS；实际 Windows/手机均确认，未复制私人课表 |
| 普通窗口与冷启动 | PASS；安装后连续三次正常退出/重开，原生窗口截图有内容，测试日程和配对保留 |
| 桌面固定/返回 | PASS；开发副本真实指针十轮，安装后再十轮，无 1400、preload 错误或渲染退出 |
| Win+D 与物理触控板 | PASS；安装后实际发送 Win+D；用户确认物理“显示桌面”手势后挂件仍展开、有测试安排 |
| 导入/取消/错误/并发 | PASS；真实系统选择器、IPC 和磁盘；确认前自动备份，取消和错误不覆盖；并发用服务修订模拟，未测试手机同时编辑导入 |
| 端口占用与启停 | PASS；实际监听和受控占用，不结束占用者；回退后 UI 显示真实端口。并非所有重启都使用相同端口 |
| 完整包实际安装 | PASS；标准 NSIS 静默安装到独立路径，退出 0，实际程序 1.3.2.0；私人程序及日程摘要不变 |
| 安装后界面 | PASS；普通窗口、导入取消/提交与自动备份、固定/返回、Win+D、正常退出 |
| 完整便携 ZIP | PASS；独立解压、实际启动空白周计划、原生截图有内容、正常退出；ASAR 与安装版一致 |
| 手机离线初始保存 | PASS（用户操作）；新 APK 未连接电脑即可新增并保存 |
| 加密配对与双向同步 | PASS；八位数字两端一致，设备数 1；手机新增到电脑、电脑改名到手机，沿用协议 1 |
| 手机断网再连接 | PASS；手机断 Wi-Fi 后修改至 19:40–20:00、备注“离线回连”，恢复网络后两端一致 |
| 手机强行停止/重开 | PASS（用户操作）；数据保留，无需重新配对，恢复自动同步 |
| 同版覆盖重装 | PASS；正常退出并冷备份后再次执行同一 NSIS；安装前后日程及配对字节相同，重开保留端口，手机继续同步 |
| 临时安排清理 | PASS；电脑真实界面仅删除唯一临时安排，配对保留；用户确认手机也删除且继续同步 |
| GitHub Actions | PASS；Windows/Android 实际公开构建均成功，见 [发布后核验](PUBLISHED.md) |
| 公开 Release 下载 | PASS；六个附件匿名完整下载，逐项 SHA-256 与本机一致，Latest 指向 v1.3.2 |
| Node 回归 | 56 项，55 通过、0 失败、1 因主机符号链接权限跳过；不替代上述实机验收 |
| 官方 APK 校验 | apksigner v2/v3 和 aapt 通过；正式 APK 的 UI assets 与源码一致 |
| 干净源码重建 | PASS；白名单源码独立副本 npm ci、测试、pack:win 完成，ASAR 与实测版本相同；官方 SDK 重编 APK 的 11 个 DEX/资源/界面成员一致、签名身份相同 |
| 公开源码与包审计 | 白名单排除真实日程、运行目录、密钥、私人 fixture、截图及私有安装器；最终摘要见 SHA256SUMS.txt |

没有测试：Mac/iOS 原生安装、多屏与动态 DPI、Explorer 重启、睡眠唤醒、长期运行/断电恢复、实际重新登录后的开机启动、安装器交互向导/卸载、锁屏持续后台同步、其他手机系统/所有网络。Windows 未配置发布者代码签名。此次为独立通用版安装及同版本重装，未将私人版或旧 Go 版覆盖成通用版。

本轮手机实际最初安排在周一，未把提问中建议的周日当成实测事实。先前旧 Go APK 的周日测试不计入本版。离线回连后的实际分钟值和备注以两端存档核对。

原始证据只保存在本机 .local/evidence：community-cold-start.json、community-portable.json、community-reinstall.json、community-cleanup.json、fresh-source-build.json、android-fresh-build.json，以及各 run-* 的窗口/导入记录。遮挡截图拒绝捕获；配对数字显示期间不保存截图。公开包不包含这些运行记录、截图或手机数据。测试未清理 AppData/手机数据、未取消原配对、未关闭防火墙。
README 演示：用户明确授权公开演示媒体后，另建合成数据实际运行安装版，通过 Windows 原生 PrintWindow 连续录制，仅捕获自身内容。16.8 秒 H.264 视频逐帧可解码，已目视审核抽帧；GIF 与截图由同次录制取得。首次按屏幕抓取的尝试因遮挡及子窗口定位失败而废弃，未发布失败媒体，未将其计作产品故障。


## Apple 补充测试（独立预览发行）

macOS Intel 与 Apple Silicon 均在原生 macOS 15 构建机运行实际打包 App，通过首次空白、UI 保存、五轮固定/返回及原生负窗口层级读取、正常退出重开保留存档；ad-hoc 深度严格签名校验通过。内部渲染截图和原生窗口元数据不是物理 Mac 桌面最终合成证据。

iOS 原生 run 39271296063 已通过设备/模拟器编译、真实 WKWebView 离线保存/新文档重载持久化、WebCrypto 和生产协议服务加密双向往返；原生存储与 URL 保护测试通过。最终运行结果、失败修正和测试范围见 [Apple 验收](APPLE.md)。不将未签名设备编译产物当作可安装 IPA。

共享桌面入口修改后，原 Windows 电脑独立测试副本完成真实 UI Automation 五轮固定/返回和系统文件选择器导入取消、预览、提交、自动备份、错误及修订冲突保护；无 1400 或渲染错误。此前指针测试六轮成功，后因遮挡/焦点安全中止，未记作十轮通过。手机共用 mobile/web 与 Android 源码相对稳定标签 v1.3.2 无差异；没有更换 Android 签名或重发 APK。

未测：个人 Mac 安装和 Gatekeeper、Mission Control/物理手势、多屏/DPI、登录启动、睡眠长期运行、Mac 原生导入/打印、Mac 与真实手机同步；真实 iPhone、本地网络权限弹窗、最低 iOS 版本、强制结束/后台/锁屏、TestFlight/App Store。
