# Fold 本地媒体工具与 Codex Skills

2026-09-11。目标仅为 lhasa / 2608BPX34C 折叠手机，未更新平板。最新连接地址在设备验收收据中记录，端口仍需重新发现。

## 已部署

- 新 APK 加入 ARM64 CPU/Vulkan 两个 ForcedAligner 原生可执行文件与社区许可证；快照 SHA 保持 `701055a66b6cc17ec30395e563501354531aa2969dbc05b118f88ef4e4ed5c2d`，没有重新初始化账号、Debian 或 ASR。
- Debian 安装 HyperFrames **0.8.33**、Node **22.23.2**、Chromium **152.0.7977.82**；FFmpeg **5.1.9-0+deb12u1** 已可用。沿用平板固定 HyperFrames 的 package-lock。
- 独立 Qwen3-ForcedAligner-0.6B Q8_0（994,404,608 字节）存于 `/storage/emulated/0/work/models/qwen3-forced-aligner/`。SHA 与模型清单一致。
- Codex 独立 HOME 的 `skills/` 下安装 `android-media`、`android-transcribe`。两者已经被手机实际 Codex 会话发现、读取并调用，不是只给 DSH 注入提示词。

APK SHA、技能文件逐项 SHA 及安装验证：`validation/2026-09-11-fold-media/deployment.json`。

## 使用方式

DeepCode 会话选择 Codex 后，可以直接说：

> 使用 $android-transcribe，把 /storage/emulated/0/work/project/video.mp4 转录成文字、字词时间戳和 SRT，保存到 project/transcript-001。

或：

> 使用 $android-media，在当前项目中用 FFmpeg 提取音轨，并检查 HyperFrames 环境。

正常自动技能发现也已开启；显式 `$名称` 可明确指定。此能力是 **Codex 原生 skill＋shell 脚本**，没有新增 DSH `transcribe` 工具，也没有改变实时麦克风输入。当前 Android Codex runtime 仍需要会话的完全访问模式；测试仅为新验收会话选择该模式，原全局默认模型已恢复。

手机技能路径：

```text
/data/user/0/com.dsharnessmobile.shell/files/home/.dsh/codex-android/home/skills/
  android-media/SKILL.md
  android-transcribe/SKILL.md
```

Skill 脚本从 Android 宿主 `python3` 运行。`android-media` 通过现有 Debian runner 将指定工作区映射到 `/workspace`，提供 FFmpeg/HyperFrames 命令入口。`android-transcribe` 在宿主编排 Debian 解码、本地 CPU ASR 与原生 Vulkan 对齐，再将分段时间加回原文件偏移。

首版转录脚本接受内部共享存储 `/storage/emulated/0` 内的输入/输出；外置存储尚未纳入此脚本路径映射。输入普通音频或视频，`--start`/`--duration` 可指定区间；时间戳对应原文件绝对时间。输出目录必须新建，不覆盖已有字幕。默认 CPU 4 线程 ASR＋Vulkan 对齐，Vulkan 失败只尝试一次 CPU 回退并记录，`--aligner cpu` 可显式选 CPU。

运行时不依赖电脑 ADB，不调用云端语音服务；模型下载与本次部署使用电脑 ADB，不等于日常转录使用 ADB。长任务用 Codex 原有 shell 任务机制等待/取消；脚本持有自己的互斥锁并清理自己启动的进程，父进程异常退出时原生推理子进程通过 parent-death signal 退出。不要强杀其他会话的引擎或麦克风服务。

## 实机验证

新建“手机媒体工具与时间戳验收”Codex 会话，实际读取两个 SKILL.md，执行 FFmpeg/HyperFrames 版本检查、transcribe doctor 和 4.2039375 秒中文音频转录。测试在手机锁屏时通过，说明本轮任务可以后台完成，不代表任意长时后台任务均不受 HyperOS 限制。

- 文本：“甚至出现交易几乎停滞的情况。”
- 13 个中文字级时间戳、1 条 SRT；普通应用权限下读取共享模型并写出共享产物。
- 对齐三张图实际矩阵节点 GPU/CPU 为 4/0、194/0、197/0，使用 Vulkan0，无 CPU 回退。
- 总脚本耗时 **9.843s**（含解码、ASR 启动、对齐加载），其中解码0.591s、ASR加载1.815s、ASR请求2.290s、对齐4.886s。短样本 RTF 2.341，不能与平板一分钟暖启动基准直接比较，也不能外推长视频吞吐量。
- 产物在手机 `/storage/emulated/0/work/fold-media-validation/codex-transcript-check/`，本机证据同名目录含 TXT/JSON/SRT/report。

Host 校验包含两个 skill 的 schema、Python 编译、真实一分钟基准导出＋30秒源偏移、子进程取消。模型时间分辨率80ms不等于人工准确率；中文按字，背景音乐的分段可能使用低能量回退。调用方式与输出契约见 [字幕 Skill](../android-shell/codex-skills/android-transcribe/SKILL.md)。

另由同一手机 Codex 会话调用 android-media 启动 Chromium headless，输出测试 HTML 的 `FOLD_CHROMIUM_OK` 标记并以退出码0正常结束。见 `codex-browser-turn.json`、`chromium-check.log` 与最终 `acceptance.json`。没有渲染视频，浏览器启动验收不替代实际工程渲染验收。

## 维护与复现

```bash
source scripts/env.sh
python3 scripts/build-forced-aligner.py
python3 scripts/build-forced-aligner.py --vulkan
python3 scripts/prepare-forced-aligner-apk.py
python3 scripts/rebuild-codex-shell.py
```

前提是已准备固定源码、NDK/Vulkan 工具链，见 `asr-lab/forced-aligner/README.md`。两个 ELF 位于 APK nativeLibraryDir，不能用 writable files 中直接执行代替正式打包。保持既有安装前检查和双屏释放流程。

技能源位于 `android-shell/codex-skills/`。打包这些目录时排除 `__pycache__`，部署到上面的 Codex HOME skills，保留其他技能。修改后重新验证 skill 文件 SHA；技能本身不在当前 APK 快照事务管理范围内，属于手机持久 HOME 文件。

Debian 安装脚本 `scripts/hyperframes/install-fold-media.sh` 在私有 staging 映射为 `/workspace` 后运行，同目录提供平板已锁定的 `environment-package.json` 与 `environment-package-lock.json`。它不会重置 rootfs；现有不同版本 HyperFrames 会停止并要求先检查。包装器采用系统 Chromium、单 worker、低内存、软件浏览器渲染。

本次配置未渲染最终视频。HyperFrames 的实际项目仍须遵循用户的素材/NAS/生产渲染管线要求；安装 npm CLI 不代表替换最终交付渲染器。
