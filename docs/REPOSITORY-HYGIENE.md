# NAS 开发仓库的提交边界

NAS 用于当前开发协作；GitHub 开源使用上游 `kelai141/dsh-mobile-apk` 的正式 Fork，保留上游公开历史，仅把审核后的下游源码作为新提交导入，不带 NAS 私有历史或本地备份 refs。创建和公开发布另按用户指令执行。

## 应提交

- 安卓壳、插件、技能、测试源码，以及仍需随源保存的固定第三方发行文件。
- 构建脚本、包管理锁文件、下载来源/提交/摘要、上游 LICENSE/NOTICE。
- 长期维护的架构、接口、使用、构建、故障处理与可复用测试方法；已采纳的决策只保留现行约束和理由。
- 可复用测试源码可以提交，测试运行结果不能提交。
- 必需的应用图形资源；加入新媒体前先核对来源和用途。

## 只保留在本机

- 一次性调查报告、方向决策分析、实验过程、测试记录、跑分和验收结论，**即使脱敏也不提交**。新资料统一放 `.local/research/` 或 `.local/validation/`；历史报告归档于 `.local/reference-reports/`。

- `.local/` 中的真实设备资料、仓库审计、清理前备份和环境变量。
- `docs/validation/`、`evidence/`、`asr-lab/evidence/` 中的截图、原始日志、聊天事件、会话编号、录音和一次性实验记录。
- SDK/JDK、node_modules、模型、rootfs/运行时快照、APK、构建回执、缓存、旧本地下载页。
- 调试/发布签名密钥、ADB 密钥、账号授权文件、模型凭据。
- 主机专用的 NAS 渲染脚本，以及意外生成的 `D:/` 目录。

本机数据只从 Git 排除；已取消或未接入的源码则先校验归档到 `.local/source-archive/`，再移出活动工作树，防止被构建脚本误发现。维护者可将原始文档备份保存在 `.local/repository-audit/originals/`，但它不是构建前提。设备操作先读公开的 [设备规则](../android-shell/docs/AGENTS/devices-and-debugging.md)；操作者自己的 `.local/devices-and-debugging.md` 如存在，仅补充本机身份，不是新 checkout 必需文件。文档中的 `192.0.2.x`、`/path/to/developer/`、`*_SERIAL` 是示例，不能当作真实配置。历史测试结论不因脱敏而变为新机验收。

## 提交检查

先判断用途：未来维护者是否需要它来理解、构建、使用或修改当前代码？仅说明某次调查/测试发生了什么的材料留在本地；混合文档需提炼可复用部分，不能把整份报告改名后继续提交。自动审计仅检查已知路径与信息特征，不能代替这一步内容审查。

```bash
git add <明确审核过的路径>
python3 scripts/audit-repository.py --report .local/repository-audit/index.json
git diff --cached --check
git diff --cached --stat
```

审计读取 **Git 暂存对象**，不是只看磁盘文件。检查本地目录、模型/密钥/大文件、部分凭据特征和本机标识。输出只含文件、规则、行号及摘要，不打印命中内容。合成测试值采用逐条内容摘要白名单；禁止整目录忽略凭据检查。

需检查旧历史时：`python3 scripts/audit-repository.py --history origin/main --report .local/repository-audit/history.json`。历史里已经有原始实机资料和公开测试签名，删除当前文件不会删除旧 Git 对象。NAS 既有历史保留，但不导入新的 GitHub 仓库。发布时从审核后的提交导出源码，应用到独立的上游 Fork checkout；不要导入 NAS `.git`、忽略文件或本地 refs，不通过合并 NAS 分支搬运改动。目录映射、许可和发布门禁见 [OPEN-SOURCE-PUBLISHING.md](OPEN-SOURCE-PUBLISHING.md)。新仓库仍须审查当前内容、许可证和二进制分发，暂存检查不等于发布审查完成。

不要使用 `git push --mirror` 或 `--all`：本机 Codex 检查点/备份 refs 可能含未筛选的资料。只推送明确审核过的分支。

## 构建与调试边界

- 原机器的 `android-shell/keystore/debug.keystore` 留在磁盘且不再跟踪，继续用它覆盖已有测试安装。新 checkout 缺少该文件时采用 AGP 自己生成的本机调试签名，不能直接覆盖其他签名的安装。
- 不把现有公开调试身份当正式发行身份。正式签名另行配置，不纳入本轮。
- ASR 实验样本 WAV 与 debug 录音 fixture 留在本地；依赖它们的测试需先自行准备有权使用的样本。源码本身不附带用户录音。
- `rebuild-codex-shell.py` 是旧增量构建入口，依赖本地快照和 `artifacts/build-arm64-codex.json`。新 checkout 使用 [首次构建流程](FIRST-DEPLOY.md)：锁定公开输入，生成自己的工具链、快照和回执，禁止用维护者私有材料补齐。构建、安装及功能验收分别报告。
- 模型测试 URL 使用 `DSH_TEST_MODEL_ORIGIN`（不含 `/v1`）或 `DSH_TEST_MODEL_BASE_URL`（含 `/v1`）。实际值由操作者提供。Fold 脚本接收显式 serial，并核对 `ro.product.device=lhasa`；旧硬编码显示状态/UID 的实验仍需按设备文档核验，不能因为 serial 参数化就视为通用工具。

## 许可证

保留各组件既有许可证，不在本轮重新许可第三方代码，也不把整个组合笼统宣布为单一许可证。新增自有代码采用根 MIT，范围见 `LICENSING.md`；项目来源见 `docs/source-provenance.json`，组件义务见 `docs/THIRD-PARTY-COMPONENTS.md`。APK 第三方分发仍需按实际发行物单独核对。

必要的应用视频资源及其可重建素材可以按精确路径与完整 SHA-256 加入 `scripts/repository-audit-allowlist.json` 的 `unreviewed-binary` 例外；修改内容后必须重新审核。例外不豁免本地路径与大小限制，设备录屏和测试证据仍只保存在 `.local/`。
