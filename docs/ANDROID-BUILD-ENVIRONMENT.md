# Android 构建环境

本文区分两个独立环境：**电脑上构建 DeepCode 本体**，以及 **DeepCode 内的 Agent 在 Android 设备上编译小应用**。安装好前者不会自动把后者装进 APK；设备能运行 ARM64 程序，也不代表能运行桌面 Linux x86_64 SDK 工具。

## 1. 电脑上构建 DeepCode

当前下游脚本以 Linux x86_64 / Bash 为宿主。Windows 上保留的上游 PowerShell 流程不是下游完整构建承诺；其他宿主需另行适配。Android Studio 不是命令行构建的必要条件。

### 工具与版本

| 工具 | 当前要求与来源 |
|---|---|
| JDK | 17；可用系统 OpenJDK 17，既有 Temurin 下载来源见 `download-sources.json` |
| Gradle | 8.11.1，使用仓库 `android-shell/gradlew`，无需全局安装 |
| Android Gradle Plugin / Kotlin | 8.8.2 / 2.0.21，由 Gradle 文件管理 |
| Android SDK Platform | `platforms;android-36`；应用 compileSdk 36、targetSdk 34、minSdk 26 |
| SDK Build Tools | `build-tools;35.0.0`；下游签名、对齐和 D8 脚本显式引用此版本 |
| SDK Platform Tools | `platform-tools`，提供 adb；连接设备时显式指定 serial |
| SDK Command-Line Tools | 现有 `scripts/env.sh` 查找 `cmdline-tools/12.0/bin` |
| Android NDK | 原生扩展需 `ndk;27.2.12479018`；仅 JVM 测试不需要 |
| Node.js / npm | Node 22 系列及其 npm；插件按各自 lockfile 安装 |
| Python | 3.11 或以上，脚本使用 `hashlib.file_digest`；部分工具需要另装其声明的 Python 依赖 |
| 系统命令 | Git、curl、unzip、xz、tar、CMake、Ninja、C/C++ 编译工具、dpkg-deb |

Ubuntu/Debian 宿主可先准备系统工具（由操作者执行需要管理员权限的命令）：

```bash
sudo apt-get update
sudo apt-get install -y openjdk-17-jdk python3 python3-venv git curl unzip xz-utils cmake ninja-build build-essential dpkg-dev
```

检查 `python3 --version` 是否达到要求；不要假定所有发行版的默认 Python 都满足。Node 单独从可信发行渠道安装，`node --version` 应为 22.x。上游完整 snapshot 构建还可能使用 pnpm，按对应构建脚本声明准备，不能把 npm 插件构建当作 snapshot 重建。

### SDK 目录与安装

以下命令从仓库根执行。SDK、JDK 和缓存均不提交。

```bash
mkdir -p .tools/android-sdk .tools/bin artifacts logs
# 采用系统 JDK 时，创建仓库工具链入口；已有入口请先核对，不覆盖。
if [ ! -e .tools/jdk17 ]; then
  ln -s "$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")" .tools/jdk17
fi
```

先确认系统 `javac -version` 为 17。若使用独立 JDK，将解压后的 JDK 根目录放到 `.tools/jdk17`，不要多套一层目录。

从 [Android 官方下载页](https://developer.android.com/studio#command-tools) 获取 Command-Line Tools。现有 12.0 包的来源及摘要记录在 `docs/download-sources.json`（`commandlinetools-linux-11076708_latest.zip`）。核对对应摘要后，将压缩包内部 `cmdline-tools` 的内容放入 `.tools/android-sdk/cmdline-tools/12.0/`，最终应有 `12.0/bin/sdkmanager`、`12.0/lib/`、`12.0/source.properties`。不要将其他版本仅改名为 12.0。

```bash
source scripts/env.sh
java -version
javac -version
python3 --version
node --version
sdkmanager --sdk_root="$ANDROID_HOME" --licenses
sdkmanager --sdk_root="$ANDROID_HOME" 'platform-tools' 'platforms;android-36' 'build-tools;35.0.0'
# 需要编译 ASR、VAD、Codex launcher 或对齐引擎时再安装：
sdkmanager --sdk_root="$ANDROID_HOME" 'ndk;27.2.12479018'
```

工具包安装及许可证接受方式见 [官方 sdkmanager 文档](https://developer.android.com/tools/sdkmanager)。官方也提供更新的 SDK 管理入口；本项目这里记录的是现有脚本兼容路径，并未验证迁移到新工具链。

`scripts/env.sh` 会将 JAVA_HOME、ANDROID_HOME、Gradle 缓存等指向仓库 `.tools/`，不是自动安装脚本。已有系统 SDK 的开发者可让 `.tools/android-sdk` 指向已有 SDK，或自行导出相应环境变量；不要在设置好外部路径后再次 source 它，误覆盖配置。首次 Gradle 调用需要网络下载依赖，不要直接使用 `--offline`。

### 可以独立执行的验证

```bash
source scripts/env.sh
export npm_config_cache="$DSH_ANDROID_ROOT/.tools/npm-cache"
cd android-shell
./gradlew :app:testDebugUnitTest --console=plain
```

插件分别在各自目录执行以下命令；仅对声明了 test 的包执行 `npm test`：

```bash
npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund
npm run build
npm test
```

需保留上面的 `npm_config_cache`：responsive 目录仍有历史 Windows 缓存配置。模块依赖与验证顺序见 [MODULES.md](MODULES.md)。JVM/插件测试不要求下载 ASR 模型，也不代表完整 APK 能运行。

### 完整 APK 还需要什么

工具链只是前置条件。当前基线是 Android 壳 0.14.0-preview、DSH 0.1.5-rc.1，不能直接套用旧 0.13.3 下载／overlay 命令。下列材料仍需按 [UPSTREAM-INTEGRATION.md](UPSTREAM-INTEGRATION.md) 装配：

- 已校验的上游 snapshot，以及本仓插件与引擎补丁。
- Debian/PRoot bundle：`fetch-debian-inputs.py` → `prepare-debian-bundle.py`，并实际注入 snapshot；只有 Debian 插件源码还不能启动环境。
- Codex 原生运行时：`prepare-codex-runtime.py` 消费公开的 runtime-lock；当前为 ARM64。
- 本机语音：ASR/VAD/对齐原生构建及其许可证，模型另行选装。
- 同次构建生成的哈希、装配回执和自有签名。

`rebuild-codex-shell.py` 是**已有完整构建的增量入口**，会读取 `artifacts/build-arm64-codex.json` 和旧 snapshot，不是新 checkout 的首次构建命令。不要伪造回执或复制维护者的签名来绕过检查。首次构建改用 [FIRST-DEPLOY.md](FIRST-DEPLOY.md) 的 `first-build.py`，按阶段从公开输入生成回执；这不表示用户账号、模型和设备内工具已经初始化。

新 checkout 缺少私有 debug key 时由 AGP 生成自己的调试身份；它不能直接覆盖使用另一签名的已安装 DeepCode。发布签名应独立管理，不入 Git，也不通过卸载用户应用来绕过签名检查。

### 模拟器是可选项

源码和 JVM 测试不需要模拟器。界面验收可另装 `emulator` 和 `system-images;android-35;google_apis;x86_64`，创建自己的 AVD，并按宿主系统配置 KVM 访问权限。无需复制维护者用户名或其 KVM ACL 命令。x86_64 模拟器不能代替 ARM64 Codex/ASR 原生运行验收，也不模拟 HyperOS 后台策略。

## 2. 让设备里的 Agent 编译 Android 小应用

这是 **Android 宿主 Termux 工具链 + Debian/PRoot ARM64 工具链** 的组合，与上面电脑的 SDK 安装独立。当前提供最小 Java APK 构建器，未承诺完整 Gradle/Kotlin/Compose/NDK 项目均可在设备编译。

### 设备内需要准备的内容

| 位置 | 必需内容 |
|---|---|
| Android 宿主 | DeepCode 引擎、Python、adb、应用自己的 ADB 授权与无线配对 |
| Debian | OpenJDK 17、aapt、apksigner、zipalign、zip、android-framework-res、Python；图标转换还需 python3-pil |
| Debian `/root/android-app-lab/toolchain/` | 从合法安装的电脑 SDK 取得 API 36 `android.jar` 与 Build Tools 35.0.0 `lib/d8.jar` |
| 应用 Codex HOME 的 `skills/android-app-dev/` | 本仓 `android-shell/codex-skills/android-app-dev/` 的完整目录 |
| 共享项目目录 | 用户选择的持久目录；例 `/storage/emulated/0/work/my-app` |

Debian 内的软件安装清单可参照 `scripts/android-app-lab/install-toolchain.sh`，但该脚本要求先把 android.jar、d8.jar 和 build-app.sh 投放到其 `/workspace`，不能在空目录直接执行。使用图标功能还要安装 `python3-pil`。

`deploy-pad-skill.py` 是当前平板的辅助部署器：限定设备代号、依赖电脑 SDK，并检查已有 imagegen；它不是任意新设备的一键安装器。电脑与 DeepCode 自己的 ADB 配对身份独立，电脑已配对不能代替应用配对。

准备后，在设备的 Codex 执行环境中运行：

```bash
python "$CODEX_HOME/skills/android-app-dev/scripts/app.py" doctor
python "$CODEX_HOME/skills/android-app-dev/scripts/app.py" build --project /storage/emulated/0/work/my-app
```

项目需已有 `AndroidManifest.xml`、Java `src/`，可包含 `res/`。构建流程为 aapt → javac → D8 → zipalign → apksigner。`doctor` 只检查部分 SDK 输入与 ADB 状态；仍需一次真实编译验证 Java、资源工具和 Debian runner。

当前 Java stubs 为 API 36，而 Debian 的资源框架可能为 API 29，不能据此承诺最新资源 API；最小示例遵循技能的兼容约束。安装生成的 APK 仍受设备系统确认策略约束。

### 图标、媒体和模型是另外的可选能力

`android-app-dev` 只在当前 Codex 环境确有 imagegen 技能及图像工具时调用它。仓库并不提供该系统技能的自动安装，也不保证任意账号都可用；没有它仍可使用已有图标编译应用。

FFmpeg、Chromium、HyperFrames、字体、ASR/对齐模型、远程 ASR/TTS 配置不属于 Android 编译器。它们需各自安装和验收，不应因“Debian 已启动”就宣称全部可用。Codex 登录、API key、ADB 私钥和设备会话保持用户私有，不复制维护者配置。
