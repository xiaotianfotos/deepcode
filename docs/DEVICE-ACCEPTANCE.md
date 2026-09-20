# 小米平板到达后的验收

当前没有实体平板连接记录。模拟器结果不是 HyperOS 真机通过。

## 连接与安装

在平板开启开发者选项和 USB 调试，连接 Ubuntu 并接受该电脑的调试授权。使用明确设备序列号，避免装到错误设备。

```bash
cd /path/to/developer/work/deepseek-harness-android
source scripts/env.sh
adb devices -l
python scripts/device-preflight.py SERIAL --manifest releases/storage-preview-20260908/manifest.json
python scripts/collect-device.py SERIAL
python scripts/install-device.py SERIAL --storage
```

安装脚本按设备 ABI 选择清单中的 APK，检查 SDK、SHA-256 和快照事务状态，再执行安装及启动。不要为了签名冲突直接卸载已有应用；已有数据需要另行备份和处理。适配包约 175 MB，首次运行还需要解压空间。

首次解压完成后执行 `python scripts/accept-device.py SERIAL --storage`，汇总基础检查。下载入口为 [局域网 APK](http://192.0.2.40:8767/)，也可直接在平板下载 ARM64 包安装；自动验收仍需要 USB 调试。

## 模型设置

Settings → Models → Add a custom provider：ID `local-qwen`，名称 `Local-Qwen`，协议 `openai-completions`，Base URL `http://192.0.2.10:5000/v1`。获取并添加 `qwen38-flash-next`，创建后进入该 provider 的 Edit，在 API key 填入占位值 `local-no-auth` 并 Apply。服务免密，但 Harness 要求这个字段非空。

平板需能访问该局域网服务；这里测试的是远端模型推理、本地安卓 Agent 工具执行，不是平板本地跑模型。

## 逐项记录

1. 记录实际型号、Android/HyperOS 版本、ABI、PAGE_SIZE、WebView 版本；运行 `collect-device.py`。
2. 完成首次解压、进入主页；运行 `runtime-smoke.py SERIAL` 和 `http-smoke.py SERIAL`。
3. 横竖屏切换、软键盘、中文输入、长回复滚动与会话恢复。
4. 先用 `e2e-fs-adapter-prompt.txt` 发起严格 write/read/edit/read 测试，核对实际文件。新适配包已在模拟器修复 EACCES；真机仍须重验。如果测试目标文件已存在，改用一个新的测试文件名。
5. 单独验证 edit 现有文件、read、Bash/Python，随后冷启动确认会话、模型配置和结果保留。
6. 先保持 HyperOS 默认电池策略，测切后台/锁屏 1、5、15 分钟以及运行中任务；记录实际失败再决定是否调整应用后台策略。
7. 安卓特权、无线调试、文件选择器、外部存储和 PDF 分开验收。基础私有工作区测试不依赖授予全盘或无线 ADB 权限。

## 取证

```bash
python scripts/test-fs-adapter-device.py SERIAL
python scripts/collect-logcat.py SERIAL
adb -s SERIAL exec-out screencap -p > artifacts/pad9-review.png
```

元数据脚本不读聊天或密钥；日志脚本对常见 token/API key 格式脱敏，但日志仍可能包含用户内容，保留本地。不要公开原始 engine.log、settings.yaml 或完整 bugreport。

## 设备测试矩阵

| 项目 | Android 15 x86_64 模拟器 | 小米平板 ARM64 / HyperOS |
| --- | --- | --- |
| 启动、鉴权、Node 工具链 | 通过 | 待测 |
| 标准 write/read/edit 与保护测试 | 通过 | 待测 |
| 冷启动数据保留 | 通过 | 待测 |
| 空闲引擎异常恢复 | 通过 | 待测；不在真机自动注入故障 |
| 运行中 Agent 熄屏 5.5 分钟 | 通过 | 待测 |
| 模型 HTTP 503 后新请求成功 | 通过 | 待测 |
| 中文输入、多窗口、文件选择器 | 未完整验收 | 待测 |
| 16 KB 页、HyperOS 15 分钟后台、强制 Doze | 未覆盖 | 依据实际设备测试 |

模拟器证据、复现命令和后续六步路线见 [STABILITY.md](STABILITY.md)。

共享/外置目录是本轮真机必测项，按 [STORAGE.md](STORAGE.md) 通过系统选择器选择真实目录，分别测试权限拒绝、重新授权、实际 USB 存储及断开后恢复。
