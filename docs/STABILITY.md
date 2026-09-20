# 稳定性验证方法

本文保留可复用的检查入口和限制。单次测试记录、性能数字及交付回执仅保存在本地。下面的脚本包含历史文件系统适配包假设，使用前必须核对当前构建清单；当前 Codex 设备操作以 [设备与调试说明](../android-shell/docs/AGENTS/devices-and-debugging.md) 为准，不直接用历史脚本覆盖设备。

## 检查入口

先安装适配包，等待第一次快照解压完成，然后运行：

```bash
cd /path/to/developer/work/deepseek-harness-android
source scripts/env.sh
python scripts/accept-device.py SERIAL
```

入口核对 ABI、SDK、本地 APK SHA-256、已装版本和该 ABI 的快照指纹，再做基础验收。基础探针会向应用私有测试目录写入数据，不清除已有应用数据。文件适配检查还需要本机已有的 `.tools/fs-adapter/overlay-ABI.json` 和插件 npm 依赖；新工作机先按 [FS-ADAPTER.md](FS-ADAPTER.md) 恢复构建环境。通过只表示这些具体检查通过，不能替代中文输入、文件选择器等手动测试。

专用模拟器可选择追加较长或会中断进程的检查：

```bash
python scripts/accept-device.py emulator-5580 --lifecycle --extended
# 或分项执行
python scripts/test-lifecycle.py emulator-5580 --case cold-start
python scripts/test-lifecycle.py emulator-5580 --case engine-crash
python scripts/test-agent-background.py emulator-5580
python scripts/test-model-retry.py emulator-5580
```

`--extended` 使用已配置的 `local-qwen / qwen38-flash-next`，访问 `192.0.2.10:5000`，约需 6–10 分钟。测试会创建独立会话/工作区，临时 provider 仅限重试测试；完成后恢复原默认模型。生命周期检查依赖先前标准工具任务产物 `android-e2e/adapter-created.json`。脚本拒绝实体设备故障注入、活动 Agent 或正在提交的快照；基础检查仍可用于明确指定的真机。

HTTP 鉴权使用动态 ADB 转发端口和内存 cookie，结束后移除自身转发。历史诊断暂时依赖 0.1.2-rc.1 的游标错误格式，版本变化会显式失败；这是验收工具的兼容性限制，不是产品通信 adapter。
