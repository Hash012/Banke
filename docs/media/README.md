# 社区版实机演示来源

## Windows 1.3.3 莲花截图

`lotus-desktop.png` 来自本机 Windows 实际运行 1.3.3 完整打包程序的莲花窗口，通过本地 CDP `Page.captureScreenshot` 捕获；测试状态预写为空，随后仅添加合成安排“念念相续 · 打包验收”。来源 `.local/lotus-packaged-community-1792426486274/actual-reminder.png`。图片未经改绘或加入设备外框，保留透明背景；是应用内部窗口截图，不冒称无遮挡桌面合成画面。未使用私人版、真实日程、配对或其他软件画面。下方 1.3.2 视频仍为历史同一录制，未冒充新增桌宠演示。

2026-10-19 在本机 Windows 原生环境实际运行已安装的 Banke Community 1.3.2，使用独立演示目录和四条明确标注“示例”的合成安排；未连接手机或开启同步。

视频通过 Windows 原生 PrintWindow 连续捕获应用自身窗口区域，5 帧/秒、1280×900、H.264、16.8 秒、无音轨。界面操作通过 Windows UI Automation 执行：周计划 → 课程与安排 → 编辑示例名称 → 保存 → 返回周计划。未以浏览器复刻或设计稿替代程序。

README 的 GIF 是同一录制的缩小预览，完整 MP4 在 v1.3.2 Release。PNG 为同一录制的实际应用画面。仅对画面等比例缩放并补齐画布，没有改写、合成或替换 UI。视频抽帧已人工目视核对，未包含桌面背景、其他软件、地址、配对数字或私人日程。

录制程序 app.asar SHA-256：4e372a007c592e32d340e2f5b3190b5e2ac017d1ee51c243c6362a0f95076165。它与已实测安装版、发行候选一致。展示内容不等于出厂预置日程；正式包首次打开为空白。
## macOS 原生 CI 截图

macos-native-ci.png 来自 Intel macOS 15 构建机实际打包 App 的空白普通窗口；macos-widget-ci.png 来自 arm64 同轮实际桌面挂件内部截图，唯一安排为合成 Apple packaged smoke。来源 run 39264627038。未编辑 UI、添加课表或合成设备外框；图片是应用内部截图，不冒称物理 Mac 屏幕最终合成证据。

## iOS 原生模拟器截图

ios-native-ci.png 来自 run 39271296063 的实际模拟器 App 内 WKWebView 初始空白快照，未配对前捕获；没有设备外框或私人数据。不冒称真实 iPhone 截屏。

## 文本导入截图

`text-import-desktop.png` 直接复制自 `.local/lotus-native-1792428449298/community/text-live/preview.png`。Windows 原生 Electron 源码运行、真实渲染器／IPC 的内部截图，输入为三条合成安排；没有私人课表、配对、密钥或其他软件画面。未经改绘，不冒称无遮挡桌面画面或手机实机。
