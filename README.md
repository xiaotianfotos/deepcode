# DeepCode for Android

在 Android 手机上和平板上运行 Coding Agent。项目文件、命令执行与开发环境留在设备上；模型可使用远程 API 或另行配置的本地服务。可选本机 ASR 的推理也在设备上进行。

本项目是 [kelai141/dsh-mobile-apk](https://github.com/kelai141/dsh-mobile-apk) 的下游，基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。保留原作者公开 Git 历史和许可证，固定集成基线见 [来源清单](docs/source-provenance.json)。

## 主要能力

- **Android 开发环境**：原生壳、WebView 和内嵌 Termux 工具链，可选 Debian/PRoot，支持共享与外置存储。
- **DSH / Codex 双后端**：Codex App Server 登录、模型选择、工具执行和会话恢复；Codex 使用自己的提示词与技能机制。
- **语音交互**：本机或 API ASR、可选 TTS、按需 `say` 播报、桌面鲸鱼入口与流式回复提示；Codex 可选 GPT Live。
- **多会话工作台**：并行泳道、独立草稿、手柄和可配置遥控器输入。
- **可选外观与通知**：折叠过渡、启动动画、后台任务通知。
- **Agent 技能**：Android 应用开发、本机调试、媒体处理与语音转录／对齐。

可选功能在 **设置 → 插件** 管理。平台桥、文件系统等底层依赖有单独的生命周期约束，见 [插件契约](docs/development/PLUGIN-CONTRACT.md)。

## 目录与模块历史

Android 工程位于 `android-shell/`，功能插件位于 `android-shell/plugins/`，根目录 `scripts/` 是下游构建与验证工具。新增代码按七个模块提交；共享宿主接口与插件的依赖、源码和验证入口见 [模块导航](docs/MODULES.md)。

## 开发与使用边界

这是源码仓库，本次不提供新 APK 或模型下载包。源码不包含账号、API Key、设备配对身份、签名、SDK、模型或运行时快照。

首次构建与部署按 [FIRST-DEPLOY.md](docs/FIRST-DEPLOY.md) 执行。新入口从公开输入生成本次快照和回执；旧增量脚本仍要求已有构建。完整设备能力还须逐项初始化和验收，不把构建成功当作部署完成。各插件可按模块文档安装锁定的开发依赖、构建并运行测试；Android JVM 测试需自行配置 JDK 17 与 Android SDK。设备上的 Codex、ASR、Debian 和特权功能还依赖各自的运行环境、权限与平台支持。

- [Android 构建环境（电脑与设备内）](docs/ANDROID-BUILD-ENVIRONMENT.md) · [运行时边界](docs/RUNTIME-BOUNDARY.md)
- [共享存储](docs/STORAGE.md) · [Debian](docs/DEBIAN.md) · [Codex 后端](docs/CODEX-BACKEND-MILESTONE.md)
- [语音服务](docs/development/SPEECH-SERVICES.md) · [工作台与手柄](docs/PS5-VOICE-DECK-DESIGN.md)

`android-shell/` 中的上游 README、发布脚本和工作流保留供来源与维护参考；它们不是 DeepCode 已发布的下载渠道。不要使用上游公开测试签名作为自己的发行身份。

## 许可证与贡献

新增自有代码与文档采用 [MIT](LICENSE)。[许可范围](LICENSING.md)、[第三方组件](docs/THIRD-PARTY-COMPONENTS.md)和各组件原有 LICENSE/NOTICE 同时保留。APK、运行时和模型的再分发需要另行核对对应许可。

贡献请围绕一个完整模块，保留模块测试与必要文档。提交前执行 `python3 scripts/audit-repository.py` 和 `git diff --cached --check`；本地账号、测试记录和环境数据只留在忽略目录。详见 [仓库边界](docs/REPOSITORY-HYGIENE.md)。
