# 设备、连接与调试

## 当前设备使用约定（2026-09-13）

- **平板是默认主要开发与实测环境**：`yingtian / M367FC`。用户授权随时用于当前开发任务的连接、部署与测试，不再逐次询问是否方便。先检查运行中会话与快照事务，保护账号、项目、模型和既有任务。
- **折叠手机仅按需使用**：`lhasa / 2608BPX34C`。只有用户明确要求折叠/手机适配时才连接操作或部署，不随平板更新，不作为平板掉线时的自动替代设备。
- 以下历史记录中“主要验收机”等说法仅代表当时分工；当前优先级以上述约定为准。测试可以自动执行，但 HyperOS 要求的人机安装确认仍由用户完成。
- 本文件的网络值已脱敏，实际地址优先查看根目录 `.local/devices-and-debugging.md`，再用 mDNS/ADB 重新发现。不要执行文档中的示例 IP。

最后现场核对：2026-09-11。以下是本机设备事实与操作经验；IP、无线端口、mDNS 后缀、前台状态必须重新发现。文中命令默认从 `/path/to/developer/work/deepseek-harness-android` 执行。

## 设备识别

| 用户称呼 / 用途 | 必须核对的设备身份 | 最近 LAN IP | 最近在线 ADB serial |
|---|---|---|---|
| 小米 Fold 手机，仅在明确要求时做适配 | `ro.product.device=lhasa`，型号 `2608BPX34C` | `192.0.2.20` | `adb-FOLD_SERIAL-13arBB._adb-tls-connect._tcp` |
| 小米平板，默认主要开发与实测设备 | `ro.product.device=yingtian`，型号 `M367FC` | `192.0.2.30` | `adb-TABLET_SERIAL-a0QCNP._adb-tls-connect._tcp` |
| 本机已有模拟器 | `emulator-5580`，`sdk_gphone64_x86_64` | 不适用 | `emulator-5580` |

两台真机当前均为 Android 17 / API 37 / `arm64-v8a`。不要凭营销名称或聊天中的设备别名选择 APK。已有模拟器不等于当前任务授权的测试设备；折叠专用 AVD 另见仓库 `docs/FOLD-TRANSITION-MILESTONE.md`。

## Ubuntu 工具链和无线连接

```bash
source scripts/env.sh
adb devices -l
adb mdns services
```

`env.sh` 使用仓库内 `.tools/jdk17`、`.tools/android-sdk`、`.tools/node`、`.tools/gradle` 等，避免混用系统 adb / Java / Gradle。以上两条查询不会断开设备。

优先使用 `adb devices -l` 中状态为 `device` 的完整 serial。2026-09-11 的发现结果为 Fold `192.0.2.20:43159`、平板 `192.0.2.30:37687`，仅供识别记录，**不是固定端口**。历史 Fold `:34783` 等已失效。

```bash
# 此值每次从 adb devices -l 复制，不依赖固定 mDNS 后缀。
dsh_serial='adb-TABLET_SERIAL-a0QCNP._adb-tls-connect._tcp'
adb -s "$dsh_serial" shell getprop ro.product.device
adb -s "$dsh_serial" shell getprop ro.product.model
adb -s "$dsh_serial" shell getprop ro.product.cpu.abi
```

如果尚未出现在在线设备列表：从 `adb mdns services` 的 `_adb-tls-connect._tcp` 行取得当前 IP:连接端口，再执行 `adb connect <当前IP:连接端口>`。同一物理设备可能同时以 mDNS serial 和 IP:port 出现，不能当作两台手机。

- 已配对设备通常只需重新连接，不重复索要配对码。
- 首次配对 / 系统忘记授权时，用户在「开发者选项 → 无线调试 → 使用配对码配对设备」打开配对页；用 `adb pair <IP:配对端口>`，在提示中输入当前代码。**配对端口与连接端口不同**；配对码短时有效，不写入文档、脚本或 Git。
- offline 时重新查询 mDNS 并连接新端口；必要时仅断开目标的旧 IP:port。避免 `adb kill-server`，它会影响其他设备与应用。
- 若无线调试服务不可见，让用户解锁并检查无线调试 / 同一 LAN。息屏是否仍可连接取决于 HyperOS 和网络状态，不保证一定可达。
- `INSTALL_FAILED_USER_RESTRICTED` 在本机曾由开发者选项「USB 安装」及系统安装确认解决；无线 ADB 安装也受此限制。已授权时直接重试，不反复要求开启。

## 电脑 ADB 与应用自己的 ADB 是两套身份

电脑的 `adb pair` 只授权 Ubuntu 的 ADB 客户端。DeepCode 的双屏控制使用**应用内自己的 ADB 通道**：设置 → 开发者选项 → 安卓调试授权。Fold 的应用内通道此前已配对、授权并连接；先查状态，再判断是否需要重新配对。现版在旧连接失败后发现本机新端口，使用原配对身份连接成功才更新；无线端口变化本身不要求新授权（坑80）。

不要复制电脑 ADB 私钥到手机，不输出配对密钥、登录 URL token、Codex 凭据或完整 engine.log。应用 ADB 是较宽的调试能力，不应描述成仅有双屏权限。

## 应用目录与运行时

包名：`com.dsharnessmobile.shell`；Activity：`.MainActivity`。

| 内容 | 手机上的路径 |
|---|---|
| 应用私有根 | `/data/user/0/com.dsharnessmobile.shell/files/`（`/data/data/...` 通常为别名） |
| Termux 工具链 / Node | `files/usr/` |
| 应用 HOME | `files/home/` |
| DSH 配置 / 会话 / 附件 | `files/home/.dsh/` |
| 当前 Web profile 插件 | `files/home/.dsh/profiles/web/node_modules/` |
| Debian | `files/home/.dsh/debian/`；不是 Android 系统根目录 |
| Fold 用户共享工作区 | `/storage/emulated/0/work/` |
| 本地 ASR 模型 | `/storage/emulated/0/work/models/qwen3-asr/`，默认 Qwen3-ASR-0.6B Q8_0 + mmproj |
| Codex App Server 独立 HOME | `files/home/.dsh/codex-android/home/` |
| 宿主 Node 输入图片缓存 | `files/home/.codex/dsh-input-images/` |

共享 / 外置卷授权见 `WorkspaceStorage.kt` 和仓库 `docs/STORAGE.md`。`incoming` 是临时导入目录，不是长期项目目录。当前已部署的账号、ASR、Debian 属于用户数据，不能因普通 UI 修复重置。

## 调试入口

`source scripts/env.sh` 后：

- `scripts/lib/android-cdp.mjs` 的 `connect(serial)` 连接 debug WebView；使用本次动态 adb forward 端口，完成后调用 `close()`。只读取必要 UI / 错误信息，不打印页面认证 URL。安装后需等待 WebView 就绪，不能把启动瞬间 socket 失败当作应用故障。
- `scripts/lib/dsh_device.py` 的 `Device(serial)` 提供私有文件访问及引擎 RPC。用 `authenticate()` 在内存中处理认证，最后 `close()`；`session/list` 参数为 `{'_request': {}}`。安装前检查每个 item 的 `running`。
- 引擎在设备内部监听 `127.0.0.1:3080`。adb forward 的回环 URL 仅供机器内部调试，不是用户可访问的发布地址。若另行交付网页服务，给出验证过的 LAN URL。
- `run-as com.dsharnessmobile.shell` 用于当前 debug APK 的私有文件访问。原生 Node 测试需要正确的 `files/usr/lib` 动态库搜索路径；参考 `scripts/test-codex-input-preview-device.mjs`，不要输出图片 base64 或认证数据。
- 旧 Fold 脚本有些硬编码 `192.0.2.20:34783` 或只测旧 state 5/6。先读脚本，核对机型、连接参数、当前实现和清理逻辑，不能把历史脚本直接当作现版验收。

## 当前 APK 构建与安全更新

从仓库根执行：

```bash
source scripts/env.sh
python3 scripts/rebuild-codex-shell.py
```

前提是已有经验证的 Codex ARM64 snapshot，脚本会核对收据中的快照 SHA。它重建响应式 UI、打包受版本与 SHA 守卫的插件补丁，再构建壳；收据为 `artifacts/build-arm64-codex.json`，APK 为 `artifacts/dsh-v0.13.3-local-codex-arm64.apk`。APK SHA 以收据为准，不在本文固化。

**不要使用 `scripts/install-device.py` 的默认模式部署当前 Codex 包**：它默认安装历史 baseline；`device-preflight.py` 默认也指向历史 fs-adapter manifest。这不是当前 Codex 构建的验收入口。

安装顺序：

1. 明确目标 serial，核对机型 / ABI；检查本地 APK SHA 与构建收据一致。
2. 确认 `files/.snapshot-transaction` 和 `files/.snapshot-stage` 均不存在。壳/插件补丁更新时，设备 `.snapshot-fingerprint` 应等于收据 snapshot SHA；不一致意味着可能重解压，按快照升级流程处理。
3. 通过 `Device` 认证查询会话，确认没有运行中的 Agent。不要打断用户正在生成图片或执行工具的任务。
4. 经 CDP 调用 `androidBridge.foldConfigure(false)`，等 `foldStatus().dual.leasedState === 0` 且 `working === false`，确认无遗留自有显示租约。不要复位别人的 device_state override。
5. `adb -s "$dsh_serial" install -r -t artifacts/dsh-v0.13.3-local-codex-arm64.apk`，再启动 `com.dsharnessmobile.shell/.MainActivity`。保留数据；不卸载、不清数据。快照重解压期间禁止 force-stop / 杀进程。
6. 等应用和引擎就绪，核验安装文件与补丁实际落地，恢复测试前的折叠开关。当前 Fold 可运行：

```bash
python3 scripts/verify-installed-release.py "$dsh_serial"
```

该核验脚本包含 Fold 现有 Codex 账号、ASR hash、Debian 验收文件假设，不可原样用于新设备或平板。证据写到 `docs/validation/2026-09-10-fold-deploy/runtime-final.json`。新包 / 新设备应调整适用的检查，不能为让旧测试通过而覆盖用户工作区文件。

## 折叠：当前实现与禁止回退的经验

- 当前候选自动双屏模式为 `foldStatus().dual.mode = stable-presentation`；`leasedState/desiredState=5` 为真实 OPENED_PRESENTATION，0 为未持有。前台且启用功能时持续持有，完全合盖也不释放；退出前台、锁屏或关闭功能后按 token/owner 回收。安装前仍必须显式释放并等待回执。
- 2026-09-11 对照：固定 state 3 + enable-display 1 仍会关闭外屏；固定 state 5 覆盖 0–179°、base 3/2/0/1，60 秒零 OFF/ON，用户确认“不黑了”。这首先验证显示策略，不能替代集成版输入/视觉验收。
- 不要在轻折时请求 state 6：会交换主副屏并关断内屏。不要在每个铰链端点取得/释放 state 5；旧策略正是在这些交接时闪黑。
- 用户已确认合盖允许文字重排、但不出现额外顶部品牌栏。Fold mobile使用紧凑导航并入既有标题，不永久裁取宽画布；断点切换抑制抽屉/底部面板自动滑出，正常手动开关动画保留，见坑83/84。
- 集成版只移动同一个 WebView：≤3°稳定150ms接到外屏 Presentation，≥10°接回内屏；既有像素在下方等待目标窗口尺寸、工作台右泳道提交及 Chromium 首帧回执（坑90）；不能只延时后显露。外屏窗口接收自己的 IME/system insets。debug `foldHostPreview(bool)` 可做15秒有界窗口交接，测试结束必须恢复；CDP 输入测试不等于原生触摸/键盘测试。
- 内屏物理 ID `4639175402683733248`（1672×2364），外屏 `4639175068132267009`（1168×1712）；截图前仍应核对。`screencap -p -d <物理ID>`，去除可能混入的多屏提示，验证 PNG 文件头。
- 只用 TYPE_HINGE_ANGLE 驱动折叠，不把陀螺仪 / 普通移动当作折叠。完全展开（>=175°）恢复原方向请求，允许系统横竖旋转；开始折叠（<170°）才锁定并保存当前真实方向，不能整个前台租约永久LOCKED，也不可强行固定+90°。
- 模糊公式与可见区域已经多轮确认；共享页面不能按 cover 标记全局强制 mobile，否则内屏镜像也跳布局。外屏普通聊天按正文起点裁取，Fold工作台按完整画布右半幅裁取；内屏保留完整画布。
- 物理开合记录见 `docs/validation/2026-09-10-fold-gradient/dual/secondary-display/`：已覆盖约 2–179°、页面/草稿连续、无渲染错误，但仍有系统交接的开关屏记录。**尚不能声称全程零黑帧。**
- 前台常亮使用 FLAG_KEEP_SCREEN_ON，不等于跳过锁屏。用户曾将系统「合盖显示设置」设为「保持亮屏」（读取值 2）；它与应用内 ADB 授权是两件事。

## Codex 图片：区分三个阶段

1. DSH 附件上传 / 原图保存。
2. 输入图片转存至宿主 `dsh-input-images`，Android 可能拒绝硬链接，即使目录在私有沙盒。当前使用受限错误下的完整临时文件 rename 回退，保留 SHA / 非符号链接检查（坑 77）。
3. Codex `imageView` 事件转回 DSH 图片预览；白名单必须含 workspace、runtime generated_images 和**同一个输入缓存根**，不能因为两个 HOME 不同漏掉输入图（坑 78）。仍拒绝目录外 / 前缀邻居 / symlink 越界。

回归入口：`scripts/test-codex-preview-roots.mjs`；`scripts/test-codex-input-preview-device.mjs "$dsh_serial"` 当前包含已验证的 Fold 图片 fixture，换图应更新 fixture。已实测读取 1773×2364 输入 JPEG 并通过 WebView 解码。历史聊天中持久化的 `Image preview unavailable` 文字不会随升级自动消失。


## 2026-09-11 平板跟随当前 Fold 版本

用户要求平板同步最新 APK。本次 lhasa 与 yingtian 已更新到同一 Codex ARM64 构建（收据及 docs/validation/2026-09-11-native-interaction/*-installed.json）。平板此前快照 67390c… 不同，按正常事务刷新，最终 701055… 且 stage/transaction 均清除；4 份用户配置哈希未变，24 个会话可读取，Debian/工作区目录保留。配置私有备份在 Ubuntu ~/.local/state/deepcode-updates/2026-09-11-pad（0700，文件0600），不得输出凭据或纳入仓库。不要再将平板视为旧快照设备；后续仍实时核对收据和状态。


## Fold 媒体工具与 Codex Skills（2026-09-11）

本轮手机新连接端口为192.0.2.20:32831，电脑原配对仍有效；仍应先查询mDNS，勿固化此端口。Fold已经部署独立ForcedAligner模型（共享work/models/qwen3-forced-aligner）与APK原生CPU/Vulkan对齐器。Codex HOME的skills/android-media、skills/android-transcribe已实机调用成功；Debian中hyperframes 0.8.33、node22.23.2、ffmpeg5.1.9可用。应用域读取共享模型/写字幕验证通过，run-as本身的FUSE访问失败不等价应用权限缺失。路径、复现、技能调用及短样本证据见仓库docs/FOLD-MEDIA-SKILLS.md。


## 平板本机安卓开发 Skill（2026-09-11）

用户授权配置平板，yingtian已通过应用自己的AndroidBridge完成无线ADB配对，T1/authorized/connected=true；电脑身份未复制到应用。首次本次发现pair39515/connect40947仅为现场端口记录，不写入脚本；配对码不保存。平板原有Debian新增Java17、ARM64 aapt/zipalign、apksigner、framework-res、Pillow与SDK JAR。Codex HOME新部署skills/android-app-dev；已有skills/.system/imagegen保留，实际平板Codex已调用内置image_gen生图、在共享work/pad-app-lab生成APK。系统安装暂拒绝，等待用户处理USB安装确认；不把构建通过写成安装通过。未更新DeepCode APK或Fold。后续结果见docs/PAD-ANDROID-APP-SKILL.md与validation/2026-09-11-pad-app-dev。


## 平板四会话应用小窝实验（2026-09-11，待系统安装允许）

工作台已替换为本次新建四会话，旧绑定与原会话保留。三个 `local-qwen/qwen38-flash-next` 会话在共享 `/storage/emulated/0/work/deepcode-nest-20260911` 的 tool/gpu/pelican 各自子目录开发；一个 `relay-codex/gpt-6-astra` 会话只生成icons。应用包名分别 `com.deepcode.nest.tool`、`.gpu`、`.pelican`，不要覆盖既有counter实验或DeepCode本体。脚本 `scripts/android-app-lab/nest-experiment.py` 可查状态和继续原会话；纠错需要及时生效时用 `--mode steer`，默认queue是下一轮。

本机编译签名/图标已完成。用户确认USB安装一直开启；22:42重试看到倒计时默认拒绝的单次安装确认，允许后鹈鹕安装成功、Android自测10/10通过。此前USER_RESTRICTED不能归因为开关未开，ADB自身T1正常，不能再次索要配对码。无人值守安装尚未验证。桌面第二屏与滑动通过，但另两App安装、GPU帧率和桌面「deepcode小窝」创建/归组均未通过；继续前读 `docs/validation/2026-09-11-pad-nest/README.md` 和sessions.json，不能把源码与JVM预检当作Android实机成功。


## 2026-09-12 SME实验连接与边界

本次发现平板192.0.2.30:39669、Fold192.0.2.20:46335（仍是动态端口）。平板mDNS serial曾显示device但命令悬挂，按当次发现的IP:port直连恢复；勿全局重启ADB。两机独立实验位于/data/local/tmp/deepcode-sme-20260912，无APK更新和用户配置修改。uid2000的SME/SME2执行不能替代应用域测试；能力、二进制/model SHA与RTF分项见仓库docs/validation/2026-09-12-pad-sme。


## 2026-09-12 KleidiAI正式更新

平板与Fold已更新同一正式双ASR构建；仍以artifacts/build-arm64-codex.json为准，勿安装旧实验lab APK。新增libdsh_voice_compat.so保留旧CPU引擎，默认libdsh_voice_server.so为KleidiAI。两机Codex HOME的android-transcribe skill已同步，原账号/模型/30个平板旧会话和8个手机旧会话保留，各增加一个独立验收会话。固定应用域音频、真实Codex视频字幕流程通过；手机真实录音用户确认，手动结束。此前SME-lab仅ADB-shell的状态不再适用于正式ASR是否已接入；性能归因限制仍适用。详见docs/VOICE-KLEIDIAI-PRODUCTION.md及validation/2026-09-12-voice-production。


## 平板三游戏与Codex监控（2026-09-12）

用户要求真正的平板4会话：3个local-qwen/qwen38-flash-next开发，1个relay-codex/gpt-6-astra high监控。共享根为`/storage/emulated/0/work/two-player-arcade-20260912`，任务和会话ID在`docs/validation/2026-09-12-pad-three-games/manifest.json`，避免重复建会话。Codex HOME新增`skills/deepcode-session-supervisor`，通过自身UID读取引擎cookie并使用本机3080 RPC；状态、历史、反馈不需ADB，安装/截图/输入使用既有android-app-dev。实际监控Codex已调用status并向3worker发送反馈，回执在平板共享根`evidence/initial-sends.json`。工作台四槽绑定本次会话，旧绑定已保存deck-before.json，其他会话未删除。未升级DeepCode APK、未操作手机/模拟器。新Qwen后端仍使用100.10:5000/v1及既有模型ID；并发开发耗时不能直接称为纯推理吞吐。


## 平板第二批应用（2026-09-12）

用户要求再做3款；新工作根`/storage/emulated/0/work/two-player-arcade-20260912-round2`，manifest和会话ID见`docs/validation/2026-09-12-pad-three-games-round2/`。3个Qwen开发乒乓/翻牌/反应对决，1个实际平板Astra high监控；4者已运行，Codex已向3者成功send。工作台改绑新4会话，旧绑定和项目保留。因前轮卡顿，本轮`build-serial.py`私有文件锁串行编译，监控者顺序验收并关闭测完的游戏。后续复用此manifest，不误反馈到第一批。当前记录仅证明启动与监控交接，完成/安装以各项目status和监控报告核对。


## 后台测试与配置边界

息屏、网页暂停、Activity/renderer 销毁、引擎崩溃和用户划掉任务需要分别验证。检查 Android 电池优化豁免及小米省电策略；前台服务通知存在不代表整个 UID 一直执行。系统 API 版本不能代替读取实际内存/省电配置。测试必须恢复自身设置、保存草稿，不得将后台短测推广为整晚保证。原始记录及单次结果只存 `.local/validation/`，不追加到本文。
