# 后台语音实验

此功能从 `experiment/background-voice-agent` 分支合入主线；下述原生实验构建与部署入口仍按各自适用条件使用。

## 使用与边界

从已有悬浮面板的“语音”入口进入，选择会话后点击“开始后台收音”。首次授权麦克风/通知后再次显式点击开始。可返回桌面或切换 App；通知提供完成录音与取消收音。每段最多 60 秒，复用现有 WebRTC VAD 的静音分段（约 5 秒），无语音不请求 ASR。加载、采音和转写全会话上限四分钟；非全天候监听。

转写在本机 Qwen3-ASR 中完成；草稿可编辑，只有点击发送才调用所选会话的 session/prompt。正在运行的会话用 steer，空闲用 queue。录音期间固定目标会话，转写草稿存在时禁止切换；清空草稿后可重新选择。“取消收音”仅结束语音服务，“停止选定 Agent 任务”调用 session/cancel，并等待状态刷新，不承诺回滚已执行动作。

此本地 ASR 入口不提供实时对话或播报；Codex GPT Live 是下文的独立入口。两者都不提供唤醒词、Widget、默认助手注册或凭语音自动批准敏感操作。后台收音能力不等于后台 UI 自动化、不绕过锁屏，不保证系统回收后恢复。用户划掉任务或关闭引擎会关闭收音；不从开机广播或 START_STICKY 复活麦克风。

## 实现

- `BackgroundVoiceActivity` 是显式操作面，打开页面不启动录音或 Agent；导出的 Activity 不接受自动提交/录音指令。
- `BackgroundVoiceService` 以 microphone 类型启动，持有有时限的唤醒锁，通知可停；原生生命周期独立于 WebView。
- `VoiceInputController` 接受 Context。原输入框仍按 Activity 前台生命周期取消；服务实例仅在显式前台服务启动后获得录音许可。共享麦克风所有权防止两个入口抢麦。
- 原始 PCM 留在内存，转录沿用应用内认证的本地 ASR；实验控制页通过 `VoiceAgentRpc` 在内存中携带现有引擎 cookie。HTTP 成功还需 RPC result.ok 和 prompt accepted，不仅检查 HTTP 200。
- 同一草稿/目标的失败重试保留 requestId，避免超时重试重复提交。成功发送后清除服务中已交付文本。
- 原 Agent 引擎保持已有执行流程，不把语音提示词注入 Codex 后端。

## 构建

普通完整构建仍使用仓库现有流程。只修改原生壳且必须保留安装包运行时时，可备份当前 debug APK，记录 SHA-256，再使用：

```bash
source scripts/env.sh
python3 scripts/build-native-experiment.py --baseline <当前安装包备份.apk> --sha256 <已核实的SHA256>
```

脚本把基线 APK 的 assets 与原生库提取到被忽略的 artifacts/native-experiment 目录，通过 experimentRuntimeDir Gradle 属性供构建使用。输出逐文件核对基线运行时字节，避免另一工作目录里尚未提交的插件改动被旧快照覆盖。此操作仍需要 SDK/JDK/Gradle 缓存与匹配签名；不声称全新 checkout 一键构建。

部署前必须依照 devices-and-debugging.md：确认设备身份、无 Agent 运行、无快照事务、释放双屏租约、备份当前 APK、核对配置和会话。实验包与基线 snapshot 相同才可作为原生覆盖更新；禁止卸载/清数据。回退通过同签名的基线 APK 覆盖安装，保留用户数据；回退也需完整预检。

## 验证

单元检查保留 VoiceInputControllerTest 与 VoiceEndpointTest。真实后台采音由 `scripts/test-background-voice.py SERIAL --session <独立验收会话> --output .local/validation/<本次运行>` 执行：

1. 在亮屏已解锁设备上通过实际 UI 点击启动；不利用 instrumentation 身份或 ADB 权限授予绕过麦克风限制。
2. 返回桌面后播放 APK 内固定语音样本，经过真实扬声器、麦克风、VAD 和本地 ASR。
3. 验证产生非空草稿、目标会话不变、没有自动发送、终态释放服务。
4. 另验证手动发送、Agent 后台执行与取消、收音取消、原输入框的麦克风竞争。

debug-only BackgroundVoiceTestReceiver 只播放固定样本并输出不含转写正文的状态；不能启动收音、任意读取文件、提交任务。release 不包含该 Receiver。测试需清理播放与临时文件，恢复设备状态。单次指标、截图和回执只写被忽略的 .local/，真实用户口音/噪声体验与自动声学回环验证分开报告。

## Codex GPT Live

GPT Live 由独立 Cordis 插件 `@dsh-android/dsh-codex-live` 提供，使用 Host `codex-live` namespace 与同名 `settings.plugin.item`，在“设置 → 插件”配置启停。`settingsScope` 写入使用标准 revision 协议；旧共享语音 localStorage 开关仅在 Host 无用户值时迁移一次，回读成功才标记。原本地语音输入插件保持独立。

Codex 会话输入栏的五条竖线图标直接开启/结束实时语音，首次缺少麦克风、通知或悬浮权限时进入系统授权流程，授权后继续启动，无须再点一次开启。使用前应阅读插件卡片中的持续收音说明。活动时“Live · 会话”打开详情；普通打开详情不会自动录音。Live 控制 Activity 不导出，外部应用不能通过 Intent 触发授权后自动收音。开启不播放固定测试音频，协议初始指令要求等待用户开口。后台收音不依赖网页可见性。

`LiveVoiceService` 持有 microphone/mediaPlayback 前台服务、音频焦点、唤醒锁与原生 WebRTC；不依赖 WebView 定时器或页面前台状态。悬浮标识不可点击、不拦截触摸，连接中、LIVE 和静音分别显示。通知和控制页都可静音、结束；静音禁用本地发送音轨，结束关闭传输并请求停止本次 Live 发起的当前 Codex turn。网络断开、永久音频焦点丢失、应用被划掉或引擎关闭会释放收音，不自动重连/开机启动；短暂音频焦点变化按下文策略降低音量或暂停后恢复。

接入方式参考 HomeRail：`thread/realtime/start`、`version:v3`、`model:gpt-live-1-codex`、WebRTC、自动 Codex handoff、关闭结束时自动提交转录尾部。App Server 与新建/恢复线程均开启 `features.realtime_conversation`，该开关只允许协议，不会自行启动录音。沿用现有 Codex 登录态；GPT Live 可用性由账号和上游服务决定。原生音频使用 WebRTC SDK 的回声消除和噪声抑制，耳机能改善扬声器回声。

### 会话身份

HomeRail 主动创建/恢复 `homerail-live-*` 专属 thread，这是其应用策略。DeepCode 当前实现将 Live 绑定到所选聊天的 Codex thread，复用原模型、权限和工作目录；控制页分别显示 DeepCode session、实际 Codex thread、Live 连接 ID。上游 `realtimeSessionId` 是实时连接标识，其默认值可能与 thread ID 相同，不代表另建了一个 Codex thread。不要用它查询 Codex thread 历史，也不要把语音握手成功写成独立 Agent 已执行成功。

语音插件读取所绑定 Codex thread 的 rollout 中已完成 `realtime_item/transcript_segment`，把用户转写和助手语音回复追加为当前 DSH 会话的标准消息。稳定片段 ID 用于去重；打开会话、回到前台、Live 活跃轮询与结束时补齐，页面重载后保留。只处理完整 JSONL 片段，未完成的流式 delta 不作为提示词提交，不调用 session/prompt。普通 Agent turn 尚未结束时延后补写。历史片段按补入顺序追加，聊天显示时间为补写时间。

Codex 后端任务仍由其持久线程保存；语音片段回填不等于导入全部工具轨迹。Relay 原有完整历史同步目前只处理 imported 绑定，native 语音任务的工具执行细节尚未全部回填。普通文字提交与同一会话的 Live 互斥；先结束 Live 再发送文字。不同会话不共享音轨或事件。当前尚未提供“专属语音协调会话”模式或跨会话调度。

### 协议与生命周期

`/api/android/codex/live` 处于引擎原有认证域中。启动需 CSRF，后续操作需绑定到原 session 的随机租约；不向网页返回凭据、SDP 日志或原始录音。支持 start/poll/stop 与需要 CSRF 的 history 补齐；history 的会话只能解析已有 Codex 绑定，不能指定任意文件。客户端丢失心跳后服务端回收语音；启动取消、重复启动和陈旧租约均被拒绝。原有本地 ASR 与 Live 共用麦克风所有权。

`prepare-live-experiment.py` 在 SHA 核实的已安装 Codex host 上加入 Live 钩子，保留其已有停用/恢复等独立改动；Relay 也在 donor 原补丁上作精确插入。构建使用 `build-native-experiment.py` 的 `--live-host <备份的lib/index.js> --live-host-sha256 <SHA256>`，并先构建 `dsh-android-voice-input` 与 `dsh-codex-live` 两个插件。仅允许明确列出的 Live 资源变动，其余运行时与 snapshot 逐字节保留。SDK 版本固定，许可证打包。

启动时通过已有原生 ADB 通道做只读本机探测，失效端口由 NSD 重新发现并用原配对身份验证后更新。控制页单独显示 ADB 状态。没有授权或连接失败不阻止普通语音，但不能声称可执行屏幕操作；此过程不配对、不撤销配对、不改变权限。

可复用检查：`cd android-shell/plugins/dsh-codex-live && npm ci && npm test`，包括真实 Cordis 的卸载、重装、可选依赖丢失/恢复，以及活跃任务关闭拒绝。`scripts/test-gpt-live.py SERIAL --session <独立 Codex 验收会话> --output .local/validation/<本次运行>` 通过真实 UI 启动验证后台采音/出站 RTP、会话绑定、静音恢复与结束释放，不播放测试音频；语音识别与回复需另行用真人对话验证。debug Receiver 可读取状态和停止测试 Live，不可启动录音，且 Live 活跃时拒绝播放固定样本。设备验收需验证实际 RTP 发送/接收、HOME 后持续采音、悬浮标识、静音恢复、结束释放、身份与原线程绑定一致。统计和本次运行证据仅存 `.local/validation/`；长期息屏与全天待机不能由短时测试推断。

### 插件资源边界

关闭功能前若仍连接/启动中，Host settings 校验会拒绝关闭并提示先结束；空闲关闭撤销 Live 通知监听和轮询。Cordis 卸载/可选 Codex runtime 丢失会关闭语音并释放租约，但不主动中断已提交的 Codex 任务；用户点击“结束”仍会结束当前语音任务。重新启用/依赖恢复只创建一个实例。客户端组件卸载不等于整个插件卸载，切后台不会释放语音。

原生壳只负责权限、麦克风/WebRTC 和前台服务；Codex 插件提供受生命周期管理的 `androidCodexRuntime` 能力，Live 插件拥有路由、产品配置与语音租约。客户端仅在语音活跃期间读取原生状态，无空闲定时器。插件首次作为受管 APK 资源部署至 profile 并写入 Cordis composition，此后不重新插入被用户移除的插件，不覆盖未知/用户修改的包文件。完整快照构建需先构建新增插件，`overlay-fs-adapter.py` 会纳入标准 composition；已安装新版本 host 的实验包需使用上述 donor 构建守卫。

语音历史投影实现位于 `dsh-codex-live/src/history.mjs`；Relay 的可选 runtime seam 提供已有会话的安全读取/持久化，插件自己拥有筛选与去重规则。来源仅限 Codex 私有 HOME 的 `sessions/年/月/日/rollout-*-thread.jsonl`，未知角色、元数据和未写完整的行不会进入聊天；超大历史文件返回可见错误。通过标准 append surface 事件写入并 flush，不复制或改写源 rollout，不更换会话身份。每个完成的语音片段作为已完成的消息轮次展示，统计轮次不等同自然语言的一问一答。复现检查包含真实 DSH Session 的恢复、重复同步、部分文件尾和执行中延后。

实验包安装使用 `python3 scripts/install-live-experiment.py SERIAL --receipt <build.json>`。该入口在同一进程内核对型号、快照、DSH 任务、Host Live 状态、原生麦克风和显示租约，再核对 APK/hash 并在安装前复查；任何失败均不执行 install。Live 发起的 Codex turn 可能不会出现在 DSH session/list 的 running 字段，因此不能只查 DSH Agent。不得把独立预检与安装串在忽略前序退出码的 shell 命令中。

管理工具修复随实验 APK 打包前，先在 `plugins/dsh-android-manage` 运行 `npm ci --legacy-peer-deps` 与 `npm test`，确保 `lib/index.js` 为当前单文件产物；契约见 [android-management.md](android-management.md)。

## 音频焦点与任务存活

系统 `AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK` 只降低远端语音播放音量，保留连接与收音；`AUDIOFOCUS_LOSS_TRANSIENT` 暂停发送麦克风与播放，保留 WebRTC 连接，收到 `AUDIOFOCUS_GAIN` 恢复。焦点恢复不解除用户主动静音。通知、悬浮标识和控制页显示临时暂停状态，不能显示为连接中或已经退出。

永久丢失焦点时结束语音媒体并释放资源，不抢占其他应用；语音错误/焦点丢失不会中断已提交的 Codex 任务。显式“结束语音和任务”仍按用户选择中断任务。临时暂停期间没有音频回放缓冲，不承诺补播被占用期间的回复；网络断开仍按连接错误处理，不隐式开启新的录音。

策略回归：`:app:testDebugUnitTest --tests '*LiveAudioFocusPolicyTest'`，覆盖降音量与恢复、临时独占与恢复、永久丢失后晚到回调、重复/未知事件。真实厂商提示音触发与来电场景需另做实机验收。

## 可配置 ASR/TTS 与直接语音

`dsh-speech-services` 接管普通语音的默认服务与设置入口。桌面模式通过同一 BackgroundVoiceService 的 direct 标志，手动结束后把转录原文排队交给固定会话，不经过 GPT Live；普通输入仍进入草稿。SpeechSessionFocus 跟随当前聊天或工作台激活泳道；SpeechOverlay 提供桌面半透明短回复层、可选朗读和仅焦点面板的手柄输入。工具条只保留编辑、语音、收起，文字输入按需展开，配置留在插件设置。详见 [语音服务](../../../docs/development/SPEECH-SERVICES.md)；源码接入不代表 APK/实机已验收。


## 普通 Codex 回合的 commentary

GPT Live 插件的任务进度设置同时服务普通文字/ASR 回合，不要求启动
WebRTC。显示默认开启、朗读默认关闭。输入框 dock 显示最新公开进度；
仅当前聊天/激活泳道在应用前台使用已配置的 TTS。桌面悬浮球继续使用
say；录音、GPT Live 通话和前后台交接取消额外播放。

`AndroidBridge.speechPlaybackContext()` 只提供 foreground / companion /
microphone 三个播放边界标记，不请求权限、不读取麦克风。旧壳缺少该接口
时自动朗读保持关闭。线程绑定和消息筛选、上限、过期与取消规范见
`../../plugins/dsh-codex-live/README.md`。


## 桌面顶部动态回复层

鲸鱼小球和语音操作不变。`SpeechOverlay` 复用当前会话的有界 ResponseFeed，
仅在桌面语音成功提交后显示窄胶囊柔光点；通过 user/message.source.rpcId 绑定
语音 requestId 与回合，普通文字、历史录音、队列前的旧回合不触发。首段正文到达后
同一深色半透明表面连续展开，最多三行跟随尾部；文字采用最终宽度布局，避免展开时反复换行。上下留白位于滚动视口外侧，跟随末尾时不滚走留白，避免正文贴住圆角边缘。
最后正文更新满 60 秒后淡出；工具阶段保留最近正文，不退回空球。未收到正文的失联请求
最多等待 30 分钟。工具、推理和历史
不作为浮层正文，也不续期。顶部窗口避让系统状态栏与摄像头，点击打开该回复
所属会话的标准全屏聊天；不是新建会话。原工作台绑定、草稿与历史保持。

`ReplySurfaceView` 在 Android 13+ 的硬件 Canvas 使用 RuntimeShader，最多约
30 次/秒重绘，仅绘制局部胶囊柔光点与圆角回复表面。原生 TextView 独立绘制，不经过模糊
或颜色效果。低版本、shader 不可用时降为可读静态表面。系统关闭动画、省电模式
均静止；息屏、锁屏、应用前台、插件停用与服务销毁移除窗口并取消帧回调。
不采集其他应用画面，不将半透明底色宣称为跨应用真实折射。

点击会话跳转通过进程内短期 request/ack（15 秒到期）和标准 sessions / uiConversation
服务完成；未知/已删除会话不跳转。语音服务插件启用时才消费请求，原生桥不接受
外部 Intent 的任意会话导航。AGSL 背景不改变 say/TTS 的启用和音频焦点规则。

## 鲸鱼面板 GPT Live 入口

GPT Live 插件将当前可见会话或激活泳道的 Codex 判定投影给原生面板，独立于 ASR 服务开关。插件启用且当前选择 Codex 时，展开鲸鱼显示波形按钮；非 Codex 隐藏，切换前台会话更新目标，隐藏 WebView/列表未就绪不覆写桌面目标。卸载/停用清理入口，不改变模型或执行权限。

点击波形复用 LiveVoiceActivity 权限与前台启动链路，绑定原会话；桌面发起后返回桌面。活跃同一会话显示停止按钮，结束语音及该语音任务，不能误停另一会话；单次 ASR 和 Live 共享麦克风互斥。状态仅在面板附着时刷新，收起不停止用户正在进行的 Live。服务已有通知、静音、历史同步与错误回收保持。

GPT Live 不再创建独立浮标：录音/连接/暂停状态投影到现有鲸鱼边缘，未启用鲸鱼时由系统麦克风指示和前台服务通知显示状态。Android 12+ 使用 `setCommunicationDevice` 选择已有外接耳机或内置扬声器，WebRTC 播放真正启动后再次确认路由，设备插拔重新选择；结束清理本应用的通信路由请求（[Android 通信音频路由约定](https://developer.android.com/develop/connectivity/bluetooth/ble-audio/audio-manager)）。保留通话音量和音频焦点降音策略，不强改系统音量、不做失真增益。

通信模式与扬声器路由依赖 Manifest 的普通权限 `MODIFY_AUDIO_SETTINGS`；它不是运行时麦克风授权。缺少时 `setMode` 可被系统忽略，不能仅凭调用未抛异常判断路由成功。实测应同时核对模式、实际播放设备和服务退出后的释放。
