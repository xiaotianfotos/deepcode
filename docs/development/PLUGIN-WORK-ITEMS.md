# 插件规范化工作拆分

验收契约见 [PLUGIN-CONTRACT.md](PLUGIN-CONTRACT.md)。这些是可开发任务及验收要求，不是一次性调查/跑分记录。运行身份、模型地址、HomeRail 数据库 ID 和日志只保存于本地。

| 顺序 / ID | 独立交付 | 范围与验收 |
|---|---|---|
| P01 | Codex 停用时释放 App Server | [详细任务](issues/001-codex-disable.md)；先修复可稳定复现的进程与状态问题，不迁移账号存储 |
| P02 | 工作台的语音/手柄可选依赖 | [详细任务](issues/002-deck-optional-inputs.md)；缺任一能力仍能显示泳道、编辑、添加附件和发送文字；热卸载/恢复不能重挂整个工作台或丢草稿 |
| P03 | 手柄设置迁入统一插件页 | Host namespace + schema、settingsScope 卡片、旧 localStorage 迁移；无消费方或关闭时无重复轮询/RAF/原生租约；运行时卸载清理按键重复计时 |
| P04 | 语音设置迁移与停用一致性 | 同一配置真值、统一卡片、旧值迁移；停止录音与未完成转录有明确策略，不能晚到投递别的泳道；保留 held 文本 |
| P05 | 工作台设置迁移 | 接续 P02、P03、P04；统一卡片、独立 enabled、四槽与 active 身份保留；关闭退回普通聊天且不停止 Agent |
| P06 | 折叠设置迁移与原生租约验证 | 统一卡片、旧值迁移、减少动态效果；停用和卸载均恢复清晰、释放双屏 override；不改变合盖策略，不回归方向/黑屏问题 |
| P07 | 退出默认分发的性能调试浮层 | 用户已取消常驻监控；清理仍在 voice-debug/Codex overlay 中装配的 performance 包与门禁要求，确认没有其他消费方后再移除桥；不动正式 ASR |
| P08 | Debian/安卓工具的生命周期与清单 | 登记平台必需和可选工具的边界；工具卸载与任务排空/查询独立，不删除 rootfs，不杀其他会话；补齐失败、取消、重挂载测试 |
| P09 | 固定适配层与第三方插件的发布清单 | fs、Termux shell、host-web-compat、responsive 为平台依赖；标明启停/替换生效时机；核验 Undo、marketplace、Relay 来源及依赖，不伪装成全自研 |
| P10 | Codex 开关迁入标准设置存储 | 保留现有可配置插件卡片；enabled 迁入 Host namespace/schema + settingsScope/revision；旧私有设置一次迁移，Host 已有值优先；OAuth、令牌和会话映射仍在专用存储，保留 P01 停用/恢复与活跃任务保护 |

全量范围包含游戏手柄、语音输入、工作台、折叠特效、Codex、Debian、linux-env、manage、file-open，以及平台 bridge/fs/Termux/host-web/responsive 和默认装配的第三方插件。已取消的 performance 浮层退出默认装配，不重新推出。平台必需组件必须明确标注，不能提供会让产品失效的普通开关；可选插件统一设置入口、持久化真值和启停边界。

## 整体交付安排

用户要求剩余规范化一次整体交付。执行契约见 [PLUGIN-NORMALIZATION-RELEASE.md](PLUGIN-NORMALIZATION-RELEASE.md)：原 P03–P10 作为同一 DAG 的内部工作包，并补齐沉浸式状态栏、Android 维护/授权/悬浮球、文件直达设置归属。先完成完整清单与共享协议，再串行实现、整体审查、修订与本机 Android 模拟器整体验收；不得以单个入口迁移完成代替整体验收。

## 执行顺序与并行边界

P01 为首个 HomeRail issue。P02 完成后再迁移工作台设置，避免“关手柄导致整块工作台消失”。P03 和 P04 可分别开发，但共享 settings 契约先固定；跨包 helper 由单个任务拥有，不能两个 Worker 同时改。P06 可独立编码，实际 Fold 验收按设备授权另行安排。P07 触及 overlay 构建，必须与其他打包更改串行集成。

每个 issue 单独形成候选 patch，先跑本地测试、独立审查，再由监督者集成。业务实现与修订使用 HomeRail DAG，监督者准备任务、验证和打包。Worker 不接触设备、不推送、不创建 PR、不直接合并主分支；监督者按根 AGENTS.md 的设备授权补验。共享配置协议固定后再串行开展设置迁移，避免多个任务改动同一 helper。

## HomeRail 工作方式

复用 HomeRail 的 issue Auto Fix 调查→实现→审查→有限修订→产物收集流程。当前 NAS 输入需采用经过验证的浅检出适配，不带 Git 历史、电脑凭据或整个本机工作目录。

任务文档、允许路径、源码 revision 和测试命令是不可变输入；模型只绑定数据库 setting/runtime profile，不放入工作流正文或仓库。首轮选用普通 Auto Fix：Auto Fix v2 的 GitHub PR broker 要求预建 GitHub Draft PR，不适合尚在 NAS 准备、未发布 GitHub 的本阶段。

独立的准备验证 DAG 只检查输入可达、固定源码、依赖、基线测试、问题复现与模型工具调用，不实现 P01。准备验证通过后才说明已经具备首个 issue 开发条件。

启动开发后注册 HomeRail 事件订阅到原 Codex 任务：结束、失败、需要指令/审批、长时间无活动或观测故障才通知；普通进度不重复唤醒。事件持久化后校验 run/workflow 身份再处理，并明确 ACK。不得以 ACK 代替人工审批，也不因连接失败重复创建同一 run。
