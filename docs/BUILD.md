# 从公开源码构建

## Windows

需要 Windows 10/11 x64、Node 22.12+、npm、系统 curl 和联网。固定依赖为 Electron 44.9.0、Koffi 3.3.3、electron-builder 26.15.3，具体完整依赖见 package-lock.json。

```powershell
npm ci
npm test
npm start
npm run pack:win
npm run dist:win
```

`npm ci` 的 postinstall 使用官方 GitHub Electron 压缩包，按 electron npm 包内官方摘要校验后提取。缓存位于 `.local/electron-cache`。不会关闭 TLS 验证、修改系统 PATH 或读取已有私人安装。网络不可用时应明确失败，联网后重试。

`dist:win` 生成完整 NSIS 安装器和完整便携 ZIP；安装器是从公开配置新构建的，不再以私人安装包作输入或修改其字节。应用 ID、安装注册、快捷方式、数据和开机启动项均独立。卸载不自动删除 AppData。签名证书不附在仓库内；当前 Windows 包未做发布者代码签名。

## 1.3.4 Windows / Android 发行

```powershell
npm run dist:win -- --config.directories.output=dist/1.3.4
node scripts/verify_desktop.cjs dist/1.3.4/win-unpacked/resources/app.asar
# 用原稳定签名构建 Android，不能为覆盖升级重新生成签名：
python scripts/build_android.py --sdk C:\Android\Sdk --key .local/signing/community.pk8 --cert .local/signing/community-cert.pem --out dist/1.3.4/Banke-Community-Android-1.3.4.apk
python scripts/package_release.py --out dist/1.3.4
```

输出完整 NSIS 安装器、完整 ZIP、原签名 Android APK、公开源码和校验清单；不替换旧版附件。完整解压 ZIP 后运行 `BankeCommunity.exe`。构建不包含诊断入口、tests、fixture 或 `.local`。1.3.4 同步增加文本导入，Android 沿用 1.3.2 的稳定签名；Apple 已发布附件仍为独立预览。

原生合成测试脚本为 `prepare-lotus-native.cjs`、`verify-lotus-native.cjs`、`test-lotus-input.ps1` 和 `verify-lotus-packaged.cjs`；后者支持第二个参数指定已安装／便携程序绝对路径。运行方式与结果见 TESTING。上轮 1.3.2 Lotus-Preview 成品只作为本机历史，不进入新版本发行。

## Android

需要 JDK 17/21、Python 3.10+、Google 官方 Android SDK Platform 35 和 Build Tools 35.0.0。设置 ANDROID_HOME，或使用 `--sdk` 指定 SDK 根目录。首次自行创建签名需要 Python cryptography。构建直接编译公开 Java，使用官方 javac、D8、aapt2、zipalign 和 apksigner，不使用不透明 DEX 或私人 APK。

```powershell
python -m pip install cryptography
python scripts/build_android.py --sdk C:\Android\Sdk --key .local/signing/community.pk8 --cert .local/signing/community-cert.pem --generate-key
# 后续版本保留原签名，去掉 --generate-key：
python scripts/build_android.py --sdk C:\Android\Sdk --key .local/signing/community.pk8 --cert .local/signing/community-cert.pem
```

生成的是开发者自己的独立签名身份，不是现有发行者的私钥。正式发行包的后续升级必须使用同一签名；脚本遇到已存在的签名文件会拒绝覆盖。不要将新签名冒充已安装版本的升级，不要要求用户清数据后掩盖签名不匹配。私钥仅留本机，不提交、不上传；可自行保留本机离线备份。

APK 当前 min SDK 26、target SDK 34，面向直接 APK 分发；不表示符合未来应用商店政策。原生桥只向打包内页面提供私有文件与受限 LAN HTTP，禁止重定向和非私网目标；加密和合并逻辑由同版本公开网页源码执行。

## 独立安装的新私有手机版

用户在无法取得旧私有签名后要求开发新应用。本机已交付“半刻私有版·新”1.3.4，包名 `cn.banke.personal.mobile`；旧版 `cn.banke.mobile` 和通用版 `org.banke.community.mobile` 均不被覆盖。新建独立身份不等于替换旧应用签名，不要求清数据或取消旧配对。安装后由用户核对数字、允许新增手机配对取得私有电脑版日程；首次默认空白。

`prepare-personal-mobile.py` 从维护中的公开 Java／网页源码创建忽略目录内的独立工程，不读取旧 APK、私人 seed、存档或配对。已有工程目录会拒绝覆盖。通用构建脚本增加 `--mobile-root` 和首次签名名称参数；自定义工程必须指定独立 `--out`，原通用版默认路径与身份保持。

```powershell
# 仅首次准备；后续保留生成的工程和固定签名，不重跑创建或 --generate-key
python scripts/prepare-personal-mobile.py
python scripts/build_android.py --mobile-root .local/private-mobile/personal-app/mobile --sdk .local/android-sdk --key .local/signing/personal-mobile-v1.pk8 --cert .local/signing/personal-mobile-v1-cert.pem --generate-key --signing-name "Banke Personal Android" --out dist/private-mobile-new-1.3.4/Banke-Private-New-Android-1.3.4.apk
```

本机活动工程在 `.local/private-mobile/personal-app`，新签名位于 `.local/signing/personal-mobile-v1.pk8` 与对应证书，本机备份位于 `.local/signing-backups/personal-mobile-v1`。交付源码 ZIP 包含 Java、网页、构建脚本、证书摘要保护的 BUILD.ps1 和说明，不含签名；再次构建会检查原证书并拒绝自动换签。成品和安装说明位于 `dist/private-mobile-new-1.3.4`，仅本机交付，不进入公共 Release 或 Git。手机实机验收由用户协助，用户已反馈测试通过，具体范围见 TESTING.md。

[Android 应用身份](https://developer.android.com/build/configure-app-module#set-application-id)与[签名规则](https://developer.android.com/studio/publish/app-signing)是独立身份方案的依据。

## 真机隔离调试

```powershell
powershell -NoProfile -File scripts/launch-community-diagnostic.ps1 -Profile community-import
```

显式数据参数为 `--banke-test-data-dir=<绝对路径>`，不要用 Electron 普通 `--user-data-dir` 代替。代码禁止该参数指向正式通用版、私人版或旧 Go 版的存档及其父/子目录。诊断入口仅用于源码调试，不被打进正式 ASAR。证据写入 `.local`，不自动发布截图、日程或配对信息。

## 发布源码

```powershell
python scripts/package_release.py
```

源码包从明确白名单构建，排除 .local、node_modules、dist、build、私钥和运行数据。完整安装包保留在 dist，发布前按 docs/TESTING.md 实机验收。macOS 测试包与 iOS 源码见 [APPLE](APPLE.md)。
## Apple 测试版

macOS 原生构建使用 `npm run dist:mac -- --arm64` 或在 Intel Mac 上用 `--x64`。默认 ad-hoc 本机完整性签名，未做 Developer ID/公证。发布前在原生对应架构运行脚本与校验。

iOS 从 mobile/ios/BankeCommunity.xcodeproj 构建，和 Android 共用 mobile/web；在自己的 Xcode 选择团队自行签名。`python3 scripts/build_ios.py --device --simulator --test` 要求 Mac/Xcode，不能在 Windows 上交叉编译宣称完成。详见 [iOS README](../mobile/ios/README.md) 与 [Apple 验收边界](APPLE.md)。

Apple 完整源码包：`python3 scripts/package_apple_source.py`。发布工作流仅手动触发，要求事先存在的指定预览草稿和两平台成功原生验证，不上传个人 Apple 签名。
