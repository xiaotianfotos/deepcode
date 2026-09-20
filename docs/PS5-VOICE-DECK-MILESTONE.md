# PS5 单麦会话工作台实施与验收

日期：2026-09-09。已完成本地开发、完整 APK 部署和实机验收。终包安装后 L2、横滑与原版样式对照再次通过；剩余覆盖边界见下文。

## 当前交互

- 设置中分别提供「会话工作台」「手柄输入」「语音输入」开关；默认本地 Qwen3-ASR-0.6B。
- 顶部只保留“会话工作台”和“返回聊天”，连接状态/单麦/本地模型标签按用户要求移除。
- 左侧槽位一行一个会话；中间共四个泳道、每屏显示两个，横向滚动吸附。各聊天区固定可用高度、内部纵向滚动。
- L1/R1 每次选择一个非空泳道，末尾循环；目标输入框聚焦且光标显式放在草稿末尾，必要时滚动到目标。横滑结束后按方向选中新出现的会话；纵向翻历史不切换会话。
- L2 调用原有 `ctx.layout.toggleSidebar()` 收放左栏；按住不重复切换。改变宽度后活动泳道保持可见。
- △ 开始/结束录音，连续 5 秒无语音自动转录；□ 在官方编辑器中退格、可长按。识别仅追加草稿，可按 ○ 经原版输入栏发送。
- 录音中换泳道会结束当前段，结果仍投递原会话；转录不阻塞另一个泳道的输入，不抢焦点。
- 原版 Markdown、消息/工具卡片、编辑器继续由官方槽位渲染。已撤销压缩圆角、内边距和控件高度的覆盖；仅对窄列选择器约束宽度。监控浮层保持关闭。

## 实现边界

`dsh-client-ui-voice-deck` 为当前单麦工作台；来源和公共接口参考保留在 `android-shell/plugins/voice-plugin-import/`。未接入的 WebHID 多麦与旧 Deck 副本已移出活动源码。

`dsh-client-input-gamepad` 负责按钮边沿、重复和连接状态；Android `GamepadInput` 只传平台按钮，使用 Activity 前台/窗口焦点/引擎来源/2.5 秒续租限制输入。安卓桥存在时不再同时轮询 Web Gamepad。网页回退使用标准按钮映射。

`scripts/patch-voice-deck.py` 校验下载快照 SHA 和精确替换锚点，生成四个 bundle 补丁：

1. `dsh-api-session-controller`：工作台/语音任务对实际 session owner 的 stage 租约。
2. `dsh-client-ui-renderer`：受限 SessionSurface，将原版 chat/composer 绑定到指定会话。
3. `dsh-client-ui-conversation`：编辑器 focus/delete/mirror 窄接口；工作台打开时取消全局 composer 挂载；后台文字插入跳过 DOM selection。
4. `dsh-client-ui-workspace`：左侧槽位挂载点。

上游 checkout 无改动。该适配针对仓库固定引擎版本，升级时必须重新校验，不能宣称任意上游版本直接兼容。会话关闭/进程被杀后恢复未完成的原始音频不在本版范围；不可写的已完成文字会保留待插入记录。

## 真实设备证据

设备：Xiaomi M367FC（yingtian），Android 17 / API 37；证据目录 `evidence/ps5-deck/2026-09-09/`。所有会话为专门创建的「手柄验收 A/B/C/D」，项目目录 `/storage/emulated/0/work/ps5-deck-test`。

| 验证 | 结果与证据 |
| --- | --- |
| 实体 DualSense | 系统枚举成功，捕获 deviceId 18 的 L1/R1/△ 按下和释放；`physical-events.json`。人工语音“语音测试”已识别，`physical-result.json`。 |
| Android 原生按键到四个编辑器 | 连续 20 次 R1，每次只换一个泳道，焦点匹配；`automated-input.json`。包含 ADB 往返的约 76–164ms，不作为纯 UI 延迟指标。 |
| □ 编辑 | Android keycode 99 删除完整 emoji 和中文；官方 Lexical 编辑器保持一致，未用字符串切片替代。 |
| 录音跨泳道 | C 采音约 4.52 秒，R1 切 D 并输入“D保留”；C 收到“甚至出现交易几乎停滞的情况。”，D 草稿和焦点不变。结束到草稿约 1757ms，ASR 请求 1531ms；同上 JSON。 |
| 双列/触屏 | R1：A/B→B/C→C/D→A/B，两轮通过；左右触摸手势选择可见边缘会话，纵向手势不换泳道；`scroll-tests.json`。 |
| 四个流式回复 | 四会话同时运行、持续更新，包括视口外的泳道；57 次采样、四者均完成，卡片高度一致；`four-streams.json`。 |
| 历史滚动 | A 处于顶部时继续生成；内容高度 1333→2056，scrollTop 保持 0；`history-scroll.json`。 |
| 原版排版对照 | 同一条真实回复，在普通聊天与 Deck 中对照 H1/P/STRONG/UL/OL/PRE/TABLE/BLOCKQUOTE/CODE；节点内容、类名、字体、行高、间距一致，编辑器 22px 圆角/10px 顶内边距一致；`style-comparison.json`。 |
| L2 收放侧栏 | 短按两次、长按两次，边栏 x=68↔292 CSS px，当前泳道、焦点、四份草稿均不变，活动泳道完整可见；`l2-tests.json`。 |
| 插件开关 | 设置弹窗不穿透处理手柄；手柄关闭后按键不换泳道；Deck 关闭恢复单聊天，重启用保留四槽；`settings-tests.json`。 |

采音测试使用平板**内置麦克风 M367FC**；自动音频用平板扬声器播放固定样本、实际 AudioRecord 采集，再调用本机 0.6B。未把送入模型的音频文件直接当作麦克风测试。该性能只代表本段样本，不是所有噪声/口音的保证。

未覆盖或需要实际使用补验：实体 □ 与 L2 的手指操作（已有 Android 按键注入测试）、DJI 蓝牙实际采音、复杂第三方输入法 composition、所有审批/文件菜单与极端窄屏布局。当前不是多麦产品，也不宣称 GPU/NPU 推理；ASR 为本地 CPU 整段解码，SSE 返回文字不等于持续音频流式推理。

## 构建与回归

本轮插件测试：语音 10 项、手柄 4 项、泳道状态 2 项；Android JVM 25 项通过。终包仍使用本地 `voice-debug` 构建变体。

```bash
npm --prefix android-shell/plugins/dsh-android-voice-input ci
npm --prefix android-shell/plugins/dsh-android-voice-input test
npm --prefix android-shell/plugins/dsh-client-input-gamepad ci
npm --prefix android-shell/plugins/dsh-client-input-gamepad test
npm --prefix android-shell/plugins/dsh-client-ui-voice-deck ci
npm --prefix android-shell/plugins/dsh-client-ui-voice-deck test
python3 scripts/overlay-fs-adapter.py arm64 --voice-debug
source scripts/env.sh
python3 scripts/build-baseline.py arm64 --voice-debug
adb -s "$DSH_DEVICE" install -r -t artifacts/dsh-v0.13.3-local-voice-debug-arm64.apk
adb -s "$DSH_DEVICE" shell am start -n com.dsharnessmobile.shell/.MainActivity
```

安装后必须等待 `.snapshot-fingerprint` 与 APK 内 `snapshot.sha256` 一致且 `.snapshot-transaction` 消失；解压期间禁 force-stop。`scripts/deploy-deck-dev.py` 仅用于迭代，不能替代终包交付；它拒绝解压事务中写入，并逐文件核对哈希。

实机脚本：`test-deck-scroll.mjs`、`test-deck-l2.mjs`、`test-deck-style.mjs`、`test-deck-settings.mjs`，参数为设备 serial 和已有验收目录。`test-ps5-deck.mjs` 会写 C/D 测试草稿并播放固定音频；`test-deck-stream.mjs` / `test-deck-history.mjs` 会向专用测试会话发送新的 Agent 请求，不能当作只读检查。脚本不输出鉴权 token。

完整方案见 [PS5-VOICE-DECK-DESIGN.md](PS5-VOICE-DECK-DESIGN.md)，运行时陷阱见 `android-shell/docs/AGENTS/gotchas.md` 55–57。

## 本次终包标识

- APK：`artifacts/dsh-v0.13.3-local-voice-debug-arm64.apk`，216541102 字节。
- APK SHA-256：`4cec557c0a1de6fd3b04bc9db383415ae2a979a1644ed6f9544ad7a2458524ad`。
- 内置快照 SHA-256：`6aaef63093303f8c08c0e1a93ab9ef62a95763c8717d4e0379ffff93323ac7c1`。
- 版本名仍为本地开发变体 `0.13.3-local-voice-debug`；以哈希区分迭代，不把相同版本名视为相同内容。
- 方向键按用户后续确认，保留原有输入光标移动行为，未增加自定义方向键处理。

终包安装确认：设备 fingerprint 与上述快照一致，解压事务已消失；13 个已部署的引擎补丁/插件文件逐一与本地构建哈希匹配。凭据见 `evidence/ps5-deck/2026-09-09/caret-end/release-receipt.json`（同时记录工作区源码哈希；尚未以本轮独立提交发布），`final-ui.json` 确认四槽/草稿保留、无槽位错误、顶部状态标签移除、性能浮层关闭。最终截图为 `final-tablet.png`。

样式自动化在冷启动时等待可见代码块的懒加载高亮完成再与普通聊天对照；视口外纯文本占位不是另一套 Markdown。手柄自动化会临时使用 ADB 合成设备，测试结束释放其所有权，恢复实体手柄接管。

## 切换光标末尾修订（2026-09-09）

按用户新要求，切换到泳道时显式将 Lexical selection 折叠到草稿末尾；原先的 `defaultSelection: rootEnd` 只在无 selection 时生效，不能覆盖旧光标。L2 与录音按钮重新聚焦仍保留已有光标位置。更新仅涉及该 adapter 与调用参数，沿用已有 Markdown/布局/语音路径。

实机定向验证：手动把光标放到开头→R1 切走→L1 切回到末尾；触屏选择到末尾；L2 收放保持手动光标；追加临时 emoji 后 □ 从末尾删除，所有原始草稿保留。记录在 `evidence/ps5-deck/2026-09-09/caret-end/`，脚本 `scripts/test-deck-caret.mjs`。该脚本仅在语音空闲时执行，会短暂追加并删除测试 emoji，不发送 Agent 请求。


## 2026-09-09 增量：○ 发送、菜单、正文横滑、输出上限

已构建完整 APK 并安装到 `192.0.2.30:41901`；13 个托管文件 SHA-256 全部匹配，快照指纹确认，事务已结束。本节最新证据位于 `evidence/ps5-deck/2026-09-09/circle-menu/`，`release-receipt.json` 为本次交付凭据；前述 caret-end 文件保留为历史验收。

- ○：Android BUTTON_B/97 → east → send，Web 标准索引 1。原版 InputBar 注册作用域 submitDraft，沿用模型/权限/队列/附件提交；跳过空草稿和拼字/禁用/机器忙碌，Deck 对录音/转录额外阻止发送。单次按下、不重复、不将空输入的 ○ 当停止。5 个手柄路由测试和 Deck 编译/2 个状态测试通过。
- `/` 与 `@`：数据生成正常但 composer overflow:auto 裁掉向上弹层；改 visible + z-index，并按每泳道标题下沿到输入卡片测量最大高度。原版引用与命令语义保留。`menus-send-tests.json`、`menus-touch-tests.json` 记录触摸选 /feedback、键盘/触摸选文件并产生 `data-composer-chip=reference`（非纯 @ 文本）。第一次自动触摸流程遇到布局移动造成命中失败，验收脚本改为只滚菜单自身并等待可命中，后续通过。
- 正文横滑：实机原行为从消息区域横拖 scrollLeft 仍为 0。chat-swipe.ts 路由水平手势、纵向由 WebView 执行。`chat-swipe-tests.json` 记录实际聊天区域横滑 0→535.6→0、活动泳道/焦点相应变化；纵向历史 400→591.6 且活动泳道及草稿不变。宽代码/表格的独立横滑分支已实现，本次未单独制作实机用例。
- ○ 的设备验收使用 Android 按键注入，非手指按实体 DualSense。长按并空草稿再按后，`send-history.json` 确认隔离验收会话恰好 1 条用户消息，模型正常 completed。
- 用户使用贪吃蛇会话时的输出中断查明：模型 local-qwen/qwen38-flash-next 配置 maxTokens=8192，两次 assistant usage.outputTokens=8191、stopReason=length，turn/end=max-tokens；是单次模型生成限制，不是 session 累计额度。通过服务端 `/v1/models` 核实 context length=262144；32768 请求被接受后，经 settings/update 仅提高该模型 maxTokens 到 32768。适配器要求正整数，0/-1 非无限开关，删除该字段也有默认回退，不能宣称无限。隔离验收请求 request/header 明确为 32768，见 token-limit.json 与 send-history.json。

测试期间用户开始使用最初“输入菜单与发送验收”会话，后续改用单独“自动验收：菜单与○发送”会话；未覆盖回旧的第二泳道绑定，保留用户正在使用的贪吃蛇会话。验收会话临时占用第三槽后已恢复；仅清掉测试残留的 /、@deck-menu 和表情，不发送或清空用户其他草稿。


## 2026-09-09 后续：横滑惯性与吸附时机

用户反馈短距离拖动会被快速拉回。原实现只按最近列取整，并在动画前恢复 `scroll-snap`；现在采集最近约 100ms 移动，240ms 速度投影选目标，快甩至少朝对应方向推进一列。WebView 抬手事件延迟不能当作零速度样本，超过 120ms 未移动才清除惯性。260–460ms 三次 Hermite 缓动从释放速度平缓减速；动画结束才恢复吸附并激活/聚焦，忽略逐帧 scrollend，避免中途抢滚动。

新触摸可停止旧动画并继续拖动；手柄切换、尺寸变化和卸载取消动画。纵向消息滚动仍保留原生行为。

6 项插件测试通过（3 项目标位置、1 项 Android 抬手延迟与停顿、2 项既有状态）。开发实机验证：同样 90px，快甩到 535.6px，反向快甩回 0；慢拖/停住后松手逐步回 0，无瞬间吸附，检查逐帧位移无反向猛拽。中途触摸停住并反向接手通过。正文横滑与纵向历史保持回归通过。脚本 `scripts/test-deck-inertia.mjs` 在固定间隔发出 CDP 触摸事件并在 touchend 捕获位移，避免逐事件等待工具回包把“快甩”人为拖慢。

最终 APK 及安装回归证据保存于 `evidence/ps5-deck/2026-09-09/inertia/final/`；`inertia/release-receipt.json` 核对快照指纹与 13 个已部署文件。测试保留所有泳道绑定和用户草稿，不发送模型请求。

## 2026-09-11 工作台空间精简

按用户要求删除工作台顶部「会话工作台 / 返回聊天」整行和底部常驻按键说明；仍通过主界面的「对话」标签返回，真实操作 notice 按需显示。泳道及编辑器复用逻辑、手柄映射不变。Deck更新进入APK独立版本与SHA守卫补丁，不重解压快照。触屏残留tooltip由响应式插件的输入来源守卫处理。实机检查记录见 docs/validation/2026-09-11-touch-deck/。

验证：已安装 a9fc7330693006a80a48f82682661a820266831f024db6328061bd6ac81d04b8；实机 WebView CDP 连续四次触屏侧栏开关无可见 tooltip，鼠标悬停有提示、再次触屏隐藏；「对话」与工作台往返通过。工作台总高不变时，泳道高度由437.36增至504.27 CSS px（增加66.91）。响应式与Deck设备文件SHA均匹配构建收据，快照未变、皮肤关闭、折叠启用。系统adb input tap被INJECT_EVENTS权限拒绝，以上触摸由实机Chromium输入通道注入，不等同用户手指最终验收。

## 2026-09-11 图片和语音跨泳道修复

根因：voice的Cordis bail省略scope subject，不能过滤其他会话；附件0.6.4全页广播drop，让并存编辑器竞争。附件旧textarea就绪检查也不适用于Lexical。现修正语音subject；图片经按ID注册的InputBar接收器保留既有限额/忙态/类型校验；来源会话/目录在处理前固定，按会话请求序号防跨泳道取消。目标拒绝或卸载时报错、不转投。APK受管补丁独立更新，不重解压快照。

验证：语音10项回归通过；手机WebView实际文件输入change走完整附件管线，右侧加图增量[0,1,0]；左侧drop后[1,1,0]；焦点在左时右侧转录插入只改变右侧草稿。语音文本为测试输入，未做新一轮真实麦克风识别或发送模型消息。全部原草稿/图片恢复通过；证据docs/validation/2026-09-11-deck-routing/。最终APK SHA d6088389844467fb04243e5640906a012dadb7979f35718a757ff96b8e1857d8；三项设备补丁SHA匹配。透明折叠/无皮肤及工作台精简保持。文档卡片多泳道不在本次图片验收范围。


## 2026-09-11 原生菜单补漏、重复标题与触屏输入

上一轮「文件输入 change」通过不能覆盖原生菜单；用户现场跟踪明确记录：右侧指令菜单点击后，左侧 imageCount 增加。原因是 host-web-compat 的 onImagePicked 仍广播 document drop。现以 callbackId 绑定原 InputBar 的节点和会话，回调交给该输入框原图片校验；异步期间切换不会改投，原框卸载则明确报错。原生文件引用也不再写首个编辑器。

工作台重复的1号会话标题行隐藏，保留原视图标签导航；普通对话标题保持。仅存在非虚拟物理字母键盘时自动聚焦，切换光标放末尾；纯触屏/手柄不自动弹软键盘，用户点击文字输入框仍可正常输入。

已安装 APK SHA `9058e86e47c0a5e8b15296795e4c94604bfbacf31747acf0ce1eacc92c2a3a75`，四项设备补丁 SHA 与 APK 相同，快照未变。实机 WebView 回归：右菜单请求后切左，图片增加 `[0,1,0]`；右麦克风按钮启动→切左→轮询完成，草稿变化 `[false,true,false]`；触屏切换不聚焦；模拟硬件键盘后聚焦末尾；重复标题行高度0。原生相册 payload 和 ASR文字为 fixture，未发送模型消息，测试结束草稿/附件恢复。证据 `docs/validation/2026-09-11-deck-routing/followup/`，脚本 `scripts/test-native-deck-routing-device.mjs`。手机真实相册/麦克风及真实外接键盘热插拔验收待补，不能将上述 fixture 测试写成已通过这些项。

补充检查：语音插件10项、工作台6项测试通过；页面确认 stable-presentation 折叠启用、皮肤未启用、fixture 已清理，重复标题高度0。未修改 Fold* 原生源码和模糊参数。


## 2026-09-11 宽屏软键盘上推修复

KeyboardBoundary 原来只管理小于640px手机布局，展开859px的工作台没适配；浏览器自动pan约273px，上方标题离屏。现对所有AppFrame按visualViewport高度布局，同时补偿offsetTop；键盘收起恢复原inline样式。修复安装包SHA `154366ee5e51c707b057c545cde51eee62e3fc95528604cc1538b19259d41bcf`，responsive设备文件与构建收据相符，快照不变。

81项响应式测试通过；Fold两个泳道分别经CDP触摸打开真实系统输入法（非模拟inset），高度273px，可见区域335.27px；frame顶端对齐可见区域，输入卡片均在键盘上方；blur后IME归零、frame height/translate恢复。最后保留右泳道输入框与键盘打开供查看。截图/坐标/安装收据见 `docs/validation/2026-09-11-deck-ime/`。只调整键盘布局，透明折叠参数未改。


## 2026-09-11 Fold 工作台等宽、覆盖侧栏和右侧内容对应

按用户最新要求恢复这一项内容对应工作，皮肤仍取消，模糊公式不变。Fold工作台的左栏改为覆盖抽屉，由顶部侧栏SVG按钮打开；按钮也替换外屏原三横线。两列以整屏中心线对称，侧栏展开不改变两列宽度。底部横向滚动条隐藏，横滑和手柄切换保留。

前端镜像来源提示在Fold工作台返回整幅宽度的一半；既有FoldMirror等高等比绘制，因此外屏显示右半幅。合盖后单列重排自动承接之前右侧会话，展开恢复原双列；不重新创建编辑器/草稿。两块屏实际宽高比略有差别，等高显示存在少量右缘裁切，不宣称硬件像素级1:1。

已装APK SHA `2dd25380d105b303398a16f1a908c55aca87596d3c6e361a98657f99cd88cdee`。82项响应式测试、6项Deck测试通过。实机自动host窗口交接：折叠模式无窄条、顶部SVG可开关抽屉且grid大小不变；列步长为整屏半宽，覆盖/展开后会话与草稿一致；WebKit滚动条display:none且可正常横滚。左右红绿来源测试外屏9点均为绿色右半幅；临时图已移除。测试保留模型/快照/草稿，未发送Agent请求。见 `docs/validation/2026-09-11-fold-deck-layout/`；真实手动开合透明观感待用户反馈。


## 2026-09-11 合盖闪左列与竖屏恢复

上一版稳态检查通过后，用户实折发现快合上时闪现左列。新增逐帧采样复现：外屏424px、hostReady=true，左列持续到约50ms后的React提交。现改为目标窗口尺寸和目标泳道提交就绪后，才请求Chromium首帧并显露；resize不再滚回旧active。不是简单延长延时。另将租约期间的永久方向锁改为折叠中锁定/完全展开恢复，保留系统旋转偏好。

已安装APK SHA `cccfc82e6475b25ad38b2e429a3e90900cf7bbd69b1c302c15c8dd04dbf6104e`，设备APK与Deck补丁SHA匹配，快照不变。Deck构建及6项测试通过；真实WebView三轮host交接369帧，显露帧零错误泳道，编辑器/草稿持续。系统旋转命令0°/270°两轮往返，608×859/859×608均通过，原free模式和rotation=1已恢复。证据 `docs/validation/2026-09-11-fold-deck-handoff/`；修复前记录在 `fold-deck-layout/flash-before.json`。自动窗口交接/旋转与用户物理验收分别记录，后者仍等待反馈。


用户随后确认“不闪现了”。90秒实折跟踪330样本覆盖0–179°、内外两种窗口尺寸，零mirrorError；记录为physical-watch.json。按新要求取消竖屏工作台的active高亮边框/box-shadow，保留普通边界和横屏选中提示，仅影响Deck CSS。新APK SHA `72da68e4112f8598bd1181fe15082c0915baf36a4583cab4800d54c33ec39c8b`。

最终包安装与Deck补丁SHA已核验。实机竖屏608×859：active边框等于普通rgba(255,255,255,.12)，shadow=none；横屏859×608：保留rgb(114,178,216)边框与选中阴影。测试后恢复原free旋转策略，证据portrait-border.json、installed.json。
