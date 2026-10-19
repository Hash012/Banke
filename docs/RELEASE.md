# 社区版发行

## 1.3.3 · 莲花桌宠

用户于 2026-10-20 明确授权：私有版更新到原安装位置，通用版发布并同步 README。当前 Windows 发行目标为 [v1.3.3](https://github.com/Hash012/Banke/releases/tag/v1.3.3)，附件限定为完整 NSIS 安装器、完整便携 ZIP、公开源码 ZIP、release-manifest.json 与 SHA256SUMS.txt。手机版继续使用 [原签名 Android 1.3.2](https://github.com/Hash012/Banke/releases/download/v1.3.2/Banke-Community-Android-1.3.2.apk)，不把临时签名验证 APK 当作升级。Apple 附件仍为独立 1.3.2 预览。

本版增加“念念相续”莲花桌宠、独立开始／结束提前量、拖动记位、透明穿透、按真实日期周次提醒和持久化去重。默认不自动开启，顶部 ❀ 保存开启。运行半刻时提醒；退出或关机不提醒。原日程挂件、空 seed、应用身份与手机协议保留。

发布前需通过 Windows 原生完整程序、实际新装与覆盖升级、公开源码隐私审计及逐文件摘要核验。先上传独立草稿并比对服务器摘要，再公开；发布后以无认证客户端下载完整附件校验，检查 Latest 和 README 真实入口。是否已发布以 [发布后核验](PUBLISHED.md) 的实际记录为准，不以草稿或构建成功代替。

私有版只在本机备份后更新，程序、seed、存档、配对、运行截图与 `.local` 不进入通用源码或附件。Windows 未配置发布者代码签名；本轮测试方式、失败与未测项目见 TESTING.md。

## 历史：1.3.2 社区版发行

用户已明确授权提交、推送并公开发布。对应源码标签为 v1.3.2，正式下载入口：

https://github.com/Hash012/Banke/releases/tag/v1.3.2

正式附件：Windows 完整 NSIS 安装器、Windows 完整便携 ZIP、Android APK、公开源码 ZIP、真实操作 MP4 和 SHA256SUMS.txt。以页面实际可下载附件为发布完成依据；构建候选或草稿不算已发布。

Windows 安装包和便携包均超过普通 Git 文件限制，只放 Releases Assets；不提交大二进制。仅发布已审阅的合成日程演示媒体，不发布 .local、私钥、配对、运行日程、私人版安装器或桌面原始截图。附件和源码经白名单及摘要检查，具体实机验收和未测项目见 TESTING.md。

APK 继续使用本轮稳定签名。Windows 当前未做发布者签名。Mac/iOS 没有本轮真机验收包，不混入旧 Go 安装包。旧 v1.1.0 是不同实现，保留历史记录但不作为当前下载入口。

README 内嵌同一次真实窗口录制的 GIF，点击打开完整 H.264 MP4；仅缩放补齐画布，未模拟 UI。示例安排不进入初始数据，来源见 media/README.md。
发布已完成，六个附件均已匿名完整下载核对摘要，Windows/Android CI 通过。见 [发布后核验](PUBLISHED.md)。源码 ZIP 固定对应 v1.3.2 标签；main 的后续核验文档不改发行包。
