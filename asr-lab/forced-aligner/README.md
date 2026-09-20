# ForcedAligner Android 实验

本目录保存独立对齐器原型和可复用算法。正式 Codex 字幕能力通过 android-transcribe Skill 接入，见 [媒体能力说明](../../docs/FOLD-MEDIA-SKILLS.md)；DSH 独立 transcribe 工具与 Codex Skill 是不同接口。

- `models.json`：独立对齐模型的来源、固定版本、SHA 与共享路径。
- `segment.py source.wav output-directory /path/libdsh_vad.so`：在设备 Python 中做 VAD / 低能量分段，输入必须为 16kHz 单声道 PCM16。
- `export_result.py benchmark.json output-directory`：生成绝对时间 JSON、TXT、SRT。
- `../../scripts/build-forced-aligner.py [--vulkan]`：固定源码校验、静态 Android ARM64 构建、16KiB ELF 检查、IGPU 修复及诊断。输出在 artifacts，不写主 APK。
- `../../scripts/probe-forced-aligner-pad.py SERIAL --minute [--gpu] [--aligner-gpu]`：一分钟性能测试；`--gpu` 控制 ASR，`--aligner-gpu` 控制对齐器。检查目标为 yingtian，要求无 Agent 正在运行。

## 本机复现

从仓库根加载 `source scripts/env.sh`，按设备文档重新发现 serial 并核对 yingtian / M367FC。不得将过期端口或 Fold 当平板。以下依赖已在本机准备：NDK 27.2.12479018、Vulkan headers、SPIRV headers、CMake/Ninja、FFmpeg，以及现有 APK 的 ASR 模型和 native libraries。

源码 `.tools/qwen3-aligner-cpp` 固定到 `6dcc586e5073fd6e85ee5728e75f0903d6c70c6c`，ggml 子模块固定到 `9be313313c8ecb9488911bd64550190e3ed80f38`。若首次 clone 得到新版 HEAD，需要 checkout 固定版本并更新 submodule；构建脚本故意拒绝不匹配的源码。

```bash
python3 scripts/build-forced-aligner.py
python3 scripts/build-forced-aligner.py --vulkan
```

现有测试目录为 `/data/local/tmp/dsh-forced-aligner-20260911/`。将 CPU 产物以 `libdsh_aligner.so` 部署，**将新 Vulkan 产物以 `libdsh_aligner_igpu.so` 部署**，并设可执行权限；该目录旧 `libdsh_aligner_vulkan.so` 是静默 CPU 回退的历史实验，不能使用。模型另放 `models.json` 指定的共享路径并核对 SHA。

设备私有 `files/aligner-lab-20260911/` 保存 source.wav、分段 WAV 与 segments.json；分段 WAV 同时放在上述 ADB 测试目录，脚本从私有目录读取供 ASR 使用。该脚本是针对本轮已准备环境的诊断器，**不是一键安装器**。新设备需先抽取同一源前 60 秒、运行设备分段、准备这两处文件，并更新脚本对应的 validation 清单。原视频位置与切点在报告中记录。

```bash
python3 scripts/probe-forced-aligner-pad.py "$dsh_serial" --minute --aligner-gpu
python3 asr-lab/forced-aligner/export_result.py \
  docs/validation/2026-09-11-forced-aligner/pad-minute-cpu-asr-gpu-aligner.json \
  docs/validation/2026-09-11-forced-aligner/oss-first60-hybrid
```

同名报告会重写，复验前另存旧结果。一次只跑一组以免互相争资源。脚本使用设备回环 ASR 服务、临时认证与 ADB forward，并在 finally 清理自己的服务及转发。不要输出认证、engine.log 或整个用户配置。推理计时包含对齐器逐段加载；下载、传输与视频解码单列。

模型下载地址为社区仓库 `resolve/<models.json revision>/<filename>`；下载后比对清单 SHA，再传设备比对。GGUF 格式布局属于该社区引擎，不能用现有 llama.cpp ASR 文件顶替。正式 APK 的许可证、模型安装入口、工具桥接与应用域执行验收仍需完成。
