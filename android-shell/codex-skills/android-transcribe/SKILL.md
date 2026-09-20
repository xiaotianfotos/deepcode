---
name: android-transcribe
description: 在 DeepCode 安卓本机将视频或音频转为文字、中文字级/英文词级时间戳和 SRT 字幕。用于口播转录、字幕与剪辑定位，使用本地 Qwen3-ASR 和 ForcedAligner。
---

使用此 skill 配套的 `scripts/transcribe.py`，从 Android 宿主 shell 的 `python3` 执行，不要在 Debian shell 里启动它。无需电脑、ADB 或云端 ASR。首次使用先运行 `--doctor`，确认模型、原生程序与 Debian 环境。

```bash
python3 <本SKILL.md所在目录>/scripts/transcribe.py --doctor
python3 <本SKILL.md所在目录>/scripts/transcribe.py \
  /storage/emulated/0/work/project/source.mp4 \
  --output /storage/emulated/0/work/project/transcript-001 \
  --language Chinese
```

输入支持 FFmpeg 可解码的本地音视频。输出目录必须不存在，避免覆盖用户字幕。可用 `--start 30 --duration 60` 仅处理指定片段；导出时间戳仍对应原视频绝对时间。默认转录后对齐，`--aligner auto` 优先 Vulkan、失败时明确记录 CPU 回退；`--aligner cpu` 可强制 CPU。ASR 默认 KleidiAI CPU 4 线程，按硬件能力自动选择指令，不需要配置或转换现有0.6B模型。

优化引擎加载失败时自动尝试随APK打包的兼容引擎；若优化进程在转录时退出，只对当前未交付片段重试一次。可用 `--asr-engine compatibility` 明确使用兼容引擎排查问题。`report.json` 的 `asrEngine` / `asrEngineAttempts` 记录实际选择和加载时间；不能仅因启用KleidiAI就宣称使用了SME或NPU。新版需与带 `libdsh_voice_compat.so` 的APK配套。

标准输出逐段报告进度，最终给出文件路径、实际后端和耗时。向用户交付 `transcript.txt`、`transcript.timestamps.json`、`transcript.srt`；`report.json` 保留分段和计时依据。不要把估计字词时间称为人工校准：中文主要逐字、英文按词，模型刻度 80ms；带背景音乐的分段可能退回低能量切点，跨段句子要抽查。

通过正常 shell 工具运行并等待任务完成；后台任务需保留工具的进程/任务 ID，用户取消时向该任务发送中断，脚本会清理自己启动的推理进程。不要杀全局 Node、Codex、麦克风服务或更改其他会话。脚本有设备级互斥，遇到另一转录正在运行应等待；与麦克风同时使用会争内存，避免并行进行。

不要把 GPU 初始化日志直接当作 GPU 已参与计算；以 report.json 中的矩阵节点后端记录为准。手机性能不同于平板，按实际耗时报告 RTF，不沿用 O3 跑分。

若模型或库缺失，按 doctor 结果说明缺项，不下载不明权重替换。此 skill 的模型布局和原生对齐器配套；不能把 ASR GGUF 当 ForcedAligner 权重。普通项目可通过内置 Debian 执行 FFmpeg/HyperFrames，见手机另一个 `android-media` skill。
