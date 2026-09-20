# 设备内 Android App 开发 Skill

[android-app-dev](../android-shell/codex-skills/android-app-dev/SKILL.md) 用于在运行 DeepCode 的 Android 设备上开发原生 Java App。它通过宿主 Termux Python 调用 ARM64 Debian 构建工具，并使用应用自身无线 ADB 安装与调试。新安装不默认具备 Debian、SDK 输入、ADB 授权或 imagegen；准备方法见 [构建环境](ANDROID-BUILD-ENVIRONMENT.md)。

## 前提与路径

- 目标设备与开发/安装范围由用户指定。DeepCode、Codex 运行时及相应账户配置须可用；保留其他项目、会话和模型。
- 安装并启用 Debian 插件，确认 ARM64 Java 17、aapt、zipalign、apksigner、framework-res、zip、Python/Pillow，以及锁定的 `android.jar` 和 `d8.jar` 可用。电脑构建工具可执行不表示同一二进制能在 Android ARM64 Debian 运行。
- 技能源文件复制至实际 Codex HOME 的 `skills/android-app-dev`；常见 HOME 为 `files/home/.dsh/codex-android/home`，相对于 DeepCode 私有根。保留已有技能和用户修改，更新前审查差异。
- 构建 helper 在宿主 Termux Python 中执行，再通过现有 Debian runner 编译；ADB helper 不直接放入 Debian 创建另一套身份。
- 在应用内「设置 → 开发者选项 → 安卓调试授权」确认本应用配对与访问开关。电脑 ADB 配对不能替代，身份和权限边界见 [设备与调试](../android-shell/docs/AGENTS/devices-and-debugging.md)。

共享项目可使用 `/storage/emulated/0/work/my-app`，但实际目录由用户选择并授权。先运行技能中的 `app.py doctor`：它检查 SDK 输入文件、ADB 程序和应用连接，不完整验证所有 Debian 工具或构建依赖；仍需一次真实构建验证工具链。不要将输出文件存在等同已安装或验收通过。

## 使用与能力

在设备 DeepCode 的 Codex 会话中打开共享项目并描述需求，例如：“用 android-app-dev 开发一个番茄钟，编译并安装在这台设备上，检查日志和截图。”如需生成图标，先确认本次会话的图像工具和技能可用再加入该需求。

| 入口 | 行为 |
|---|---|
| `app.py doctor` | 检查 SDK 输入文件、ADB 程序与应用自身连接 |
| `app.py build --project ...` | aapt 资源/R.java → javac → D8 → zipalign → 签名，输出 APK 和 SHA 收据 |
| `app.py install / launch` | 核对项目包名与产物收据，覆盖安装或启动该项目 |
| `app.py logs / capture / ui` | 获取限定进程日志、截图、UI 树 |
| `app.py tap / key / text` | 系统 ADB 输入；权限拒绝时报告错误 |
| `app.py return` | 返回 DeepCode |
| `icons.py` | 使用 Debian Pillow 将现有图标打包为多密度与自适应资源 |

运行命令和参数见技能正文；从实际 skill 路径定位脚本，不能把电脑路径当设备路径。项目包含 `AndroidManifest.xml`、`src/`、可选 `res/`，产物是 `app.apk` 与 `build-receipt.json`。选定的原图可存 `assets/` 作为项目素材；当前构建器只显式打包 `res/`，不自动将项目 `assets/` 加入 APK。

当前轻量构建器使用 API 36 Java stub 与 Debian API 29 framework 资源，Manifest 按工具链设置 minSdk 26 / targetSdk 34；新的资源属性不可仅凭 Java API 版本推定可用。Java 匿名类可避开当前 lambda stub 兼容问题。完整 Gradle、Kotlin、Compose、NDK 工具链不因该技能存在而就绪，也不能擅自将已有复杂项目重写为简化 Java 项目。

开发签名保存在私有 Debian `/root/android-app-lab/debug.keystore`，不拷贝至共享项目或 Git，不用作正式发行密钥。同包名升级须保持兼容签名；key 丢失/变化时不要自动卸载用户应用。helper 拒绝覆盖 DeepCode 自身，但其他应用仍需用户的任务授权。安装和系统输入受 Android/OEM 规则约束；`INSTALL_FAILED_USER_RESTRICTED` 不自动表示配对失效，`INJECT_EVENTS` 拒绝也不能记为成功。前台交互和安装串行，完成后退出测试 App 并返回 DeepCode。

## 可选图标生成

本仓库不保证安装 `.system/imagegen` 或提供内置图像工具。需要 AI 栅格图标时先发现可用技能、读取其说明并核对当前工具列表；缺少工具时明确报告，可使用用户已有素材，不自动切换收费服务或索要 API key。模型推理和图像生成可能依赖云服务，本机编译不等于离线 AI。

原图及必要创作说明保存在共享项目，`icons.py` 只做尺寸转换和资源打包。它支持传统 mipmap 与 v26 adaptive-icon，不宣称支持 Android 13 monochrome 图标。分层与安全区参见 [Android 官方说明](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive)；透明前景需实际带 alpha，不能将带底色方图描述为透明分层图标。

## 当前部署脚本限制

[scripts/android-app-lab/deploy-pad-skill.py](../scripts/android-app-lab/deploy-pad-skill.py) 是保留的特定机型部署辅助脚本，不是新设备通用安装器。当前源码有以下前提和行为：

- 硬编码检查 `ro.product.device == yingtian`；其他机型会失败。需要 debug 包的 `run-as`，并依赖电脑 `.tools/android-sdk` 中 API 36 `android.jar` 与 Build Tools 35.0.0 `d8.jar`。
- 只检查 `.snapshot-transaction`，不完整检查 `.snapshot-stage`、运行中 Agent 或现有技能修改。调用前须按设备详档完成保护检查；不能依赖脚本代替。
- 逐文件写入技能和 bootstrap，并验证传输 SHA；随后才断言既有 `.system/imagegen/SKILL.md` 存在。因此失败不表示未发生写入，也不会自动回滚。
- 不安装 Debian、不执行 apt、不替换 DeepCode APK；复制的工具链安装脚本仍需在已准备的环境中执行。
- 将回执写入历史 `docs/validation/2026-09-11-pad-app-dev` 目录。新部署应先将工具参数化并改用忽略的 `.local/validation/`，不把生成目录提交。

在这些限制处理前，不把该脚本列为新 checkout 的一键步骤。旧 prompt 和实验脚本也须先读源码，不能默认存在某个会话、模型或工作目录。部署、构建、系统安装、启动、程序自测与真实触摸应分别记录结果，不能用历史实验的结论替代本次验证。
