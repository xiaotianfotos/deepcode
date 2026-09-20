# 上游集成维护

本项目采用 vendored Android 壳，来源和精确版本记录在 `source-provenance.json`。集成使用“上次导入版本、DeepCode 当前实现、新上游”三方比较，不将上游历史直接拼接到 NAS 仓库。原始许可证保留。升级在独立分支完成，验收前不得替换正式设备的 APK 或运行时。

## 0.14 系列接口边界

- DSH 0.1.5 的 `ui-layout` 是唯一布局服务提供方；responsive 0.3.3 只加移动端样式、平台桥和交互适配，不再复制 AppFrame。
- 工作台用 `SessionSurface` 和输入适配边界挂接标准会话组件。`patch-voice-deck.py` 对 0.1.2/0.1.5 分别检查锚点，0.1.5 提交走自己的 keyboard/附件就绪协议。
- 折叠裁剪由 `FoldContinuity` 发布导航宽度；物理外屏尺寸提示不得改变 WebView 的布局媒体查询或重新挂载输入框。真机双屏效果需另行验收。
- 悬浮球保留 DeepCode 的当前会话和内联编辑器交互，没有合入上游的会话选择窗口；相应收起测试覆盖释放 IME、焦点和面板窗口。
- Android 文件系统适配固定 0.1.5 的 `internals.linkFile`，保留上游沙盒与读写观察协议。升级仍须重新核对该内部扩展点。
- Codex context delegation 和附件持久化补丁从新引擎源生成，不得复用旧引擎完整 bundle。原生启动时覆盖的同名 asset 也必须同步。Codex 活动与历史导入生成的 `assistant/message` 必须包含 `stream: []`，满足新版本的结算与恢复协议；回归入口 `node --test scripts/test-codex-settlement.mjs`。
- 会话 v0→v3 迁移的 Android hardlink 回退只允许一次独占占位。`publish-exclusive-F7` 同时清除历史内联占位；不能只检查 marker 存在。`node android-shell/scripts/patches/tests/publish-exclusive-reclaim.test.mjs` 同时验证原始输入和实际 APK asset，覆盖发布、冲突、失败回收。旧数据文件保留，遇到空的新版本产物必须先停写、备份并核实来源，不自动批量删除用户文件。
- 带 `deepcode` 版本后缀的实验 APK 禁止通过上游 APK 更新器安装 stock shell，防止丢失下游扩展。

## 分 ABI 实验入口

`scripts/stage-upstream-experiment.py` 接受经哈希验证的 v0.14.0-preview release archive、其全新解压目录和 APK assets 目录，覆盖已经构建的本仓插件，并应用有锚点校验的引擎补丁。`--abi x86_64` 为默认值；ARM64 使用 `--abi arm64`，不同 ABI 分别校验固定哈希。它不会下载 ASR 模型或执行语音推理。运行前 source `scripts/env.sh`，所有路径均由调用方明确指定。

1. 在独立工作树中安装各插件的锁定依赖，构建 responsive、语音服务/输入、启动外观、遥控、工作台、手柄、折叠、Codex/Live、Android FS 与 Debian 插件。vendor Relay 使用仓库内的审阅产物。
2. 从上游 v0.14.0-preview release 下载 `snapshot-x86_64.tar.xz` 并与 MANIFEST 对照。脚本额外固定 SHA-256，拒绝其它快照。多线程 xz 解压到一次性本地目录，不在已安装应用数据上操作。
3. 调用 staging 脚本，再将目录中的 `usr`/`home` 用 tar + `xz -T4` 打包到实验工作树的 `android-shell/app/src/main/assets/snapshot.tar.xz`，更新同目录 snapshot.sha256。
4. 在 android-shell 执行 `./gradlew :app:testDebugUnitTest :app:assembleDebug -PruntimeAbi=x86_64 -PversionNameSuffix=-deepcode-upstream-test`，校验签名和 ZIP 对齐，再安装到独立模拟器。首次解压完成前不终止进程。

ARM64 使用同一 release 的 `snapshot-arm64.tar.xz`，Gradle ABI 为 `arm64-v8a`。首次安装按 [FIRST-DEPLOY.md](FIRST-DEPLOY.md) 从公开输入构建 Codex、ASR/对齐、PRoot native payload 与许可证并装配 Debian bundle，不要求既有维护者构建。升级设备上的用户 rootfs 不重置；签名不兼容时停止，不以卸载清数据绕过。

组合中的插件 ID 必须延续既有安装的 ID，例如 `android-codex`、`speech-services`，不能以包目录名生成新 ID。工厂配置合并按 ID 工作；改变 ID 会使同一插件加载两次。x86_64 仅停用 Codex host/Live，ARM64 保留正常挂载。

真机升级前备份已安装 APK、`files/usr`、用户 HOME/配置与 SharedPreferences，核对没有运行中的 Agent、快照事务或双屏租约。备份含私密数据，只放被忽略的本地目录。升级完成后对照会话与凭据保留情况，并分别验证本地模型和 Codex 的实际工具执行；单元测试、界面出现和插件状态均不能代替执行验收。

这是升级接入实验入口，不替代旧 ARM64 发布脚本。当前 Codex Android 原生执行器只提供 ARM64，x86_64 组合中保留其插件包但停用 host/Live 挂载；不能以模拟器通过宣称 Codex 登录或执行通过。Debian 原生 payload、ASR 推理与折叠双屏需要相应 ABI 另行打包验收。

一次性备份、比较报告、构建回执和模拟器截图放 `.local/`，不进入源码提交。正式化前必须完成升级数据迁移、ABI payload、模型目录过滤、插件开关及设备回归的门禁，才可合入发布主线。

## 旧会话升级门禁

DSH 0.1.5 的格式迁移会严格校验历史流片段引用及 system head 的时间顺序。下游原生 Codex 委托会话可能没有 DSH 系统提示词，部分历史活动消息也没有完整流结算引用，因此不能以会话列表可见推断历史可读。升级前必须逐条读取旧会话，并验证冷启动后继续同一会话。未通过时保留原日志和全部迁移产物，恢复已备份的 APK、运行时与配置；不得通过放宽校验、静默删除事件或补造历史来宣称迁移成功。此兼容层完成前，0.14 集成分支仍不能替换日常版本或合入发布主线。


### Relay / Live 历史兼容

`scripts/lib/legacy_codex_migration.py` 对固定哈希的 0.1.5-rc.1 迁移器生成两个窄补丁，staging 和 APK 启动资产必须一致。不是关闭上游校验：

- Relay 的 `relay_codex_activity` 合成工具消息以空 stream 独立保留，不终止仍在进行的文字 attempt；最终消息仍须引用完整、有序的全部原始 chunk。其它供应商、工具、缺失/错误来源引用继续拒绝。
- 已发布 GPT Live 的用户片段使用 `gpt-live:<thread UUID>:<segment UUID>` 身份，可能单独占一个没有 step 的完整 turn。只有匹配 Relay 路由、该身份、紧随同 turn 结束的首条用户消息，才加入一个零时长格式初始化框架：`step/start → 空 system/message → step/end`。system 来源明确标记 `deepcode-legacy-live-migration`；这不是模型调用或历史系统提示词。所有原事件顺序、消息内容、身份、时间与工具记录不变；未闭合或未知结构继续拒绝。
- 当前 Live 与 Codex 历史导入在写入第一条可见消息前预留空 system head，非流式 assistant 消息写入 `stream: []`，避免新会话重现旧格式问题。空 head 不包含 DSH 提示词。

回归使用真实 staged 引擎：设置 `DSH_MIGRATION_ENGINE` 为其 `usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai` 目录，运行 `node --test scripts/test-legacy-session-migration.mjs`。涵盖旧数据重读、拒绝未知结构、新 Live/历史导入写入与重读。用户备份还需单独逐条校验正文/时间/工具/展开后流片段一致、原文件哈希不变；结果仅留 `.local/`。这项兼容通过不代表 APK、设备升级或硬件语音已通过。


模型目录过滤对 0.1.5 的 `dsh-api-session-controller` 使用独立固定哈希资产 `model-catalog-host-015.js`，保持旧版本资产独立。过滤检查现有 credentials / pi-ai 鉴权来源，不将服务器暂时离线当作未配置，也不改变已保存的模型路由。运行 `DSH_MODEL_CATALOG_ASSET=android-shell/app/src/main/assets/patched/model-catalog-host-015.js node --test scripts/test-model-catalog.mjs`；设备上还需验证真实 Cordis 注入及设置变更后的菜单刷新。

Codex 上下文与图片边界可用 `DSH_CONTEXT_ENGINE=<上述引擎目录> node --test scripts/test-codex-context.mjs scripts/test-codex-preview-roots.mjs` 检查实际 staged bundle；不传该变量时仍检查旧发布输入，不能当作新引擎验证。设备脚本需显式 serial，不能作为无参数 Node 单元测试执行。

响应式前端补丁按版本隔离：0.3.3 使用 `responsive-client-033.js`，0.1.13 继续使用 `responsive-client.js`。壳核对包版本及原始/上次安装哈希后更新，禁止以新版布局组件覆盖旧版运行时；设置文案变更通过同一补丁入口更新，不重建用户快照。

### 旧附件入口迁移

0.1.5 的聊天组件已有附件选择入口。旧安装的 profile 合并会保留 `attachment-formats` 工厂插入块，导致两个附件按钮挤占手机输入栏。壳在引擎启动前，仅对已核对的 0.1.5-rc.1 聊天组件和 web profile 执行一次迁移：精确匹配没有额外配置或显式开关的旧工厂块，追加 `disabled: true`，原文件留本机备份并原子写入。自建 profile、自定义配置、分组插入和显式开关均不修改；插件包、附件及缓存保留。标记 `.attachment-native-entry-v1` 防止后续覆盖用户重新启用的选择。

响应式层通过输入槽位定位工具组，手机宽度下缩小间距，不依赖构建后的 CSS 类名；保留原有换行能力供大字号或额外插件使用。

## 会话选择与桌面回复连续性

`dsh-api-session-controller` 0.1.5-rc.1 的列表投影可能暂时隐藏当前会话，不能因此抹掉用于刷新恢复的持久选择。`scripts/lib/session_selection_patch.py` 对固定 SHA 的客户端做窄补丁：仅当 Manager 自身已明确清空选择时才清理持久值。未知上游版本拒绝应用；显式新建会话仍保持空白。`stage-upstream-experiment.py` 生成 `session-selection-client-015.js`，壳使用版本、基线 SHA 和已有补丁回执保护安装。可用 `node scripts/test-session-selection.mjs <生成的补丁文件>` 检查列表暂缺、恢复、明确清空与切换。

语音插件在列表未就绪时保留原生焦点；顶部回复与已提交语音的原会话绑定，空白首页不撤销该回复。切到另一有效会话或停用会清理绑定。空白首页不能直接发起新的桌面录音，避免把新指令隐式送到错误后端。界面恢复与权限选择分开：不自动将 DSH 会话改成 Codex，也不自动提高会话权限。

## 退役模型目录同步插件

不再内置 `@aiwayds/dsh-model-sync`。源码、默认挂载和注入清单已移除；Codex 模型发现、已配置供应商、本地 Qwen 和独立的 model-capability 插件保留。供应商配置、凭据、当前模型选择及 models-store 不属于清理范围。

`inject-all.py`、旧版 `overlay-fs-adapter.py` 和 0.14 的 `stage-upstream-experiment.py` 清理构建暂存区 web/headless 中的旧包及原厂挂载。用户自定义挂载不做猜测性改写：构建输入发现此类挂载时拒绝打包，需维护者明确处理。负控 headless-bad 不作为生产装配变更。

设备升级合并 profile 时可能恢复旧条目。`LegacyModelSyncProfile` 在启动前仅移除独立、未定制的原厂插入块（允许原有 enabled/disabled 选择），不触碰用户自定义配置、分组插入或其他插件。设备上原有包文件及模型数据不被主动删除。

打包与增量构建用 `android-shell/scripts/retired_plugins.py <snapshot.tar.xz>` 检查输入。旧回执对应的快照仍有该包时，须先按原 ABI、固定来源和哈希验证流程重新 staging、建立新快照回执；不要直接改哈希绕过检查。源码移除不代表已安装 APK 自动更新。

可复用回归：`python3 -m unittest discover -s android-shell/scripts -p test_retired_plugins.py`；Android JVM 测试 `LegacyModelSyncProfileTest` / `FactoryProfilePatchTest`；模型菜单使用当前引擎版本对应的 `test-model-catalog.mjs` 资产。
