# gotchas.md — 关键实现细节与坑（全量）

> grep 用法：`grep -n "<坑号>\." docs/AGENTS/gotchas.md` 或按关键词（如 `borrowSession`、`MANAGE_EXTERNAL_STORAGE`、`store-rehome`）定位。
> 维护约定：新坑追加到文末并递增编号；修复后保留条目（教训与历史归档）。

## 6. 关键实现细节与坑（每次踩坑必须登记）

1. **realpath 前缀混用（B7 运行时表现，已修）**：Android 上 `/data/user/0` 可能是 `/data/data` 的软链——只把「文件侧」realpath 后再与未 realpath 的 ws 比较必拒。修复：`safeResolveInside` **两侧都 realpath**（ws 侧失败按原样参与），symlink 目标按 `dirname(rel)` 解析（`../../LICENSES` 从 `doc/<pkg>/` 出发 = `share/LICENSES`）。**新路径校验代码一律双侧规范化。**
2. **会话 header meta 白名单**：`Session.create(meta)` 的 `origin` 只允许 `"subagent"`——自定义值报 `session header origin must be "subagent"`；只写白名单键（如 `cwd`）。
3. **surface 事件必须带 surfaceOp**：`user/message` 等 surface-eligible 事件 append 需第 3 参 `{surfaceOp:'append'}`，否则 `requires a surfaceOp marker`。
4. **pnpm 是市场安装的硬依赖（已固化进快照构建）**：`dsh plugin add` spawns `pnpm`（apps/cli plugin.ts）；快照缺 pnpm → `pnpm not found on PATH`；且**陈旧 pnpm 状态记录**（base-dsh 里的 `.modules.yaml`/`.pnpm-workspace-state`/`pnpm-lock`）指向旧 store → `ERR_PNPM_UNEXPECTED_STORE`——build-snapshot-013.mjs 已装配 pnpm 10.12.1 standalone（npm tgz + `usr/bin/pnpm` shim）并清理这三种记录。**市场目录里的部分插件（如 humanizer-ru）不在 npm，安装 404 属上游目录数据，不是本链路缺陷。**
5. **快照 node 需要 OPENSSL_CONF**：运行快照内 node 时务必与 UndoGate 同样注入（否则 OpenSSL config error 静默吞 CLI 输出）。
6. **Windows 侧读 WSL 9p 文件 = EACCES**：stage 文件不可直 stat/read；校验类代码走 `--tar`（wsl tar -tvf 带大小）视图；wsl.exe 输出前有 localhost 代理噪音行，解析时过滤。
7. **npm registry 元数据可能缺 dist.sha512**：pnpm tgz 完整性校验「在场则严格，缺席降级警告」。
8. **run-as 引号地狱 / adb 二进制传输**：PowerShell 双引号内 `$var` 本地展开；二进制经 `adb exec-out`/push 传输。
9. **template 字符串反斜杠**（页面注入）：`\n` 双写。
10. **签名一致性**：debug.keystore 固定，否则覆盖安装失败。
11. **CDP 断言注意**：input placeholder 不在 innerText（查 `[placeholder]`）；「live 会话禁止 API prompt」；`session.list` 的 stats 字段（turns/llmMs）判断代理是否真跑。
12. **引擎级 OPENSSL_CONF 曾有缺口（2026-08-24 真机实锤，已修）**：快照 node 编译期硬编码 OpenSSL 配置路径 `/data/data/com.termux/files/usr/etc/tls/openssl.cnf`（app 域不可读）——`shellEnv()` 未注入 OPENSSL_CONF 时，**任何 node/npm 子进程（agent 工具调用）启动即 OpenSSL configuration error 退出**；引擎本体侥幸存活（不触发该初始化的路径）。修复 = `shellEnv()` 加 `OPENSSL_CONF=<usr>/etc/tls/openssl.cnf`（与 UndoGate/AdbState 统一；坑 #5 是本坑在 CLI 面的显式版）。
13. **apt/dpkg 编译期路径（issue #80，2026-08-24 重写）**：apt/apt-get/dpkg 二进制内置 `/data/data/com.termux/files/usr` 编译期路径。`-o Dir::Etc=...` 参数覆盖不了 apt.conf.d 早期扫描（仍报 Permission denied）；**有效方案 = APT_CONFIG 主文件**（build-snapshot-013.mjs 7d 段生成 `usr/etc/apt/apt.conf`，wrapper 统一 `export APT_CONFIG`）——注意 `K='...$B...'` 单引号不展开曾令 wrapper 失效。**dpkg 的 SYSCONFDIR（dpkg.cfg.d 配置目录）无 env 可覆盖**（strings 证实无 DPKG_CONFIG_DIR 变量；`--admindir/--instdir` 不覆盖）→ apt 在线安装 dpkg 阶段受限；`scripts/check-prefix-residue.sh` 设备端自检验证。
14. **配对伪成功防御（2026-08-24 真机实锤）**：`nativeBridge()?.setAdbPair?.()` 可选链在桥缺失/方法缺失时返回 undefined → `ok === false` 恒 false → 前端误报「配对完成」——**显式检查 `typeof b.setAdbPair === 'function'` 且无函数即 throw**。设置页两端口输入框是必经项，用户嫌手动抄录——0.13.0 起端口发现用 **NSD/mDNS**（AdbState.discoverPorts：系统属性直读优先 → `_adb-tls-pairing._tcp`/`_adb-tls-connect._tcp` NSD 发现（5s 超时）→ 手动输入硬回退；盲扫 37000-45999 已剔除，Q17）。
15. **临时工作区面板不可见（issue #60，2026-08-24 已修）**：workspace registry 只从**既有会话 cwd** bootstrap——无会话时「临时工作区」不出现在工作区面板。修复：dsh-android-file-open apply 时 `workspaceRegistry.create(tmpWorkspace(), '临时工作区')`（幂等复用）。TTL 清理（7 天）壳侧 FileIncoming.sweepExpired（启动 + 每次入队前）。
16. **老内核 ES2022 polyfill（issue apk#81/#79）**：华为/荣耀/小米定制 WebView（Chromium<92）缺 `Object.hasOwn`/`Array.at`/`String.at` → 前端加载插件报 "Failed to load plugins"。polyfill 注入点 = `assets/patched/web-frontend-index.html` `<head>` 首个 script 之前（引擎 applyAssetPatch 用它替换内核 index.html）；**升级 dsh 后其模块脚本哈希（index-ClqxG24t.js）须同步更新**。
17. **错位目录（issue #80 P5）**：relocate-snapshot 曾把包内绝对路径 `/data/data/com.termux` 当相对路径搬进 usr 树（`usr/data/data/...`）——纯冗余；构建链 7e 无条件删除 `usr/data`。
18. **debug APK 默认 x86_64 快照（2026-08-24 本日重大事故）**：`app/build.gradle.kts` mergeDebugAssets 注释写死「从 GitHub Releases 下载 snapshot-x86_64.tar.xz 放 assets」→ `app-debug.apk` 内快照是 x86_64；**装到 arm64 真机覆盖终版后引擎崩**：`error: "/data/data/.../usr/bin/node" is for EM_X86_64 (62) instead of EM_AARCH64 (183)`。核对方法：解快照 tar 读 `usr/bin/node` 的 ELF e_machine（62=x86_64，183=arm64），或 `aapt dump badging <apk>` 看 native-code。修复/预防：构建/安装前核对设备 ABI 与快照 ABI；换 arm64 快照须**同时替换** `assets/snapshot.tar.xz` + `snapshot.sha256`（指纹变→refreshSnapshot 全量重解压 2-4 分钟，勿中断）。
19. **cordis.patch.yml 装配缺陷**：基座 cordis.patch.yml 只含 shell-termux/host-web-compat/ui-responsive——0.13.0 新增的 android-bridge/android-manage/android-linux-env/android-file-open/undo-savepoint/marketplace **从不进入快照装配** → 引擎不加载这些插件（`/api/android/file-incoming` 404、ADB 设置项缺失、通知事件桥无宿主）。修复：build-snapshot-013.mjs 7b2 用 `scripts/profile-web.cordis.patch.yml` **权威覆盖**快照内同名文件（缺失即 `process.exit` 拒发）。**注意**：真机热改 cordis.patch.yml 后必须**冷启动 app**（`am force-stop` + start）才重装配——watchdog 热重启引擎不重读 profile（只重跑 node）。
20. **EngineService 挂载缺失**：startEngineService 只在 startEngineFlow 首次轮询成功时调用——**引擎先跑、app 后启动（热启动/恢复）时服务从未启动 → watchdog 缺失 → 通知消费（task-done 标记）/自动回退/唤醒锁全链路失效**。修复：MainActivity `onResume` 幂等 `startEngineService()`。
21. **通知链路三缺（2026-08-24 用户实测「任务完成没通知」根因）**：① 引擎事件桥缺失（前端 showNotification 桥无调用方，F0.3 部分实现=以前未做）——补：dsh-android-bridge 监听 `ctx.on('session/event')` 捕获 `assistant/message` → 写 `files/home/.dsh/.task-done.ndjson` 标记；② WatchdogV2.consumeTaskDoneMarkers 消费标记 → `NotifyCenter.notify`（deepProbe 成功路径顺带；JSON 解析失败会丢通知——务必确保标记是 `JSON.stringify` 合法 JSON）；③ EngineService 必须挂载（见坑 20）。验证：`files/notify-debug.log` 落盘每步（诊断时开）；通知 id=`("dsh-"+category).hashCode() and 0x7fffffff` 稳定正数。
22. **免 hooks 环境 ELF 不可执行**：`adb shell run-as ... /usr/bin/<bin> | head` 会报 `not executable: 64-bit ELF file` / `CANNOT LINK ... library libandroid-support.so not found`——因为 run-as 裸环境无 termux-exec LD_PRELOAD 钩子与 LD_LIBRARY_PATH。**验证快照内二进制必须带全套引擎 env**（`LD_PRELOAD=libtermux-exec-ld-preload.so` + `TERMUX_EXEC__*` + `LD_LIBRARY_PATH` + `OPENSSL_CONF`）。这是「run-as 测出假错误」的常见来源（如 node/npm/adb）。
23. **通知 debug 落盘**：WatchdogV2.consumeTaskDoneMarkers 写了 `files/notify-debug.log`（诊断用，**保留**——是排查通知链路的关键工具）。
24. **adb client 冷启动 server 必败（2026-08-27 真机实锤，已修）**：termux-exec/Linker64 重路由环境下，`adb pair` 首次调用自动起 server（fork-server）时握手坏——client 打印 "* daemon started successfully" 后读不到应答，报 `error: protocol fault (couldn't read status message)`，**配对必失败（用户侧观感"光速报错"）**。对照实验证明：client 直连**已存在**的 server（`adb server nodaemon` 常驻）时 pair/connect 全部正常（同码同端口复刻 2/2 成功）。修复 = AdbState 壳内自管常驻 server（runAdb 前 `ensureAdbServer`：spawn `server nodaemon` + 5037 探测 + 日志落 `files/home/adb-server.log`）+ `retryRunAdb`（protocol fault 时毁 server 重建重试一次）；pair 失败首行错误文本入审计（不含码）。另：discoverPorts 同步 NSD 等待 5s 会卡配对页 UI（bridge 同步调用链）——超时压到 2s + 启动后台预取 + 15s TTL 缓存（`cachedPorts`），bridge 缓存优先。**补锤**：app 域直接 exec app-data ELF 恒 EACCES（error=13，server/client 双双中招，审计 error 字段实锤），spawn 一律走 `spawnAdb`（捕获 Permission denied 降级 `/system/bin/linker64` 加载——EngineManager.startWithArgs 同机制）。
25. **配对码窗口被自家冷启动链耗光（2026-08-27 复盘实锤，三探针 logcat/audit/adb-server 时间线定案，已修 F1+F2+F3+F4）**：系统「使用配对码配对」弹窗的端口仅在弹窗存活期监听；用户点「配对」后壳侧才冷启动（linker64 加载 ~3s + 回收配对后密钥删除触发全新 RSA keygen + 首轮 client 握手竞态必吃 protocol fault 再自愈重建），合计 7 秒以上，拨号时窗口已关 → 恒 `Connection refused`（pairing_client.cpp），用户在系统弹窗上点什么都不救得回来。修复四件套 = **F1 常驻预热**（`AdbState.prewarm`：getAdbState 轮询钩子/onResume 后台线程拉起，60s 节流；**密钥生成移出关键路径**——回收配对会删 `$HOME/.android/adbkey*`，下次任何连接都会重新生成）+ **F2 真实就绪判定**（5037 bind ≠ 可服务：`ensureAdbServer` 放行条件收紧为一次真实 `devices` 客户端往返通过，`serverReady` 标志贯穿 spawn/复用孤儿/self-heal 三路径）+ **F3 结构化配对结果**（`setAdbPair` 返回 JSON `{ok, reason, message}` 替代 Boolean，壳侧 `classifyFailure` 归因 window-closed/protocol-fault/server-not-ready/handshake-timeout 等）+ **F4 前端分流**（AdbAuthSection 轮询不再抹操作报错——双通道 pollError/actionError 且后者留存 15s；失败不清空输入框；文案按 reason 分流，refused 明示「窗口已关闭请重开弹窗」而非误导性「核对 6 位码」）。
26. **vivo SELinux 拒读无线调试属性（2026-08-27 logcat 实锤）**：untrusted_app 读 `service.adb.tls.pairing_port` / `service.adb.tls.port` 触发 `avc denied { read } adbd_prop`——AdbState.discoverPorts 的「系统属性直读」优先路径在 vivo OriginOS 上恒失效（异常路径静默吞掉无感知），实际全靠 NSD/mDNS 兜底。勿据此属性在 vivo 上做正确性假设；后续若在此设备上看到直读成功属 ROM 变更，需回归。
27. **引擎侧页面误调 openNativePath（2026-08-27 记录在案）**：logcat 出现 `dsh-image: openNativePath: not exists: 自动扫描系统无线调试的配对/连接端口…`——引擎 UI 包把按钮 title 文案当路径传给了桥调用。壳侧安全拒绝 no-op 无实害；根因在上游引擎页面包（非本仓库管辖），升级引擎时留意。
28. **dsh-shell run() 返回 CollectedOutput 结构体（2026-08-27 活体插桩实锤，已修）**：`shellFace.run()` 契约返回 `{stdout:{text,truncated,spillPath?}, stderr:{…}, exitCode,…}` 而非字符串（引擎内置 bash 工具经 `streamText(output).text` 同款读取）。插件历史代码 `String(r.stdout)` 直取 → 恒 `"​[object Object]"`：**进程真实执行（审计恒 ok）、模型转录全毁**，并连带 device_info 满屏 `?` 占位（拿乱码 grep MODEL= 零匹配）与 lossless 拒收（可选字段 undefined 成员被引擎整值拒绝）。修复 = `collectText()` 解包 + `pickText()` 类型闸 render（非 string 一律 JSON 转写，杜绝 [object Object] 再入转录）+ 可选成员空串兜底。**伴生雷**：NSD 抓的连接端口随无线调试重启轮换（37575 失联实锤）→ `resolveLivePort()` 配置端口失效即回退 5555。**排障方法论沉淀**：①疑似「改码不改行为」先杀引擎进程再验——`force-stop` 后可能有孤儿 `node -`（linker64 链）幸存占 5037/3080 继续用旧模块（/proc 扫 cmdline 对照注入 mtime）；②设备端插件注入用 base64 分块 `printf %s >> ` 通道（MSYS /tmp 不跨执行块存活，stdin 管道会截断）；③插桩指纹（状态消息缀 ⟪标记⟫）一次往返即可判定加载版本。
29. **引擎会话档位为事件溯源、按会话隔离（2026-08-27 澄清，非缺陷）**：UI 档位选择器写入会话日志 `sandbox/mode` 事件（`effectiveSandboxMode` fold，最后一条生效），重启经重放恢复、两会话互不可见；`session.list` projections.permissions.currentValue 为真值。状态端点显示的 `writeMode=workspace-write` 仅部署默认（装配 yml shell-termux config），工具实际放行以会话档位为准（gateFor→sandboxPolicy.resolve）。勿把部署默认当死锁。
30. **ps1 双 ABI 循环后 assets 停留 x86_64（2026-08-29 实锤，坑 18 现代版）**：build-apk-013.ps1 循环内按 ABI 覆盖 `assets/snapshot.tar.xz`，循环结束留在 x86_64——此后直接 `gradlew assembleDebug` 的 debug 包即 x86 树，装 arm64 真机报 EM_X86_64（本轮已踩）。铁律：真机安装只用 ps1 对应 ABI 命名产物；存疑时 `od -A d -j 18 -N 2 -t u1` 读 node ELF 机器码（183=arm64/62=x86_64）。
31. **force-stop 杀不死 linker64 回退子进程（2026-08-29 vivo 实锤，0.14 修复）**：升级后旧引擎孤儿存活 → 双引擎抢 3080（探活打到旧引擎、新引擎 bind 失败循环；两代 engine.log 交错误导排障）。真机找引擎 `ps -A | grep linker64`（进程名非 node，pidof node 必空）；处置：run-as kill 全部 linker64 → 看门狗 ~7s 自愈。`pkill -f bin.js` 在 vivo 疑似不生效（坑 28 排障方法论①的 /proc cmdline 扫描为可靠手段）。
32. **adb forward 静默失效（2026-08-29 实锤）**：APK 重装/USB 重枚举后宿主 forward 清空 → 宿主探活 000，但设备内正常（用户 WebView 秒起）——「引擎挂了」的判断必须先 `adb forward --list` 再重 forward，否则误诊。
33. **系统 HTTP 代理劫持壳侧本地探针（#118 根因1，2026-09-02 实锤）**：WiFi 配置系统代理时，`HttpURLConnection.openConnection()` 默认走 `ProxySelector` 下发的系统代理 → 把 `127.0.0.1:3080` 的本地请求发给代理网关（回不来本机）→ 探针恒 timeout；而 WebView（Chromium 对 loopback 豁免代理）与 curl（不读系统代理）直连正常 → 「网页能开、app 却判引擎没起来」的矛盾现场。修复 = **壳侧所有本地引擎端口调用一律 `openConnection(Proxy.NO_PROXY)`**（EngineProbe / file-incoming / session.export / session.cancel；UpdateManager 的远程下载**不走** NO_PROXY），且诊断包 probe 字段区分 timeout/refused。
34. **UndoGate.runCli 直接 exec app-data ELF 无 linker64 fallback（#118 根因2，2026-09-02 修）**：`runCli` 直接 `ProcessBuilder` exec `usr/bin/node`（对比 `EngineManager.startWithArgs` 有 `/system/bin/linker64` fallback）——Android 15+ 拒绝直接 exec app-data ELF → error=13 → auto-undo 从未真正执行。修复 = 与 startWithArgs 同款：捕获「Permission denied」降级 `linker64` 加载（`build` 复用 shellEnv/OPENSSL_CONF/redirectErrorStream）。
35. **requestLegacyExternalStorage 对 targetSdk≥30 应用无效（#120/MT 调研，2026-09-02 实锤）**：该 flag 仅对「targetSdk≤29 + 运行在 Android 10」生效；targetSdk≥30（含 34）应用即使运行在 Android 10 设备上 flag 也被忽略（SO 63365334 / cgeo #10386 / 小米适配指南多源实锤）→ Android 10 上 SAF 树授权不解锁 FUSE 原始路径、bash 走不了 ContentResolver → 非 root 下「读用户任意目录作工作区」不可达成。落地：SDK 26-28（无分区存储）运行时 READ/WRITE 权限放行；SDK 29 保留拒绝但显式 reason（`__dsh_pick_refused__:android-10`）而非伪装取消；SDK 30+ 维持 All Files Access。
36. **自包含内置子仓副本必须与协调仓同版（2026-09-02 实锤）**：本仓库是**云端自包含构建宿主**（`.github/workflows/build-apk.yml` 依赖 `$GITHUB_WORKSPACE`=本仓库，不签协调私库），仓库内自带整套子仓副本（`dsh-shell-termux`、`dsh-client-ui-responsive`、`dsh-host-web-compat`、`plugins/dsh-android-*`）。**协调仓改动这些子仓的源码或 bump 版本后，必须把产物同步进本仓库对应子目录（src + package.json + lib/），否则自包含链（云端构建 + `gradlew assembleDebug` 直打）注入的是旧副本**——设备上表现「悬浮球开关消失 / ADB 面板缺失 / #120 拒绝信号缺席 / 配置导入导出按钮消失」这类**功能性缺失但编译通过**的幽灵缺陷。0.13.2 实测：协调仓 ui-responsive 0.1.11 含悬浮球开关、apk 仓副本 0.1.9 无它（DevSection 少了 W7 悬浮球开关行 + 配置导入导出块）；host-web-compat 0.1.8 vs 0.1.6（#120 拒绝信号缺席）。**教训：凡协调仓动了这三个独立子仓/bridge/manage，发布前必须比对两个仓库的 package.json version + 抽验 apk 仓副本 lib/client.js 关键字符串（如「悬浮球」），不一致即用 robocopy 从协调仓同步**（`robocopy "<协调仓子仓>" "<本仓\<同名子目录>" /E /XD .git node_modules /XF *.tgz`，lib/ 必须一并拷入——自包含链不对这些子仓执行 npm build）。
37. **快照刷新中途杀进程 → 看门狗拿半解压运行时拉引擎 → 用户 settings 被剪（2026-09-05 三重实锤）**：① refreshSnapshot 全量解压在模拟器实测 **~8 分钟**（44805 文件；流式逐文件覆盖——「bridge mtime 已新」≠ 完成，**唯一完成标志 = `.snapshot-fingerprint` 翻转新值 + `.dsh-backup` 消失**，中途抽验必误判）；② 解压中 force-stop → 无闸门的看门狗 5s 一拍用「半新半旧运行时」spawn 引擎（12:45:26 补丁日志实证）→ 混合态引擎的 settings 归一化把 `llm-pi-ai.providers`（**用户自定义供应商 Hy3/opencode-go 挂此**）剪成出厂空模板，且后续刷新备份忠实保留损坏结果；③ 恢复通道 = `undo-snapshots/auto/<最后好版本>/home-settings.yaml` 拷回 `.dsh/settings.yaml` + 重启（.credentials.yaml 的 apiKeyEnv 引用未受损）。**修复**：`EngineManager.snapshotRefreshing` companion 级 @Volatile 闸门（MainActivity/EngineService 各持实例字段互不可见，同 STARTING CAS 道理），刷新期 startEngine 直接跳过、finally 清标志。**升级/排障铁律：装新包触发重解压期间，禁 force-stop、禁拔 USB、禁 adb reboot（协调仓雷点 1 同源）。**

38. **rc.2 锁定型运行时补丁在引擎升级时抹掉新引擎代码（0.13.3 模拟器实锤，prompt 链阻断）**：assets/patched 的 session-persistence-jsonl/attachment-local 等是 0.1.1-rc.2 原版整文件（无 delta），0.1.2-rc.1 引擎启动前 applyRuntimePatches 整文件覆盖 → 新代码被旧版回退（persistence.borrowSession is not a function → 一切会话写入/发送全断）。**修复/约定**：升级引擎时逐补丁核对上游是否原生覆盖（能退役则退役——fs-local/primitives 已退役）；重出 asset 必须从新版本包文件改起（RUNTIME-PATCHES.md §3-2）；本次重出 SPJ/ATT 的最小 delta = link(2) 失败 EACCES/EPERM/ENOTSUP → rename 回退（grep "rebuild-runtime-patches" 见协调仓 .tmp-upgrade 备忘）。grep `borrowSession`。
39. **rc.1 loader module table 不再应答 client-runtime require（store-rehome 落地）**：上游把 store 引擎迁到 @deepseek-ai/dsh-client-store（web dist 内联 + Module table 命名空间），ui-responsive 构建预设的 RUNTIME_STORE_EXEMPTION（require("@deepseek-ai/dsh-client-runtime/client") external）在新 loader 上必炸——"missed the module table — build-time externals drift"，boot 即 Failed to load plugins。**修复**：源码 import 迁到 client-store；构建预设 CLIENT_EXTERNALS 移除豁免、INLINE_SAFE 加 client-store（内联，官方 ui-layout 同款）；ClientContext 类型改用 cordis Context；自备 slots-augment.d.ts（SlotMap root / GlobalStandardProps.useSessions / Context.slots-sessions 增强抄自 runtime rc.2 types）。grep `store-rehome`。
40. **npm arborist 对复杂 peer 树 + 精确 pin 会崩（spec undefined）**：ui-responsive 升 cordis 4.0.2 + client-store rc.1 后，npm install 带包参数崩（Cannot read properties of undefined (reading 'spec')）；且半装 node_modules 会让 "up to date" 谎报。**处置**：删 node_modules + package-lock 全新 install --legacy-peer-deps；peer cordis 从精确 4.0.1 放宽到 ^4.0.2；装完必须回读 node_modules/<pkg>/package.json 验证版本（npm "up to date" 不代表真装）。grep `legacy-peer-deps`。
41. **overlay 登记表漏项（primitives 缺席 rc.1 升级）**：engine-overlay.json 生成以 research 的 196 包清单为主循环——@deepseek-ai/dsh-client-ui-primitives 在旧树但不在清单 → 未覆盖留在 rc.2。**修复/约定**：登记表必须与基座树全量对账（.tmp-upgrade/audit-manifest.mjs：base-nm-paths 逐包 vs manifest ∪ keepUnpublished，未覆盖即查 npm）；发现 npm 有新版即补登记+拉 tgz。grep `audit-manifest`。
42. **run-as 的权限视图不代表引擎运行时**（Android 15 模拟器实测）：appops MANAGE_EXTERNAL_STORAGE allow 后 run-as cat /storage/emulated/0 仍 Permission denied（run-as/FUSE 评估差异）——引擎进程（同 uid 真实运行）实测可读（AI 轮 read 工具逐字读回）。验证权限问题必须走引擎运行时（会话轮/工具），不能只信 run-as。grep `run-as`。
# 坑 43 修复记录（追加 gotchas.md）

## 43 续：白屏静默挂起的真因与修复（第二轮定位）

首轮定位到「create 循环静默挂起」后，用 **Runtime.enable + dist 插桩**（设备侧 python 给 index-Df-65__b.js 的 boot await 链插 console.log）拿到完整时序：**50 个 entries 全部 created、r5-pluginboot-done、mount-effect、r6-mounted 全部触达——boot 管线本身是通的**。真因在 mount 后的 **React 渲染错误**：`Error: strict session slot 'details' rendered without a scope binding`（console error，0.13.2 时代无此强制）。

**根因**：rc.1 对 session-scope 槽（details 等）加了**严格 scope binding 强制**——session-scope 槽必须包在框架注入的 `<SessionProvider>` 里渲染（官方 ui-layout AppFrame 的写法：`jsx(SessionProvider, { children: renderSlot("details", {}) })`，SessionProvider 从 AppFrameProps 解构）。我们 rc.2 时代的 AppFrame 直接裸渲染 `renderSlot('details')` → 渲染期 throw → React 卸载整树 → root 空、且 React 渲染错误不进 Runtime.consoleAPICalled（error boundary 前抛出）→ **零 console 静默白屏**。

**修复**：AppFrame.tsx 三处——① 解构加 `SessionProvider`；② 桌面形态 `DetailsColumn` 内包 `<SessionProvider>{renderSlot('details')}</SessionProvider>`；③ 移动形态 bottom sheet 同款。conversation 是 session-maybe scope（无需 binding）；sidebar 是 root scope。

**定位方法论（可复用）**：
1. `Runtime.consoleAPICalled` 事件**必须先发 `Runtime.enable`** 才投递——没 enable 时「零 console」是探针假象（本坑第一轮误判「静默」的根因之一）。
2. 设备侧 python 给 minified bundle 插桩（boot await 链插 console.log）+ push + run-as（带全套引擎 env，坑 22）+ 重启引擎（内存中的旧 bundle 不会自动换）→ CDP reload 读日志——黑盒时序一步到位。
3. 服务器内存 serve：combo bundle 从 flush 时内存 responses 出（非磁盘直读），**改 dist 文件后必须重启引擎**才生效。

**验证**：SessionProvider 修复 + 第 6 次装机解压后——rootLen=411682、零 error、composer（contenteditable）在场、截图实证完整 UI（Hy3 选择器/会话历史/悬浮球全部在场）、session/create+list+prompt 新 wire 全 PASS。


44. **WSL 9p 挂载 chmod 无效 → 归档权限归一化只能在重打包层做（2026-09-08 实测）**：`/mnt/d` 是 9p 挂载且未启用 metadata，`chmod 600` 后 `stat` 仍 777、`tar -tvf` 记录 777（实测探针目录）。因此「归档前 chmod 整棵树」在 Windows 侧是**无效步骤**（白走 6 万文件），快照 tar 的权限只能靠**流式重打包**修正——唯一权威落点 = `scripts/inject-all.py`（重写每个成员：ELF/shebang=0700、数据文件=0600、目录=0700），门禁 `scripts/check-snapshot-file-modes.mjs` 校验注入后快照（= APK 内嵌 + 发布资产同源）。`build-snapshot-013.mjs` 8a3 步已删除并注明原因；`build-apk-013.ps1` 的 `-SkipInject` dev 档跳过该门禁（警告不拒打包）。grep `check-snapshot-file-modes`。

45. **快照含绝对符号链接（9 个 applet 指向 `files/usr/...`）→ 暂存解压必须放行 runtimeRoot 内的绝对目标（2026-09-08 实测）**：final 快照 1989 个符号链接中 554 个是绝对目标——545 个 Termux 残留（`/data/data/com.termux/...`，应拒）与 **9 个指向本应用运行时根**（`/data/user/0/com.dsharnessmobile.shell/files/usr/bin/{editor,ex,nc,pager,vi,view,vim,vimdiff,vimtutor}` → `libexec/{busybox,vim}/*`、`bin/more`；设备实测这 9 条在场）。旧解压器只在 `dest`（当时 = filesDir）内放行，**暂存目录解压（`.snapshot-stage`）会把它们全部静默丢弃** → applet 缺失。修复：`SnapshotExtractor.extract(..., runtimeRoot = context.filesDir)`，绝对目标只要落在 runtimeRoot 内即放行（交换后正是正确路径）；相对链接仍须落在解压根内，Termux 残留与 `../` 逃逸照旧拒绝。在线更新路径（UpdateManager，dest=update-stage）同款受益——此前同样在静默丢链。回归验证：装机后 `run-as ... ls -l files/usr/bin/more` 应见绝对链接。grep `isLinkTargetAllowed`。

46. **标准 write 新建文件仍触发 link/EACCES（2026-09-08 模拟器复现）**：0.1.2-rc.1 的普通覆盖写走 rename，但 createIfAbsent 走硬链接；不可据前者退役判断后者兼容。修复插件 dsh-android-fs 以 renameat2(RENAME_NOREPLACE) 发布完整暂存文件，保留已有目标和并发保护，不做 exists+rename 或 copy 退化。10 项测试已在 Ubuntu 和 Android 应用域运行；ARM64/HyperOS 待真机。

47. **共享/外置项目不能直接沿用私有路径策略（2026-09-08）**：SAF 只返回文档句柄，旧 resolvePickedPath 仅映射 primary 且 Web 插件仅接收 /storage/emulated/0。改由 WorkspaceStorage 查询 OS 已挂载可写卷、匹配 UUID、拒绝非本地提供方及越界路径、实际探测读写后回传。pendingPermissionRequest 仅负责系统全部文件权限返回，不能在每次 SAF onResume 重开选择器。真实 Agent 在共享 FUSE 上 renameat2(RENAME_NOREPLACE) 返回 EINVAL；fs 插件仅对 Android /storage 卷路径采用 wx 独占创建，已有目标不覆盖，但写入中断可留下部分文件（不宣称原子发布）。ADB run-as 不是 app mount namespace，权限应以实际引擎读写验证。

48. **PRoot 的 ADB 探测成功不代表普通应用域可执行（2026-09-09）**：`run-as` 启动 Debian/apt 成功，实际 Agent 调用却在 `/usr/bin/env` execve 返回 EACCES。静态 loader 不能只放可写 app-data；改为构建期生成 `jniLibs/<abi>/libdsh_proot_loader.so`，保留 ELF 并启用 native library 提取，使用 `applicationInfo.nativeLibraryDir` 作为 PROOT_LOADER。Node/PRoot 的动态 ELF 仍经 linker64 启动。Debian tar 含硬链接，应逐项安全解包并复制硬链接内容；检查越界之前要识别合法 `./` 根目录条目。新增环境 `.dsh/debian` 必须登记 SnapshotUserData.preservedNames，不能在快照更新后丢失用户安装的软件和任务记录。

49. **原生引擎与存储撤权不能只靠 force-stop 测试**：模拟器中 APK force-stop 后可能残留原生 Node，引擎句柄为空时 stopEngine 仍须按本包 Harness 完整路径 pkill；不能全局匹配 bin.js。Debian 外部项目显式检查壳导出的 All Files Access；引擎启动和 MainActivity.onResume 刷新该状态。已打开句柄、系统 FUSE 缓存及其他授权可影响实际撤权时机，此检查不是实时内核隔离。撤权验收同时检查授权状态、工具拒绝与真实输出不存在。

50. **HyperOS 4 默认省电会冻结有前台服务的整个应用 UID（Pad 9 Pro Max 实测）**：Android 17 / API 37 上 EngineService 仍 `isForeground=true`，但 `/sys/fs/cgroup/apps/uid_<uid>/cgroup.freeze=1`、events `frozen 1`；Node 与 PRoot 服务同时无响应，回到应用后恢复。PID 子组 freeze=0 不能排除上层 UID 冻结。应用信息→省电策略→“无限制”后，回桌面 62.41 秒/13 次 HTTP 200，UID frozen=0、PID 不变，Agent 取消后端口关闭。只调整了本应用省电项，没有开启自启动或改写 cgroup；不把短时桌面后台等同于长期熄屏、高负载游戏并行或其他 HyperOS 版本。

51. **语音 SSE 语言前缀不等于正文，取消必须跨线程围栏（2026-09-09）**：Qwen3-ASR 先返回 `language Chinese<asr_text>`；只有完整标记之后的非空正文才计首字。VoiceInputController 用请求世代防止取消/页面切换后的旧任务写入新会话，进程发布和录音释放也受同一围栏约束。模型进程从 APK nativeLibraryDir 启动，不能执行共享存储中的可写二进制。CPU 4 线程是当前默认；stop 后整段处理，不把 SSE 当作流式声学缓存。

52. **性能指标不能用 ADB 的可见性冒充应用权限（2026-09-09）**：本平板应用不能读 `/proc/stat`，GPU `gpufreq_usage` 连 shell 也拒绝。插件 CPU 为应用可读取的同 UID 进程时间差（不含隔离 UID 的 WebView renderer）；GPU 为 null/不可用。run-as 探针负载未反映在本应用采样中，未作为通过证据；同 UID 仍可能因 SELinux 域不同而不可读。用应用实际 ASR 子进程负载验证：空闲约 2%，4 线程转录时曾到 42.1%（本机 10 逻辑核心）。

53. **InputState.draft.length 不能直接作含文件卡片的 TokenSpan 末尾（2026-09-09 实机）**：draft 是展开 clipboardText 的投影，而 insert-text 使用 detect 投影（每张卡片仅占一个 U+FFFC）。直接使用 draft.length 会被官方跨度守卫拒绝，文字留在错误提示。末尾应折算为 `draft.length - sum(occurrences.length - 1)`，仍带当前 draftRev；修复写在语音插件，不修改 Lexical 或上游。必须用真实 reference decorator 卡片验收，普通文本 `@filename` 不足以覆盖此路径。

54. **语音 dock 与硬件字号（2026-09-09）**：`conversation.input.dock` 的宽度是整个会话区，插件必须沿用 `--dsh-composer-card-max-width` 和 `--dsh-composer-side-clearance` 才能对齐输入框。Homerail 当前语音界面使用 AgentVoiceCockpit 三条 SVG 曲线，旧 AgentChatPanel 柱条不是同一设计。安卓硬件 Ctrl 组合键可能不产生 DOM keydown，由 Activity 转发专用事件；仅模拟 DOM 事件通过不代表真实快捷键通过。

55. **多会话 UI 必须租用实际 session controller，且一个 Lexical root 只能挂载一次（2026-09-09 实机）**：当前 `ctx.sessions` 由 `dsh-api-session-controller` 提供，`dsh-client-runtime` 的旧实现不是实例来源。stage 租约补丁写入实际 owner，四个 `SessionSurface` 使用 renderer 的 scope binding 与标准 chat/composer 槽位；工作台打开时取消外层全局 composer 的实际挂载，不能只用 CSS 隐藏。版本守卫见协调仓 `scripts/patch-voice-deck.py`，原始快照 SHA 与每个替换锚点必须匹配。

56. **后台会话转录不能抢占正在输入的 Lexical selection（2026-09-09 实机）**：转录拥有原 sessionId 的租约，挂载组件不拥有任务。后台 editor 的 applyEdit 使用 `skip-dom-selection`；不可写结果先持久化再确认 native，存储满则保留 native 结果待显式处理。实际 C 录音后 R1 到 D，D 输入保持、C 接收文字、焦点仍在 D 通过。安卓 WebView 的 `document.hasFocus()` 有时为 false，手柄可用性由原生 Activity 前台/窗口焦点/引擎来源/租约守卫确认，不能只依据该 DOM 值。

57. **双列横滑与原版样式（2026-09-09 实机）**：四条轨道用固定 `calc((100% - 12px)/2)`，`minmax(0,目标宽度)` 会收缩四轨到一屏。触屏在横滑吸附结束后按方向选中可见边缘会话；用 click 而非 pointerdown 激活卡片，避免拖动开始时强制聚焦/滚动。卡片 header/footer 规则限定直接子元素，保留原版 Markdown 与 composer 圆角、内边距、控件高度；只约束窄列控件宽度。对照同一实际回复的 H1/P/STRONG/UL/OL/PRE/TABLE/BLOCKQUOTE/CODE 节点和计算样式通过；测试文本单换行在原版 Markdown 也会合并，不能拿无 Markdown 列表标记的长文本冒充排版验收。

58. **Lexical focus 的 defaultSelection 不覆盖已有 selection（2026-09-09）**：`editor.focus(...,{defaultSelection:'rootEnd'})` 只在没有 selection 时选择末尾，不能满足“每次切换泳道都到末尾”。adapter 增加 `focus(atEnd)`；切换时显式 `editor.update(() => $getRoot().selectEnd(), {discrete:true,tag:'focus'})`，并保留 composition 守卫。L2 收放与普通重新聚焦不传 atEnd，维持当前光标；不靠字符串长度定位，兼容多行、emoji 与引用节点。


59. **输入框外层滚动会裁掉官方 /、@ 菜单（2026-09-09）**：菜单是原版 overlayAnchor 的 absolute 子节点，DOM 有候选不等于可见/可点。Deck composer 的 overflow:auto 会裁掉向上弹层，必须 visible 并提供层叠优先级；文字已有内部滚动。ResizeObserver 按卡片到泳道标题的空间限制 listbox 高度。验收必须包含 elementFromPoint 命中候选和真实触摸/键盘选择。

60. **Android 嵌套聊天纵滚不保证向外传递横滑（2026-09-09）**：仅测试空聊天或输入栏手势会漏掉正文触摸锁定。Deck chat-swipe.ts 以 12px / 1.2 方向阈值路由横滑，纵向留原生，双指取消自定义拖动；代码/表格内部横滚优先。○ 使用 BUTTON_B/97 → east → send，原版提交守卫禁止空草稿/忙碌/拼字，录音和转录中禁止发送，长按仅一次。


61. **恢复 scroll-snap 会抢在惯性之前吸附（2026-09-09）**：松手立即恢复 x mandatory，再 scrollTo(round(left/stride)) 会令短快甩被拉回。保留最近约 100ms 移动样本，抬手延迟不追加零位移采样，最后移动超过 120ms 才判停顿；按释放速度投影 240ms，超过 0.35px/ms 时至少向该方向越过一条边界；慢拖/停顿按最近位置。rAF Hermite 缓动 260–460ms，完成才恢复 CSS snap 并选择/聚焦泳道。动画期间忽略逐帧 scrollend 与 160ms settle；新触摸可中断动画，手柄选择与尺寸变化取消惯性。

62. **折叠不能只检查铰链状态，聊天也不能跨断点重挂载（2026-09-10）**：API 35 通用旧模板报告 CLOSED 却不改变应用窗口；Pixel Fold 参数能创建第二物理屏，仍须匹配 device_state/display_layout 映射才能交接默认逻辑屏。`scripts/configure-foldable-emulator.py` 仅对独立 AVD 安装固定 AOSP 映射。Web AppFrame 若在 mobile 分支换树，会丢失 Lexical DOM/selection 并触发 Deck unmount 的语音清理；统一槽位树、仅改容器样式，禁止用重新加载聊天实现动画。原生模糊等待双 rAF + WebView visual-state，160ms 降级启动、650ms 兜底清理，禁用/后台/销毁立即清理，快照最大边 1024 像素且只存内存。

63. **Codex Android runtime 不等于 Linux 沙盒**：2026-09-10 实测社区 0.153.3 的 command/exec 在 readOnly 下仍可写文件；Android adapter 必须拒绝 read-only/workspace-write 执行，不能自动升级。原生启动层打包在 nativeLibraryDir；Codex 清除 LD_* 后，用独立 Shell launcher 恢复本应用 Termux 环境。命令需自行选择完全访问。账号令牌仍由 Codex 私有 HOME 管理。详见 CODEX-BACKEND-MILESTONE。

Codex 坑 63 补充：GPT-6 工具依赖独立 code-mode host。Android APK 的原生提取要求 `lib*.so`，固定 Codex 0.153.3 按兄弟路径查找 `codex-code-mode-host` 且不支持旧路径覆盖环境变量。prepare 脚本对两处等长文件名字节做有计数和 hash 守卫的替换，辅程序作为 `libdsh_codex_host.so` 打包；原件不改，回执记录前后 hash。Relay resume 需传入已选择的 permissions，否则平台守卫按设计拒绝恢复。

Codex 坑 63 UI 补充：Relay 的 AdvancedDebugGuard 会监视任何会话 header，并点击第一个聊天 tab，导致 Voice Deck/轨迹立即被切回。Android vendor 不挂载这个 guard。权限/停用错误在恢复 Thread 时保留原提示；不可误报为断线。
64. **Codex 上下文委托与独立图片根目录（2026-09-10）**：仅在 LLM adapter 丢弃 `options.system` 不够，DSH ReactLoop 仍组装系统提示词并调用 `agent/pre-step` 注入插件、写入轨迹。`--codex` overlay 通过 `scripts/lib/codex_context_patch.py` 增加可选 `agent/context-delegation` waterfall；Relay native Codex 会话返回空 assembly 和真实用户消息，其他会话返回 `next()` 完整保留原行为。权限检查仍在 Android App Server transport，不升级用户权限；Skills / AGENTS.md 由 Codex 自己加载，DSH 专用工具不隐式导出。另：Node 主进程的 HOME 不等于子进程 CODEX_HOME，预览必须显式传入后者并限定 `generated_images` 目录，不能把私有 Codex 全目录加入图片白名单。历史失败提示不通过改写会话日志修复。

坑 64 图片持久化补充：`dsh-attachment-local.ensureDurableHome` 原来同步直到 `/`，Android 上打开 `/data/data` 会 EACCES，导致图片即使路径合法、解码成功仍保存失败。同一 overlay 对 Android 改为 canonical filesDir 边界，保留应用目录内全部 fsync；HOME 与 TERMUX__PREFIX 都 realpath 处理 `/data/data` 和 `/data/user/0` 别名。私有附件仓必须在 filesDir 内，其他位置明确拒绝，不吞掉 EACCES；桌面原路径不变。真机独立 saveImageFile 探针已通过，见 `image-storage-probe.json`。

注意：`EngineManager.applyRuntimePatches` 每次启动会用 `assets/patched/attachment-local-index.js` 覆盖 snapshot 中的 attachment-local，必须同步修改这个启动资产；仅改 overlay 仍然会失败。`verify-codex-release.py` 现在逐字节对照已装机附件模块与 APK 内启动资产，并检查上下文委托入口，不能只以 APK/snapshot 哈希作为模块已运行的证明。

65. **Codex 跳过提示词组装时仍须捕获会话模型选择（2026-09-10）**：`installModelSelection` 原本借 `system-prompt/assemble` 捕获模型与 effort；直接跳过组装会漏掉这个非提示词副作用，导致 UI 投影选 Astra 而 request/context 仍标 DeepSeek，原生 App Server 使用默认模型。Relay native delegation 现在独立读取 `modelSelection.pending ?? lastUsed` （无历史的新会话回退到 `agentDefaultModel.currentSelection()`）并复制到每个 Agent 的 WeakMap；`agent/request` 在其他处理器返回后应用该快照，未选 effort 时清除继承值。拒绝非 Codex 路由，不恢复 DSH 组装/注入。空白标准会话只从模型菜单选 Codex 仍会被 preset/model 同步器回退，需先从 hero 的标准模式菜单选 Codex；已有会话的 preset 仍锁定。

66. **折叠动画与外屏续接是两条链路（2026-09-10）**：lhasa 的标准 TYPE_HINGE_ANGLE 可用；原型仅监听窗口宽度且 onPause 清除全部转场，因此开始折叠没有动画。现在 FoldHingeMotion 去抖、量化角度进度，FoldTransition 在前台监听、半折静止 450ms 后淡回清晰，切屏完成后抑制同方向残余事件。onPause 清除位图/效果但保留无像素 handoff 标记，onResume/window focus 且非锁屏后恢复动画。系统 Settings.apk 中 close_lid_display_setting=1 为上滑继续、2 为保持亮屏、0 为立即锁屏、3 为智能保持；不能把应用 blur 当作系统唤醒或解锁。此手机拒绝 ADB WRITE_SETTINGS/INJECT_EVENTS，应由系统页操作；插件仅提供页面入口，不改系统设置。

67. **折叠玻璃感是空间渐变，不能整页统一模糊（2026-09-10）**：用户明确以截图左强右弱为参照。FoldGradientBlur 在 API 33+ 使用系统高斯模糊多尺度层与 AGSL 横向权重混合，sigma 随横坐标 smoothstep 衰减至 0，范围随绝对铰链角度变化。采样同一实时 RenderNode，不叠加 FIT_CENTER 旧截图，避免字形错位和双影；半折静止保持渐变，完全展开清除，完全合拢无切屏 350ms 后恢复。端点 170-180 度噪声不触发；布局仅在物理面板尺寸改变时触发（前后台交接另外保留折叠意图），旋转/分屏/IME/刷新率改变不算切屏。低版本/着色器异常退化为清晰布局，不恢复已被拒绝的整页 blur。旧坑 66 中的快照及半折 450ms 淡出行为已被替代。测试桥 foldPreview 仅 debug 执行、4 秒兜底清除；用户真机折叠与 GPU 像素测试应分别记录，模拟调用不能冒充物理折叠。

68. **单屏渐变不等于双屏玻璃效果（2026-09-10）**：用户进一步明确两块物理屏须同时亮、同时渲染。lhasa 状态 3 仅内屏 ON，0 仅外屏 ON，5/6 配置两屏 ON；ADB 临时请求 5 实测两物理屏均 ON、显示 ID 0/1，已 reset。此证明仅属 shell 能力，不能代替普通应用权限验证。config_deviceStateConcurrentRearDisplay 读到 -1，须核对 WindowManager Extensions/OEM 接入。新增仅 debug 的 FoldDualProbe，在原应用 UID 请求 5、15 秒限时、Presentation 探测、不改 hidden API 策略、不用 root/ADB；退出和后台尝试撤销，任何权限失败均记录。旧单屏实测结果只证明局部渲染/会话保留，不是用户最终验收。

69. **安装不能隐式获得应用自己的 ADB 授权（2026-09-10）**：电脑 ADB 在线不代表 AdbState.allowSwitch/paired 为真。FoldSetup 在首次启用双屏插件时给出原生权限引导（仅 lhasa），授权布尔只由原生确认按钮用户手势写入；不自动点击、复制电脑私钥或把 signature 权限当普通运行时权限请求。FoldPairingService 通过用户通知 RemoteInput 接收六位码、自动发现本机端口，在本机前台服务完成配对；码不写日志/偏好，结果无代码。POST_NOTIFICATIONS 如缺失走系统申请，合盖设置入口单独提供。NSD 两种服务必须使用两个 listener，缺一个端口也要补查，只接收本机 IP，防止同 LAN 的 Pad 广播覆盖当前手机。

70. **双屏 ADB 必须有可回收租约（2026-09-10）**：lhasa 当前标准 WindowArea API 实测不可用；已授权应用内 ADB 的固定 state 5/6 路径实测双物理屏 ON，Presentation/PixelCopy 46 帧无错误。FoldDualPolicy 离开端点（8–170°）持续 100ms 才进入双屏；端点 ≤3°/≥177° 持续 250ms 释放。FoldDualDisplay 串行、合并异步请求，后台/锁屏立即销毁副屏聊天画面，失去心跳由 shell watchdog 兜底。shell 对 app PID 的 `kill -0` 返回 EPERM，不能作为死亡判据；用 `/proc/PID` 存在性和心跳超时，实测 4 秒后租约仍活，停止续租后 15 秒内释放。只能取消与 token/请求所有者匹配的自有租约；已有其他 override 则拒绝抢占。不复制电脑私钥。副屏白色系统栏须单独隐藏，不能只修 MainActivity。角度自动双屏完整路径仍需实折验收；不能把此静态探针等同最终体验。

- 坑 70 补充：用户实折发现 state 6 外屏主画布让内屏暂时保留竖向布局；自动双屏统一请求 state 5，临时保持最近完全展开时的内屏方向，释放后恢复应用原始方向策略。外屏模糊应随合盖减小，与内屏相反；因此不能把已模糊的主屏 PixelCopy 后直接显示。改为可见 WebView.draw 清晰内容 + 副屏独立 RenderEffect，分别用 `(170-angle)/150`（内）和 `(angle-10)/150`（外），端点夹紧。此修正新增单调性测试，实机性能和像素复验待完成。

71. **前台常亮不等于绕过系统锁屏（2026-09-10）**：用户要求 DeepCode 内不自动锁屏，使用窗口 FLAG_KEEP_SCREEN_ON（默认启用），onResume/onPause 成对设置/清除；现有 keepScreenOn 桥改为主线程更新该请求，去掉 Activity SCREEN_BRIGHT_WAKE_LOCK，避免离开应用仍持亮。不改全局 screen_off_timeout、不解锁/覆盖 keyguard。电源键和 HyperOS 合盖策略仍由系统处理。

- 坑 70 第二次补充：用户最终确认展开时外屏模糊区右→左扩大、内屏清晰区右→左扩大。FoldProjection 以正视对称折叠的正交投影基线 `boundary=cos(theta/2)` 驱动互补空间 mask，固定高斯模糊核、移动过渡边界，不再只改变全屏强度。明确这是固定视点近似；当前取样仍等高左裁切，尚未完成眼位透视单应映射，不应声称任意观察角度严格透明。

- 坑 70 最终澄清（以用户实机照片为准）：内屏红框中已经物理露出的内容必须始终清晰。把互补 mask 铺在整块内屏上会模糊真实可见区域，已撤回；保留内屏清晰，由实际手机外壳遮挡自然产生可见范围变化。模糊只作用于外屏。因为内屏无滤镜，副屏可以安全用 PixelCopy 读取真实硬件合成画面；WebView.draw 不是等价替代，原生截图验证发现它漏掉了更新后的 HTML canvas 层。外屏仍是固定视点近似的移动边界，未实现根据用户眼位的精确单应取样。

72. **合盖设置跳转参数必须来自实际 Settings 实现（2026-09-10）**：错误使用 `:android:show_fragment` 会启动 Settings/SubSettings 却没有进入目标页面，不能把 am start 成功当作配置页已打开。真机 Settings dex 的键是 `:settings:show_fragment`。修复后 UI 层确实出现“上滑继续使用（6 秒内无操作自动锁屏）/保持亮屏/立即锁屏”；用户选择后系统值由 1 变 2，已读取确认。早先多次“好了”时仍读 1，根因是错误深链，不能归责用户。

- 坑 70 投影角度修正：实际模型是固定内屏、外屏绕铰链转动，外屏边界采用 `max(0, cos(theta))`，不再按双侧对称模型除以 2。半角版在外屏仍朝向用户的阶段只有最右极窄区域改变，用户感知为“外屏没变化”。内屏继续保持清晰。模糊过渡带只落在已越过边界的一侧；左边缘清晰。仍是固定正视近似，并非眼位重建。

73. **独立内外屏滤镜与合盖交接（2026-09-10）**：PixelCopy 从已施加 RenderEffect 的主窗口取样会把内屏模糊带入外屏。新增 FoldClearFrame 在离屏硬件 RenderNode 录制同一 WebView，只在 clearSourceReady 后启用内屏折叠侧滤镜；不能把软件 Canvas 截图成功当作硬件 canvas 内容最新。固定右半屏始终清晰。合盖释放租约时原代码先 dismiss Presentation，再等待 ADB reset，造成外屏空白间隔；前台未锁定时保留 Presentation 到 reset 返回，交接期间先清除主屏滤镜。新路线待本轮真机截图与实际合盖验证，不能承诺消除厂商面板切换的所有黑帧。

- 坑 73 补充：仅延后 dismiss 仍会在主屏映射/尺寸变化时继续采样，用户看到合盖后图片飞过；交接改为 freezeForHandoff 停止后续采样并保留末帧，Presentation 关闭窗口动画，恢复原方向提前到 state reset 前。内屏半角边界被用户反馈为扩展太慢，改为 `0.5*max(0,cos(theta))`，90 度达到全清晰；外屏公式保持不变。本轮待复验。

- 坑 73 最终需求纠正：用户所说“太慢/一直清晰”指模糊覆盖不足，不能仅加快清晰区展开。取消右半屏恒清晰与 90 度全清晰限制；固定正视正交投影中铰链位于 x=0.5，折叠边缘投影为 `b=0.5+0.5*cos(theta)`。b 右侧可见并清晰，左侧遮挡侧渐变模糊；90 度 b=0.5、180 度 b=0。前述半屏公式已被替代，不能作为当前验收标准。它仍是假设固定视点的投影近似，不是眼位追踪。

74. **合盖外屏 OFF 来自物理显示映射（2026-09-10）**：实际系统日志表明 state 5→0 会把外屏从 ON 变 OFF，再 ON，并等待约 300ms 首帧。仅延后关闭 Presentation 无法阻止供电切换。对照试验 state 0→6→0 只开关内屏，没有外屏 OFF。该副屏 canHostTasks=false，shell 启动 Activity 被明确拒绝，不绕过限制。新路线为 state 6 保持外屏主屏；FoldSharedCanvas 将同一个 WebView 临时扩为内屏比例，外屏窗口裁取左部，FoldMirror 向内屏渲染完整清晰源并独立施加已确认的内屏投影；竖向物理副屏内将图层旋转显示。退出恢复原 WebView 宽度和请求方向，不重建编辑器或会话。该重构须重新验证两屏像素、合盖供电事件、页面/草稿保留及朝向；不能仅凭 0→6→0 无 OFF 就声称完整体验已通过。

- 坑 74 方向修复：固定 +90° 绘制到内屏副屏，和用户先前的反向横屏相差 180°。用户明确要求仅修复颠倒、保留已接受的模糊速度；回退包只构建未安装，恢复当前 state 6 方案后只修复方向。完全展开时记录内屏真实 display.rotation；副屏图层使用 `(savedInnerRotation - targetDisplay.rotation + 360) % 360`，并对四个象限分别平移回容器。尚未获得展开方向时使用本设备已确认需修正为的 270° 作为初值。验证同时检查左右模糊区和红色 TOP/蓝色 BOTTOM 标记，避免只测正弦条纹而漏掉上下颠倒。

75. **共享镜像不能按外屏角色强制手机布局（2026-09-11）**：state 6 的 FoldSharedCanvas 将同一 WebView 扩宽到约 859 CSS px，外屏实际约 424px。原有画布断点会露出 56px 窄栏；第一次按 cover 标记强制 AppFrame mobile 的修复虽然藏住了外屏栏，也让内屏镜像切到手机布局，已被用户否决并撤销。最终保留原来全部断点与 DOM；responsive 插件仅提供 `window.__dshNavigationInset(widthCssPx)`，按同一侧栏求解器预测正文起点。FoldSharedCanvas 在一次原生更新中设置画布宽度与负 translationX，外屏从正文起点裁取，离屏硬件源仍完整录制局部 WebView 坐标供内屏使用。外屏 AGSL 按裁取偏移重新归一化，不改投影公式。退出恢复原 width/translation；异步回调按 generation 丢弃。运行时 client 补丁必须有包名、版本、SHA 守卫，不能覆盖未知用户构建。验收同时检查内屏布局、外屏无栏、原始清晰源不被裁剪、模糊方向及草稿/DOM 连续性。

76. **轻折闪黑是主动交换主副屏造成的（2026-09-11）**：本机日志实证 3→6 会对原内屏执行 OFF→ON，反向 6→3 也有关断；保持 DOM/位图并不能遮住物理屏关闭。`cmd display enable-display 1` 在本机已授权 ADB 中可用，保持当前主屏及 device_state 无 override，静态对照只新增副屏 ON。FoldSecondaryCommands 用独立排他 token 文件/心跳/watchdog 租约启用逻辑副屏 1，拒绝已有 override 或已启用副屏；释放/后台恢复副屏禁用。FoldDualPolicy 非零值 1 现在表示副屏启用租约，不是 request state 1。角色随 HyperOS 自然折叠交接；内屏主屏时保持原 WebView，外屏主屏时才用共享宽画布。完整物理开合仍须复验，不能用静态 enable 成功就声称系统最终合盖交接零黑帧。

77. **Codex 输入图片也有独立 hard-link 缓存（2026-09-11）**：DSH 附件上传成功不等于 Codex 能使用图片。relay-dsh-plugin-codex 的 persistContentAddressedImage 在 `.codex/dsh-input-images` 用 link 发布缓存，本机即使私有目录也报 EACCES。改为对受限制错误使用同目录完整临时文件 rename，已有目标仍检查普通文件/非符号链接与 SHA-256；相同 digest 的并发发布写入同一内容。APK 中 codex-image-input.js 采用固定 0.2.3-rc.1 + 已知基线/受管 SHA 守卫更新 host-plugin.js，未知包不覆盖。实际失败图片 668137 字节已验证缓存写入、重复使用、坏内容拒绝、符号链接拒绝及临时文件清理。不是相册权限问题，不能靠增加存储权限修复。

78. **输入缓存写成功后，imageView 预览还有独立根目录校验（2026-09-11）**：Relay 的 imageView 原来只允许 workspace 与 runtime CODEX_HOME/generated_images；输入缓存由宿主 Node 的 codexInputImageRoot() 决定，两者 HOME 不同。新增 codexImagePreviewRoots，复用写入侧同一个缓存根，不放开整个 HOME。readImage 仍先 realpath 后按路径边界校验，目录外、同名前缀邻居、符号链接越界均拒绝。测试 scripts/test-codex-preview-roots.mjs 覆盖三个合法目录和三个拒绝场景。既有聊天中持久化的失败文字不会自动被改写。

坑 78 实机补充：安装包内实际 importCodexImage 函数读取用户本次失败的 374942 字节 JPEG，通过 WebView Image.decode 验证 1773×2364；验证脚本 scripts/test-codex-input-preview-device.mjs，未重新提交生成任务。

79. **物理屏幕透视与像素重采样是两层（2026-09-11）**：已有余弦模糊边界不会自动改变内容透视。新增 FoldPerspective/AGSL 对移动半屏做固定观察点回投；不能再将整张 WebView 压成梯形，否则叠加物理缩短且可能触发响应式。内屏固定右半保持恒等，外屏采样必须扣除裁取 offset。当前20项JVM数学/状态测试与APK构建通过，Fold双屏AGSL/网格通过、真实视觉待反馈，详见仓库 docs/FOLD-PERSPECTIVE-MILESTONE.md。

80. **无线调试换端口不等于需要重配对（2026-09-11）**：电脑恢复连接后，应用AdbState仍可能保存旧localhost端口，返回device not found。现仅在旧连接失败后复用本机端口发现，校验新连接明确成功才保存；保留原授权门和密钥，不接邻机、不自动新授权。Fold已实测从34783更新43159，应用双屏租约获取/释放通过。系统属性可能为空，应保留只匹配本机IP的NSD回退。

81. **单面板尺度与释放时重排（2026-09-11）**：透视观察距离不能用内屏整画布宽与外屏单面板宽分别计算；使用内屏半宽/外屏全宽归一，等物理尺寸时放大率一致。合盖旧trace确有CSS宽880→424与系统OFF/ON叠加。共享画布需等释放回执后再恢复；中途重开保留，且禁止sharedCanvas刷新分支重启已freeze的镜像。最新21项Fold测试与双屏AGSL/固定右半像素通过，真实视觉待验收，不代表解决系统电源交接。


82. **零闪黑需要跨整个开合持有双屏状态（2026-09-11）**：仅 enable-display 或固定 OPENED state 3 仍被合盖策略关断外屏；实机60秒固定 OPENED_PRESENTATION state 5，base 覆盖3/2/0/1、角度0–179°，零OFF/ON且用户确认“不黑了”。自动实现改为前台全程 state 5，端点只迁移同一个 WebView 的原生宿主，不释放显示状态、不交换物理面板身份。移动时用旧帧垫底，等待 Chromium visual callback，再显示调整过布局的编辑器；外屏输入窗口必须转发自身 IME inset、拥有焦点，并单独实测触摸。六次自动宿主迁移同文档/同编辑器/同草稿且零电源事件；真实输入仍待验收。debug observe 重复调用只延期，不能每次拆窗口，否则对照引入额外闪烁。当前透视仅混入0.18*sinθ的回投位移，横向≤单面板4.5%、纵向≤2%；不是完整光学重建。

坑82验证补充：旧shader脚本仅enable-display导致外屏实际全黑但mirrorShowing/frames正常，接口状态不能证明物理像素。当前脚本用与APK一致的state5租约并在成功前运行check-fold-perspective-pixels.py：八张物理图须非空、120°内屏固定右半与180°逐像素一致。四角度state5重跑通过；生命周期两种宿主退出/返回亦通过。真实触摸和折叠视觉仍待用户确认。


83. **断点换布局会误播放抽屉/底部面板退出动画（2026-09-11）**：AppFrame跨640px保持子树挂载，但desktop sidebar/details变成mobileDrawer/mobileSheet时，旧桌面盒子成为CSS transition起点。实机记录margin-left与transform持续300ms，底部编辑器不动，面板从其上方滑出，表现为合盖“屏幕飞走”。原生120ms后请求visual-state callback不能保证CSS动画已结束。AppFrame在mobile标记变化的layout effect给根节点添加data-layout-changing，禁止这一轮drawer/sheet/mask/handle/frame过渡；经过两次rAF确认新盒子已提交后移除，只抑制断点重映射。`test-fold-endpoint-animations.mjs`在实际WebView上记录往返逐帧：自动panel transitions=0、手动drawer动画仍存在，同文档/编辑器/草稿。14项相关回归通过；APK5b414033…已部署、快照/账号/模型保留。仍需用户真实合盖确认，不把自动宿主迁移等同物理开合。


84. **外屏可重排但不另加品牌栏；跨屏safe-area可能仍是内屏值（2026-09-11）**：用户明确选择“合盖后文字重排，但不显示顶部标志”，不选择永久宽画布/横移操作。AppFrame仅在原生foldStatus.dual.supported设备的mobile布局使用compact header：隐藏DeepSeek Harness品牌、导航绝对定位于现有会话标题旁边、mobileBody从y=0开始，输入区仍按外屏宽度排版。为导航在标题行保留48px空间，44px按钮保留可触面积。首版按env(safe-area-inset-top)定位，实机保留46px旧值令按钮y=50压住tabs；改为匹配既有header首行y=12，不再叠加旧inset。像素/矩形检查需确认按钮bottom≤tabs.top，不能仅检查“按钮在屏内”。

85. **触屏会保留桌面 tooltip（2026-09-11）**：侧栏切换按钮的 role=tooltip 在 WebView 触摸后可因 hover/focus 残留；不能通过 blur 按钮、阻止事件或删除无障碍名称修复。响应式插件 TouchTooltipGuard 初始按 hover:none 设置触屏模式，捕获 pointerdown/move 区分 touch/pen 与真实 mouse，仅隐藏 tooltip；Tab 恢复键盘提示。CSS 按角色定位，不依赖上游散列类名，退出时清理监听/属性/样式。

86. **多泳道语音/图片串会话（2026-09-11）**：客户端Cordis作用域事件必须显式传subject：`actx.bail(actx,event,payload)`，仅调用`actx.bail(event,payload)`不会触发身份过滤，其他已挂载会话可抢收。附件0.6.4把处理结果广播为document drop也会让多InputBar竞争；其composerReady还仅查询旧textarea。现版voice修正subject；图片经deckInput.for(id).addImages进入原InputBar intakeImages，保留权限/忙态/类型/数量/大小检查；来源ID与cwd在异步处理前固定，序号按会话分隔，目标不存在/拒绝显式报错。用户原图、草稿保持；文档卡片多泳道不在此次验收范围。


87. **同一图片选择有两条入口，不能用 file input 验证替代原生菜单（2026-09-11）**：坑86只覆盖社区附件按钮的 input change。用户真实操作为「指令 → 上传图片」，host-web-compat 注入菜单调用 Android pickImage，再由 onImagePicked 向 document 广播 drop；右泳道菜单→左泳道图片的元数据追踪已复现。修复通过 callbackId 保存原 data-dsh-input-session 与 card 节点，回调校验身份/挂载状态后对原 card 派发局部 dsh-native-images，由 InputBar 的原 intakeImages 校验接收；取消清理映射，原输入框关闭不转投当前会话。引用文件的 mention 也限定原 card。host 0.1.9 新增版本/SHA 守卫补丁，不重解压快照。新测试实际点击菜单处理函数与语音按钮，经过 native callback / VoiceSession 轮询，再验证切到左边后的回写；原生返回值使用 fixture，不能标为相册/ASR 实测。测试须恢复原草稿；尚未输入过的 Lexical EditorState.isEmpty() 不能直接 setEditorState（error38），有变化时用 setDraft 恢复空草稿。

- 工作台切换的 focus 在 activate、Lane layout effect、Deck mount 与手柄动作都有入口，统一由 hasHardwareKeyboard 守卫；Android InputDevice 只接受非虚拟且具有 SOURCE_KEYBOARD 的 ALPHABETIC 设备，不能将触屏/游戏手柄/鼠标当键盘。每次调用重新读取，支持热插拔。触屏切换可以 blur 原泳道输入框，但不抢走用户直接点击新输入框产生的焦点。实际外接键盘尚未重新接入，本轮仅验证系统返回 false 与模拟 true 分支末尾光标。
- 工作台只隐藏 ConversationSessionHeader 的重复标题行，保留对话/工作台/轨迹标签用于返回；普通聊天标题不变。Fold 窄屏导航按钮占位转移到标签行，避免标题隐藏后压住标签；折叠透明效果源码未改。


88. **Fold 展开宽屏遗漏键盘边界，visualViewport pan 不能忽略（2026-09-11）**：现场 innerHeight=608、visualViewport.height=335.27、offsetTop=272.73、native IME=273px；KeyboardBoundary 原来仅查 `[data-mobile]`，宽屏工作台完全未处理，Chromium 为聚焦编辑器将整页上移，顶部被裁且出现空白。临时仅把 frame 高度设为335.27仍错误，因为浏览器已有272.73px偏移。修复给 AppFrame 稳定 data-app-frame 标记，全部布局按 visualViewport.height 设高，CSS translateY=offsetTop 抵消浏览器pan；不再减一次IME高度，所有composer seat取消重复padding。监听visualViewport resize/scroll以及根style的MutationObserver，覆盖inset比resize更晚到达；attach可重入，关闭/卸载恢复原height/translate/padding。Fold最终实机两次真实键盘展开均273px、可见335.27px，frame顶部与viewport一致，全部输入卡片在键盘上方；关闭恢复自然高度。81项响应式测试通过。测试不修改草稿、不发送模型请求；证据docs/validation/2026-09-11-deck-ime。保留原皮肤暂停与透明折叠决定，不修改投影参数。


89. **Fold工作台省略侧栏必须消除窄栏轨道，并保留右侧泳道身份（2026-09-11）**：普通computeColumns(sidebar=0)仍保留56px轨道，不等于无侧栏。Deck挂载经layout.setWorkbenchActive通知根布局，只有native Fold支持且workbench挂载时，AppFrame使用覆盖式抽屉；宽屏不标data-mobile、不修改设备状态。toggleSidebar/L2沿既有drawer状态工作，进入/离开工作台关闭抽屉但保留原宽度偏好。顶部以矩形分栏/箭头SVG代替三横线，沿用44px触摸目标与aria-expanded。工作台横向padding=6、列gap=12，列步长恰为完整画布宽的一半；隐藏滚动条只改scrollbar-width/WebKit scrollbar，仍可横滑。

- 原__dshNavigationInset在此模式返回width/2，FoldMirror沿现有等高等比矩阵取右半幅；常规聊天仍返回导航偏移。它现在表示镜像来源起点，不能理解为所有模式都等于侧栏宽。原生模糊/投影/租约未改。实机内屏半幅1182×1672、外屏1168×1712，等比等高后仍有少量右缘裁切；不承诺两种硬件宽高比像素级完全一致。
- Deck保留宽屏当前左右可见会话ID；resize到单列时激活原右侧，恢复宽屏时找回原左侧作为双列起点。异步布局期间的scroll事件必须检查新旧宽度一致，避免把已重排的几何覆盖原双列缓存。用户已授权此会话选择策略；输入的原owner不随之改变。
- `scripts/test-fold-deck-layout.mjs` 验证抽屉开关不挤压、等宽、右侧会话交接、展开恢复、滚动条不可见但仍可滚、DOM与草稿不丢。自动hostPreview不是物理开合验收。像素测试需先确认当前是宽屏主窗口再采外屏；用户物理合盖后，直接在窄外屏画红绿半屏会产生无效对照，不能当裁切失败。最终强制有界宽屏窗口后9点均取到绿色右半幅，测试图已移除并恢复原窗口。


90. **合盖首帧回执先于右泳道提交；双屏常驻不能始终锁方向（2026-09-11）**：用户发现近合盖闪左列，逐帧记录确认新宽424px时hostReady已true，仍显示左列；约50ms后才切右列。固定120ms后postVisualStateCallback只保证当时画面提交，不保证ResizeObserver/React已换好泳道。FoldMirror改为核对CSS/原生宽度和工作台__dshFoldDeckReady，再请求visual-state回执；之前正确的镜像仍垫底。Deck回调检查目标右列data-active及实际位置，resize同步定位右列后直接返回，避免再scrollIntoView旧active。世代取消和1500ms报错兜底保留；异常兜底不能算通过验收。3轮369帧检查零错误泳道、草稿/编辑器不变。用户另报无法竖屏：FoldDualDisplay原先租约全程SCREEN_ORIENTATION_LOCKED，现角度<170°保存原方向并锁定，>=175°恢复原请求（含用户系统旋转策略），中间5°滞回；同步保存真实内屏rotation，避免强制方向。实机以系统user-rotation命令完成0/270°两轮往返，608×859及859×608，原free模式与user_rotation=1已恢复。这是实际窗口旋转检查，非手持传感器验收。证据docs/validation/2026-09-11-fold-deck-handoff，后续330样本实折覆盖0–179°、零渲染错误，用户确认“不闪现了”。


91. **刚露出区域立即清晰、179°仍采样投影滤镜（2026-09-11）**：旧内屏sigma=1-smoothstep(edge-.20,edge,x)，过渡带全在遮挡侧，x>=edge立刻变清晰；用户希望新露出的右侧也经过渐清晰。新带为edge-.10到edge+.18，保留signed-cosine投影边界，未改移动速度几何。增加145–175°强度渐退，>=175°移除整个RenderEffect，避免实机停在179°却仍做亚像素形变采样；外屏<=3°移除效果、3–12°平滑进入。shader与Java诊断共用feather常量；sigma与透视strength同步乘端点强度，权重仍为partition of unity。23项Fold JVM测试通过。该组是按参考片段/用户反馈校准，不是苹果公开公式，也不是真实眼动追踪。详见docs/FOLD-BLUR-REFINEMENT.md及validation/2026-09-11-fold-blur-refine。

坑91验证补充：两屏13角度实机像素检查通过，内屏175/179°与180°源、外屏2/3°与0°源完全一致；右侧75%/90%位置对比度含中间值并随展开恢复。FoldDualProbe.observe有15秒期限，长扫描须每角度续期，避免把正常到期当渲染失败；finally仍要关闭probe并恢复正式折叠开关。用户视觉验收单列。

坑91用户反馈后只提高maxSigma 10→14dp，边界与羽化、端点阈值均不变。不要通过移动边界/延长模糊停留代替强度调整。

坑91增强版验收：加入75°采样后，两屏14角度全部通过，清晰端点零像素差，x=.75在75°对比度0.722，证明增强后仍有中间焦点态。产品参数没有为测试修改。


92. **不能为取消网页式长按而禁用整个 WebView 的选字（2026-09-11）**：用户明确要求泳道聊天信息仍支持触摸和鼠标选字。NativeInteractionGuard 仅在 androidBridge 存在时挂载，默认 chrome user-select:none；稳定的 [data-chat-flow]（普通聊天和 Deck 共用）、显式 [data-dsh-selectable] 及 input/textarea/contenteditable 放行，正文内部按钮/折叠控件仍不可选。只 preventDefault contextmenu/selectstart，不拦截传播、touchstart、pointerdown、dragstart，不使用全 WebView setOnLongClickListener 吞事件。卸载清理样式与监听。不要以 data-conversation-scroll 作为宽泛白名单，某些外层会包含整个工作台标题和控件。Deck touchmove 原横滑逻辑可能抢走长按后的选区调整；检测到本工作台正文非折叠选区时取消拖动/惯性并还原 snap，selectionchange 也处理“touchstart 之后才开始选字”。清除选区后恢复普通横滑。

坑92验证：87 项响应式、6 项 Deck 测试通过；手机真实 WebView 中鼠标拖选得到非空正文选区，正文/编辑器默认菜单放行，标题/按钮默认菜单被阻止，草稿未变。CDP touchStart/touchEnd 不走 Android 原生长按识别，不能以其零选区断言实际长按坏了；此设备 shell input 被 INJECT_EVENTS 限制。用户实际手指操作已回复“可以了”。详见 validation/2026-09-11-native-interaction。


93. **枚举到 Vulkan 不等于实际用上 GPU，Mali 可能是 IGPU（2026-09-11）**：predict-woo/qwen3-asr.cpp 固定 6dcc586 的 ForcedAligner 只调用 GGML_BACKEND_DEVICE_TYPE_GPU，O3 Mali-G2-Ultra-NX MC16 被 ggml 分类 IGPU，最初静默 CPU 回退。scripts/build-forced-aligner.py 对 backend 和 weight buffer 两处增加 IGPU fallback，使用 QWEN_USE_VRAM=1，并在三张图计算后诊断 MUL_MAT 节点的实际 scheduler backend。实机分别为 GPU/CPU=4/0、194/0、197/0；不能用 GPU 名称、编译开关或速度独自证明。旧回退跑分被标无效并单独保存。

坑93验证：现有 llama.cpp ASR GPU 日志确认 29/29 层及 CLIP Vulkan；一分钟带音乐 OSS 口播 CPU/CPU RTF 0.898、GPU/CPU 0.997、GPU/GPU 0.796、CPU/GPU 0.756（含分段及对齐器逐段加载，不含 ASR 启动/视频解码）。均单轮，非热控统计。独立对齐模型约 994MB，中文输出按字；0.08s 是模型刻度，非人工准确率。VAD 本例两切点均为低能量回退，不得写成检测到停顿。所有性能推理来自 ADB-shell，尚未证明普通应用 SELinux 域执行；transcribe 工具未挂载、正式 APK 未修改、日常语音 CPU 默认未改。构建产物留 artifacts，切勿因为 ADB 可执行就把 ELF 放 writable files 直接执行。详细证据见 ../../../docs/FOLD-MEDIA-SKILLS.md。


94. **ASR/对齐原型转成 Codex skill 必须验证应用域与实际技能发现（2026-09-11）**：Fold 的 run-as 能读取私有目录，但对 /storage/emulated/0 模型 is_file 返回 false；真实 Codex shell（应用域）doctor 与共享音频转录成功。不能用 run-as 的 FUSE 失败宣称用户缺少存储权限，亦不能用 ADB-shell 成功替代应用执行。正式 APK 打包 libdsh_aligner.so、libdsh_aligner_vulkan.so 至 nativeLibraryDir，附许可证；prepare-forced-aligner-apk.py 校验固定构建 SHA 和16KiB对齐。运行时每次从 network-dns.json 获取安装后的新 nativeLibraryDir，不固化 /data/app 随机目录。

坑94：Codex HOME 是 files/home/.dsh/codex-android/home，技能部署到其 skills/android-media、skills/android-transcribe，实际 Codex 读取 SKILL.md 并运行脚本通过。转录用宿主 Python 编排、现有 Debian runner 解码、CPU ASR＋实际 Vulkan 矩阵节点对齐；新增输出目录避免覆盖，源偏移加回 JSON/SRT，任务互斥和自有子进程清理。当前仅共享内部存储路径，外置卷未在此脚本接入；时间戳80ms是刻度，非准确率。测试4.204秒音频共9.843秒（含启动），不得外推一分钟性能。新验收会话要选择 relay-codex 模型与完全访问；session/selectModel 会同时保存全局默认，测试后通过 settings/replace 的 revision 守卫立即恢复原默认。文档 docs/FOLD-MEDIA-SKILLS.md 与 validation/2026-09-11-fold-media 保存版本、产物与真实工具记录。


95. **注册供应商或同步模型清单不代表授权已配置（2026-09-11）**：DSH modelCatalog 原本直接枚举所有已注册适配器；模型同步插件会写入只有 models 的 pi-ai profile。不能只检查 profile 存在，也不能将 apiKeyEnv 为空直接当作可用。scripts/lib/model_catalog_filter.js 对 pi-ai 复用固定适配器 current/profileOf/config.resolveApiKey 与 Models.checkAuth，支持显式密钥、环境发现、OAuth 和免密服务；显式引用缺失不回退环境。其他声明供应商按 credentials.describe 的 configured 判定；没有声明配置地址的插件（Relay Codex）保留其自有目录。缺少配置不进入 groups，读取错误仍进入原 failures；不改变 routableProviders、默认和持久会话选择，不动设置页。原前端的 settings/document-updated、credentials/reference-updated、llm/adapters-updated 会刷新共享目录。

坑95构建：scripts/patch-model-catalog.py 从当前快照提取 Host lib/index.js，SHA e8c43c… 守卫后插入辅助函数；Android 用包版本0.1.2-rc.1与SHA守卫应用 model-catalog-host。registration/current 是固定版本的内部接口，升级须重审，不能移植补丁时忽略守卫。该 Host 文件不是 patch-voice-deck.py 产出的 lib/client.js。5项目录回归覆盖显式/原生授权、免密、配置增删、错误隔离、持久选择及路由保留。


96. **Host补丁新增服务调用必须声明Cordis注入，普通对象单测会漏报（2026-09-11）**：坑95首版只改buildModelCatalog，却未给SessionController的static inject添加settings，实机返回gateway/internal cannot get property "settings" without inject；错误发生在逐供应商隔离之前，连不依赖该设置的Codex模型也消失。现给固定Host类添加settings/credentials依赖，测试从实际补丁提取注入表，用限制服务访问的Proxy执行目录，覆盖此回归；手机modelCatalog返回6个Codex模型、零failure，配置与7会话未变。

坑96设置：Fold工作台宽屏也沿用mobileDrawer，不能因祖先是drawer便把设置切成横向标签。mobile-settings.css.ts改为左分类/右内容，两列独立滚动，关闭按钮44px且不随内容滚出。原按钮CDP触摸能关闭，未复现按钮本身失效；系统返回旧实现只走WebView历史，现通过AndroidX OnBackPressedCallback优先调用设置自身关闭动作（含预测返回分发），再回退历史/Activity，不把UI遮罩当浏览历史。手机拒绝ADB INJECT_EVENTS，系统返回手势未自动化实测；右上关闭已实机CDP触摸验证，宽/窄视口检查单列证据。


97. **本机安卓开发的执行边界**：Debian ARM64 编译工具与 Android 目标 ABI 是两个概念，不能因 Google SDK 支持 ARM 目标就假定其 Linux 宿主二进制能运行。最小 Java 工具链使用 API36 stub 和 Debian API29 资源框架，lambda 存在 stub 兼容限制；完整 Gradle/Kotlin/Compose 链需独立验证。ADB 复用应用自己配对的身份，不能复制电脑密钥；签名留私有目录，不提交。程序 performClick 不等于物理触摸或 INJECT_EVENTS 已获授权。当前通用入口见根目录 docs/PAD-ANDROID-APP-SKILL.md。


98. **平板不是手机的ADB身份/工具链副本；长驻引擎token日志会轮转（2026-09-11）**：yingtian此前有adb二进制但没有应用配对prefs；经原生setAdbAllow/setAdbPair授权后T1已连接。已有系统imagegen skill不要另造同名副本；新android-app-dev显式引导其内置工具，真实Codex生图并在项目保存原图/提示词，Pillow仅做mipmap/adaptive资源打包。aapt先生成R.java再javac，支持res与图标；构建产物收据不等于安装成功，第一次真实安装被INSTALL_FAILED_USER_RESTRICTED拒绝，未绕过。验收见docs/PAD-ANDROID-APP-SKILL.md。Device.authenticate原来只查engine.log启动token，平板运行已久使日志轮转，现先复用壳dsh_engine_auth持久cookie并HTTP验证，凭据只在内存、无日志/报告输出。


99. **实时指挥与下一轮队列不同，模型也不等于具备视觉输入（2026-09-11）**：`session/prompt mode=queue` 将消息放入 next-turn，通常每轮消费一条；不是实时转向。正在运行的任务纠错用 mode=steer，或对自己创建且仍pending的消息调用 session/updateQueue action.kind=steer，避免反复重复构建。四会话实验使用同一cwd下按应用分子目录；只有图标会话写icons。选择会话模型会修改全局默认，逐轮设置后必须按revision恢复。平板 local-qwen/qwen38-flash-next 当前未声明image input，read_image真实失败，不能假称模型看过截图；协调者可读图反馈，GPT6图标会话保持仅图标职责。应用自身ADB连通不代表USB安装允许：本轮鹈鹕APK在无系统弹窗时直接被USER_RESTRICTED拒绝。桌面Home/跨页滑动通过仍不代表长按归组已验证。

100. **SME、KleidiAI 与应用集成需分别验证**：SME 属 CPU 扩展，不代表 NPU 开放。手写 smstart/smstop 入口必须保存/恢复 AAPCS64 的 d8–d15。不能将 NEON/I8MM/权重重排收益全部归因 SME；通用 CPU buffer 测试也不单独证明专有 kernel 执行。新进程加载不等于冷文件缓存；纯 ASR、对齐、解码分段与字幕导出必须分项计时。正式构建见根目录 docs/VOICE-KLEIDIAI-PRODUCTION.md，独立芯片探针不属于产品构建。

101. **优化ASR正式打包必须同时更新完整构建和壳重建入口（2026-09-12）**：scripts/build-voice-engine.py生成默认libdsh_voice_server.so和旧libdsh_voice_compat.so，验证固定源码/收据/16KiB/许可证；rebuild-codex-shell.py和build-baseline.py同时接入，防止下次完整构建退回旧ASR。KleidiAI使用运行时特性检测，不全局强制SME；失败回退只清理自己的进程，取消不重试。麦克风重试不得重复投递草稿，字幕skill记录实际engine与加载尝试。debug固定fixture仅验证应用域SSE，不能写成麦克风实测。旧skill需随新APK升级doctor兼容库项；详细结果见docs/VOICE-KLEIDIAI-PRODUCTION.md。
