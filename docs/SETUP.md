# 本地开发与复现

工作目录：`/path/to/developer/work/deepseek-harness-android`。开发工具和 APK 留在本机，源码按用户要求纳入 Gitea，远端与同步方式见 `REPOSITORY.md`。

## 已安装环境

先执行 `source scripts/env.sh`。JDK、SDK、AVD、Gradle、pnpm 均在 `.tools/`，没有修改系统 Java 或全局 shell 配置。

| 项目 | 本机版本 |
| --- | --- |
| Temurin JDK | 17.0.20.1+1 |
| Android cmdline tools | 12.0 |
| Android platform / build tools | API 36 rev 2 / 35.0.0 |
| Emulator / platform tools | 37.1.11 / 37.0.1 |
| 模拟器系统 | Android 15 / API 35 Google APIs x86_64 rev 9 |
| Gradle / AGP / Kotlin | 8.11.1 / 8.8.2 / 2.0.21 |
| Node / pnpm | 22.23.2 / 11.7.0 |

用户已为 `/dev/kvm` 设置 ACL，实际 KVM ioctl 和模拟器加速探测通过。重启后若权限消失，需要用户再次执行 `sudo setfacl -m u:matrix:rw /dev/kvm`。无需更改当前终端；权限作用于同一台机器的设备节点。

## 输入与构建

源码固定在 `android-shell/` 的 `v0.13.3`（`4e721c8814f3b1163ce21e6ce77a2e7ae87a93fc`），当前作为根仓库 `main` 下的源码目录管理（原分支 `local/android-baseline`）。`upstream/` 仅作较新版官方源码参考。

```bash
cd /path/to/developer/work/deepseek-harness-android
source scripts/env.sh
python scripts/download-baseline.py
python scripts/check-runtime.py x86_64
python scripts/build-baseline.py x86_64
python scripts/check-runtime.py arm64
python scripts/build-baseline.py arm64
```

下载脚本使用 `docs/download-sources.json` 的固定来源、大小和摘要；Android SDK 包由 sdkmanager 管理。构建两个 ABI 必须顺序执行，因为共享 assets。脚本清理 Gradle 的 APK 增量打包状态，避免切换 ABI 后 ZIP 留有旧快照的废弃字节。

本次 APK 是从源码构建的壳，加上已核验的发行版运行时快照；不是从头编译全部运行时。详见 `RUNTIME-BOUNDARY.md`。签名为仓库开发调试签名，不是独立生产签名。

在新的本地目录重装 SDK 时，解压已校验 JDK 到 `.tools/jdk17`，将 commandlinetools 的内容放入 `.tools/android-sdk/cmdline-tools/12.0/`，然后：

```bash
source scripts/env.sh
sdkmanager --licenses
sdkmanager 'platform-tools' 'emulator' 'platforms;android-36' 'build-tools;35.0.0' 'system-images;android-35;google_apis;x86_64'
mkdir -p .tools/bin
ln -s /usr/bin/python3 .tools/bin/python
npm install --prefix .tools/node pnpm@11.7.0
```

SDK 工具仓库未来可能更新同名包的 revision；当前安装版本以上表和 `.tools/android-sdk/*/package.xml` 为准，未承诺未来下载的二进制逐字节一致。

## 模拟器

```bash
source scripts/env.sh
bash scripts/start-emulator.sh > logs/emulator-api35.log 2>&1
```

在另一个终端：

```bash
source scripts/env.sh
adb -s emulator-5580 wait-for-device
adb -s emulator-5580 install -r -t artifacts/dsh-v0.13.3-local-baseline-x86_64.apk
adb -s emulator-5580 shell am start -n com.dsharnessmobile.shell/.MainActivity
python scripts/runtime-smoke.py emulator-5580
python scripts/http-smoke.py emulator-5580
python scripts/collect-device.py emulator-5580
python scripts/collect-logcat.py emulator-5580
```

首次启动需要等待快照解压和内核就绪，并完成应用界面的通知/内测说明操作。模拟器是 Pixel Tablet 配置，2560×1600、4 GB 内存、4 核。它不模拟小米 HyperOS 的后台策略。

自动化输入助手 `android-fill.py` 仅用于专用模拟器，需要先通过 adb 启用并选择应用的 `.AdbKeyboardService` 测试输入法；本次测试结束已恢复 Gboard 并禁用该测试输入法。`android-ui.py` 按当前无障碍标签定位；滚动菜单中仍需确认目标位于可见区域。

## 插件源码检查

UI 插件目录是 `android-shell/dsh-client-ui-responsive`，其余插件在 `android-shell/plugins/`。分别执行 `npm ci --legacy-peer-deps --cache /path/to/developer/work/deepseek-harness-android/.tools/npm-cache` 和 `npm run build`。UI 的旧 peer 声明需要 legacy 参数；显式 cache 避免仓库 `.npmrc` 的 Windows 路径。

UI 的 `npm test` 已通过 74 项。桥插件增加了 `@deepseek-ai/dsh-session@0.1.1-rc.2` 开发依赖及纯类型 import，用于装载 `session/event` 声明，解决 TypeScript 编译错误。构建成功的插件输出尚未重新注入基线快照。

## 当前推荐适配包

标准 write 修复版的构建与测试入口见 [FS-ADAPTER.md](FS-ADAPTER.md)，使用 `--fs-adapter` 生成独立标签包。历史 local-baseline 用于对照。
