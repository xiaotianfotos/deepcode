# Android 管理工具的观察与动作契约

实现位于 `plugins/dsh-android-manage`，经既有 `androidPrivilege` 授权桥注册标准 DSH 工具。保持现有授权要求，不增加 root、配对或模型切换。DSH 工具与 Codex 自己的 shell/skill 执行路径不同，此文不声称修复会自动应用于 Codex 的任意原始 ADB 命令。

## 观察与坐标

- `android_screenshot` 校验 PNG IHDR，返回真实像素宽高、旋转和 `snapshotId`。截图前后默认显示屏的输入视口必须稳定，且与 PNG 尺寸一致。读图仍需当前模型声明并支持图片输入；工具不自动替换模型，也不把截图路径当作视觉理解成功。
- `android_ui_dump` 的模型文本包含完整紧凑 JSON（至多 60 个节点），包括节点编号、语义标签、位置、当前屏幕尺寸和 `snapshotId`。画布内容可能不在无障碍树中，需读图确认。
- 输入坐标来自 `dumpsys input` 的默认显示屏活动 `Viewport` / `logicalFrame` / `orientation`。`wm size` 是自然物理尺寸，不得用于当前横屏定位；无法解析当前视口时拒绝坐标动作，不猜尺寸。其他显示屏尚未适配。
- `android_ui_click` 使用 `id:n0` 等编号时必须传对应 dump 的 `snapshotId`；使用 `nx/ny` 时必须传最新截图的 `snapshotId`。归一化 1 对应最后一个有效像素。`android_ui_scroll` 的编号引用同样需要快照；精确文本引用存在歧义时拒绝操作。
- 快照只属于创建它的会话，有效期 120 秒。新 dump 替换旧树；动作使已有观察失效。操作前重查旋转/尺寸，快照失配、坐标越界或调用已取消时不注入输入。外部用户或原始 shell 仍可改变页面，因此动作后必须重新观察，不能仅靠快照编号证明页面未变化。
- 插件内设备操作串行执行，避免多个会话交错修改同一个 UI/输入法。原始 shell 和其他插件不受此队列管理。

## 输入与结果

`android_act_input` 的点按/滑动支持 `source: touchscreen | stylus`。普通 tap/swipe 默认触摸屏来源。命令执行成功只代表发送成功，不等于应用接受了输入或任务完成；调用方应 dump/截图验证，不应在没有视觉能力时反复用字符画猜画布内容。连续路径笔画与自动视觉验证尚未提供。

`android_ui_input` 默认借用内嵌 ADB 输入法：确认原 IME、切换并回读、发送广播、在 `finally` 中恢复并验证。原 IME 不明或已经是自动化 IME 时拒绝借用，要求先选回用户输入法。用户中途自行选择另一输入法时保留其选择；恢复失败显式报告，不吞掉错误。进程被强制终止时 JavaScript `finally` 无法运行，当前没有跨重启恢复租约。ASCII `input` 通道不支持清空，明确拒绝 `clear`。

## 构建、验证与交付

从仓库根加载 `source scripts/env.sh`，在插件目录执行 `npm ci --legacy-peer-deps` 与 `npm test`。构建将内部模块打包为单个 `lib/index.js`，避免多文件补丁部分更新；测试包括方向变化、越界拒绝、快照所属/失效、模型节点输出、输入法异常恢复和并发借用。

`scripts/test-android-manage-device.py <tablet-serial>` 将测试放入设备独立临时目录，使用设备真实 DSH 工具定义验证输入契约，ADB 副作用由夹具隔离；不点击屏幕、不切输入法，测试后清理。此测试不等于真实应用端到端验收。

后台语音实验构建在 `prepare-live-experiment.py` 加入管理工具资产；`EngineManager` 仅对已知包版本与基线 SHA（或上次受管 SHA）原子替换，遇到用户修改跳过。安装仍执行 `install-live-experiment.py` 全部空闲门禁；运行中的 Agent/Live 不允许被修复包中断。真实截图/点击/文本验收在安装后独立进行，证据留根 `.local/validation/`。
