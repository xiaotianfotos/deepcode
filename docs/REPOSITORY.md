# 仓库组织

根目录是统一 Git 仓库；`android-shell/` 包含 Android 壳、插件、资源和上游许可。固定来源见 [source-provenance.json](source-provenance.json)，各目录职责见 [MODULES.md](MODULES.md)。从 `git rev-parse --show-toplevel` 定位工作目录，不依赖开发者机器路径或私有仓库。

公开版本保留适用的上游公开历史和许可，不引入维护者的私有开发历史。发布规则见 [OPEN-SOURCE-PUBLISHING.md](OPEN-SOURCE-PUBLISHING.md)。实际 remote 和分支以当前 checkout 的 `git remote -v`、`git branch --show-current` 为准；没有预设 NAS 地址或默认推送授权。

`upstream/` 是可选参考 checkout，不是构建的隐式输入。`.tools/`、`.local/`、`artifacts/` 等忽略目录可能在新 checkout 中不存在；它们存放工具链、私有配置、构建输入或结果，不能代替公开依赖说明。Android 构建所需输入及当前限制见 [ANDROID-BUILD-ENVIRONMENT.md](ANDROID-BUILD-ENVIRONMENT.md) 与 [UPSTREAM-INTEGRATION.md](UPSTREAM-INTEGRATION.md)。缺少受验证的运行时或收据时应报告缺项，不从他人的本地目录或旧 APK 猜测恢复。

源码只保存代码、必要资源、锁定依赖、许可证和长期维护文档。凭据、ADB 身份、签名密钥、设备记录、模型、快照、截图和一次性测试结果不提交；结果即使脱敏也仍存忽略的 `.local/`。公共方法必须在仓库内可读，不能要求先读取维护者私有报告。具体规则见 [REPOSITORY-HYGIENE.md](REPOSITORY-HYGIENE.md)。

新设备没有隐含授权、已安装插件或登录状态。设备发现、签名兼容、数据保护和权限边界见 [设备与调试](../android-shell/docs/AGENTS/devices-and-debugging.md)；安装准备见 [SETUP.md](SETUP.md)。

提交前检查 `git status`、明确暂存路径，运行 `python3 scripts/audit-repository.py` 和 `git diff --cached --check`。推送仅针对操作者已授权的 remote 与分支；不要使用 `--mirror` / `--all` 推送本地备份或内部 refs。移除文件跟踪不会从已有历史中删除敏感内容，发布历史需独立审核。
