# 插件规范化：整体实施与发布契约

本文是一次整体改造的实施输入和长期维护契约，覆盖旧任务 P03–P10 及此前遗漏的 Android 显示、开发者设施。子任务只用于 DAG 内部分工，不能单独作为“插件已规范化”交付。P01 的 Codex 生命周期修复和 P02 的可选依赖修复必须保留。

## 1. 用户能看到的最终变化

设置保持 DSH 现有左右布局、关闭按钮和返回行为。左侧仅保留上游设置分区；本项目增加的语音输入、手柄输入、会话工作台、折叠过渡、性能调试、开发者选项都不再独立占一行。通用设置里也不再插入沉浸式状态栏。不能用 CSS 隐藏旧菜单来代替撤销注册。

所有 Android 扩展统一从「设置 → 插件 → 可配置插件」进入，在原有内容区域使用标准卡片，不另建一套插件管理页面。每张卡片说明功能、启停和实际能力状态；权限入口在对应卡片中。聊天区的麦克风、工作台入口、原有模型选择仍是功能入口，不必搬进设置才能使用。

最终卡片与名称如下。namespace 同时用于 Host 注册和 client keyed slot；实现可沿用已有稳定 key，改名必须提供兼容映射。

| 卡片 | namespace | 用户操作 |
|---|---|---|
| Codex | `android-codex`（保留） | 启停后端、登录/退出、账号与运行状态 |
| 语音输入 | `android-voice-input` | 启停单麦本地 ASR；不增加无必要的模型参数 |
| 手柄输入 | `gamepad-input` | 启停手柄、查看连接状态与既有按键说明 |
| 会话工作台 | `voice-deck` | 启停四泳道工作台、打开工作台、管理未插入转录 |
| 折叠透明特效 | `fold-transition` | 启停既有特效、显示能力、进入双屏与系统合盖授权 |
| Android 显示 | `android-display` | 沉浸式状态栏；不接管 DSH 主题、字体或输入法排版 |
| Android 调试授权 | `android-bridge` | 查看权限、已有 ADB 配对、允许访问/回收；保持原生授权门 |
| Android 维护 | `android-maintenance` | 日志开关、控制台、刷新、受保护的引擎重启/关闭、配置导入/导出 |
| Android 悬浮球 | `android-overlay` | 既有工具动态悬浮球启停和系统悬浮窗授权；默认关闭 |
| Debian 工具 | `android-debian` | 启停新命令入口、查看任务/取消自己的任务及安装状态 |
| Linux 环境工具 | `android-linux-env` | 启停工具链查询等扩展，展示既有工具状态 |
| Android 设备工具 | `android-manage` | 启停 Agent 的设备操作工具；有效权限仍由 Android 调试授权决定 |
| 文件直达 | `android-file-open` | 启停外部打开/分享接入、查看临时目录占用、手动清理 |

“性能调试浮层”和“工具动态悬浮球”是两个实现：前者用户已取消，退出默认分发；后者保留功能但必须有独立卡片和完整停用，不顺便重新开启。所有卡片出现在同一个插件区域，并不要求把所有卡片同时展开。

## 2. 当前代码与完整改造清单

下表是实施起点；不能把已有包名、已有复选框或 P02 安装成功视为本表验收通过。除特殊说明，路径相对 `android-shell/`。

| 组件 / 源码 | 当前缺口 | 本次处理 |
|---|---|---|
| `plugins/dsh-client-input-gamepad` | Host apply 空；`settings.section`；`dsh.input.gamepad.enabled`；无消费者仍有 750ms timer / Web RAF | 正式 namespace/card/scope；空闲与停用释放 timer/RAF/lease；保留路由语义 |
| `plugins/dsh-android-voice-input` | Host apply 空；独立 section；localStorage/event 双链；关闭仅调用 voiceRelease | 正式配置；统一在 VoiceSession 所有者停用/排空；旧结果不得串泳道 |
| `plugins/dsh-client-ui-voice-deck` | 独立 section；`dsh.voice-deck.controller.v2` 混合 enabled 和泳道数据 | 保留 P02 child injection/fence；只迁移 enabled，四槽/active/草稿分离保留 |
| `plugins/dsh-client-fold-transition` | 空 Host、独立 section、`dsh.fold.transition.enabled` | 正式配置和卡片；清理租约；几何、模糊曲线和屏幕交接保持 |
| `plugins/dsh-android-codex` | card 已标准；namespace schema 空，enabled 在 `codex-android/settings.json` | enabled 纳入标准 Host；账号 API 复用同一状态；OAuth 专用存储不变 |
| `dsh-client-ui-responsive/src/client/general-settings` | 沉浸式状态栏借 `settings.general.item` 注入 | 移入新 `plugins/dsh-android-display`，移除旧 contribution |
| `dsh-client-ui-responsive/src/client/dev-section` | 维护、日志、悬浮球、文件清理混在布局包；提供 `settings.dev.item` | 按维护/悬浮球/文件直达拆归；移除 Android 专属左侧分区与旧子槽 |
| `plugins/dsh-android-bridge/src/client` | ADB 卡片寄生 `settings.dev.item` | 自己注册 namespace/card；权限仍由原生 AdbState 管理 |
| `plugins/dsh-android-debian` | 仅工具注册，无标准配置；有按会话记录的后台 PID | 增加 Host/card、新任务闸门；排空与持久任务查询/取消边界 |
| `plugins/dsh-android-linux-env` | tools + env API，无可配置卡片 | 标准配置；关闭停止新执行；保持已装工具和环境配方 |
| `plugins/dsh-android-manage` | tools + androidPrivilege；无功能启停卡片 | 标准配置和工具闸门；原授权链和并发保护继续生效 |
| `plugins/dsh-android-file-open` | tools + HTTP 接入；临时目录管理在开发者页 | 标准配置；关闭后新分享明确拒绝，不误落另一会话；管理入口归本包 |
| `plugins/dsh-android-performance` | 仍由 voice-debug/Codex 构建装配；独立 section | 从默认清单、overlay 生成、快照校验与补丁管线中移除，保留必要许可证追溯；不删除 ASR |
| 新 `plugins/dsh-android-maintenance` | 当前不存在独立所有者 | 只承接既有维护动作；日志为可选开关，页面卸载停止轮询；不引入自动重启 |
| 新 `plugins/dsh-android-overlay` | 当前原生悬浮球偏好与启动不归可卸载插件 | 独立启停/lease；卸载释放自己的悬浮窗；后台意图与授权分开 |
| 原生 `MainActivity.kt` / `WebUiChrome.kt` | 两处沉浸式持久化/应用实现，focus 时旧偏好可能复活效果 | 收敛唯一执行入口；Host 意图 + 原生运行 lease；卸载不能被 focus/onResume 复活 |
| 原生 `AndroidBridge.kt`、相关 controller | 产品偏好、授权和运行状态混合 | 只暴露必要 getter/应用/释放接口；幂等、owner/epoch 安全；不得扩大提权面 |
| 快照与版本守卫 | 更新 client.js 不会自动更新 Host/schema/package client inject/cordis | 同时打包 Host/client/metadata/assembly；启动补丁不能恢复旧菜单 |

## 3. 平台必需组件、第三方与 Skills 的边界

以下也属于本次清单审计，但不能为了“每项都有开关”提供危险的普通停用按钮。

| 类别 | 清单与最终规则 |
|---|---|
| 平台必需 | `dsh-android-fs`、`dsh-shell-termux`、`dsh-host-web-compat`、`dsh-client-ui-responsive` 的布局/IME/选字/桥适配、基础 Android bridge transport；在现有插件清单中标注平台必需、替换需重启，保留原路径和提供者 |
| 原生系统职责 | EngineService/进程托管、权限弹窗、SAF、系统栏执行、安装授权、双屏控制；继续留在 Kotlin，TS 插件拥有可选功能与配置，不把系统权限伪装为普通布尔配置 |
| 第三方固定适配 | `dsh-undo-savepoint`、`dshmarketplace-plugin`、`relay-dsh-plugin-session-import`、`relay-dsh-plugin-codex`；登记来源、版本、许可证、是否默认启用及依赖，复用上游已有设置/清单，不造重复卡片。Relay Codex 由 Android Codex 适配器拥有，不能双重激活 |
| 快照中的其他扩展 | 例如 `dsh-attachment-formats`、原生 directory-picker 等不一定在 plugins/ 下；准备节点必须从实际快照和 cordis 装配枚举，逐项标注“上游原样/固定适配/可选自有/不再分发”，不能只数目录 |
| Codex Skills | android-app-dev、android-media、android-transcribe、deepcode-session-supervisor、homerail-dag-ops 等是 Codex 技能；保留，不能列作 DSH Cordis 开关，也不复制私有凭据进仓库 |
| 已取消实验 | 皮肤、多麦、独立性能实验继续不分发，不因本次规范化重新导入 |

审计发现清单之外仍有自有 settings.section/settings.general.item、独立配置文件或自动启动副作用时，归入上述最近的所有者；如果需要改变权限/平台依赖边界，必须返回具体缺口，不允许将它悄悄排除在“全部完成”之外。

## 4. 标准设置协议

基于当前固定运行时 DSH `0.1.2-rc.1`、Cordis `4.0.2`，检查实物导出和类型后使用 `settings.installSection` / namespace schema、`settingsScope.bind`、`settings.plugin.item`。不要靠自定义接口声明让不存在的方法通过类型检查。

- Host 注册 namespace 与 schema；client 注册同 key 的 card，声明实际服务与 package-level client 依赖。单独改 slot 名称会留下不可见卡片。
- 客户端 `settingsScope` 持有 `status/value/base/user/revision/writable`；ready 前禁用写入，unavailable 明确说明，不能临时退回 localStorage 另起真值。
- `.set` / `.unset` 使用当前 revision；同 namespace 串行写，409 后刷新并提示，不重放过时意图；两屏/多网页不以旧快照覆盖新值。
- 稳定 namespace + 同一配置控制全部消费者：card、麦克风、手柄 service、Deck、后台 Host、原生桥。禁止 checkbox 一个布尔、服务另一个布尔。
- 可选功能默认值沿用有效旧值；新安装的语音/手柄/折叠保持既有产品默认，Deck 默认关闭，overlay 与调试日志默认关闭。Android 显示缺省保留既有沉浸偏好，不能在更新时改变用户选择。
- 关闭功能后 card 仍可见、可重新开启；Cordis 真正卸载后 card 随 namespace/contribution 消失，重新装配通过上游插件清单恢复。
- 上游卡片拥有自己的外观；本项目使用当前主题变量和表单组件/可访问语义，不跨插件值导入其私有 UI，不新增自绘设置导航。

参考：[上游设置卡片契约](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-settings-card.zh.md)、[服务与可选注入](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/03-services.zh.md)。上游 master 仅供解释，实施时以随任务提供的固定 runtime 类型/源码为准。

## 5. 迁移算法与数据保护

每个 namespace 独立执行如下流程，不以一次全局“迁移完成”掩盖部分失败。

1. 读取 Host 原始 `user` 层的字段存在性；用户明确 false 同样是已配置，不能用 truthiness 判断。
2. 已有 Host 用户值最高优先。缺失时读取本字段旧来源，并严格解析；不存在时保留 assembly/base 默认。
3. 用读取时 revision 条件写入；冲突、断连、只读或写盘失败均不标记成功、不删旧值。再次连接后按新 revision 重新判定是否仍需迁移。
4. 回读确认后写版本化迁移标记；旧值最多作为迁移/回滚材料，不能继续参与运行决策。用户后来 unset 不能导致老值再次导入。
5. 客户端卸载、连接切换或新一代实例出现后，旧 Promise/订阅不能回写或执行原生副作用。

| 旧来源 | 迁移字段 | 必须原样保留 |
|---|---|---|
| `dsh.input.gamepad.enabled` | gamepad enabled | PS5 按键含义 |
| `dsh.android.voice.enabled` | voice enabled | `dsh.voice.held.<sessionId>`、ASR 模型与声学参数 |
| `dsh.voice-deck.controller.v2`（含历史 lanes 兼容读取） | 仅 enabled | lanes 数组、active、四个 session 身份、正文草稿、附件、滚动与视图 |
| `dsh.fold.transition.enabled` | fold enabled | 系统合盖、ADB 配对、几何参数、方向与原生显示状态所有权 |
| `dsh.android.immersive` 的 `1/0`、原生 `dsh_settings.immersive_mode` | display immersive | Host 已有用户值优先；缺失时优先读取原生实际持久偏好，再回退 legacy web 值；允许新增只读 getter |
| 原生 dev-log、overlay 偏好 | 对应日志/悬浮球开关 | 不将系统授权位搬入 Host；恢复旧 false，不自动弹授权 |
| `codex-android/settings.json` | Codex enabled | `home/auth.json`、session-links、登录进度/密钥；迁移不得读取令牌进通用配置或日志 |

迁移不能只发生在打开卡片时：用户升级后不进入设置，已停用功能也不得短暂启动。UI 控制器在插件 apply 生命周期完成设置订阅，卡片只渲染。原生需要冷启动缓存时，它只缓存“最近已确认的意图 + 版本”，不能成为第二写入真值；没有活动所有者时不能凭缓存复活特效/overlay。

## 6. 启停、卸载与竞态的明确策略

### 6.1 手柄与工作台

- P02 的可选 child context、live-generation fence、父层卸载时先释放布局再处理延迟 React cleanup 必须保留。
- 游戏手柄只有 enabled、可见、工作台有 sink 且无模态阻挡时采样；空闲不得留 750ms timer/RAF 或原生 lease。监听 visibility/focus/设备事件以重新激活，不靠永不停的轮询。
- L2 收栏、L1/R1 切泳道、三角录音、方块退格/长按、圆圈发送保持；旧 sink 不能发给新泳道。触屏切泳道不弹输入法，物理键盘自动聚焦末尾。
- 关闭工作台退回普通聊天，释放 view/stage/input sink/fold hook；不停止 Agent、不清四槽，不误把待插入文字送到当前其他会话。

### 6.2 语音

- 空闲可立即关闭；已有录音或转录时采用明确排空：立即禁止新录音，已有一条完成或由用户显式取消，结果仍归原 session，无法插入时存 held。
- enabled 表示用户意图，draining/busy 表示运行状态，不能写成已经“资源全部释放”。卡片解释当前状态，保留取消入口。
- 真正卸载必须停止录音、timer 与原生资源；已取得的转录文本先安全保存，迟到完成不能插入新实例或另一泳道；无法保存时必须给出可复制/错误反馈，不静默 ACK 丢失。
- 不改变 Qwen3-ASR-0.6B、KleidiAI/兼容回退、5 秒 VAD、Homerail 波形和原生录音链路。

### 6.3 Codex

- 功能开关与账号 API 共用 Host enabled 真值。卡片走标准 scope，旧 enable API 如保留则代理同一 namespace/revision，不继续写另一份设置。
- 活跃 turn/command 或登录授权操作期间关闭须拒绝并返回忙碌原因，保存前验证；处理“检查 idle 与新任务启动之间”的竞态，不仅依赖 UI 禁用。
- 停用后状态 GET、模型目录、旧异步响应不能重新启动 App Server；启用只恢复一个实例；保留 P01 初始化失败后的显式恢复。
- 保留 GPT 模型、推理等级、图片输入/preview 以及 Codex 原生提示词/Skills 执行边界。

### 6.4 折叠、显示、悬浮球

- 折叠只改变配置归属和生命周期，保持现有模糊/投影函数、双屏 host 交接、合盖重排、方向恢复；关闭/卸载清晰且释放自己的双屏 lease。系统减少动态效果继续优先。
- Android 显示只有 status-bar 意图；safe-area、IME、深色导航栏、触摸选字和布局仍由必需适配处理。关闭沉浸式/卸载显示插件后，focus/onResume 不得重新隐藏状态栏。
- 原生显示/overlay 使用所有者或 epoch 区分新旧实例，释放旧实例不得释放新实例；Activity 销毁仍有兜底。现有系统权限/后台限制保持。
- 悬浮球关闭和卸载移除窗口、订阅与后台资源，不影响 Agent。不能把停止悬浮球等同停止引擎。

### 6.5 Debian、文件、维护和设备工具

- Debian enabled=false 禁止新 exec/start；已有后台任务继续并可按原 session 查询/取消。不得 killall/pkill 或删除 rootfs。工具拥有者撤销注册时保留持久任务记录，由下次启用恢复查询；不声称已停掉仍运行的用户任务。
- manage/linux-env 停用先关新执行入口；已经执行的单次操作返回结果，不跨用户/会话取消。不改变 tools.execute、Bash 策略、ADB 授权或安装确认。
- file-open 关闭后新的分享/打开给出明确不可用结果；不自动创建空会话或投递当前泳道。已完成的导入及对应项目保留；临时清理为独立显式动作，不能当作停用副作用。
- Android 维护不提供“关掉整个 Android”的开关：日志是可选功能，刷新/导入/关闭是明确动作；运行 Agent 时重启/关闭必须检查并避免无提示中断。无权限时保留说明/系统入口。
- Android 调试授权 card 不绕过 AdbState；通用 settings 不能自行授予 allow、pair、all-files、完全访问等权限。必需 transport 和可选 Agent 设备工具分开。

## 7. 单一 DAG 的工作包与所有权

一个 run、一个共享固定源码基线、一个最终候选和一次集成发布。节点间保存完整源码和结构化 handoff，不把半成品依次装给用户。所有实现/修订角色绑定已配置的本地 Qwen；不用 Codex 替代实现。

| 节点 | 输入 / 唯一写入所有权 | 完成条件 |
|---|---|---|
| G0 可信准备 | 固定 NAS revision + 当前已接受源码 seed + 本文/任务表/固定 runtime | SHA 全匹配、浅 checkout、依赖到位、AGENTS/Git/凭据/邻居只读；准备失败不 dispatch |
| G1 范围核验 | 只读完整清单、装配、运行时 | 输出遗漏与跨包依赖；禁止缩减本契约的“全部” |
| G2 共享协议与输入插件 | gamepad/voice/Deck + 同属本次的新共享源码 helper | 标准 settings/card、迁移/开关/排空/可选依赖测试；不写 native 或 responsive |
| G3 原生显示和设置归位 | 新 display/maintenance/overlay + responsive 旧 contribution + bridge card + 明确 native 文件 | 开发者/通用旧入口撤销；授权入口仍可达；原生 focus/lease/恢复测试 |
| G4 后端与工具 | Codex/debian/linux-env/manage/file-open | 标准 Host 配置、任务与授权边界、完整保留 P01 |
| G5 折叠与装配 | fold 插件 + 构建/overlay/补丁/清单 + 性能退出分发 | 所有卡片 Host/client/metadata 齐全；无被启动补丁复原的旧入口 |
| G6 整体集成与可复用验收 | 所有允许路径（串行）+ 集成测试源码/维护文档 | 符合下节硬验收；交付结构化逐项覆盖，补全跨包缺口 |
| G7 可信收集/验证 | 固定测试命令、scope diff、构建、实际 runtime | 完整候选 diff；测试失败不得进入“批准” |
| G8 三个独立审查 | UI/迁移完整性；生命周期/数据；授权/装配/回归 | 每个审查都对完整候选投票，遗漏 card 或生命周期是阻塞，不以“原有问题”豁免 |
| G9 有限整包修订 | 具体审查缺陷 + 原候选 | 修订后重新 G7/G8，最多两轮；耗尽留证据失败，不伪造完成 |
| G10 仲裁与收集 | 最终候选、测试记录、三票 | 三票一致且覆盖完整才输出本地可审查产物；无 PR/push/merge |
| G11 监督验收与发布 | 已通过本地检查的单一候选 | 独立验证、一次构建、本机 Android 模拟器完整体验验收、保留旧 APK 回滚；Fold 等用户授权，不冒充通过 |

G2–G6 按依赖串行，避免两个 Worker 同写桥类型、responsive 或打包文件。三位审查可并行只读，但共用模型的三次执行不构成模型多样性。确认服务已有事件订阅能力后只启动一次，注册回调并核验观察者；只在结束、失败、需要处理时唤醒。

## 8. 硬验收矩阵

以下编号必须由最终 `coverage.json` 引用测试名称、文件与结果。缺任何必做项，状态为 incomplete。不得用函数名搜索或自写 mock 全部通过代替实际运行时测试。

| ID | 检查与预期 |
|---|---|
| UI01 | 原左侧自有 section 注册为零；通用设置没有 Android 沉浸项；无额外 Android 顶级设置页 |
| UI02 | 本文 13 张 card 各出现一次，Host namespace 与 slot key 一一匹配；性能监控不存在；平台组件在原清单可解释 |
| UI03 | 关闭任一可选功能后 card 仍可重新启用；真正卸载/重装则消失/恢复一次；不刷新整个聊天来冒充恢复 |
| UI04 | 平板和窄屏都保持可返回、可关闭的 DSH 设置；主题/字体/模型原入口未消失，无多余页眉、按键提示或横向滚动条回归 |
| ST01 | 每个可选开关覆盖：未配置、旧 true、旧 false、Host false 优先、只读/断线、写入失败、重启和不打开设置直接启动 |
| ST02 | 409 并发写、两 client、多次点击、unset 后不二次迁移、卸载后迟到 Promise；实际 settingsScope/Host provider 测试 |
| LC01 | voice/gamepad 缺失/存在四组合；withdraw/reprovide、父卸载+延迟 React cleanup；实际 Cordis4.0.2 验证，普通聊天/Deck 都可用 |
| LC02 | 关闭手柄/无 sink 后 timer/RAF/lease 为零；重开只有一个 sink；旧按键、重复按键、销毁回调无副作用 |
| LC03 | 录音/转录中停用、切泳道、取消、卸载后完成：结果只归原会话，held 不丢，模型/ASR 参数不变 |
| LC04 | Codex active-work 关闭拒绝；idle 关闭后实际子进程退出、读状态不拉起；重开目录恢复且只有一个 App Server |
| LC05 | fold 关闭清理；显示关闭后 focus/onResume 不复活；overlay 关闭窗口/订阅移除；实际桥契约与 Kotlin 测试 |
| LC06 | Debian 新任务闸门、旧任务存活和同 session 查询/取消；工具卸载重挂、file-open 拒绝、维护动作 busy；不杀其他 Agent |
| PK01 | 所有包 build/typecheck；Host/client lazy factory、client purity、版本/namespace metadata；源码与最终 APK/snapshot 三者校验一致 |
| PK02 | 默认 overlay/cordis/snapshot 不再包含性能浮层；受版本/SHA守卫的启动 patch 不恢复旧代码；从旧 snapshot 升级可用 |
| RG01 | 普通聊天及双泳道文字、附件、语音路由、Markdown、/ 与 @、手柄既有映射、触屏不弹 IME、选字继续工作 |
| RG02 | GPT/本地模型目录、Codex OAuth/image preview、原用户配置/会话/草稿/ASR/rootfs/共享项目不变；不扩大权限 |
| RG03 | 既有 Fold 几何测试通过；实机 Fold 单独标为未测。不得以平板不支持双屏为由判功能通过 |
| RP01 | 逐个恢复所有测试前开关、用户绑定/草稿；无用户任务运行且无 snapshot transaction 再升级；回滚包完整 |

测试分四层：①业务单测与可复用集成测试；②实际固定 settings/Cordis + 真实浏览器 DOM（含 enabled false 的冷启动）；③本机 Android 编译/JVM 与隔离 APK 核验；④本机 Android 模拟器真实 APK 安装、开关、卸载/恢复、冷启动与聊天回归。模型 handoff、自报通过和 DAG terminal 不是第四层证据。纯触屏录音/实体手柄或 Fold 必要人工项目如暂不可执行，明确列出，不能说全通过。

## 9. 源码、打包与交付边界

- 源码基线包含当前 P01/P02 已集成修复；可信准备步骤使用受 hash 保护的 seed，不从工作电脑复制全部目录或私有文件。后续候选增量必须与该 seed 比较，防止覆盖已有修复。
- 允许范围为本表相关插件、明确的新插件/helper、responsive 的设置归位、必要 Kotlin 设置/lease 控制、构建脚本、可复用测试和维护文档。折叠投影/着色器、ASR 引擎/模型、第三方业务实现、签名、CI、Git、设备文件不在 Worker 写入范围。
- 新文件与新包在可信准备阶段预建必要父目录；需要文件 bind 时预建目标并原位写入。禁止 remount、关闭 sandbox、绕过只读边界。拒绝操作必须早报具体路径/原因，不能扩大到整个 workspace。
- 新依赖只使用经过验证的当前运行时/工具链版本，变更 package/lock 必须同步且能从干净 checkout 安装；依赖无法准备时属于明确阻塞，不能通过删除类型检查绕过。
- 构建必须同时更新 Host JS、client JS、package metadata、默认装配和对应 patch asset/SHA。本次改变多个 Host，不能只用旧 client-only 增量脚本声称部署完成。
- 最终一个候选包含源码 patch、功能到文件映射、namespace inventory、迁移协议、可复用验收入口和构建说明。DAG、设备日志、模型地址、测试结果及一次性调查仅在被忽略的 `.local/`。
- 不创建 PR、不推送、不改 HomeRail 生产、不操作 Fold。本轮先在模拟器验收；平板后续更新另作部署步骤；已安装的 P02 是基础修复版本，不能叫作本次设置整合版。

## 10. 完成定义

“全部搞定”指清单无遗漏、一个完整候选、设置入口和配置真值统一、可选功能可安全关闭恢复、已有数据与交互不回归，并通过本机 Android 模拟器实际安装运行的整体验收。若某个子项失败，继续在同一整体任务处理；不能将未做项目改为“后续优化”再宣告完成。


## 11. 模拟器作为最终交付门槛

本轮用户明确要求在开发机 Android 模拟器完全跑通。真实安装候选 APK，验证本机 Host、WebView、设置读写、Android bridge 与配置持久化，不能仅把页面挂到桌面浏览器。原有平板授权继续有效，但本轮不以平板替代模拟器验收。

- 检查模拟器 ABI/API、现有 APK/快照与数据，使用独立验证目录/配置或专用 AVD，避免清空旧环境。可复用已有 x86_64 运行时；ARM64 原生库不能直接混进 x86_64 APK。
- 构建和清单需支持完整功能的模拟器变体。当前 Codex/ASR 构建脚本有 arm64-only 分支：本轮需提供对应 x86_64 原生二进制和声明、校验，或者真实可执行的兼容运行时。不能仅关闭插件让缺失的 Codex/ASR 检查变绿。
- 验收不下载模型、不运行模型推理。x86_64 Codex 验证真实 App Server 进程启停和无需模型的接口，Debian 验证工具执行；语音插件验证设置、配置持久化、权限/桥连接、取消与停用清理，不以固定音频识别或模型速度作为本轮门槛。凭据不能放入产物或日志；实际语音识别效果明确不在本轮验收范围。
- 在模拟器真实 WebView 覆盖 13 卡片、旧菜单撤销、冷启动迁移、每项开关恢复、工作台文字/附件归属及配置重启持久化；转录归属使用受控完成事件验证路由与生命周期，并明确区别于真实模型推理。手机窄屏/平板宽屏可用同一 AVD resize/旋转测试，记录并恢复。
- 实体折叠双屏/屏幕亮灭、真实 PS5 HID、O3 GPU/NPU、麦克风音质及 HyperOS 后台策略不是 x86 模拟器可证明的结果。模拟器应验证对应插件的能力不可用提示、桥/租约和生命周期；硬件层明确标为未覆盖，不宣称该硬件验收通过。
- 只有实际可执行的模拟器矩阵通过，才完成目标。DAG 的源码成功仅表示可以进入本地 Android 编译和模拟器验收；若发现代码或模拟器装配缺陷，仍经 Qwen DAG 定向修订后重新验收。
