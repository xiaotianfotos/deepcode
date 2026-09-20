# DeepCode 开发入口

本项目是 Android 原生壳 + WebView 前端 + 内嵌 Termux 工具链，Debian/PRoot、Codex、语音和工作台按插件扩展。包名 `com.dsharnessmobile.shell`。

- 修改 Android、插件或构建前，阅读 `android-shell/AGENTS.md` 与对应维护文档。
- 模块职责、依赖和验证入口见 `docs/MODULES.md`；可选功能遵守 `docs/development/PLUGIN-CONTRACT.md`。
- 保留上游公开历史及所有适用许可证；新增自有代码采用根 MIT。公开仓库不得引入私有开发历史或备份 refs。
- 源码只包含代码、必要资源、依赖锁文件和长期维护文档。账号、凭据、签名、模型、快照、一次性调查与测试结果只留在忽略的 `.local/` 等本地目录。
- 提交前执行 `python3 scripts/audit-repository.py` 和 `git diff --cached --check`，明确暂存路径。隐私扫描不能替代人工审核；不得直接推送未经审核的历史。
- 设备测试先获得操作者授权并核实设备身份；每条 ADB 命令显式指定 serial。不终止用户的 Agent，不清除会话、账号、模型或项目，不绕过系统安装确认。
- 环境安装与设备内 Android 编译先读 `docs/ANDROID-BUILD-ENVIRONMENT.md`，不要将已配置的个人设备状态当作新安装前提。
- `scripts/env.sh` 提供本机工具链目录约定；实际 SDK/JDK 与设备配置由开发者自行准备。示例 IP、目录和 serial 不是可用的凭据。
- 首次构建/部署以 `docs/FIRST-DEPLOY.md` 为入口。不得复用维护者私有回执或已装机 runtime；生成自己的构建回执。插件/JVM测试、APK构建、安装与功能验收分别报告。
- 每个功能提交包含对应源码、设置／生命周期处理、相关测试和必要文档；共享宿主接口不得被单个插件私自改成不兼容版本。
