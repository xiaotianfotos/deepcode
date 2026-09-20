# 语音输入交互与内容字号（2026-09-09）

本次替代第一版的大幅柱状卡片。正式外观沿用 Homerail `AgentVoiceCockpit.vue` 的三条渐变 SVG 曲线与输入框上方窄条：宽度使用 Harness composer 的官方 CSS 变量，左右对齐，52px 内容高度，原生 dock 提供 8px 间隔。右侧取消/完成图标；配置入口与默认本地 Qwen3-ASR-0.6B 保留，转录只追加草稿。

参考源码：`/path/to/developer/work/HomerailRepos/homerail/agent-ui/src/components/agent/AgentVoiceCockpit.vue`，提交 `308f652cab608ed47810e6acba7a9d17cea9de53`。路径构造为 buildVoiceWavePath（quadratic Bézier，3 个相位/偏移），PCM 可视化采用实时输入仪表的 72 个有符号采样、6 倍显示增益、0.24/0.76 平滑。没有伪造静音时的动态波形。

## 端点与限制

原生 libfvad 固定 `532ab666c20d3cfda38bca63abbb0f152706c369`，WebRTC VAD mode2，16kHz/20ms。VAD 阳性还需通过自适应能量门槛与连续 60ms 判定。`VoiceActivityGate` 使用最近 2 秒的帧 RMS 第 20 百分位估算底噪，门槛为该值的 3 倍，限制在 0.0003–0.012；包含 VAD 阳性帧，避免持续底噪被 hangover 当成人声而无法更新估计。安静环境中的轻声可以重置静音计时，固定底噪与孤立脉冲仍受过滤。音频本身不增益，波形显示与端点判定分离。连续 5000ms 没有有效语音后结束录音；无语音返回提示且不提交模型。语音仅保留前后 300ms 上下文再提交，最长 60 秒。环境声音也可能被判作语音，极轻声可能漏检；此次测试不是全环境准确率基准。

历史版本的第一轮 WebRTC 裸检测将底噪当成语音，4.2 秒样例持续录制 45.9 秒才结束；加入能量闸和连续帧后，一轮相同样例在 9.2 秒结束，其中末尾静音恰好 5 秒，实际送入模型 3.86 秒，模型请求 1.362 秒。前一次布局检查发现额外 margin 与官方 gap 叠加到16px，最终去掉额外 margin。

当前内置 llama.cpp `df750f76bb6126566621803b69ddaeb993be5b08` 的接入使用完整 WAV 输入与文字 SSE 输出，**没有接入持续音频输入或增量音频上下文**；不能称为实时流式 ASR。核对 [官方 server 接口说明](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md) 与 [server 路由](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server.cpp)，未发现可直接用于当前 Qwen3-ASR 的持续音频追加接口。VAD 来源为 [libfvad](https://github.com/dpirch/libfvad)。

## 字号与性能

删除 CPU 百分比及 /proc stat 时间差采样；性能插件只保留同 UID RSS 与真实 GPU 可用性。小米 O3 平板当前 GPU 利用率仍返回不可用。

Ctrl + = / + / 数字键盘加，Ctrl + - / 数字键盘减，Ctrl + 0 恢复14px。沿用 ThemeRuntime 的 12–17px 范围与持久配置。WebView 在 DOM 前消费部分硬件组合键，Activity 只转发专用事件，插件调用 `ctx.theme.setFontSize`；响应式 ThemePresenter 补齐单独 fontSize 字段的 CSS 投影。侧栏、按钮和页面缩放保持不变。

## 构建与验收

先 source scripts/env.sh；构建两个 voice/performance 插件和 dsh-client-ui-responsive；执行 overlay-fs-adapter.py arm64 --voice-debug，然后 build-baseline.py arm64 --voice-debug。构建会固定并编译 libfvad JNI、校验六项运行时门禁与 APK ELF 对齐。模型仍位于平板共享 work/models/qwen3-asr，不在 APK 内。

实机脚本：scripts/test-voice-vad.mjs、scripts/test-content-font-keys.mjs、scripts/test-voice-plugin-lifecycle.mjs。最新结果以 evidence/voice-performance/2026-09-09-vad/final-* 下的收据为准；其余子目录保留问题定位过程，不表示最终版通过。

### 最终安装包实测

- 最终版三条 SVG 曲线随真实麦克风 PCM 变化；左右与 composer 误差 <2px，条高53.6 CSS px（含边框），间隔8px。
- VAD 最后有效语音后恰好5000ms结束。最终一轮捕获12.54秒（环境声延长了语音判定），送入模型7.74秒，模型请求2.292秒、首段文字2.167秒；前一轮同样例模型1.362秒。不要将5秒端点窗口误写成总延迟。
- 一个真实 environment.json 引用卡片及既有草稿均保留，0次 agent prompt 请求。
- Android keycombination 的 Ctrl =、Ctrl Shift =、数字键盘加减、Ctrl +、Ctrl -、Ctrl0全部通过；内容字号14→15→16→17（上限）→16→15→14，视口1363px/scale1、按钮40px、侧栏270px不变；真实WebView重载后字号15px保持，已恢复14px。
- Home及会话切换均取消录音，草稿保留，取消后无 ASR 子进程；性能开关关闭后停止采样。GPU不可用，CPU采样字段已删除。
- 25项JVM测试、语音5项/性能1项/字体5项测试、六项运行时门禁通过。未做嘈杂环境准确率或极轻声覆盖性验收。

APK：artifacts/dsh-v0.13.3-local-voice-debug-arm64.apk

APK SHA-256：`1ff8b3d0288f299ce75307031d627b3176ed5fe8fcc13620b4e7b61714cc1343`；216430138 bytes。实机 base.apk 校验一致。
快照 SHA-256：`938a14757232f14757e580b35e8be093d0ec67eb48142cb3b8f02060e2b9a508`；fingerprint一致且更新事务已消失。
