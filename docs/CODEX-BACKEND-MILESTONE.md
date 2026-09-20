# Codex Android 会话后端里程碑

状态：2026-09-10，核心里程碑已完成并部署小米平板 M367FC（Android 17）。仅支持下述明确的平台边界。

## 用户确认的架构

DSH 前端和原语音/手柄/Voice Deck 保留。新会话选择 Codex Harness 后，规划、模型上下文和工具执行由本地 Codex App Server 管理；每个 DSH Session 绑定独立 Codex Thread。设置页通过 `account/login/start {type:chatgpt}` 获得授权链接，在安卓系统浏览器打开；Codex 自己监听回调、维护凭据，插件只呈现白名单账号字段。

## 实现位置

- `android-shell/plugins/dsh-android-codex`：平台配置、JSONL client、账号 API、设置 UI。
- `android-shell/vendor/relay-dsh-plugin-codex`：固定 npm 0.2.3-rc.1，MIT，上游源码/发行完整性见 SOURCE.json。以 `codexExecutionMode:native` 运行，未启用 Relay 的 DSH 动态工具增强模式。
- `android-shell/vendor/relay-dsh-plugin-session-import`：固定配套 0.2.3-rc.1，负责其前端依赖。
- `android-shell/app/src/main/cpp/codex/launcher.c`：进程父退出信号；独立 Shell 入口恢复 Termux 库和 exec 环境。Codex 自身不加载 Termux exec hook，只加载自有 `shell_identity.c` 小适配：将当前 UID 的 passwd Shell 指向已配置入口，不改 UID/HOME 或权限字段。Codex 上游从 passwd 选 Shell，不读取 SHELL；仅设环境变量会落回 Android sh，Node/Git 因直接 exec 应用数据目录而失败。
- `scripts/prepare-codex-runtime.py`：验证固定 tarball 的 SHA-256/SHA-512，再准备 APK 原生库；不执行 npm 安装脚本。
- `scripts/probe-codex-android.py`：独立工作目录的无账号协议探针。

## 构建

先在插件目录运行 `node build.mjs`，然后仓库根目录：

```bash
source scripts/env.sh
python3 scripts/overlay-fs-adapter.py arm64 --codex
python3 scripts/build-baseline.py arm64 --codex
```

产物 `artifacts/dsh-v0.13.3-local-codex-arm64.apk`；保留当前 ASR、PS5、Deck 与折叠 UI。基础 Node/DSH 仍来自已校验快照，未宣称全量重编译。此构建目前只支持 ARM64。此前 local-voice-debug 包作为回退保留。

## 运行时与限制

- 社区 `@mmmbuto/codex-cli-termux=0.153.3`，源码项目 DioNanos/codex-termux。其协议版本与 Relay 原依赖 0.149.0 不同，因此必须进行我们自己的集成测试。
- 无账号探针先验证版本号、initialize、account/read、model/list、thread/start 和命令执行；随后通过平板自身浏览器授权完成真实 GPT-6 Astra 推理，证据分开保留。
- **实测该 runtime 的 readOnly command/exec 仍能写入测试目录。** 因而当前适配拒绝只读/工作区隔离的执行请求，不自动把用户权限升级；必须在会话中明确选择完全访问。实际 OS 边界为本 Android 应用已获授权的文件。外部目录仍检查原生存储权限。
- GPT-6 使用 code-mode 工具，必须启用 `features.code_mode_host=true` 并打包独立 `libdsh_codex_host.so`。固定 runtime 没有辅助进程路径覆盖入口；构建时将两处 20 字节 `codex-code-mode-host` 等长替换为 Android 可提取的 `libdsh_codex_host.so`，断言出现次数，保留原始/最终 SHA-256，不修改执行或授权逻辑。改名依据固定 upstream rust-v0.153.2 的 install-context 路径解析；不能只靠 PATH 或已移除的环境变量。
- 验收过程没有读取或迁移 Ubuntu Codex 凭据。账号状态和登录链接仅由经过 DSH 登录鉴权的 API 提供；写操作还校验会话内存 CSRF token。App Server 的 stderr 不进入 DSH 会话日志，避免授权链接泄露。

## 使用

1. 设置 → 插件 → 插件配置 → Codex：启用后端，点击“登录 Codex”，在系统浏览器完成账号授权。当前验收平板已登录。
2. 新建会话时选择 Codex Harness，再从原模型菜单选择账号可用模型；实测 GPT-6 Astra。
3. 在该会话权限菜单明确选择完全权限。原 DSH 会话的权限和模型默认值不变。
4. 继续使用原聊天输入、语音草稿或 PS5 工作台。关闭后端会拒绝新 Codex 请求；重新启用可继续原 Thread。

## 验收结果与边界

| 项目 | 验证结果 |
|---|---|
| 浏览器登录 | 真机点击 App Server 登录入口、Chrome 授权回调、更新应用后保持账号状态通过 |
| 模型与输出 | GPT-6 Astra 真实回答、流式文本、DSH 原 Markdown 渲染通过 |
| Agent 工具 | 原生 Codex code-mode → Shell；文件创建/读回、Node 24.18.0、Git 2.55.0 通过 |
| 会话恢复 | 多次更新/冷启动后恢复原 Thread，并记住之前上下文，无替代 Thread |
| 多会话 | 两个独立 Codex Thread 并发执行；分别操作验收文件并核对物理内容 |
| 取消 | 输出过程中从 DSH 取消，记录 aborted/user；后续可继续会话 |
| 手柄/工作台 | 两个 Codex + 两个原 DSH 泳道；双列显示、原 Markdown、L1/R1 焦点与末尾光标、○ 原生发送、回复渲染通过；恢复原绑定 |
| 语音 | 原麦克风入口在 Codex 泳道保留；本次不重复验收声学识别准确率，沿用此前 0.6B 实机结果 |
| 开关 | 停用后请求得到明确错误，启用后继续同一会话，账号保持 |
| 权限 | 实测拒绝 workspace-write，测试文件未创建；不会自动升级为完全访问 |
| 审批/提问映射 | Relay 协议测试覆盖 request/reply、取消与归属；当前 Android 完全权限模式不具备 Linux 沙盒升级语义，未声称通过真实沙盒升级审批 |
| DSH 后端 | 原会话及 UI 继续存在；本轮原局域网模型服务不可达，未冒充完成其新的在线推理回归 |
| 发行一致性 | 本地 APK、设备安装 APK、snapshot 指纹和 6 个原生文件哈希一致；签名、16 KB 对齐及构建门禁通过 |

## 平台兼容修复

- Relay 前端依赖必须显式挂载供 DSH 发现，client-only 行不创建第二个后端。
- Relay 恢复 Thread 时传递既有 permissions；Android 权限/停用错误不被包装成断线。
- 去掉 Relay 强制切回聊天 tab 的 AdvancedDebugGuard，保留工作台及轨迹视图。
- 原生辅助文件名映射和 passwd Shell 适配见上述运行时说明；不替换 Codex 的规划/工具决策。

## 当前验证证据

- `validation/2026-09-10-codex/runtime-probe.json`：已安装 APK 的原生 launcher、模型目录、Thread、Shell、Node 24.18.0、Git 2.55.0 通过；同一报告保留 readOnly 未隔离的失败证据。
- `validation/2026-09-10-codex/android-plugin-tests.txt`：9/9 通过；凭据字段过滤、登录回调、CSRF、忙态退出保护、登录/取消串行化、发送中与乱序完成事件保护、进程崩溃和重连。
- `validation/2026-09-10-codex/relay-protocol-tests.txt`：固定上游源码的 session-runtime 与 connection-status，27/27 通过。最初连同桌面安装器测试运行时另有 3 项缺少桌面 @openai/codex 依赖，未将其计入通过范围；Android 使用本项目自己的 runtime 探针。
- `validation/2026-09-10-codex/sessions.json` 与 `thread-isolation.json`：两个独立的 Codex 验收会话，工程目录 `files/home/projects/codex-validation`。未修改用户原有泳道绑定。

- `validation/2026-09-10-codex/first-real-response.json`：平板经自身浏览器授权后，真实 GPT-6 Astra 流式返回 `CODEX_ANDROID_AUTH_OK`，记录独立 Codex Thread ID，非模拟响应。

- `cancel.json` 保留真实流式输出中断及 `turn/end: aborted/user`；早期工具/恢复失败记录也保留，后续复测以 `*-fixed` 和最终版本记录为准。

- `termux-tools.json`：真实 GPT-6 工具调用经默认 Shell，Node 24.18.0 / Git 2.55.0 / 文件读回全部退出码 0。
- `permission-denied-final.json`：工作区限制模式被拒绝，`should-not-exist.txt` 未生成；随后恢复验收会话原本的完全访问设置。

## 最终产物

- APK：`artifacts/dsh-v0.13.3-local-codex-arm64.apk`。
- 回执：`validation/2026-09-10-codex/release.json` 与 `build.json`。
- 复核入口：`scripts/verify-codex-release.py <serial>`；真实会话探针 `scripts/test-codex-session.py`，工作台回归 `scripts/test-codex-deck.mjs`。
- 失败的早期验收记录保留用于定位兼容问题；最终成功证据为 `termux-tools.json`、`final-native-check.json`、`deck.json`、`reenabled-backend.json`、`release.json`。

## 2026-09-10 设置入口修订

Codex 配置卡注册至标准 `settings.plugin.item`，配套 `android-codex` Host settings namespace 用于发现；账号操作继续走鉴权 API，凭据不进入 settings JSON。不再单列 Codex 设置导航。全部插件清单继续显示真实挂载模块。账号 API 在返回前将邮箱本地部分中段替换为 `****`，包括短邮箱，不在 DOM 属性保留完整邮箱。

实机设置回归通过：`plugin-settings.json` / `plugin-settings.png`；账号仍登录、邮件中段已脱敏、原独立导航已移除、插件配置卡可切换并恢复原启用状态。新版 APK/设备哈希复核见更新后的 `release.json`。

2026-09-10 补充切换验证：在真机新会话的“标准模式”菜单点击 Codex，前端显示 Codex / GPT-6-Astra，host 投影同时确认 `agentPreset=relay-codex`、`modelSelection.next.provider=relay-codex`；未发送消息，见 `harness-selection.json`。已有聊天的 Harness 是只读标签，DSH 原版在首个 turn 开始后以 `agent-preset/locked` 拒绝更换，模型菜单不负责更换 Harness。各会话共享 App Server 进程但使用独立 Thread；进程启停遵循下述生命周期。

### Codex 启停生命周期（本地源码，设备更新另行安排）

启用时，Relay 激活会启动共享 App Server；显式开启也会等待初始化完成，让后续会话请求无需等待账号轮询。关闭时先阻止新工作，再释放空闲进程；活动 turn、启动工作请求和初始化未完成时拒绝关闭，保留配置与工作。停用后的账号状态查询只返回脱敏缓存，不启动进程或读取授权原文。登录中关闭只取消当前登录流程，不退出已授权账号。

初始化报错或超时会清理该次启动的子进程，返回未连接和可重试错误。关闭等待有超时上限，无法确认进程退出时明确返回清理错误，停用配置保持不变。旧子进程的消息、退出和 pending 结算不能影响新实例。Cordis 卸载为永久销毁当前 client，与可恢复的 enabled 开关分开；二者均不删除账号授权、会话映射或项目。

Android 插件显式启用固定 Relay 的激活恢复补丁：重新开启后，同一个适配器重新初始化模型和连接状态，`whenReady`、模型解析、工作区会话与终端入口读取当前就绪状态，保留会话绑定。启动失败后的账号状态轮询返回断开和可重试错误，不重复启动；修正问题后需显式重新开启。默认非 Android 路径保留上游行为。补丁范围及 sourcemap 边界见 `android-shell/vendor/relay-dsh-plugin-codex/ANDROID-PATCHES.md`。本地消费者测试使用实际 vendor 实现和模拟 DSH 服务；完整界面与设备验证须单独完成。

可复用本地检查：`node --test android-shell/plugins/dsh-android-codex/tests/*.test.mjs` 和 `npm run build --prefix android-shell/plugins/dsh-android-codex`。测试覆盖真实 JSONL 子进程、初始化错误/超时、启停竞态和明确的清理失败；运行回执只放 `.local/validation/`。APK 更新后仍须按 P01 任务验证设置页、进程、模型菜单与旧会话。

### 后续修复：原生上下文与图片预览（2026-09-10，已部署并通过真机验证）

之前主对话 adapter 已经不转发 DSH system，但外层仍生成约 4,603 字符的 DSH
系统提示词、30 个工具 schema 及运行时策略注入，并写入 DSH 轨迹。现在通过
可选 `agent/context-delegation` 在组装前接管：Codex 会话只接收真实用户输入，
跳过 DSH prompt/pre-step 注入及辅助提示词改写；普通 DSH 保留原流程。
调度、取消、会话和 UI 仍由 DSH 承载，Codex 拥有模型上下文及工具执行。
Android 执行权限守卫继续有效。历史注入记录不删除，新轮次不再新增。

Skills 和项目说明交给 Codex 原生机制：`.agents/skills/<name>/SKILL.md`、
Skill 配套文件、项目 `AGENTS.md` 实机通过。`$native-boundary-check` 从原生 Skill
读取配套 proof.txt，返回 `CODEX_SKILL_RESOURCE_OK`，同时遵循项目说明返回
`CODEX_PROJECT_INSTRUCTIONS_OK`；DSH 当轮 request/header 的 system 字符数和 tools
数量都为 0，user/message 来源只有 user。证据：`native-context-skill.json`、
`native-context-boundary.json`。DSH 专用 skill 工具和远程 provider 不自动导出；
共享可移植 Skills 使用 `.agents/skills`，依赖 DSH 工具的技能需要独立适配。

图片预览失败有两个原因：Relay 白名单遗漏独立 CODEX_HOME；附件持久化尝试
同步应用无权访问的 `/data/data`。修复后按实际 CODEX_HOME 校验生成图片，附件
fsync 限于 canonical app filesDir；仍拒绝路径越界和符号链接逃逸。启动资产
`assets/patched/attachment-local-index.js` 同步更新，避免旧资产覆盖 snapshot。
旧失败文字保留；修复后的新轮次已经产生真正的 image block，WebView 解码并显示
1254×1254 原图。证据：`native-image-preview-final.json`、`native-image-display.json/png`。
此前 `native-image-preview*.json` 中间失败记录保留用于定位，不作为成功凭据。

原图已从应用进程原样导出到平板
`/storage/emulated/0/work/codex-generated-20260910-01a08a50.png`，2,139,625 字节，
源和副本 SHA-256 均为 `c379b968b4507d8f5a9ef15c8054899bdb43b591243ab72aa1115f03af985564`。
见 `recovered-image.json` 和实际命令输出 `image-export-command.json`。

验证：6 项上下文/图片专项测试、9 项账号/transport 测试通过；最终 release
校验除了 APK/snapshot/native 哈希，还逐字节核对已装机附件模块和 APK 启动资产。
上述 Pad 验收 APK SHA-256 为 `9892e97d9f11b33b08ab5bc353015390450467750951af5a6e35ee00e7e6b18b`，
snapshot 为 `67390c2dda891c6e54a711faeb3be03112038df9efafb547b452790ea84aff90`。

### 新 Fold 部署发现的模型参数问题（2026-09-10）

首次请求确实执行了原生 Codex 工具，但 `request/context` 仍是 DeepSeek 路由。
原因是跳过 `system-prompt/assemble` 同时绕过 DSH 的模型选择捕获监听。
现在 Relay 通过独立的会话投影快照和 `agent/request` 传递 model/effort，保持零 DSH 提示词注入。
定向测试覆盖模型切换期间的快照、effort 缺省清理和错误路由拒绝；Fold 更新后的验收以
`validation/2026-09-10-fold-deploy/` 内后缀 fixed 的请求记录和最终 APK 哈希为准。


### Codex 插件增量打包

修改 Android Codex 插件后，必须将新构建的 `lib/index.js`、`lib/client.js` 写入内置快照的对应插件目录，并同时更新快照中的 Relay `lib/host-plugin.js` 与 `assets/patched/codex-image-input.js`。只更新 Android 壳或 vendor asset 不会升级快照内的 Android 插件。快照升级采用现有事务流程，保留用户数据；发布前核对 APK、快照和设备落地文件的 SHA。
