# 可配置语音服务

当前支持本机、OpenAI 兼容、MiMo API，以及 Qwen ASR / vLLM-Omni CustomVoice WebSocket 服务；真实麦克风、手柄与跨 App 交互需分别验收。插件不使用 GPT Live 转述语音；现有 GPT Live 独立保留。

## 两种语音模式

- **单次语音（麦克风图标）**：ASR 转录 → 当前 Agent → 可选 TTS。适用于 DSH、本地模型和 Codex；TTS 开启不代表进入实时会话。桌面入口点一次录音，说完静音 5 秒后转录并自动发送；再点一次可提前结束，普通聊天输入栏保持 VAD 草稿行为。
- **实时语音（波形图标 / GPT Live）**：独立 `dsh-codex-live` 插件，仅当前选中的会话使用 Codex 时提供入口。切到本地模型的会话不展示实时入口；不能用曾经使用过 Codex 的模型记录解锁本地会话。

## 配置与交互

在设置的可配置插件列表中打开“语音服务”。ASR、TTS 分别启停，ASR 默认本机 Qwen3-ASR-0.6B，TTS 默认关闭。添加命名的 OpenAI 兼容或 MiMo API 服务后，可分别选择默认 ASR/TTS；两个能力可以用不同服务。配置 base URL、model、声音和可选 API key；无鉴权的局域网服务不必填写密钥。删除已选服务前先切换默认服务。首页只保留功能开关、默认服务和服务摘要，地址、模型、声音与密钥收进“添加/编辑服务”面板；密钥留空保存保持原值。MiMo 使用 `api-key` 和 `/v1/chat/completions` 的音频协议，支持 `mimo-v2.5-asr` / `mimo-v2.5-tts`，原始 PCM 朗读响应按 24 kHz 单声道 PCM16 包装 WAV。

普通输入栏维持原波形、5 秒 VAD 和追加草稿行为，服务选择改为使用统一配置。旧本机输入开关在 Host 尚未保存 ASR 用户值时迁移；不再提供独立的“语音输入”左侧设置栏目。

桌面悬浮入口自动跟随 DeepCode 当前聊天；工作台模式跟随可见的激活泳道，不提供独立会话选择器，也不隐式创建新会话。点球展开“编辑 / 麦克风”两个图标，再点小鲸鱼收起工具条；不保留额外的向下箭头。语音键点击开始收音，说完静音 5 秒自动结束、转录、发送；再点一次可提前结束。不需要按确认键。编辑键才展开文字输入和键盘，再次点击收起；草稿按会话暂存。服务/API 配置只在标准插件设置中维护。

语音原文只移除首尾空白，走录音开始时会话的 `session/prompt` queue，不改变模型、后端或工具权限。切换当前聊天后，再次按语音键仍完成原录音，不把转录发给新会话。达到时长上限仅生成待确认文本，不当作手动发送。顶部浮层仅由成功提交的桌面语音触发，按 user/message.source.rpcId 对应请求和回合；等待时为窄胶囊柔光点，首段正文到达后连续展开深色半透明文字框，最多三行流式尾文。普通文字任务、旧回合和历史录音不触发；工具阶段保留最近正文，最后正文更新 60 秒后淡出。TTS 关闭时照常显示，收起工具条不停止观察；DeepCode 前台隐藏浮层。点击打开该会话的标准聊天记录，不新建会话。

桌面 PS5 三角键与小米遥控器语音键开始/提前结束录音，VAD 静音 5 秒自动发送；桌面遥控器的删除/确认不再编辑或发送隐藏草稿，手柄同样不处理方块/圈。前台工作台仍保留原映射。主动收起面板后，小球在遥控器插件启用时可保留按键焦点；触摸其他应用后释放，不使用无障碍全局监听。手动展开文字输入仍可用屏幕发送按钮。

## 组件和协议

| 模块 | 职责 |
| --- | --- |
| `dsh-speech-services` | Host 配置、密钥、API 转录/朗读代理、会话正文投影、标准插件设置卡 |
| `VoiceInputController` | PCM/VAD/波形与麦克风租约；本机与 API 识别选择 |
| `SpeechTransport` | 原生到引擎的已鉴权 loopback HTTP，可取消、有界响应 |
| `BackgroundVoiceService` | 用户启动的 microphone FGS；固定录音目标和一次性直接发送 |
| `SpeechOverlay` | 非焦点短回复层、焦点面板手柄、后台响应轮询、可选原生播放 |
| `SpeechDelivery` / `SpeechKeyPolicy` | 固定归属、重复交付防护、按键重复/焦点/设备断开处理 |

引擎接口为 `/api/android/speech`，仍由上游浏览器鉴权保护。GET 返回脱敏配置、`keySet`、CSRF、配置 revision。POST 使用 JSON、CSRF；`asr` 和 `tts` 还验证 revision，配置变化会中断旧请求。`key` 保存/清空凭据；`feed` 只返回指定会话的内存正文投影。原生请求使用 EngineAuth 和 Proxy.NO_PROXY，不暴露引擎 cookie 给其他 App。

ASR API 为 multipart `/v1/audio/transcriptions`，固定上传 WAV；TTS 为 `/v1/audio/speech`，请求 MP3。base URL 避免重复 `/v1`，禁止带用户密码、查询参数或片段，拒绝重定向；API 错误不会自动回退本机识别。HTTP 服务在录音结束后整段上传。WebSocket 服务使用下述流式传输，不改变单次录音的交互或 Agent 后端。

### WebSocket 服务

服务地址直接填写完整 `ws://` 或 `wss://` URL，不能含凭据、查询参数或片段。支持两种明确协议：

- ASR：`/v1/realtime`，要求服务握手声明 `qwen-local-asr-v1`、16 kHz 单声道 PCM16、partial replace。先发 `session.update` 与非 final 的 `input_audio_buffer.commit` 开始，再持续 `input_audio_buffer.append`；手动结束或 VAD 静音结束发 final commit。`transcription.partial` 替换预览，只有收到 `transcription.final` 和 `session.done` 才交付最终文本。不是所有同名 OpenAI realtime URL 都兼容此协议。
- TTS：`/v1/audio/speech/stream`，vLLM-Omni `session.config` / `input.text` / `input.done`；指定 CustomVoice、PCM、`stream_audio=true`，声音填写服务支持的名称（如 `serena` 或 `vivian`）；`instructions` 是可选的声音风格文本（最多 500 字），在服务编辑面板配置，并透传给支持该字段的 TTS。vLLM-Omni 的当前 WebSocket `stream_audio=true` 要求 `speed=1.0`，风格指令不能当成精确倍速。按 `audio.start` 的采样率创建原生 AudioTrack，二进制 PCM 到达即播放；`audio.done` 和 `session.done` 完整结束后排空播放队列。

原生录音线程每 200 ms 将 PCM 送到独立上传线程，最多积压 2 秒，超出即失败，不丢片段或静默降级。原生到 Host 仍走已鉴权 HTTP：`asr-start/chunk/finish/cancel`，带随机连接 ID、严格片段序号及配置 revision；Host 持有上游 WebSocket 和凭据，最多两个录音连接、最长 95 秒（包含转录）。配置变更/卸载立即关闭连接。`tts-stream` 将音频按 NDJSON 逐块转给原生，HTTP 断开取消上游，限制总音频和积压。

桌面悬浮球的 TTS 由 Agent 显式调用 `say` 启动，不自动朗读助手回复。前台 Codex 可在 GPT Live 插件中另行开启 commentary 进度朗读：仍使用这里的默认 TTS，但仅朗读完整公开进度，不读最终回答、思考或工具输出；桌面、录音和实时通话期间停止该额外播放器。DSH 在启用 TTS 时注册 `say` 工具和一段简短的 systemPrompt 指引；Codex 通过托管 `say` skill 的描述/正文取得相同指引，使用原生 shell 调用辅助脚本，不恢复 DSH 全套提示词与工具注入。流式指录音上传与音频生成/播放，与仅 Codex 的 GPT Live 入口独立。关闭 TTS 仅保留识别与文字反馈。

API 密钥独立存于应用私有 HOME 的 `.dsh/speech-services/credentials.json`，目录 0700、文件 0600、原子替换；不在设置快照、localStorage、日志或前端 bundle 中回传原值。它不是 Android Keystore 加密存储，应用数据备份需按敏感数据处理。关闭插件保留服务配置和凭据。

会话正文实时消费 DSH 0.1.5 的 `agent/assistant-stream`，按 agent、attempt、revision 和顺序号隔离重试与迟到片段；`session/event` 提供最终消息和 turn 边界，仍兼容旧 `assistant/chunk`。只观察当前进程实时事件，不遍历已存储的 stream。工具与 reasoning 排除。每会话最多保存短正文，最多保留 32 个会话，不扫描历史。此桌面消息流的文字事件不会生成语音请求；只有显式 say 才能播放。前台 commentary 是 GPT Live 插件独立消费的、需用户开启的通道。say 最多 160 个 Unicode 字符；通过 phase=status 查询当前会话桌面语音是否可用。悬浮球模式且 TTS 可用时，要求每个任务先用 phase=ack 确认收到，长任务用 phase=progress 播报实质新进展，结束前必须用 phase=result 播报结果（含失败或阻塞），随后简短文字回复。确认与结果每轮各一次，不受进度 30 秒间隔限制，避免短任务结尾被限流。进度距上次播报至少 30 秒，不逐工具播报、定时重复或拆分长文。待播结果替换过时进度，保留先前确认；队列有界，下一轮开始丢弃旧轮待播内容。原生消息轮询携带 companionActive：桌面或展开悬浮面板时续期当前会话的 3 秒接收租约，普通聊天前台且悬浮面板收起时立即释放，仅空闲时取出一次性请求；切换会话、锁屏导致的租约过期、禁用和卸载丢弃待播语音，不重放历史。确认/进度最多等待 15 秒，结果最多等待 60 秒，返回 queued 仅表示接受，不保证已经播放或被听见。

## 生命周期边界

- 输入、直接语音、GPT Live 共用麦克风所有权。新录音中断 TTS；语音服务不可用时不反复启动本地推理。
- 录音固定原会话；切换 DeepCode 当前聊天不会把旧录音发送给新会话。重复完成只交付一次。HTTP 超时或未收到 accepted 时保留文字，并提示先检查原会话，不自动重发。
- 禁用/更换配置取消在途 API 请求；原生录音周期核验配置，插件卸载或引擎失联时停止。此检查有网络超时边界，不是硬实时安全中断。
- 文字层是顶部限宽卡片（至多 440dp、三行正文），不抢焦点，有正文时点击打开会话；等待时窗口透传触摸，窗口外触摸由原应用处理。自绘半透明底色与独立文字保证可读性；避让状态栏和摄像头。锁屏/息屏时移除文字并停止朗读。
- HTTP 整段朗读使用原生 MediaPlayer，WebSocket PCM 使用 AudioTrack；两者使用 mediaPlayback FGS 与音频焦点，不依赖 WebView 定时器；网络失败不取消 Agent。收起输入条不结束录音；关闭语音服务或悬浮入口会释放其录音/播放资源。
- 麦克风仍需系统权限和用户明确操作；悬浮窗权限不能替代 microphone FGS 启动条件。被系统拒绝时回到 App 授权/重新操作，不绕过限制。

## 构建与维护

插件执行 `npm ci`、`npm test`；普通输入插件也运行 `npm test`。Android 可仅执行 `:app:compileDebugKotlin :app:compileDebugJavaWithJavac :app:testDebugUnitTest --tests '*SpeechInputPolicyTest'`，这些任务不生成 APK。

`stage-speech-services.py` 将已构建插件及 composition 放入 APK assets；EngineManager 首次安装并更新可验证的托管文件，保留用户修改与主动移除。`rebuild-codex-shell.py` 已接入构建与资源暂存；保留 donor 的构建入口新增 `build-native-experiment.py --speech-services`，与 `--live-host` 可组合。完整 snapshot overlay 在启用客户端插件时包含该插件。资源暂存及单元测试不能替代 APK 运行验收。

必须验证：本机/API 选择、API 路径未加载本机模型、两后端直接发送、跨会话迟到结果、插件启停、TTS 关闭与取消、手柄焦点和重复按键、跨 App 点击穿透、锁屏隐私和声音焦点。一次性测试结果只保存 `.local/validation/`。

参考 HomeRail 的能力独立配置、ASR 代际隔离、会话归属和 TTS 去重思路；此实现不依赖 HomeRail 服务运行。平台接口边界见 [Android 手柄输入](https://developer.android.com/games/sdk/game-controller/controller-input)、[窗口焦点](https://developer.android.com/reference/android/view/WindowManager.LayoutParams#FLAG_NOT_FOCUSABLE)、[后台 FGS 限制](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)。


收起面板后，鲸鱼悬浮球保留真实音量反馈：圆形白底从下往上填充绿色，静音保留小段稳定绿色表示麦克风已开启，声音越大填充越高；结束、取消、错误或禁用时立即清空。球仍只负责展开/收起，不因最小化开启新的麦克风或改变录音目标。

录音状态由工具条的五柱音量动效显示，使用实际 PCM 波形/能量，静音不伪造跳动。原生每 80 ms 读取已有录音快照，视图平滑绘制，不提高网络轮询频率。工具条只在录音、识别、发送、Agent 工作或朗读期间显示一行短状态；Agent 是否工作来自真实会话事件，终止/完成恢复麦克风。顶部消息层不显示会话、文件夹或工作区标题，仅展示回复正文或语音提交后的胶囊等待状态，空闲不保留标题行占位。回复卡片不显示服务配置、工具正文或推理；切换会话、刷新配置不延长旧回复的展示时间。`SpeechSessionFocus` 是进程内投影，插件卸载清空；后台观察不写回网页选择；只有点击回复时提交 15 秒有效的进程内导航请求，客户端通过标准会话 API 打开对应完整聊天并确认消费。客户端恢复后以真实会话列表和当前泳道重新投影。

WebSocket 协议参考：[vLLM-Omni Speech API](https://docs.vllm.ai/projects/vllm-omni/en/stable/serving/speech_api/)。Bundled ws 的 MIT 许可保留于插件 `THIRD-PARTY-NOTICES.txt`。debug `voiceTestServiceSample` 仅将固定内置 16 kHz 测试音频按实时时序送入所选流式识别，不启动麦克风、不自动发送 Agent；正式版本禁用该入口。

桌面回复条只显示助手正文，结构化思考、工具参数及工具结果不展示；带 analysis/commentary 标识的流片段也过滤。语音提交但正文未到达时使用柔光点，不占用文字标题行。正文使用最高三行的原生滚动视口，每次增量更新、换行或尺寸变化后跟随末尾，不再用尾部省略号截去最新内容。完成后保留最后正文，60 秒没有新回复则隐去；等待胶囊仅在已提交语音且尚无正文时出现，锁屏/关闭插件仍立即清理。

## Say 技能与会话归属

技能源码在 `android-shell/codex-skills/say/`，内容打包到语音插件。启用语音服务和 TTS 时安装到应用 Codex HOME 的 `skills/say/`；关闭时移除托管 SKILL.md，保留用户修改的文件。DSH 工具使用执行上下文的真实会话 ID；Codex helper 使用 CODEX_THREAD_ID，由 Host 在自身 session-links.json 中唯一反查会话。禁止根据桌面当前焦点猜测调用方。多泳道的非选中会话只返回语音不可用，不串到当前泳道。

辅助脚本通过应用私有 Cookie 访问本机认证接口，仅提交短文本与线程 ID；密钥留在 Host。若技能不可用、当前会话未连桌面伴侣或播放器繁忙超时，继续简短文字回应，不重试、不私自启用设置。长文、代码、思考和工具结果继续只作为文字；播放失败不会取消 Agent 任务。Codex 已运行线程的技能发现受其自身刷新机制约束；新请求的服务端启停门禁立即生效。Codex 技能要求每个任务先运行 say.py --status，可用时按 --phase ack/progress/result 调用；仅更新专用语音技能，不向 Codex 注入 DSH 完整提示词。开始和结果属于 Agent 的调用约定，不自动朗读最终回复；播放器不可用时降级文字，不声称已听到。
