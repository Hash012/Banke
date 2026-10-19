# 更新记录

## 1.3.2 Apple preview.1

- 增加 macOS Intel/Apple Silicon 完整 DMG/ZIP 测试包及原生桌面层，默认空白并保持相同界面。
- 增加可自行签名的 iOS Xcode 源码，与 Android 共用手机 UI 和加密协议，支持离线原子保存。
- Apple 独立预览发行，不替换 Windows/Android v1.3.2 稳定附件。Mac 仅 ad-hoc 签名、未公证；iOS 不提供直接安装 IPA。原生验证与未测范围见 docs/APPLE.md。

## 1.3.2 通用版

- 采用已实测正式版的 Electron 桌面 UI、右半屏桌面挂件、普通窗口恢复、备份与加密局域网同步；手机采用对应原 UI。
- 移除私人初始课表、真实备份 fixture 及特定校区简称规则；当前周从零条安排开始。
- 分离通用版应用、数据、配对、安装和开机启动项；可与私人版并存。
- 提供完整可克隆构建源码、依赖锁、标准 NSIS 完整安装器、完整便携包和从公开 Java 构建的 APK。
- 保留 showInactive 后再 SetParent 的表面初始化修复，以及销毁窗口后不再访问 webContents 的修复。
- 真实 Windows 文件选择器与安装后 UI 均复测；具体矩阵见 docs/TESTING.md。
- 旧 1.1.0 Go 预览版是另一实现/协议，已从当前下载位置移至本机备份，不冒充同 UI 新版。