- **构建环境入口**：电脑工具链与设备内 Android Java 编译环境分别见 `../docs/ANDROID-BUILD-ENVIRONMENT.md`；旧 0.13.3 命令不作当前首次构建入口，增量回执必须由真实构建生成。

- **模型目录同步退役**：不再内置 `dsh-model-sync`；构建清理旧快照包/原厂挂载，启动迁移仅撤下原厂入口，保留供应商与模型数据。旧增量快照需重新 staging 和核验回执，详见 `../../docs/UPSTREAM-INTEGRATION.md`。

- **公开 Fork 发布**：保留原作者公开历史与所有许可声明，只导入审核后的下游树，不导入 NAS 私有历史；新增自有代码采用根 MIT，第三方许可保留；范围见 `../../LICENSING.md`，组件见 `../../docs/THIRD-PARTY-COMPONENTS.md`。README、目录映射、凭据扫描、素材与发行渠道门禁见 `../../docs/OPEN-SOURCE-PUBLISHING.md`。

## 上游集成分支（维护规则）

旧 Relay/Live 会话迁移使用固定哈希的窄适配；原日志不修改，未知结构拒绝。当前语音/历史导入先建立空 system head 并携带 stream 结算，详见 `../../docs/UPSTREAM-INTEGRATION.md` 的历史兼容小节。

本分支以 `docs/source-provenance.json` 的固定提交为基线：Android 壳 0.14.0-preview、DSH 0.1.5-rc.1、responsive 0.3.3。下方历史条目中的 0.13.3 构建与 0.1.2 补丁只适用于旧发布链，不得直接覆盖本分支的新引擎。入口与边界见 `../../docs/UPSTREAM-INTEGRATION.md`。

实验 staging 支持 x86_64 / ARM64，组合 ID 沿用已安装插件身份；ARM64 原生扩展与 Debian bundle 必须另行保留和校验，不能只更换上游 snapshot。真机升级须先备份，再核对配置迁移及真实工具执行，详见上述集成文档。 Codex 合成消息遵守新引擎 stream 结算字段，会话迁移回退禁止重复独占占位；两个行为回归入口见集成文档。

# AGENTS.md — dsh-mobile-apk 开发地图（索引主文件）

- **默认设备与授权（2026-09-13）**：平板 `yingtian / M367FC` 为主要开发与实测环境，用户允许随时用于当前任务，不重复询问测试时机。Fold `lhasa / 2608BPX34C` 仅在用户明确要求时做适配，不顺带连接/部署；不打断平板已有 Agent，不清数据、不绕过系统安装确认。根 `AGENTS.md` 记录架构、NAS 提交与四会话分工，具体操作见设备详档。

- **NAS 源码整理（2026-09-13）**：原始实机资料、签名、模型和本机目录不入库；设备实值留在 `.local/devices-and-debugging.md`（仓库根），文档地址均为示例。调试构建有本地原密钥时沿用，新 checkout 使用 AGP 本机 debug key。详见 `../../docs/REPOSITORY-HYGIENE.md`，后续提交先运行仓库审计。

> **AI 主动更新条款（必须最先执行）**：本文件是唯一权威入口，采用「主文件索引 + docs/AGENTS/ 详档」结构。**任何代码变更导致描述失真时：① 主文件对应行当轮更新；② 细节写入 docs/AGENTS/ 对应详档（坑→gotchas.md 追加递增编号；长期实现变化→更新记录表登记；一次性实验/测试记录只放根目录 `.local/`，不追加进历史档）。** 若发现文档与源码不一致，以源码为准并当场修正。**查询规范：优先用 grep 在 docs/AGENTS/ 详档内定位（见下方路由表），不要凭记忆猜细节。**
>
> **过期风险声明**：代码演进可能快于文档更新；一切以源码为准。

- **Voice Deck 来源**：活动单麦工作台在 `plugins/dsh-client-ui-voice-deck`；导入来源、MIT 声明与公共接口参考见 `plugins/voice-plugin-import/README.md`。未接入多麦及旧 Deck 副本只留本地归档。

---

## 1. 仓库概览

- **手机输入栏**：0.1.5 以原生附件入口为准，启动时一次性停用未定制的旧 `attachment-formats` 工厂插入块；自定义配置/显式开关保留，包与文件不删除。窄屏工具组使用紧凑间距，仍允许大字号/额外插件自然换行；维护边界见 `../../docs/UPSTREAM-INTEGRATION.md`。

- **会话恢复**：固定 0.1.5 客户端补丁保留重连期间被暂时隐藏的会话选择；显式新建仍清空选择。语音焦点忽略未就绪列表，已提交的顶部回复在空白视图期间保留原会话；切换到另一有效会话或停用时回收。见 `../../docs/UPSTREAM-INTEGRATION.md`。

- **桌面顶部回复浮层**：鲸鱼入口保留；语音成功提交后按请求 ID 绑定回合，顶部 AGSL 窄胶囊柔光点在首段回复到达时连续展开深色半透明文字框，三行流式尾文，60 秒无正文更新淡出。点击复用原会话完整聊天，禁止创建分支会话或朗读全部正文。动画独立于文字、30fps 上限，息屏/锁屏/进入应用/停用时移除；省电/系统关闭动画降为静态。见 `docs/AGENTS/background-voice.md`。

- **鲸鱼 GPT Live**：展开面板在 Live 插件启用且当前会话/泳道为 Codex 时显示波形入口，复用原会话与原生权限链路；连接后可停止，与单次 ASR 互斥。Live 状态合并到鲸鱼，不另建浮标；通信音频优先现有耳机，否则显式选择扬声器。见 `docs/AGENTS/background-voice.md`。

- **Codex 前台进度**：GPT Live 插件卡片统一管理“显示进度 / 朗读进度”；普通文字/ASR 回合也适用。仅显式 commentary 进入输入框进度区，TTS 使用语音服务默认配置并默认关闭；当前会话前台播报，桌面交给 say，录音/Live/切换/停用取消。身份、去重与生命周期见 `plugins/dsh-codex-live/README.md`。快照内置插件首次升级仅接受随包基线哈希；未知用户改动继续保护。

- **悬浮球语音反馈**：`say` 区分确认、进度、结果；语音可用时要求 Agent 开始先确认、结束必报结果，确认/结果每轮各一次且不受进度 30 秒限流。普通聊天前台且浮层收起时释放播放租约；Codex 通过专用技能查询当前线程可用性。队列与失联/停用边界见 `../../docs/development/SPEECH-SERVICES.md`。

- **任务通知与桌面语音分流**：`dsh-task-notifications` 在标准插件设置中控制任务提醒/后台进度。按可见会话和原生前台状态静默去重；桌面语音成功回复降为静默通知，失败与决策继续提醒。顶部回复层由语音提交触发胶囊等待、有正文时展开流式显示、60 秒无新正文隐去，点按打开当前会话记录。维护约定见 `../../docs/development/TASK-NOTIFICATIONS.md`。

- **小米遥控器**：`plugins/dsh-xiaomi-remote` 使用标准 settings namespace / 插件卡片，默认关闭，通过“点击录入→按遥控器键”配置语音/返回/确认三个按键和动作（只读显示当前绑定名称/键码，15 秒捕获，取消/离页回收，录入不执行原动作），配置卡片使用独立主题样式及窄容器换行；`RemoteInput` 仅接管匹配的外接遥控器，聊天使用短期焦点租约，展开桌面面板复用单次语音与草稿操作，最小化不提供全局键监听。音量、方向和系统保留键不修改。细节见 `plugins/dsh-xiaomi-remote/README.md`。

- **深海启动页插件**：`dsh-startup-appearance` 通过标准 `startup-appearance` settings namespace 与插件卡片控制，安卓缓存开关供下次启动。关闭恢复默认页面，卸载回收。启用时覆盖默认网页加载 Logo，聊天首帧就绪后撤下。GuideChrome 使用本地海底鲸鱼视频，匹配首尾帧后单播放器静音循环，原生品牌/进度/状态布局适配横竖屏；详细状态、日志、存储授权、控制台及更新收进“启动详情”，失败/关闭仍能重试。背景不是加载进度截图；不延迟进入已就绪的 Web UI。维护约定见 `docs/AGENTS/startup-screen.md`。

- **语音服务流式传输**：`dsh-speech-services` 统一配置本机、HTTP 与 Qwen ASR / CustomVoice WebSocket；原生持续上传 16 kHz PCM，TTS 通过 AudioTrack 边收边播；悬浮录音显示真实音量五柱，收起球在鲸鱼背后用绿色填充高度显示同一录音能量，工具条显示识别/回复/朗读短状态，音色及风格在插件配置维护。仍使用单次麦克风交互，GPT Live 仅 Codex；协议、取消和上限见 `../../docs/development/SPEECH-SERVICES.md`。


- **可配置语音服务与桌面会话**：`plugins/dsh-speech-services` 通过 `speech-services` namespace / `settings.plugin.item` 提供 ASR/TTS 独立开关、默认服务和 OpenAI 兼容 / MiMo API 配置；本机 ASR 默认不变，TTS 默认关闭；启用后仅通过 `say` 工具/技能按需说一句短话，长任务可间隔播报实质进展/关键步骤/阻塞，普通回复不自动朗读。DSH 注册专用提示段，Codex 通过托管 say skill，不恢复 DSH 全套注入。ASR＋TTS 属单次语音，使用麦克风图标并支持各后端；波形图标专属仅 Codex 会话可用的 GPT Live 实时模式。普通输入保持 VAD 草稿模式，桌面悬浮入口跟随当前聊天/激活泳道，只提供编辑、语音和收起；按键启停并将原转录排队发送到录音开始的会话；顶部半透明短回复层独立于 TTS，语音提交后显示胶囊等待，正文最高三行并始终滚动跟随末尾，完成后停止更新 60 秒淡出，不显示工具/推理。手柄仅聚焦展开面板接收，不能宣称收起球有全局按键权限。参见 `../../docs/development/SPEECH-SERVICES.md`；构建/安装前遵守当轮用户授权，非 APK 编译与 fake HTTP 测试不能当作实机验收。


- **Android 管理工具契约**：完整控件表与会话快照编号、当前输入视口坐标、越界/旋转检查、默认显示屏串行动作、临时输入法异常恢复；读图仍依赖视觉模型配置。实现、构建与隔离设备测试见 `docs/AGENTS/android-management.md`。

- **后台语音与 GPT Live**：独立标准插件 `dsh-codex-live` 在设置→插件配置，Codex 输入栏波形图标直接启停原生 WebRTC 后台语音，持续收音时显示独立状态标识；完成的语音转写/回复按片段 ID 去重回填当前聊天，重开可补齐；控制页展示 DeepCode/Codex/Live 三种身份，启动时复用原生 NSD 恢复已授权的本机 ADB 端口并显示状态。本地 ASR 插件独立保留；Live 不播放测试音频；短暂音频焦点变化降低音量或暂停后恢复，媒体错误保留后台任务；活跃关闭需先结束，卸载释放语音但保留已提交任务。用户显式开启，可静音/结束，断线停止，无开机录音。安装用 `scripts/install-live-experiment.py` 在同一进程检查 DSH 与 Live 活跃状态，预检失败即退出；协议、构建与验证见 `docs/AGENTS/background-voice.md`；单次证据仅存 `.local/validation/`。

- **全量插件规范化维护范围**：P01/P02 基础修复保留，剩余设置统一按 `../../docs/development/PLUGIN-NORMALIZATION-RELEASE.md` 在一个 HomeRail 本地 Qwen DAG 内分工、整体审查并在本机 Android 模拟器真实安装跑通后验收。覆盖语音/手柄/工作台/Codex/折叠与此前遗漏的沉浸式状态栏、维护、ADB 授权、悬浮球、文件及 Debian 工具；布局包不再拥有这些产品设置的目标尚待整体实现验收，不能把计划写成完成。

- **插件规范化**：遵循根目录 `docs/development/PLUGIN-CONTRACT.md`；可选功能开关、Cordis 卸载和平台必需依赖分别处理。拆分任务见 `PLUGIN-WORK-ITEMS.md`。P01 本地源码已接入停用进程清理、禁止轮询唤醒、重新启用及初始化失败清理；平板已更新并验证启停与模型目录恢复；Fold 尚未更新。固定 Relay 首次激活失败可通过显式重新开启恢复同一适配器，失败后状态轮询不重启；详见 `plugins/dsh-android-codex/README.md` 和 Codex 详档。


- **后台生命周期边界**：由 EngineService 管理引擎与子进程，网页负责交互与展示；息屏、网页暂停和进程终止分开处理。省电/Doze 配置按设备核实，划掉任务仍按用户主动关闭处理。一次性调查、跑分和验收记录只放 `.local/`；提交边界遵循根 AGENTS.md。

- **平板会话监控 Skill（2026-09-12）**：`codex-skills/deepcode-session-supervisor` 让平板Codex通过本机认证RPC读取manifest指定的3个Qwen会话并发反馈，ADB复用android-app-dev负责顺序安装验收。实际4会话已启动，Codex已读取状态并给三个worker成功send；3游戏仍开发中，不把调度成功等同游戏完成。10项fake HTTP检查通过，见 `../../docs/validation/2026-09-12-pad-three-games/`。

- **KleidiAI正式ASR（2026-09-12）**：新增正式构建/收据，默认优化CPU引擎并随APK保留兼容库；麦克风加载失败自动回退、死进程只重试未交付录音，Codex android-transcribe同样接入且支持显式兼容。两机已安装同一APK，应用域优化/兼容样本与真实Codex视频字幕skill均通过；平板完整一分钟RTF0.640。Fold首条短样本漏字、后续六次通过，保留记录；手机真实麦克风3.76秒音频/1.569秒转录，用户确认通过（手动结束）。无snapshot/模型替换。见坑101与 `../../docs/VOICE-KLEIDIAI-PRODUCTION.md`。



- **平板安卓开发 Skill（2026-09-11）**：yingtian 已完成应用自身ADB配对与ARM64 Debian Java/资源/签名工具安装；新增 `codex-skills/android-app-dev`，复用既有 `.system/imagegen`，支持项目构建、安装、日志、截图与图标资源打包。实际平板Codex已生图、编写并构建App，安装暂被HyperOS拒绝，待用户处理；未替换DeepCode APK。见坑98、`../../docs/PAD-ANDROID-APP-SKILL.md`。


- **模型菜单过滤（2026-09-11）**：共享 modelCatalog 仅列出已配置供应商的模型；pi-ai 复用实际适配器的密钥引用及 checkAuth（含 OAuth、环境凭据和免密本地服务），仅同步模型目录不算完成配置。保持设置页供应商入口、路由和会话选择；按原有配置/凭据事件刷新。固定 0.1.2-rc.1 Host 补丁，不替换 Deck 客户端。首次实机发现未声明 settings 依赖导致整个目录报错，现补齐注入，实机恢复6个Codex模型；设置恢复左右双列、44px关闭按钮和AndroidX返回处理。见坑95–96与 `../../docs/validation/2026-09-11-model-catalog/README.md`。

- **Fold 媒体 Skills（2026-09-11）**：手机已补齐 Debian HyperFrames 0.8.33 / Node 22.23.2 / Chromium 与 FFmpeg，APK 加入独立 CPU/Vulkan ForcedAligner；Codex HOME 安装 android-media、android-transcribe。实际 Codex 会话已发现并调用 skill，在应用权限下完成共享音频→CPU ASR→Vulkan对齐→共享JSON/SRT。日常调用不依赖ADB；此为Codex skill，未注册DSH transcribe工具。见坑94与 `../../docs/FOLD-MEDIA-SKILLS.md`。

- **O3 字词时间戳原型（2026-09-11）**：复用现有 llama.cpp ASR，另构建 Qwen3-ForcedAligner-0.6B Q8_0。修复社区引擎漏选 Mali IGPU，矩阵节点证明 Vulkan 执行；一分钟 OSS 中文口播 CPU ASR＋GPU 对齐 45.373s，RTF 0.756。共享 work 已写入 JSON/TXT/SRT；仅 ADB-shell 原型，未挂 DSH 工具、未改 APK/日常语音 CPU 默认。见坑93与 `../docs/FOLD-MEDIA-SKILLS.md`。

- **原生选字边界（2026-09-11）**：只在 Android 壳限制按钮、标题、侧栏等界面控件的默认选字/菜单，普通聊天与泳道 `[data-chat-flow]` 正文、代码和编辑器继续支持选字/复制粘贴；自定义菜单事件仍传播。Deck 存在正文选区时让出横向手势，避免拖选变成切泳道。87 项响应式与 6 项 Deck 检查通过；Fold 鼠标拖选验证通过，用户确认真实触屏“可以了”。已按用户要求将 Fold 与 Pad 更新到同一 APK，平板完成运行时事务升级且4份配置哈希未变、24会话可读。见坑92与 `../../docs/validation/2026-09-11-native-interaction/README.md`。

- **折叠模糊微调（2026-09-11）**：参考开合片段逐帧分析后，将内屏渐清晰过渡带跨过投影边缘，避免右侧过早全清晰；145–175°平滑退出，>=175°直接移除RenderEffect，外屏<=3°直接清晰。保留双屏租约、宿主交接/方向修复与现有布局；23项Fold测试及两屏13角度像素检查通过，175/179°与清晰源一致、右侧有连续清晰度变化；用户反馈保持速度、增加模糊程度，追加maxSigma 10→14dp（+40%），增强版两屏14角度像素复核通过。见坑91与 `../../docs/FOLD-BLUR-REFINEMENT.md`。

- **Fold 工作台等宽布局（2026-09-11）**：顶部导航改为侧栏折叠SVG图标；Fold+工作台启用覆盖式会话抽屉，不保留56px窄栏，也不挤压双泳道，普通聊天/平板保留原布局。左右列步长为完整内屏宽的一半；外屏镜像取右半画布，合盖重排承接原右侧泳道，展开恢复原双列。工作台底部横向滚动条隐藏，手滑/手柄滚动保留。82项响应式+6项Deck测试、实机抽屉/窗口交接/草稿持续性及右半幅9点像素检查通过；用户实折发现合盖短暂闪左列，现追加显露前泳道/排版握手，369逐帧检查零错误泳道；完全展开释放方向锁，横竖往返4次通过。用户已确认“不闪现了”；随后按要求取消竖屏工作台高亮边框，横屏保留，实机横竖样式验证通过。见坑89–90与工作台里程碑。

- **宽屏软键盘修复（2026-09-11）**：KeyboardBoundary 从仅 `[data-mobile]` 扩展至全部 AppFrame；按 visualViewport.height 限高，并补偿 offsetTop，避免 Fold 展开时浏览器将整页上推约273px。观察原生IME变量的异步到达及 viewport scroll，关闭/卸载恢复原样式。手机左右泳道两轮真实软键盘开关、81项响应式测试通过，见坑88、`../../docs/validation/2026-09-11-deck-ime/`。

- **工作台输入归属（2026-09-11，追加原生菜单修复）**：语音显式使用 `scope.bail(scope, ...)`；附件插件按会话接收图片。用户再次复现揭示另一条「指令 → 上传图片」原生桥仍全页广播 drop，现按 callbackId 绑定原 InputBar，使用局部 `dsh-native-images` 事件经过原图片校验；原输入框关闭时报错、不转投。原生文件引用也绑定来源输入框。实机 WebView 菜单回调/语音按钮轮询跨泳道回归通过，原生返回数据为测试 fixture，真实相册/麦克风待用户复验。工作台隐藏重复会话标题行；仅检测到物理字母键盘时自动聚焦末尾，触屏切换不弹输入法。见坑87与工作台里程碑。

- **触屏提示修复（2026-09-11）**：响应式插件 `TouchTooltipGuard` 在触屏/手写笔输入时隐藏 role=tooltip 提示，避免侧栏开关触摸后残留文字；真实鼠标或 Tab 导航恢复提示，不拦截点击/焦点、不删除 aria-label。工作台删除重复标题/返回按钮行与常驻按键说明，实际 notice 按需出现；原有对话标签可返回。Deck 0.2.0 通过独立版本/SHA守卫补丁更新，透明折叠与皮肤暂停决定保持。见坑85。

- **取消的皮肤**：雾山皮肤及配套安装/测试脚本已移出活动源码，不能自动恢复或打包。透明折叠特效与 stable-presentation 双屏方案继续保留；二者独立。

- **设备与 Ubuntu 调试入口（2026-09-11）**：先读 [设备与本地调试](docs/AGENTS/devices-and-debugging.md)。Fold 为 `lhasa / 2608BPX34C / 192.0.2.20`，平板为 `yingtian / M367FC / 192.0.2.30`；端口与 mDNS 后缀动态变化。从仓库根 `source scripts/env.sh` 后用 `adb devices -l`、`adb mdns services` 发现并核对目标；电脑配对与应用内 ADB 授权分开。当前 Codex 包以 `artifacts/build-arm64-codex.json` 为准，历史默认 install-device.py 不适用。

- **Codex 后端（2026-09-10，核心实机验收通过）**：`plugins/dsh-android-codex` 包装固定 Relay App Server 会话插件，在设置的可配置插件列表提供浏览器登录/账号设置，邮箱中段脱敏；Codex 专属上下文委托入口跳过 DSH 提示词/前置注入，保留原生 Skills；模型/推理等级在独立边界捕获并传入原生请求（坑 65）；图片预览使用独立 CODEX_HOME（坑 64）；输入图片缓存对 Android 禁止硬链接做 rename 回退，保留内容校验（坑 77）；工具预览同时允许严格限定的输入图片缓存根（坑 78）。原生 runtime、code-mode host 与 Shell launcher 使用独立 `--codex` ARM64 构建。当前社区 runtime 不实施只读/工作区隔离，适配层拒绝这些执行模式，仅接受用户明确选择的完全访问。进度见 `../../docs/CODEX-BACKEND-MILESTONE.md`。

- **折叠与温和透视（2026-09-11，实机验收中）**：`FoldGradientBlur` 保留已接受的横向清晰/模糊边界；透视回投改为角度权重混合，位移上限为单面板宽 4.5% / 高 2%，避免过强形变。22 项 Fold JVM 检查通过。实机对照确认持续保持 state 5 双屏时真实开合无 OFF/ON，用户反馈“不黑了”；现已改为前台持有 `stable-presentation` 租约，端点移动同一个 WebView 到外屏 Presentation / 内屏窗口，首帧握手后显露，不在铰链阈值释放状态。六次窗口交接、两种宿主前后台恢复、state5下四角度双屏像素检查通过；旧enable-display脚本黑图假阳性已修复；合盖飞屏复现为断点切换自动播放300ms抽屉/底部面板动画，已在布局切换两帧内抑制，逐帧测试通过且保留手动动画（坑83）；用户选择合盖文字重排、无顶部标志：Fold手机保留正常mobile宽度，取消独立品牌栏、导航并入既有标题区域，修正跨屏safe-area导致按钮压住标签（坑84）；最新120秒实折606样本覆盖0–179°，零OFF/ON、无错误、页面/草稿连续；用户最终观感与外屏输入待确认。见 `../../docs/FOLD-PERSPECTIVE-MILESTONE.md`、坑 82。旧 state 6 交换主副屏和仅 enable-display 1 的路径均曾闪黑，不作为当前策略。

- **折叠平台边界**：仅 TYPE_HINGE_ANGLE 驱动，应用自身 ADB 已配对通道取得 token/心跳/watchdog 租约，退出前台或关闭插件释放；用户系统“保持亮屏”仍单独管理。`plugins/dsh-client-fold-transition` 提供开关；响应式 AppFrame 保持聊天组件挂载，外屏镜像在Fold工作台取右半幅，其他视图按正文起点裁取；合盖可交互窗口使用正常手机布局，禁止把共享 DOM 全局强制 mobile。方向保持实际内屏方向；主题同步原生底栏。历史验收见 `../../docs/FOLD-TRANSITION-MILESTONE.md`。

- **PS5 单麦工作台（本地开发，核心实机验收通过）**：用户取消多麦映射。Voice Deck 使用标准聊天/编辑器四泳道，左侧一行一会话，中间每屏两列并支持横滑选择，来源见 `plugins/voice-plugin-import/README.md`；切换泳道显式将光标定位到草稿末尾；L2 调用既有 layout.toggleSidebar 收放左栏，○ 经原版输入栏发送；修复 /、@ 弹层裁剪及聊天正文横滑与速度惯性；新增可选 `dsh-client-input-gamepad` 与原生 `GamepadInput` 租约桥。`../../scripts/patch-voice-deck.py` 生成版本守卫补丁进入 voice-debug 构建；语音任务独立于视图存活，切换后结果仍投递原会话。进展见 `../../docs/PS5-VOICE-DECK-MILESTONE.md`；LARK 不接入。

- **前台常亮（2026-09-10）**：MainActivity 默认使用 FLAG_KEEP_SCREEN_ON；onPause 清除，恢复前台重新应用，不改系统休眠时间，不覆盖电源键/合盖锁屏策略（坑 71）。

- **角色**：DeepSeek Harness 安卓壳应用（`com.dsharnessmobile.shell`）。职责边界 = 只保留安卓平台权能与桥（前台服务/看门狗/WebView/SAF 桥/快照解压/UndoGate/ADB 授权/审计/控制台/日志）；**AI 可见能力全部来自插件**。
- **运行时形态**：内嵌 Termux 快照（`assets/snapshot.tar.xz` → files/usr + files/home）；引擎 `@deepseek-ai/dsh` **0.1.2-rc.1**（0.13.3 起构建期 overlay；/api 全前缀浏览器鉴权——壳侧 EngineAuth 带 Cookie）监听 127.0.0.1:3080；WebView 加载引擎 Web UI。
- **构建链**：minSdk 26 / targetSdk 34 / compileSdk 36；Kotlin 2.0.21；AGP 8.8.2；Java 17。
- **版本状态**：**0.13.3 开发中（vc30；引擎升级/鉴权/MuxClient 重做/文件引用重构/W1-W10 代码面全绿；2026-09-08 追加运行时替换事务化（SnapshotTransaction）+ 解压权限/绝对符号链接修复，见坑 44-45；回归与 push/PR 待用户口令）**。0.13.2 已发布（vc29，悬浮球 v2.1 全套）。当前开放跟踪：#115（市场 Phase2）、#108（数据备份）。
- **兄弟仓库**（协调仓子目录，本仓内含自包含副本——**坑 36 同步铁律**：协调仓改子仓源码/bump 版本后必须 robocopy 镜像到本仓，lib/ 产物一并拷）：`dsh-shell-termux`、`dsh-client-ui-responsive`（0.1.13）、`dsh-host-web-compat`（0.1.9）、`plugins/`（bridge 0.1.4 / manage / linux-env / file-open）、`vendor/`（marketplace、undo-savepoint + PATCHES.md）。
- **上游** deepseek-ai/deepseek-harness（协调仓 `dsh/` 只读 checkout）：**零改动**；一切适配走补丁/插件/壳侧。
- **共享/外置项目（本地开发）**：`WorkspaceStorage.kt` 从 StorageManager 已挂载卷解析 SAF 路径并做读写预检，host-web-compat 接受内置及 UUID 卷路径；共享 FUSE 新建走显式独占创建策略，见坑 47 和 `../../docs/STORAGE.md`。
- **Android 文件系统适配（本地开发）**：新增 `plugins/dsh-android-fs`，继承原 `SandboxedFileSystem`，仅替换固定 0.1.2-rc.1 的原子新建 hook；实现与回归见该插件 README。标准 write 的 link/EACCES 问题不能因普通 rename 分支存在就视为已修复。
- **Debian 执行环境（本地开发）**：`plugins/dsh-android-debian` 经标准 Bash/审批/任务接口提供安装与执行；Debian rootfs 与 proot 独立打包，静态 loader 必须从 APK nativeLibraryDir 执行（坑 48）；启动及回到前台刷新存储授权，外部 Debian 项目执行显式检查；关闭时按本应用引擎路径清理原生孤儿（坑 49）；`.dsh/debian` 属于必须保留的用户数据。边界与验收见 `../../docs/DEBIAN-MILESTONE.md`。
- **语音/性能插件（本地开发）**：`plugins/dsh-android-voice-input` 在官方输入槽位展示 Homerail SVG 三曲线窄条，WebRTC VAD 配合最近 2 秒底噪的自适应能量门槛，连续 5 秒无语音自动结束并追加草稿（默认本地 0.6B，服务配置委托 `dsh-speech-services`）；`plugins/dsh-android-performance` 提供 GPU/内存浮层（不采集 CPU 占用）。响应式插件拦截 Ctrl +/-/0，仅调整内容字号。壳仅提供 VoiceInputController/PerformanceSampler 桥；GPU 无权限明确不可用。构建用 `--voice-debug`，详见 `../../docs/VOICE-VAD-INPUT-MILESTONE.md`。
- **Pad 9 实机（2026-09-09）**：ARM64 / Android 17 / OS4.0 基础及 Debian 功能通过；默认智能省电会冻结整个 UID，即使已有前台服务。应用级“无限制”后短时后台复测通过（坑 50），详见 `docs/AGENTS/devices-and-debugging.md`。
- **Ubuntu 本地复现补充（2026-09-08）**：bridge 显式引入 `dsh-session` 的事件类型声明；插件依赖以锁文件和 `npm ci --legacy-peer-deps` 安装，缓存路径由环境覆盖，详见 `docs/AGENTS/build-and-env.md` 的「Ubuntu 本地基线」。

## 2. 构建命令速查（在协调仓根执行）

```powershell
pwsh -File scripts\build-apk-013.ps1 -Suffix ""   # 一键双 ABI（门禁失败即拒打包）
pwsh -File scripts\build-apk-013.ps1 -Fast        # dev 快速档（单 ABI x86_64 + preset 1；产物禁发布）
node scripts\build-snapshot-013.mjs <arm64|x86_64> # 快照构建（Windows 需 WSL）
node scripts\smoke-bridge.mjs                      # bridge 冒烟
adb -s <serial> install -r -t out\v<版本>\...apk    # 装机（同签名 debug keystore）
```

门禁链：统一补丁 → 引擎 overlay 抽验（check-engine-overlay）→ 单 pass 注入 → 挂载集 → 机密 → third-party → elf-check → gradle。云端自包含构建：`.github/workflows/build-apk.yml`。

## 3. 高频雷点 TOP（一行一条；全量 101 坑 grep docs/AGENTS/gotchas.md）

- **坑 37**：快照重解压中（~8-12 分钟）**禁 force-stop/杀进程**——唯一完成标志 = `.snapshot-fingerprint` 翻转 + `.snapshot-transaction` 消失（0.13.3 事务化后不再用 `.dsh-backup`）；中途杀 → 事务恢复会自动回滚，但仍建议等完成。
- **坑 18/30**：debug 包默认 x86_64 快照装 arm64 必崩；真机安装只用 ps1 对应 ABI 命名产物。
- **坑 19**：真机改 cordis.patch.yml 后必须冷启动 app（force-stop + start）才重装配。
- **坑 33**：壳侧所有本地引擎调用一律 `Proxy.NO_PROXY`（系统代理劫持探针）。
- **坑 38**：运行时补丁升级引擎时必须逐个核对（rc.2 锁定 asset 会抹掉新引擎代码——0.13.3 prompt 阻断实锤）。
- **坑 44**：WSL 9p 挂载 chmod 无效——归档权限归一化只在 `inject-all.py` 重打包层做（门禁校验注入后快照）。
- **坑 46**：write 的 createIfAbsent 仍受 Android link/EACCES 限制；本地 fs adapter 用原子不覆盖发布，不能以普通 rename 回退代替。
- **坑 45**：快照含 9 个指向 `files/usr/...` 的绝对符号链接（vi/vim/nc/editor/pager 等 applet）——暂存解压必须传 `runtimeRoot=filesDir` 放行，否则静默丢链。

## 4. 详档路由表（grep 形式查询）

| 要查什么 | grep 建议 | 文档 |
|---|---|---|
| 真机身份 / 无线配对 / 安装 / CDP | `rg -n "设备识别|无线连接|安全更新|调试入口" docs/AGENTS/devices-and-debugging.md` | docs/AGENTS/devices-and-debugging.md |
| 坑 N 详情/新坑登记 | `grep -n "^38\.\|^39\." docs/AGENTS/gotchas.md` 或按关键词（`borrowSession`/`store-rehome`/`MANAGE_EXTERNAL_STORAGE`/`run-as`/`overlay`） | docs/AGENTS/gotchas.md |
| 某 .kt 文件职责/函数位置 | `grep -n "<文件名>.kt" docs/AGENTS/modules.md` | docs/AGENTS/modules.md |
| 桥方法签名/通道语义 | `grep -n "<方法名>" docs/AGENTS/BRIDGE-API.md`；0.13.3 增量 grep `pickFilePath\|remote.mux\|EngineAuth` docs/AGENTS/BRIDGE-API.md | docs/AGENTS/BRIDGE-API.md |
| 构建失败/门禁/环境差异 | `grep -n "门禁\|WSL\|abi" docs/AGENTS/build-and-env.md` | docs/AGENTS/build-and-env.md |
| 运行时补丁（assets/patched） | `grep -n "patched\|applyAssetPatch" docs/AGENTS/RUNTIME-PATCHES.md` | docs/AGENTS/RUNTIME-PATCHES.md |
| 35 模块地图/依赖方向 | `grep -n "模块\|依赖" docs/AGENTS/ARCHITECTURE.md` | docs/AGENTS/ARCHITECTURE.md |
| android.* API 清单/守卫点 | `grep -n "API 等级\|android\." docs/AGENTS/ANDROID-API-USAGE.md` | docs/AGENTS/ANDROID-API-USAGE.md |
| gradle 依赖与升级策略 | `grep -n "依赖\|升级" docs/AGENTS/DEPENDENCIES.md` | docs/AGENTS/DEPENDENCIES.md |
| GPL 合规三形态 | `grep -n "copyright\|LICENSES" docs/AGENTS/gpl-compliance.md` | docs/AGENTS/gpl-compliance.md |
| 待办与已知缺口 | `grep -n "F[0-9]\|未实现" docs/AGENTS/known-gaps.md` | docs/AGENTS/known-gaps.md |
| 版本历史 | `grep -n "0.13.2" docs/AGENTS/changelog-archive.md` | docs/AGENTS/changelog-archive.md |

## 5. 更新记录表（最近 3 条；完整历史 docs/AGENTS/changelog-archive.md）

| 时间 | 版本 | 更新内容 | 更新者 |
|---|---|---|---|
| 2026-09-13 | local-codex-lifecycle | Codex 停用释放空闲进程、轮询遵守开关；初始化失败清理、按进程代际隔离、有界退出和保留授权。固定 Relay 首次激活失败支持显式重新开启恢复模型/会话/终端就绪；失败状态轮询不重复启动。 | AI 开发助手 |
| 2026-09-12 | local-session-supervisor | 新增本机会话监控skill和三worker受限RPC；平板3Qwen+1Codex实际读状态/发反馈成功，游戏开发验收进行中。 | AI 开发助手 |
| 2026-09-12 | local-voice-kleidiai | 正式优化/兼容双ASR构建与SHA门禁、应用失败回退、Codex字幕skill接入；平板已安装，双设备验收见详档。 | AI 开发助手 |

- **收起小球遥控**：主动收起展开面板时可将按键焦点转交小球（遥控器/语音服务开启且应用后台）。触摸其他应用后不抢回焦点；前台聊天和停用功能释放小球焦点。不使用无障碍权限，见小米遥控器插件 README。

- **桌面语音发送**：用户按键开启一段录音后，VAD 静音 5 秒自动转录并发送到录音原会话；再次按语音键提前结束。`stopReason` 区分静音与时长上限，达到上限仍保留待确认结果。桌面遥控器删除/确认及手柄方块/圈不提交隐藏草稿，前台映射不变。

- **桌面消息条标题**：不显示会话/文件夹/工作区名称，移除标题行；保留回复正文，无标题占位；没有正文时只由小球表示等待，消息条在最后正文更新 60 秒后隐藏。详见 `../../docs/development/SPEECH-SERVICES.md`。
