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

## 真机隔离调试

```powershell
powershell -NoProfile -File scripts/launch-community-diagnostic.ps1 -Profile community-import
```

显式数据参数为 `--banke-test-data-dir=<绝对路径>`，不要用 Electron 普通 `--user-data-dir` 代替。代码禁止该参数指向正式通用版、私人版或旧 Go 版的存档及其父/子目录。诊断入口仅用于源码调试，不被打进正式 ASAR。证据写入 `.local`，不自动发布截图、日程或配对信息。

## 发布源码

```powershell
python scripts/package_release.py
```

源码包从明确白名单构建，排除 .local、node_modules、dist、build、私钥和运行数据。完整安装包保留在 dist，发布前按 docs/TESTING.md 实机验收。Mac/iOS 尚无本次已验证发行包。