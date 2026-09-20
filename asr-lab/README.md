# Qwen 安卓离线语音实验

独立 APK `com.dsharnessmobile.asrlab`，验证 Xiaomi Pad9 Pro Max（本次设备实际报告 O3）本地 Qwen3-ASR-0.6B / 1.7B。默认 0.6B。引擎是固定版本 llama.cpp，直接运行 Android ARM64/Bionic 可执行文件，无需 Debian 或 PRoot。

## 使用

1. 安装本仓库 `artifacts/qwen-asr-lab-v0.1.0.apk`。
2. 模型放到平板内部存储 `work/models/qwen3-asr/`，文件名见 `models.json`。解码器和 mmproj 音频编码器都必需。
3. 在应用中授权 work 目录（实验 APK 使用所有文件访问权限），选择模型和 CPU / Vulkan，加载模型。
4. 可填写热词／领域上下文。此文本原样通过 system message 传给模型，不进行识别后强制替换，不保证命中，也没有独立热词权重参数。
5. 点击“开始说话”，授权麦克风；选择 2 / 4 / 6 秒分段。停止后处理尾段。单次最长 120 秒。
6. 结果和引擎日志保存到内部存储 `work/asr-lab/`。报告包含识别文本和输入的上下文；麦克风原始音频仅在内存，不保存。

## 实时能力边界

当前使用固定长度独立 PCM 分段，并通过 SSE 逐步显示模型输出。它没有跨段音频状态、重叠纠错、VAD 断句和稳定文本提交策略，可能在段边界截断词语。队列最多等待 3 段，超限停止录音并记录丢段错误；低音量片段会跳过。切离当前页面停止麦克风。前台服务用于维持用户启动的推理任务，不提供后台偷录或自动唤醒。

官方 Qwen3-ASR Python `init_streaming_state` / `streaming_transcribe` 目前限定 vLLM：累积音频，重送已收到的音频，并用前次文本回退若干 token 后作为前缀。这与本 APK 的独立分段不同；也不能据其“流式”命名推断存在恒定开销声学缓存。

参考：<https://github.com/QwenLM/Qwen3-ASR/blob/main/qwen_asr/inference/qwen3_asr.py>

## 构建和复测

在仓库根目录执行（首次下载源代码和模型需要网络；Android/JDK/Gradle 依赖由项目环境提供）：

```bash
source scripts/env.sh
python3 scripts/download-asr-models.py
python3 scripts/build-asr-lab.py
adb -s DEVICE install -r artifacts/qwen-asr-lab-v0.1.0.apk
adb -s DEVICE shell mkdir -p /storage/emulated/0/work/models/qwen3-asr
adb -s DEVICE push .tools/asr-models/. /storage/emulated/0/work/models/qwen3-asr/
python3 scripts/test-asr-lab.py DEVICE --model 0.6B --backend cpu --output artifacts/asr-lab/cpu-new-run
python3 scripts/test-asr-lab.py DEVICE --model 0.6B --backend vulkan --output artifacts/asr-lab/vulkan-new-run
# 上一个测试结束后保持应用引擎运行：
python3 scripts/probe-asr-stream.py DEVICE --output artifacts/asr-lab/context-and-paced.json
# 约 120 秒持续供给文件音频；请在没有麦克风识别任务时运行：
python3 scripts/probe-asr-stream.py DEVICE --repeats 24 --skip-context --output artifacts/asr-lab/paced-120s.json
# 只读观察用户手动启动的麦克风会话，不会自动录音：
python3 scripts/monitor-asr-mic.py DEVICE --seconds 180 --output artifacts/asr-lab/mic-observation
# 已授权麦克风后，可做一次可听见的扬声器→真实麦克风回环；会播放中文样例：
adb -s DEVICE shell am force-stop com.dsharnessmobile.asrlab
adb -s DEVICE shell am start -n com.dsharnessmobile.asrlab/.MainActivity --es model 0.6B --es backend vulkan --es mode loopback
```

模型来源 ModelScope ggml-org，版本、字节数和 SHA-256 固定在 `models.json`。APK 构建输出旁有签名验证后的 SHA-256 收据；引擎源码和 Vulkan 依赖版本由构建脚本固定。APK 为实验调试签名，并非商店发布包。

`test-asr-lab.py` 每个中英文样例先预热一次再计时三次。RSS 每两秒采样，对同应用 UID 的进程求和；这是采样峰值，不是准确的 GPU 显存占用。请求耗时不含采集音频的时间。`probe-asr-stream.py` 经 ADB 转发连接本机服务，测试 context 请求和按真实时间供给的 2 秒音频分段，包含 ADB 开销；这不等同于真实麦克风测试。

给 `test-asr-lab.py` 加 `--silence` 会额外检查一秒数字静音，要求输出正文为空且没有正文首字时间；语言前缀不应算正文。扬声器回环走 AudioRecord，报告 `captureSource=speaker-loopback`，区别于用户朗读和文件直接输入。诊断播放仅执行一次，后续手动加载模型不会自动重播。

引擎仅监听平板 loopback 8876，每次 Activity 会话生成随机 API key。CPU 模式显式禁用 GPU 和 mmproj offload；GPU 是否实际生效须查日志中的层 offload 及 CLIP backend，不能只看 UI 选择项。应用推理请求仅发往平板自身，无云端模型依赖。
