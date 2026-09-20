> 2026-09-11 当前候选已改为前台持续持有 OPENED_PRESENTATION state5；旧自动切换/enable-display路径是历史记录。实机60秒固定状态对照零OFF/ON且用户反馈“不黑了”；集成单WebView迁移已部署，最终开合与输入仍在验收。最新细节见 [透视与显示连续性](FOLD-PERSPECTIVE-MILESTONE.md)。

# DSH 折叠过渡首个里程碑

状态：内外屏投影与方向已获用户确认；当前修复外屏侧栏跳变及轻折黑帧。已安装直接点亮副屏的新链路，实折验收进行中。

日期：2026-09-10。目标：内外屏窗口切换时保持会话/输入状态，提供可关闭的原生模糊过渡，完成可复现模拟器验证及可用小米平板回归。

## 实现

- Android `FoldTransition.kt` 在配置变化前保留有界画面快照（最大边 1024px，仅内存），按比例完整显示旧画面，避免按新宽高强行拉伸或中心裁切放大。
- 窗口宽度变化时通知 TS 插件；双 rAF 后调用原生 `foldReady`，等待 WebView visual-state callback。新窗口内容从 blur 18px 到 0，旧画面 blur 12px 并淡出；动画设定 260ms。API <31 退化为已有快照淡出，不声称支持原生模糊。
- 插件缺失响应时 160ms 降级启动，650ms 兜底清理；暂停/销毁/关闭开关均清理 Animator、RenderEffect、ImageView 和位图。单独 IME 高度变化不触发模糊。
- `dsh-client-fold-transition` 为独立插件，在“设置 → 折叠过渡”提供开关，默认启用；尊重网页 prefers-reduced-motion，卸载插件时关闭原生效果。关闭动画不关闭响应式布局。
- 响应式 AppFrame 跨 mobile/desktop 断点始终保持相同槽位树；旧实现切换整棵视图，可能丢光标、触发 Deck 卸载的录音清理。
- Deck 容器不大于 680 CSS px 时单列，大于时两列；四个泳道持续挂载。切屏不会当作切换 session，不强行将光标移到末尾。
- TS engine、会话传输和插件职责保留；未引入双 runtime 或第二套编辑器。

## 模拟器复现

环境：本项目 SDK Emulator 37.1.11.0，API35 Google APIs x86_64，KVM，SwiftShader。专用 AVD `dsh_foldable_api35` / `emulator-5582`，原平板 AVD 5580 保留。

```bash
source scripts/env.sh
bash scripts/start-foldable-emulator.sh
# 在另一终端，首次启动完成后：
source scripts/env.sh
python3 scripts/configure-foldable-emulator.py
```

启动脚本采用官方 sdklib Pixel Fold 参数：内屏 2208×1840，外屏 1080×2092，420dpi。配置脚本只接受指定 AVD，并检查解压/Agent 状态；安装固定 AOSP device_state/display_layout 映射后必要时重启。映射将默认逻辑屏交给当前物理屏，实际应用窗口会变化。`fold`/`unfold`/`posture 2` 分别驱动合拢/展开/半折。

这是通用 Android 折叠测试设备，不是 HyperOS、玄戒模拟器，也不是 18 Fold 像素密度复刻。设备识别与调试边界见 [设备说明](../android-shell/docs/AGENTS/devices-and-debugging.md)。

## 构建与部署

先构建 `android-shell/dsh-client-ui-responsive`、`android-shell/plugins/dsh-client-ui-voice-deck`、`android-shell/plugins/dsh-client-fold-transition`；已有 voice/gamepad 插件保留。

```bash
source scripts/env.sh
python3 scripts/overlay-fs-adapter.py x86_64 --deck-ui
python3 scripts/build-baseline.py x86_64 --deck-ui
python3 scripts/overlay-fs-adapter.py arm64 --voice-debug
python3 scripts/build-baseline.py arm64 --voice-debug
```

Gradle 的 ABI 构建必须串行，共用 assets/jniLibs。x86_64 `--deck-ui` 含当前 UI、折叠/手柄/语音前端插件与 Debian，**不含 ARM64 本地 ASR 二进制，不用于语音性能测试**。ARM64 voice-debug 保留原本 0.6B 语音与 VAD。

产物：

- `artifacts/dsh-v0.13.3-local-deck-ui-x86_64.apk`
- `artifacts/dsh-v0.13.3-local-voice-debug-arm64.apk`

最终安装摘要、运行时 fingerprint 和 11 个客户端文件校验见 [release-receipt.json](validation/2026-09-10-foldable/release-receipt.json)。

## 验收与证据

- responsive 原有 76 项测试通过；新增稳定挂载测试通过，反复改变宽度后同一编辑器 DOM/焦点/selection/订阅仍存活。Deck 6 项测试通过；两个 APK 的构建、签名、ZIP 对齐、6 项运行时门禁通过。
- [折叠设备测试](validation/2026-09-10-foldable/dsh/fold-tests.json)：两轮真实合拢/展开，窗口/列数正确，草稿、光标、editor DOM、WebView timeOrigin 和应用 PID 保持；原生模糊实际多帧播放后回到 idle；关闭模糊仍正常自适应。
- [设置开关测试](validation/2026-09-10-foldable/dsh/settings-tests.json)：通过实际设置页切换，确认原生状态变化并恢复启用。
- [流式连续性测试](validation/2026-09-10-foldable/dsh/stream-tests.json)：可控 OpenAI SSE 响应经过真实 Agent session 链路；100 行文字持续更新，反复折叠 8 次，看到 39 个不同文本长度；单次 HTTP 请求且 turn/end reason 为 completed，草稿/进程保持。
- **真实模型未通过测试**：192.0.2.10:5000 当时连接被拒绝。最初测试误在用户提示词中匹配结束标记，已明确作废为 `stream-tests.invalid.json`；修正测试使用仅由响应生成的唯一标记，并检查引擎终态。可控 SSE 测试不能作为模型推理速度或服务可用性结论。
- [当前小米平板回归](validation/2026-09-10-foldable/tablet/tablet-tests.json)：M367FC / Android API37，4 次旋转，无输入/发送/录音操作；原生过渡完成，草稿、活动泳道、编辑器 DOM、应用 PID 和 WebView 保持；恢复测试前旋转设置。
- 动画目标 260ms，最终平板实测 267～496ms / 6～7 次动画更新；旋转布局开销会影响时长，尚未达到 60/120fps 性能验收。模拟器 SwiftShader 时长更不宜当成真机性能。
- PNG 截图必须显式传物理 display ID；否则 screencap 多屏警告会混入 stdout，输出文件并不是合法 PNG。

测试命令：先 `seed-fold-test.py` 在专用模拟器创建验收会话并打开工作台，再运行 `test-fold-transition.mjs`、`test-fold-stream.mjs`；真实平板用 `test-fold-tablet.mjs`，不创建用户草稿、不发送提示词。

## 仍需 18 Fold 真机确认

HyperOS 内外屏点亮顺序与通知时机、系统转场与应用转场叠加、折叠过程中录音/转录、软键盘与蓝牙手柄、外置目录授权、后台省电和低内存恢复；精确铰链角度能力尚未接入。这一版由窗口变化驱动，不声称按每一度铰链角度连续控制。

本实现是 DSH 应用范围内的模糊连续性原型，不能控制系统熄屏/亮屏动画；没有完成与苹果官网视频逐帧对照，不声称像素级复刻。后续优先优化布局/模糊首帧耗时，再用 18 Fold 校准触发时序。

画面证据：[过渡中](validation/2026-09-10-foldable/dsh/transition.png)、[过渡完成](validation/2026-09-10-foldable/dsh/transition-complete.png)、[外屏单列](validation/2026-09-10-foldable/dsh/fold.png)。快照按比例完整显示；请结合实机观察动效，静态图不能证明帧率。

## 18 Fold 反馈修复（2026-09-10）

实机设置值为 `close_lid_display_setting=1`，从设备 Settings.apk 的 CloseLidDisplaySettingFragment 确认对应“上滑继续使用”，保持亮屏为 2。ADB 写设置被系统拒绝；已打开系统页面请用户选择。未绕过锁屏，也未修改安全锁设置。

新增标准铰链传感器驱动：FoldHingeMotion 去抖、按运动方向计算进度；切屏后抑制残余角度事件，反向折叠可重启；半折静止 450ms 后恢复清晰，继续运动可重新触发。暂停清除敏感像素，仅保留过渡意图，非锁屏恢复并有窗口焦点时播放新画面。传感器仅在插件启用且前台时注册。没有标准传感器时仍由窗口宽度触发。设置插件增加系统合盖设置入口和影响整机的说明。

这不保证内外物理屏同时点亮或接管系统切屏动画。最终体验必须在“保持亮屏”启用后进行真实合盖/展开验证，见 `validation/2026-09-10-fold-hinge/`。


## 2026-09-10：按用户截图修正为空间渐变（新版验证中）

用户明确：同一帧左侧强模糊、向右连续清晰，像透过磨砂玻璃看到同一幅画面。此前整页统一 blur、旧截图 FIT_CENTER 叠加和半折停顿 450ms 淡出均不符合要求，不能沿用之前的“动效通过”结论。

当前渲染器 `FoldGradientBlur`：Android 13+ 系统高斯模糊 + AGSL 空间权重，将 0、0.08、0.22、0.5、1 倍峰值的原生二维高斯模糊层相邻混合，近似随横坐标连续变化的 sigma。权重之和为 1，无白色遮罩、位移或 source-over 叠影。初版稀疏 13 点采样在真机文字中出现网格，已放弃该实现。峰值 sigma 为 10dp × amount，`extent = 0.25 + 0.7 × amount`，`sigma(x) = peak × (1-smoothstep(0, extent, x/width))`。右缘保持原始像素；半折 amount 由绝对角度 `(170-angle)/150` 截取至 [0,1] 得到，不依赖从何处开始折叠。它是参考截图制作的应用内空间渐变，不声称复制官网完整 3D 材质或让物理屏幕透明。

不再存储/缩放/叠加旧界面截图，直接采样仍挂载的 WebView；内容几何位置不因渲染器改变。内外屏尺寸改变时仍由现有响应式布局接续，首帧握手后 300ms 收回渐变。半折静止保持渐变；完全展开、禁用、后台和销毁均清除。完全合拢但未切窗 350ms 后恢复可读内容。API <33 或编译错误保持清晰画面，不回退至用户拒绝的整页模糊。

误触发修复：完全展开的 170–180 度抖动不启动动效；宽度变化仅在物理面板尺寸改变时触发，普通旋转、键盘、分屏、刷新率变化不算折叠。未读取陀螺仪或加速度计。

验证分层：
- JVM：角度状态机、完全展开噪声、同帧 sigma 单调性和清晰右缘。
- 真机原生 GPU：debug 限时调用生产渲染器，ADB 截取 Android 合成后的画面；比较水平/垂直正弦测试条纹从左至右的对比度，并确认右侧和复原像素不变。CDP 截图发生在原生 RenderEffect 之前，不能充当此证明。
- 真机系统旋转：四次横竖切换，blur 始终为 0，WebView/草稿保留。
- 用户实际合拢/展开：记录传感器和面板尺寸、渐变强度、清理、会话 DOM 与草稿。此项必须与人工 preview 或模拟器分开报告。

证据目录：`validation/2026-09-10-fold-gradient/`。

### 应用内配对与双屏渲染组件（2026-09-10，继续实施）

已部署原生首次授权引导与插件设置入口。用户确认“允许”后提供本次配对码，由现有原生桥完成应用自己的握手，实测 authorized/paired/connected 均为 true；没有复制电脑凭据。通知 RemoteInput 路径已构建，但本次用户选择由助手提交配对，不能声称通知输入端到端已验收。

通过该应用自己的 ADB 通道请求 state 5，两个物理屏均 ON；第二屏 Presentation 同步收到 46 帧 PixelCopy 画面，无错误，已检查两屏截图。测试结束释放覆盖状态。证据在 `validation/2026-09-10-fold-gradient/dual/`；`mirror-result.json` 明确 physicalHingeTested=false。停止心跳后的 shell watchdog 在 15 秒观察窗口内释放；4 秒存活测试避免把跨 UID 的 kill 权限失败当死亡。自动角度控制器正部署，尚不标记整个里程碑完成。

### 最新反馈修复：内屏折叠侧滤镜和合盖交接

外屏效果已获得用户确认，保持其正视投影公式。内屏新滤镜仅覆盖左折叠半屏，固定右半屏零模糊；清晰源改为同一 WebView 的离屏硬件录制，两屏滤镜各自计算。真机两块物理屏的五组角度截图与对比度验证通过，16 项纯函数测试通过。新增渲染的采样耗时 37–48ms，加 40ms 调度间隔，尚非高帧率方案。

合盖释放双屏模式时保留外屏 Presentation 到 reset 返回，避免提前撤掉画面。已构建并安装；实际铰链联动及短暂黑屏仍以本轮用户复测为准，不用 debug 预览代替物理验收。安装 SHA、原生运行时、账号、Debian 和 ASR 模型保留均由 `validation/2026-09-10-fold-deploy/runtime-final.json` 核验。详见 `validation/2026-09-10-fold-gradient/dual/README.md`。

后续用户反馈“内屏展开太慢、合盖图片飞过”：内屏边界改为 `0.5*max(0,cos(theta))`，90 度全清晰；交接新增冻结末帧并在 reset 前恢复方向。前一轮实际铰链联动 0–179 度、双屏 ON、同 WebView/草稿保留通过，但视觉验收未通过。新包须重新验收，不沿用前轮结论。

最终澄清：模糊覆盖不足才是问题，不能把右半屏无条件设为清晰。当前内屏使用投影边缘 `b=(1+cos(theta))/2`，右侧可见区域清晰、左侧遮挡区域模糊，完全展开才全清晰。旧半屏实现已撤回；外屏保持用户认可的公式。当前验收目录改为 `dual/visible-projection/`，视点仍是固定正视近似。

### 合盖闪黑：切换到外屏稳定主屏

用户已确认内屏模糊速度。外屏黑闪由 state 5→0 物理显示映射时的 OFF/ON 与约 300ms 首帧等待构成；单靠保留 Presentation 无法解决。对照实机 0→6→0 仅内屏供电变化。副屏不承载 Activity，保留同一 WebView，改用临时宽画布 + 内屏旋转 Presentation；窗口退出恢复宽度与方向。两屏原生像素测试已通过，实际交接仍待复验。证据见 dual/stable-cover 与 cover-primary-probe.json。

用户最新要求仅修复轻折后的上下颠倒。保留 state 6 与接受的投影公式，修正固定 +90° 图层方向，改为跟随展开时实际 display.rotation（本机记录 270°）。inner-upright 原生像素与不对称上下标记测试通过；实际轻折正在复测。撤回 state 5 的包未装机，不能当作当前部署。
