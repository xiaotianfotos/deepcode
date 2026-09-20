---
name: deepcode-session-supervisor
description: 在安卓 DeepCode 内监控用户指定的其他会话，读取进度和工具结果、发送修复反馈，并配合本机 ADB 顺序验收多个会话开发的应用。用户要让一个 Codex 管理多个 DeepCode 会话时使用。
---

# 监控本机 DeepCode 会话

你就在 Android 的 DeepCode/Codex 中。其他会话通过本机引擎 RPC 读取和反馈；ADB 用于应用安装、启动、截图、日志与输入。不要把“有 ADB”当成已能看懂或控制会话，也不必反复截 DeepCode 聊天界面猜进度。

## 会话入口

使用本技能同目录 `scripts/supervisor.py`，由宿主 Termux Python 执行。用户本轮授权的会话在任务 `manifest.json` 的 `jobs` 中（每项 `key`、`id`、`workspace`、`package`），只监控这些条目。保持模型和项目分工，不改全局默认模型。manifest 缺少目标时先核实用户指定对象，不从其他私人会话中挑选。

脚本通过应用自身已保存的引擎 Cookie 连接设备内部 127.0.0.1:3080，认证仅在内存处理。不要复制/打印 Cookie、配对密钥或 Codex 凭据。它是本机内部接口，无需电脑 adb forward 或对外开端口。

```bash
python <skill>/scripts/supervisor.py --manifest /storage/emulated/0/work/<任务>/manifest.json status
python <skill>/scripts/supervisor.py --manifest /storage/emulated/0/work/<任务>/manifest.json history --job hockey
python <skill>/scripts/supervisor.py --manifest /storage/emulated/0/work/<任务>/manifest.json send --job hockey --mode queue --message-file /storage/emulated/0/work/<任务>/feedback/hockey.txt
python <skill>/scripts/supervisor.py --manifest /storage/emulated/0/work/<任务>/manifest.json watch --seconds 30
```

`send --mode queue` 排到下一轮；`--mode steer` 请求插入当前工作，但具体后端可能在工具或模型调用边界才处理，accepted 不代表已经读到。用后续事件/产物确认，不重复发送同一条指令。查看 `--help` 确认实际参数。

状态 running=false 只说明停止运行，不代表完成。结合最近助手消息、错误、工作目录 status.json、APK/构建收据与测试结果判断。对宣称的成功做独立核对；遇到失败，给负责的会话发具体错误和可复现反馈，继续跟踪。用户在比较模型表现时，由原开发会话修复；监控者不代写游戏代码或换模型掩盖失败。

## 本机验收

已部署的 `android-app-dev` skill 提供安装/启动/截图/日志/输入，用其 `scripts/app.py`，按需读该 skill。它复用 DeepCode 自己的配对身份，与电脑身份分开。初次安装被 HyperOS 拒绝时报告具体包名和系统返回，等待用户处理安装弹窗后再重试，不改安全策略。

三个开发会话可同时写各自目录；设备只有一个前台，监控者统一顺序安排 build/install/launch/test，避免互相切屏。正在编写或编译的项目不要抢着覆盖安装。验证前检查屏幕已亮且解锁；截图后取当前坐标，不在旋转后沿用旧坐标。避免向系统未知页面盲点。不要 force-stop DeepCode，否则会终止自己和其他会话。

只读验证允许检查包名、APK SHA、构建时间、限定包日志及共享测试产物。保存每个任务的进度、反馈、首次构建是否成功、修复轮次、实际安装/交互验收结果；不把静态代码检查或 performClick 说成真实多指操作。

监控时每次短轮询（watch 最多45秒），有新结果就处理；不要丢一个无人检查的后台脚本便宣称持续监控。所有目标完成时写汇总；若卡在用户确认或后端错误，明确记录待办与可恢复位置。开发耗时含模型服务排队、工具和编译，不能称为模型纯推理速度或 token/s，除非另有真实测量。
