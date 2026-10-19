# 1.3.2 发布后核验

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
