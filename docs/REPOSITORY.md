# 仓库组织

根目录是统一 Git 仓库，`android-shell/` 纳入源码管理，保留上游 LICENSE、第三方声明和本地修改。固定来源见 [source-provenance.json](source-provenance.json)。项目当前使用 NAS Git 托管；实际远端以 `git remote -v` 为准，不在共享文档保存操作者的网络与账号配置。

原上游 Git 元数据保留在本机 `.tools/android-shell-upstream.git`，不上传。`upstream/` 为可选官方参考 checkout；运行时快照、SDK、模型和 APK 按锁定来源重新取得，不跟随源码提交。

公开版本保留上游 Fork 关系，按 [OPEN-SOURCE-PUBLISHING.md](OPEN-SOURCE-PUBLISHING.md) 在独立 checkout 导入下游源码，不合并 NAS 私有历史。

提交范围、脱敏规则、调试签名与当前构建限制见 [REPOSITORY-HYGIENE.md](REPOSITORY-HYGIENE.md)。一次性调查、方向评估、测试记录、截图、日志、录音和会话事件仅本机保存，脱敏后也不提交。长期文档只提炼当前实现约束和可复用方法，不依赖本地报告才能理解。

## NAS 同步

先检查 `git status`、暂存差异及 `python3 scripts/audit-repository.py`。只推送明确分支，例如 `git push origin main`；不要推送 Codex 内部 refs 或使用 mirror/all。原 NAS 历史不会因停止跟踪文件而自动脱敏，正式公开前应进行独立历史审查。
