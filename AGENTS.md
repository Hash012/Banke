# 半刻开源通用版

请用中文沟通。工作目录为本仓库；私人版开发场所和本机真实存档不能当作输出目录或测试 fixture。

- 保持与正式版 1.3.2 相同的桌面/手机 UI 和功能，仅默认空白日程、分离身份与数据。不要退回旧 Go 普通窗口方案，不删除桌面挂件或改成置顶来冒充实现。
- 先读 README.md、docs/BUILD.md、docs/TESTING.md 和 WORKLOG.md。默认日程在 desktop/renderer/seed.js 与 mobile/web/seed.js，必须保持为空。
- 禁止自动导入私人课表、删除 AppData/手机数据、取消原配对、结束未知端口进程、关闭防火墙或上传密钥。
- 新测试使用独立数据目录和合成记录；读代码确认 --banke-test-data-dir 隔离，不假设 --user-data-dir 足够。
- 改完必须在 Windows 原生环境真实启动复测。没有 Computer Use 时明确报告，使用已获授权的 Win32/UI Automation/真实日志并准确标注操作方式。手机和物理手势请用户协助。
- 生产构建不得包含 desktop/diagnostic-main.cjs、测试 fixture 或 .local；公开源码可以包含诊断源码，不能包含其运行数据和截图。
- Android 签名仅本机稳定保存；禁止换签名后要求用户清数据。CI 的临时签名 APK 只用于验证，不可冒充正式升级。
- Windows 完整包超过普通 Git 文件限制，留在 dist 并通过 Releases 分发。不要提交大二进制或混用旧 Go 安装包。
- 不未经用户指示推送、发布或上传。先完成本机验收、隐私审计与校验清单，再报告是否已发布。
- 将真实执行、失败、根因和未测项目更新到 WORKLOG.md 与 docs/TESTING.md；单元测试/解包不等于界面或安装验收。