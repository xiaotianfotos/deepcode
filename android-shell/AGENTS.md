# Android 开发地图

本文件是 Android、插件和构建维护的索引；仓库通用规则见 [根 AGENTS.md](../AGENTS.md)。修改前先读下表中对应详档，用 `rg` 定位源码。文档与实现不一致时核对源码并在同轮修正；只记录当前约束和可复用方法，一次性日志、调查、截图和验收结果放在忽略的 `.local/`。

## 架构与版本边界

- 当前架构为 Android 原生壳 + WebView + 内嵌 Termux；Debian/PRoot、Codex、语音和工作台由插件扩展。包名 `com.dsharnessmobile.shell`。壳提供前台服务、WebView、存储、快照事务和权限桥；AI 工具通过插件暴露。
- 固定上游来源见 [source-provenance.json](../docs/source-provenance.json)，集成范围及 DSH/客户端版本见 [上游集成](../docs/UPSTREAM-INTEGRATION.md)。旧文档中的 0.13.3 / 0.1.2 发布链不能用来覆盖当前引擎；补丁必须匹配版本和 SHA。
- Termux 快照展开到应用私有 `files/usr` 与 `files/home`；引擎在设备回环地址 `127.0.0.1:3080` 提供认证接口。网页暂停、Activity 销毁、引擎退出与用户划掉任务分别处理，不将前台服务等同后台永不冻结。
- DSH 与 Codex App Server 使用各自的执行流程；Codex 不注入 DSH 全套提示词和工具。迁移保留原日志，未知结构拒绝；会话恢复、stream 结算和合成消息边界见上游集成与 [Codex 后端](../docs/CODEX-BACKEND-MILESTONE.md)。
- 可选插件遵循 [插件契约](../docs/development/PLUGIN-CONTRACT.md)。停用、卸载、初始化失败、重新启用都必须处理；不得由轮询偷偷重启已停用功能。计划与验收区分，待办见 [工作项](../docs/development/PLUGIN-WORK-ITEMS.md)。

## 构建与设备操作

电脑工具链、首次构建限制、设备内 Java 工具链见 [构建环境](../docs/ANDROID-BUILD-ENVIRONMENT.md)。从 `git rev-parse --show-toplevel` 定位仓库根；Ubuntu 命令从根目录执行，先 `source scripts/env.sh`。环境脚本提供路径约定，不自动安装 SDK、JDK 或受验证运行时。不要把旧 PowerShell 命令或本地快照收据当作新 checkout 的完整构建方法。

设备必须由操作者指定并授权，在线设备不自动成为测试对象。连接、安装或调试前读 [设备与调试](docs/AGENTS/devices-and-debugging.md)，核对 serial、型号、代号和 ABI。所有针对设备的 ADB 命令指定 `-s`；发现、配对与连接命令按各自参数使用。电脑 ADB 与应用自身 ADB 的身份和授权独立。

更新前核验 APK 来源、SHA、ABI、签名兼容性和快照；等待运行中的 Agent、快照事务和 Live 音频任务结束，释放应用自己的双屏租约。保留会话、账号、模型、Debian 和项目；不得通过卸载、清数据或强杀解决安装冲突。新 checkout 的 debug key 通常不能覆盖其他人的已安装包；系统安装和输入权限不由开发签名自动授予。

公共仓库不包含开发者密钥、ADB 配对信息、模型或私有回执。[仓库卫生](../docs/REPOSITORY-HYGIENE.md)、[许可范围](../LICENSING.md) 和 [第三方组件](../docs/THIRD-PARTY-COMPONENTS.md) 约束提交与发行。提交前执行仓库审计与暂存差异检查。

## 功能维护边界

- **存储与快照**：共享/外置卷通过实际授权与读写预检；`incoming` 是临时导入目录。保留用户配置与 `.dsh/debian`。快照事务完成前禁强杀；Android FUSE 的硬链接限制不能用普通覆盖 rename 代替原子不覆盖创建。
- **Codex 图片**：附件保存、宿主输入图片缓存和 `imageView` 预览为三个阶段。两个 HOME 的预览根须一致覆盖合法输入缓存，同时拒绝路径邻居和 symlink 越界。参考 [Codex 插件](plugins/dsh-android-codex/README.md)。
- **工作台与输入**：活动单麦工作台位于 `plugins/dsh-client-ui-voice-deck`，来源见 [导入声明](plugins/voice-plugin-import/README.md)。录音、附件、文件回调绑定原会话/输入框；原目标失效时报错，不能广播或转投其他泳道。聊天正文、代码和编辑器保留选字与复制。
- **语音、Live 与通知**：本地 ASR、配置语音服务和 GPT Live 分别处理。Live 仅适用于 Codex，用户显式启动，与单次录音互斥；断线停止，无开机录音。TTS 默认关闭，桌面短回复绑定原请求及会话；取消、切换和停用回收资源。见 [语音服务](../docs/development/SPEECH-SERVICES.md)、[通知](../docs/development/TASK-NOTIFICATIONS.md) 和 [后台语音](docs/AGENTS/background-voice.md)。
- **遥控器**：仅接管已配置且匹配的外接设备，使用焦点租约，不承诺全局监听；系统保留键不修改。桌面小球只在适用条件下接受焦点，触摸其他应用后不抢回。见 [遥控器插件](plugins/dsh-xiaomi-remote/README.md)。
- **启动页**：启动外观由标准插件设置控制，失败和关闭可恢复默认；不延迟已就绪 Web UI。见 [启动页](docs/AGENTS/startup-screen.md)。
- **折叠**：显示状态编号与 OEM 实现相关，不能在未知设备上套用。双屏租约按 owner/token 释放，同一 WebView 交接等待目标尺寸和首帧回执；完全展开恢复系统旋转。输入注入、CDP、像素检查和真实触摸各自报告，不能互相替代。
- **设备内技能**：源码位于 `codex-skills/`，存在源码不代表已部署或具备运行工具。`android-app-dev` 依赖 ARM64 Debian 和应用自身 ADB；imagegen 是可选能力。前提与旧部署脚本限制见 [设备内 App 开发](../docs/PAD-ANDROID-APP-SKILL.md)。会话监控使用用户提供的 manifest，不能默认创建指定数量或特定供应商的会话。
- **模型迁移**：不再内置 `dsh-model-sync`；迁移只撤下原厂入口，保留供应商和模型数据。旧快照必须重新 staging 并验证；不借迁移重置用户配置。

## 详档路由

下列链接相对于本文件；文档内的历史版本描述需按当前来源锁和源码核对，不能当作新安装已通过验收。

| 维护内容 | 入口 |
|---|---|
| 设备识别、无线授权、安全安装、CDP | [设备与调试](docs/AGENTS/devices-and-debugging.md) |
| ADB 权限链、管理工具 | [ADB 链](docs/AGENTS/adb-chain.md)、[Android 管理](docs/AGENTS/android-management.md) |
| 模块地图、依赖方向 | [仓库模块](../docs/MODULES.md)、[壳模块](docs/AGENTS/modules.md)、[架构](docs/AGENTS/ARCHITECTURE.md) |
| Bridge 方法与 Android API | [Bridge API](docs/AGENTS/BRIDGE-API.md)、[API 使用](docs/AGENTS/ANDROID-API-USAGE.md) |
| 构建环境、Gradle、运行时补丁 | [构建环境](../docs/ANDROID-BUILD-ENVIRONMENT.md)、[壳构建](docs/AGENTS/build-and-env.md)、[依赖](docs/AGENTS/DEPENDENCIES.md)、[补丁](docs/AGENTS/RUNTIME-PATCHES.md) |
| 存储、Debian、原子文件写入 | [存储](../docs/STORAGE.md)、[Debian](../docs/DEBIAN.md)、[文件系统适配](../docs/FS-ADAPTER.md) |
| 单麦工作台、折叠显示 | [工作台](../docs/PS5-VOICE-DECK-MILESTONE.md)、[折叠](../docs/FOLD-TRANSITION-MILESTONE.md) |
| ASR、媒体技能 | [ASR 实现](../docs/VOICE-KLEIDIAI-PRODUCTION.md)、[媒体工具](../docs/FOLD-MEDIA-SKILLS.md) |
| 故障、已知缺口、许可 | [故障排查](docs/AGENTS/gotchas.md)、[缺口](docs/AGENTS/known-gaps.md)、[GPL](docs/AGENTS/gpl-compliance.md) |
