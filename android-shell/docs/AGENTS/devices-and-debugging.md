# 设备、连接与调试

本文不预设操作者的设备、网络、签名、账号或测试授权。命令从仓库根执行；先获得本次任务对目标设备的授权，再发现并核对设备。用户已经授权的范围无需反复确认，但不能因为另一台设备在线就将其作为替代对象。

## 设备识别与电脑无线连接

按 [构建环境](../../../docs/ANDROID-BUILD-ENVIRONMENT.md) 准备电脑工具链，再运行：

```bash
source scripts/env.sh
adb devices -l
adb mdns services
```

`env.sh` 只配置工具查找路径，不安装工具。选择操作者指定的在线设备；下面使用交互输入避免执行示例 serial。所有针对设备的命令显式指定 `-s`，设备列表、mDNS、pair/connect 则是发现与连接命令，不以 `-s` 选择已连接设备。

```bash
read -r -p '请输入已授权目标的完整 ADB serial: ' dsh_serial
test -n "$dsh_serial" || exit 1
adb -s "$dsh_serial" shell getprop ro.product.device
adb -s "$dsh_serial" shell getprop ro.product.model
adb -s "$dsh_serial" shell getprop ro.product.cpu.abi
adb -s "$dsh_serial" shell getprop ro.build.version.sdk
```

核对结果与操作者目标、APK ABI 及支持平台一致。设备代号、型号可帮助辨认，同型号设备仍需核对各自连接身份。mDNS 后缀、IP 和端口会变化；同一物理设备同时显示 mDNS serial 与 IP:port 时不是两台设备。

尚未在线时，从目标的无线调试页或 `_adb-tls-connect._tcp` 发现当前连接端点，再使用 `adb connect`。首次配对或系统忘记授权时，操作者在无线调试页打开「使用配对码配对设备」，使用 `adb pair` 并交互输入代码。配对端口和连接端口不同；不把配对码放进命令行参数、脚本、日志或 Git。已配对设备通常只需重新连接，端口变化不意味着配对失效。

offline 时先重新发现，必要时只断开目标旧端点；不要全局 `adb kill-server` 干扰其他任务。无法发现时核对目标解锁状态、无线调试开关和网络。OEM 后台策略可能影响连通性。

## 电脑 ADB 与应用 ADB 独立

电脑的配对仅授权电脑 ADB 身份。DeepCode 内部通过「设置 → 开发者选项 → 安卓调试授权」建立自己的身份，供本机管理、输入及双屏等能力使用。先查询实际授权和连接状态，已有配对使用动态发现恢复；不要复制电脑 ADB 私钥给应用，也不要将电脑连接成功当作应用已获授权。

应用内的允许开关、文件访问及真实配对分别核实；ADB 能力还受当前会话权限档位约束，见 [ADB 链](adb-chain.md)。ADB 是较宽的调试能力，不是只针对双屏的权限，也不使 DeepCode 成为 root 或系统签名应用。

安装、共享文件读写、麦克风、悬浮窗、通知与系统输入分别受 Android/OEM 权限控制。普通 debug 签名不能授予系统签名权限。遇到 `INSTALL_FAILED_USER_RESTRICTED` 或 `INJECT_EVENTS` 拒绝时记录实际错误并由操作者处理系统要求；不要假定无线配对失败、循环盲点确认或绕过安装提示。`run-as` 需要可调试应用，并可能受系统额外限制；它不是任意 release 包的沙盒访问方式。ADB shell 能读文件或执行原生程序不等于应用 UID 具备同样能力。

## 应用目录

包名为 `com.dsharnessmobile.shell`，入口 Activity 为 `.MainActivity`。下表 `files/` 相对于 `/data/user/0/com.dsharnessmobile.shell/`；实际多用户环境需重新核对应用用户。

| 内容 | 路径 |
|---|---|
| 内嵌 Termux / Node | `files/usr/` |
| 应用 HOME | `files/home/` |
| DSH 配置、会话与附件 | `files/home/.dsh/` |
| Web profile 插件 | `files/home/.dsh/profiles/web/node_modules/` |
| Debian 用户环境 | `files/home/.dsh/debian/` |
| Codex 独立 HOME | `files/home/.dsh/codex-android/home/` |
| 宿主输入图片缓存 | `files/home/.codex/dsh-input-images/` |
| 共享工作区示例 | `/storage/emulated/0/work/`，由用户选择与授权 |

模型、项目、Debian、账号和会话是否存在必须实时检查，不按本文假设已部署。`incoming` 仅供临时导入；长期项目存用户选定目录。共享/外置卷授权与 FUSE 边界见 [存储](../../../docs/STORAGE.md)。

## 调试入口与数据保护

- [android-cdp.mjs](../../../scripts/lib/android-cdp.mjs) 的 `connect(serial)` 为支持调试的 WebView 建立动态 forward，结束调用 `close()`。安装后等待 WebView 就绪，不把启动瞬间连接失败当作应用故障。
- [dsh_device.py](../../../scripts/lib/dsh_device.py) 的 `Device(serial)` 提供 debug 包私有文件读取和认证 RPC；`authenticate()` 在内存处理认证，结束 `close()`。检查 `session/list`（参数 `{'_request': {}}`）中每个会话的 `running`，并检查 Live 等独立活跃功能；无法读到状态时不能假定空闲。
- 引擎设备回环地址为 `127.0.0.1:3080`；ADB forward 的回环 URL 仅供电脑内部调试。不要将引擎认证接口直接暴露到 LAN。另行交付网页服务时绑定适当接口并提供实际验证的可达 URL。
- 只采集任务所需日志和状态，不输出完整 `engine.log`、认证 URL、配对密钥、登录凭据或图片 base64。备份和一次性记录存本地忽略目录，限制访问权限。
- 脚本名含 `test`、`verify` 或显式 serial 不代表它适用于任意设备。先读脚本的型号、fixture、输出路径和清理条件；不为通过旧断言而写入或替换用户工作区文件。

## APK 构建与安全更新

构建入口和所需输入见 [构建环境](../../../docs/ANDROID-BUILD-ENVIRONMENT.md)、[上游集成](../../../docs/UPSTREAM-INTEGRATION.md)。`scripts/rebuild-codex-shell.py` 是依赖受验证快照与回执的 ARM64 增量入口，不是新 checkout 的完整初始化方法。已有产物可由 `artifacts/build-arm64-codex.json` 定位；校验其中实际 APK 路径、SHA 和 snapshot SHA，不将旧文件名视为当前发行版本。

升级前先检查候选 APK 的包名、版本、ABI 和签名证书，与目标已安装应用比较。源代码不提供维护者签名密钥；本机缺少 `android-shell/keystore/debug.keystore` 时 debug 构建使用 AGP 的本机 debug key。来自另一密钥的同包名 APK 通常不能覆盖安装，`-r`/`-t` 不解决签名不匹配。无法取得同签名构建时停止原地更新；不得自动卸载或清数据。独立包名方案也需要检查快照和运行时硬编码路径，不能只改 applicationId 即声称可用。

安装顺序：

1. 明确 serial 并核对身份；校验 APK 与构建收据、ABI、签名和升级路径。先保存适用的配置与数据备份，确认可恢复方法。
2. 已安装设备检查 `files/.snapshot-transaction` 和 `files/.snapshot-stage` 均不存在；目录和读取错误不是同一回事。比较 `.snapshot-fingerprint` 与候选 snapshot SHA，不一致时按运行时升级处理，预留空间和等待时间。
3. 查询所有运行中 Agent 及活跃音频任务。等待用户任务结束；不能通过 force-stop 制造安装窗口。首次安装没有现有 DeepCode 状态，可跳过仅适用已安装包的检查。
4. 若应用使用双屏租约，保存开关状态，经 CDP 调用 `androidBridge.foldConfigure(false)`，等待 `foldStatus().dual.leasedState === 0` 且 `working === false`。只释放应用自己的租约，不复位其他 owner 的 `device_state` override。
5. 所有前提满足后，以已验证 APK 路径执行 `adb -s "$dsh_serial" install -r -t "$dsh_apk"`；`dsh_apk` 必须事先指向候选产物。遵守系统安装确认，再用 `adb -s "$dsh_serial" shell am start -n com.dsharnessmobile.shell/.MainActivity` 启动。
6. 等待快照事务结束及引擎就绪；解压期间不杀进程。检查实际安装的版本/哈希、快照和补丁、用户数据及本次功能，恢复测试修改的开关。JVM、CDP 或脚本自测不能替代真实安装和触摸验收。

旧 `scripts/install-device.py`、`scripts/device-preflight.py` 默认指向历史 baseline / manifest；`scripts/verify-installed-release.py` 还假设特定账号、模型哈希与工作区 fixture，并把结果写入历史验收目录。这些脚本不是通用发布安装器。必须先审查和参数化适用检查，将新结果写入 `.local/validation/`；缺失旧 fixture 不表示新设备安装失败。

## 折叠与后台验证

当前双屏实现的 `stable-presentation` 在已支持设备上使用状态 5，0 表示未持有；OEM 状态编号不是 Android 通用常量。新设备先核对实际状态定义与权限，不盲用状态 5/6。前台启用时持有的租约按 token/owner 回收；铰链动作不能频繁取得/释放租约制造屏幕闪断。

集成版在内屏与外屏 Presentation 间移动同一个 WebView；交接等待目标窗口尺寸、工作台泳道提交和首帧回执，不只等待固定延时。截图前实时查询物理 display ID 与尺寸，不能复制其他设备的 ID。使用 `TYPE_HINGE_ANGLE`，完全展开恢复先前方向请求，不把普通移动当作折叠。细节见 [折叠实现](../../../docs/FOLD-TRANSITION-MILESTONE.md)。

息屏、锁屏、网页暂停、Activity/renderer 销毁、引擎崩溃和用户划掉任务分别验证。`FLAG_KEEP_SCREEN_ON` 不绕过锁屏，前台服务通知不保证整个 UID 一直运行；电池与 OEM 设置按设备读取。测试恢复设置、保留草稿，短测不推广为整夜保证；只报告本次实际覆盖的设备和功能。
