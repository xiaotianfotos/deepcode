# KleidiAI 正式语音引擎接入

本地语音使用优化 CPU 引擎与兼容引擎两条路径；保持模型接口、VAD/波形、输入归属和 GPU 字词对齐的边界。模型独立配置，不随 APK 分发。

## 构建与运行

- `scripts/build-voice-engine.py` 构建固定 llama.cpp `df750f76bb6126566621803b69ddaeb993be5b08` + KleidiAI v1.24.0，CPU-only、运行时指令检测，不强制SME、不修改上游。复用NDK27.2.12479018/API29，检查16KiB ELF段对齐。
- 默认 `libdsh_voice_server.so` 为优化引擎；兼容引擎 `libdsh_voice_compat.so` 来自固定的原 ASR lab 构建与SHA收据，支持原CPU路径。两者均安装到APK nativeLibraryDir，不从可写目录执行。
- `artifacts/voice-engine.json` 记录两个 ELF 和许可证 SHA，当前 `first-build.py` 装配并验证这些原生输入。`rebuild-codex-shell.py` / `build-baseline.py` 保留同一语音校验入口，仅用于匹配旧快照与回执的维护链。`build-asr-lab.py --native-only` 显式关闭 KleidiAI，生成兼容基线回执而不构建实验 APK。
- KleidiAI Apache-2.0、BSD-3-Clause许可证与源代码版权行随APK保留。产物只携带组件及来源信息，不含Ubuntu构建路径；本地构建收据保留完整命令。

```bash
source scripts/env.sh
# 单独准备原生语音；输入缺失时自动调用 build-asr-lab.py --native-only。
python3 scripts/build-voice-engine.py
```

单独原生构建不生成完整 DeepCode APK。完整装配运行 `python3 scripts/first-build.py`，产物由 `artifacts/first-build.json` 定位；安全部署使用 `scripts/deploy-source.py --check --serial <完整serial>`，详见 [首次构建与部署](FIRST-DEPLOY.md)。旧增量链的 `artifacts/build-arm64-codex.json` 及历史回退包不是首次构建输入。任何更新均需核对签名并保留用户数据，不自动降级或卸载。

## 麦克风插件

`VoiceInputController` 默认启动优化引擎；读取模型/校验长度放在尝试引擎前，共享存储权限或缺模型不会被错误归因到KleidiAI。优化引擎无法启动/就绪时释放该进程，并尝试一次兼容引擎。

若优化进程在转录中退出，对保留在内存里的同一录音重试一次；只在请求仍有效、进程已死、尚未使用兼容引擎时重试。取消和正常HTTP校验错误不触发此重试；完成文字仍经原请求ID交给原泳道，不重复追加草稿。兼容选择保持到Activity重建；正常用户无需新增配置。诊断status新增 `engine`、`engineReady`，不在聊天界面增加标签。

API key改由子进程环境传入，避免出现在命令参数中；不输出凭据。原有前后台取消、两分钟空闲卸载和麦克风路由逻辑保留。

仅debug包新增固定公开音频fixture入口 `voiceTestSample(id, compatibility)`；文件来自debug assets，不能指定外部路径，不采集麦克风、不发Agent消息。Release构建拒绝此入口且不含debug音频。它用于真实应用UID下测试原生产SSE解析与两套引擎，不能代替真实麦克风录音验证。

## Codex 字幕 skill

`android-shell/codex-skills/android-transcribe` 默认优化CPU ASR + Vulkan对齐；支持 `--asr-engine compatibility` 排查，自动选择和失败重试记录在 `asrEngine`、`asrEngineAttempts` 中。`--doctor` 检查兼容库，新skill需与本次APK一起更新。

解码、VAD分段、ASR、对齐、字幕导出继续在Android宿主/内嵌Debian完成，正常使用不需要ADB。新版 `wallMs` / `rtf` 包括字幕导出及临时目录清理（最后写report本身不计），可以与前次仅分段音频处理段口径区别。不要用只读功能检测或GPU加载日志替代实际矩阵节点记录。

## 验证方法

检查优化与兼容引擎的构建摘要、许可证、ZIP/ELF 对齐，并在应用 UID 下分别验证固定音频、失败回退和真实麦克风。字幕链需额外验证解码、分段、Vulkan 对齐及共享目录写入。

比较性能时保持设备负载、模型、线程数和样本一致，区分纯转录、新进程加载与完整字幕端到端耗时。扬声器回放不能替代用户真实说话；手动停止不等于 VAD 自动结束已经验证。运行结果保存在 `.local/validation/`，不提交样本录音或会话正文。

## 首次原生构建

`python3 scripts/build-asr-lab.py --native-only` 只构建固定版本兼容引擎并生成原生回执，不构建实验 APK；`build-voice-engine.py` 在输入缺失时自动调用。APK 验收字段只由真实 APK 构建产生。完整装配入口见 [FIRST-DEPLOY.md](FIRST-DEPLOY.md)。
