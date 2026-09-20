---
name: android-media
description: 在 DeepCode 安卓手机的 Debian 环境使用 FFmpeg、FFprobe、HyperFrames 和 Chromium，处理本地媒体或检查 HyperFrames 工程。用于调用手机已安装的媒体工具链。
---

这些程序安装在 DeepCode 的 PRoot Debian，不能假设 Android 宿主 PATH 中有 `ffmpeg` 或 `hyperframes`。从宿主 shell 使用配套入口：

```bash
python3 <本SKILL.md所在目录>/scripts/media.py --workspace /storage/emulated/0/work -- ffmpeg -version
python3 <本SKILL.md所在目录>/scripts/media.py --workspace /storage/emulated/0/work/project -- hyperframes --version
```

`--workspace` 指定现有的手机项目目录，在 Debian 中映射为 `/workspace`；命令的当前目录也是 `/workspace`。命令参数使用相对路径或 `/workspace/...`，不要把 Android 的 `/storage/...` 路径直接传给 Debian 程序。例如：

```bash
python3 <本SKILL.md所在目录>/scripts/media.py --workspace /storage/emulated/0/work/project -- \
  ffmpeg -nostdin -i input.mp4 -vn -ac 1 -ar 16000 -n speech.wav
```

安装环境沿用已验收的 HyperFrames 0.8.33、Node 22.23.2，Chromium 和 FFmpeg 来自此 Debian 的包管理器。HyperFrames 包装器已设置系统 Chromium、单 worker、低内存与软件浏览器渲染。具体命令先查 `hyperframes --help` 或对应子命令 `--help`，不要套用较新版本参数；软件渲染耗时不能当作手机 GPU 性能。

仅提供工具链，不替代项目的工程规范和用户对素材、NAS、最终渲染器的要求。实际渲染前读取项目说明；本机预览不能冒充用户指定生产管线的最终交付。不要覆盖原始媒体，输出使用新文件名。预览 web server 使用 `--host 0.0.0.0`（若该子命令支持），给用户手机当前 LAN IP 的可访问地址，不交付 localhost 地址。

获取字词时间戳用另一个 `android-transcribe` skill；`hyperframes transcribe` 不是此设备的本地 Qwen 对齐入口。
