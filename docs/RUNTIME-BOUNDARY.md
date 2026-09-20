# 运行时架构与边界

当前产品由 Android 原生壳、WebView 前端、内嵌 Termux 用户态和 Android 版 Node/Harness 组成；Debian/PRoot 插件提供 Linux 软件兼容环境。全原生前端和去 Termux 不属于当前实现。APK 原生层负责进程、生命周期、权限、快照事务和 Android 能力桥接；可扩展能力通过插件接入，不将模型业务逻辑堆入 Activity。

## 构建与装配边界

当前 ARM64 入口见 [首次构建与部署](FIRST-DEPLOY.md)。`scripts/first-build.py` 校验公开固定摘要的上游 snapshot，构建并装配本仓插件、受管补丁、Debian bundle、技能和原生组件，再验证实际 APK 的快照与原生文件摘要。该流程不要求维护者已有 APK 或私有回执，也不声称从源码重编译全部 Termux/Node 二进制或逐字节可复现。

引擎版本、插件锁文件、补丁和启动资产必须配套，来源以 [上游集成规则](UPSTREAM-INTEGRATION.md) 为准。不能将较新的官方 checkout 直接替换进旧快照；插件编译成功也不能替代实际装配检查。启动时覆盖运行时模块的 `assets/patched/` 资产同样属于版本与摘要校验范围。

需要直接执行的 Codex、语音引擎和 PRoot loader 等组件安装到 APK 的 `nativeLibraryDir`，遵守 Android 应用域执行限制；不能仅复制到可写 app-data 后假定能执行。模型、账号凭据和外部服务配置由用户另行准备，不从开发者机器或已安装设备复制进交付包。

## 后端与权限边界

DSH 与 Codex App Server 后端并存。Codex 会话由其自身流程管理规划、上下文和工具执行，Android 插件负责协议与平台适配，不重新注入 DSH 提示词或工具决策。具体约束见 [Codex 后端](CODEX-BACKEND-MILESTONE.md)。原生桥和插件的职责及生命周期见 [插件契约](development/PLUGIN-CONTRACT.md)。

[Debian/PRoot](DEBIAN.md) 是兼容层，不提供强安全沙箱。宿主应用权限、Android 后台限制和共享存储语义仍然适用；Debian 工具链与 Android/Termux 工具链分别管理。可运行某个 CLI 不等于具备其全部生产依赖或后台常驻保证。

## 文件与更新边界

文件适配必须保留原接口的并发保护语义。`createIfAbsent` 不能改成先检查不存在再普通 rename，否则可能覆盖并发创建的目标。`dsh-android-fs` 通过固定版本的 `internals.linkFile` hook 接入 `renameat2/RENAME_NOREPLACE`，复用同一应用 UID 下的 Python/ctypes；这是平台适配，不是模型改用 Bash 的回退。适用文件系统及接口约束见 [文件系统适配](FS-ADAPTER.md)。

APK 更新和快照迁移必须保留账号、会话、Debian、项目及用户修改。安装前核对签名和忙态，等待 Agent、音频任务、快照事务及双屏租约释放；未知状态不得视为空闲。安装后等待引擎就绪与快照指纹一致，不在解压过程中强制停止。具体流程见 [设备调试规则](../android-shell/docs/AGENTS/devices-and-debugging.md)。

## 验证边界

工具链检查、单元测试、APK 构建、部署、引擎初始化和真实功能验收是独立步骤。模拟器结果不能代替目标 ARM64 设备的页大小、权限、输入法、音频和后台行为验证；启动页或插件卡片出现也不代表后端已授权、模型已安装或工具任务成功。一次性运行证据保存在本地忽略目录，不作为公开首次构建的必需输入。
