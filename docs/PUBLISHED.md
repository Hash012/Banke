# 发布后核验

## 1.3.4 · 文本识别导入（发布前记录）

本机逻辑回归、两版完整 Windows EXE、通用版 NSIS 新装／1.3.3 覆盖升级、安装后运行、便携 ZIP 独立解压运行、Android 原稳定签名及资源校验、源码隐私审计均已执行，详见 TESTING。私有电脑版已原位更新最终程序并核对真实存档和配对保留。

当前源码快照准备发布 v1.3.4；草稿上传不等于公开发行。后续以公开 Release、无认证完整附件下载摘要和 README 实际入口核验记录为准。私有手机缺原签名私钥，未生成改签升级 APK；手机页面验收不替代真机安装或同步验收。

## 1.3.3 · 莲花桌宠

2026-10-20 已公开发布 [Banke Community v1.3.3](https://github.com/Hash012/Banke/releases/tag/v1.3.3)，GitHub Latest 指向本版。源码与 README 提交为 `b12481e327179022b00d4e51060562be7f9c4384`，独立标签 `v1.3.3`；未改写旧标签或旧附件。

- 五个附件上传后核对 GitHub 服务器摘要；随后全部由无认证客户端完整下载，逐项 SHA-256 与本机一致，不是只查 HEAD／文件名／大小。
- 公开 README HTML 已确认包含新版安装入口、“念念相续”和真实莲花图；公开 raw README／PNG 与本机逐字节一致。图像仅为通用版 1.3.3 合成提醒的应用内部截图，来源在 media/README.md。
- 公开源码 ZIP 的149个源文件逐项与标签提交一致；其中不含 `.local`、用户错误截图、运行数据、私有工程、私有包、配对或签名材料。生产 ASAR 排除诊断与 fixture。
- 本机已完成实际完整安装器新装／1.3.2→1.3.3升级、安装后原样程序提醒与退出重开测试，边界见 [TESTING](TESTING.md)。公开下载与本机已测包摘要一致。
- [GitHub Actions run 39285541503](https://github.com/Hash012/Banke/actions/runs/39285541503) 在本记录时仍为 queued，没有将其写作通过。发行依据为已完成的本机安装／界面验收及公开下载核验，后续 CI 结果需另行记录。
- Android 维持 v1.3.2 原签名 APK，摘要 `a863ab832ebbca0ebd1f640967c25b02bde54cf96c57e4686fb4138332ebea9c` 未变；Apple 附件仍为独立1.3.2预览。本次只发行Windows。私有版按用户授权在本机更新，不公开。

| 已匿名完整下载的附件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| Banke-Community-Setup-1.3.3-x64.exe | 112632743 | `cbb0f916cb3d618efbbaf4c541763170970c78792581bf69de9ecec59bd27eda` |
| Banke-Community-1.3.3-Windows-x64.zip | 154311482 | `b84199564d9ab35a9925d319e969e0fc7c462c546cc78a9b60591d79a9666fbe` |
| Banke-Source.zip | 1507656 | `29bdb358132a55fa43a2154716db70177f24f4f2c7ff2e5262501d1ced4aaf43` |
| release-manifest.json | 798 | `decb9cd44bb7c77db96b0058f7a3546a28505f737baed4349470c753ed9a8cc8` |
| SHA256SUMS.txt | 377 | `a29379378db9eb9ba512a7005f73d6a41a3ee406ead95bd1883760df51b12990` |

证据仅在 `.local/release133-public-verification.json`、`release133-readme-verification.json`。发行源码及根目录 Banke-Source.zip 固定对应 v1.3.3；main 在发行后只补核验文档，不重传或改写已核验的附件。

## 历史：1.3.2 发布后核验

2026-10-19 已公开发布 [Banke Community v1.3.2](https://github.com/Hash012/Banke/releases/tag/v1.3.2)，GitHub Latest 指向本版。

- 源码提交：cdaabc6fabb020245c0cfa597f8f3bf9c2b363e6；标签 v1.3.2。
- [GitHub Actions](https://github.com/Hash012/Banke/actions/runs/39259904664)：Windows 与 Android 均 success。包括安装依赖、回归、公开源码审计、打包和产物上传；不替代 TESTING.md 的实机测试。
- 六个 Release 附件先核对 GitHub 服务器 SHA-256，再以不带认证的客户端从公开下载地址完整下载，逐项摘要一致。不是只检查 HEAD、文件名、大小或上传成功。
- 公开 README HTML 已确认包含实际内嵌 GIF 和完整 MP4 链接，公开原始 README/GIF/PNG 与本机审阅文件逐字节一致。
- H.264 MP4 全部 84 帧解码通过，无空白帧；GIF 合并相同静止帧后为 15 帧、总时长 16.8 秒，内容来自同一次真实安装版录制。
- 发布源码 ZIP 的 97 个成员与 v1.3.2 标签逐字节一致。发布之后 main 仅补充本核验记录与文档；不改写原标签、不重传已核验发行包。根目录 Banke-Source.zip 是该标签的发行源码快照。

## 已匿名完整下载的附件

| 附件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| Banke-Community-Setup-1.3.2-x64.exe | 112624735 | `f4fefad9f8670ea99ce78f9a5fa3c6875d8533b05936db0ca1557e4bd15a0587` |
| Banke-Community-1.3.2-Windows-x64.zip | 154301737 | `c2f73c4d5d623960a48476a2f1e8b729a59674c6387029a54ef011f54369dec2` |
| Banke-Community-Android-1.3.2.apk | 54049 | `a863ab832ebbca0ebd1f640967c25b02bde54cf96c57e4686fb4138332ebea9c` |
| Banke-Source.zip | 976030 | `e63937d91fc40bade5e849b6e6375ceb368320b9e56fd7c3a94aee1d410b4c30` |
| Banke-Community-Demo-1.3.2.mp4 | 11376535 | `069d274573589f8b86c88b63cd7009a45a595b34d524f1dc2bfd23c06246cde3` |
| SHA256SUMS.txt | 486 | `8b082c4e641adbecd7340b2e445b3d4ad0fa44300326c5165d20f32334f5347e` |

私人日程、配对、签名私钥和 .local 未发布。Windows 未配置发布者签名；Mac/iOS、多屏、睡眠唤醒、长期运行等未测范围见 [TESTING](TESTING.md)。


## Apple 独立预览发行

[v1.3.2-apple-preview.1](https://github.com/Hash012/Banke/releases/tag/v1.3.2-apple-preview.1) 已公开，七个附件匿名完整下载校验通过。Mac 提供两架构 DMG/ZIP，iPhone 提供可自行签名的完整源码。稳定 Latest 与既有 Windows/Android 包保持 v1.3.2。原生测试、签名限制和未测项目见 [APPLE](APPLE.md)。
