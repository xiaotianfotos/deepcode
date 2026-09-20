# DEPENDENCIES.md — 构建与运行时依赖登记

> 登记 APK 构建依赖、平台内置库与内嵌引擎的边界。实际版本以 [app/build.gradle.kts](../../app/build.gradle.kts)、根 Gradle 配置和各组件锁文件为准；首次装配见 [FIRST-DEPLOY.md](../../../docs/FIRST-DEPLOY.md)。旧源码行号和使用次数不作为当前契约。

## 1. 工具链（根 build.gradle.kts + gradle-wrapper.properties）

| 项 | 值 | 备注 |
|---|---|---|
| Android Gradle Plugin | 8.8.2 | 根 build.gradle.kts:2 |
| Kotlin Android 插件 | 2.0.21 | 根 build.gradle.kts:3（jvmTarget 17） |
| Gradle | 8.11.1 | gradle-wrapper.properties distributionUrl |
| compileSdk / targetSdk / minSdk | 36 / 34 / 26 | 理由见 docs/ANDROID-API-USAGE.md §5 |
| versionCode / versionName | 38 / 0.14.0-preview | app/build.gradle.kts（构建可加 -PversionNameSuffix） |
| debug 签名 | 本地存在 keystore/debug.keystore 才使用 repoDebug，否则使用 AGP 本机调试密钥 | 源码不分发密钥；新 checkout 不保证与已有安装同签，覆盖更新必须校验证书 |
| lint | checkReleaseBuilds=false / abortOnError=false | 离线环境无 lint 缓存，不在发布关键路径 |

## 2. Gradle 产品依赖（implementation）

| 依赖 | 版本 | 用途（代码锚点） | 换掉的成本 |
|---|---|---|---|
| androidx.activity:activity-ktx | 1.10.1 | ComponentActivity 基类（MainActivity/ConsoleActivity）；ActivityResultContracts 目录/图片/权限三契约（ConfigTransfer.kt:412-421 PickImageContract、MainActivity.kt:84） | 自写 ActivityResult 分发与回调生命周期；选择器「字段初始化即注册」时序约束要重推 |
| androidx.core:core-ktx | 1.15.0 | FileProvider（外部阅读器打开，issue #52，manifest provider + res/xml/file_paths.xml 白名单）；ViewCompat/WindowInsetsCompat/WindowCompat（insets 三件套，MainActivity.kt:145-164） | FileProvider 可自实现 ContentProvider 但需自管 URI 授权与安全边界；insets 兼容层要回退平台 API 并全档自测 |
| androidx.dynamicanimation:dynamicanimation | 1.1.0 | 悬浮球 spring：SpringAnimation/SpringForce/DynamicAnimation（OverlayService.kt:369-408 贴边吸附 380/0.8） | 手写 spring 微分方程或降级 ValueAnimator；吸附手感需重调参 |
| org.apache.commons:commons-compress | 1.28.0 | 快照 xz tar 流式解压（TarArchiveInputStream/XZCompressorInputStream，SnapshotExtractor.kt:22-24）——154MB 快照逐文件解压 + owner-only 权限 + exec xattr 全走它 | 自实现 xz+tar 成本极高；换库需重验 4 万+ 文件流式解压与 symlink 保留 |
| org.tukaani:xz | 1.10 | xz 解码算法后端（commons-compress 依赖它做 XZ） | 与 commons-compress 绑定，单独换无意义 |
| io.github.webrtc-sdk:android | 150.7871.01 | Live 音视频传输 | 需验证音视频生命周期及原生 ABI 兼容性 |
| dev.rikka.shizuku:api | 13.1.5 | Shizuku API 接口 | 需验证权限、服务连接和降级路径 |
| dev.rikka.shizuku:provider | 13.1.5 | Shizuku Binder 提供器 | 与 API 和 Manifest 配置配套 |

本地测试另用 `junit:junit:4.13.2`、`org.json:json:20240303`；仪器测试使用 `androidx.test.ext:junit:1.2.1` 与 `androidx.test:runner:1.6.2`。这些测试依赖不作为产品运行库装配。

### 2.1 相关构建配置

- `buildConfigField TERMUX_VERSION = "0.118.3"`（:24）：快照内 Termux 基线版本号，用于运行时一致性展示/诊断。
- `androidResources.noCompress += "xz"`（:33，注释：snapshot.tar.xz 已 xz 压缩，AAPT 二次压缩破坏流式读取）——commons-compress 依赖拿到原始字节流的前提。
- mergeDebugAssets/mergeReleaseAssets doFirst 校验（:74-89）：assets/snapshot.tar.xz 缺失即抛 GradleException 并给出下载指引（快照大文件不入库）。

## 3. 平台内置（无 gradle 依赖，勿加重复坐标）

- **org.json**（JSONObject/JSONArray/NULL 语义）：Android 平台内置，9 个文件使用——AndroidBridge、AdbState、EngineProbe、FileIncoming、OverlayLiveFeed、OverlayPanel、UpdateManager、OverlayService、WatchdogV2。注意桥返回 JSON 以真机内置实现为准（NULL 处理曾有 `optString` 对 NULL 返 "null" 字面量的坑，悬浮球会话标题已判空）。
- **手写 WebSocket**（MuxClient.kt，185 行）：java.net.Socket + Base64 + MessageDigest(SHA-1) + SecureRandom 完成 RFC6455 握手/帧解析/掩码——不引 OkHttp 等网络库（换掉的成本 = 新增 3-4MB 依赖面 + 回环信任围栏行为重验，且 downlink-only 语义要重验）。
- **其他 java.* 面**： HttpURLConnection（DownloadSaver/EngineProbe/OverlayService.postRpc/OverlayPanel.postRespond/UpdateManager）、ProcessBuilder（EngineManager/ConsoleSession/AdbState spawn adb 与 node）、java.nio.file.Files（EngineManager）——均标准库，零依赖。

## 4. 可选权限服务

Shizuku 已声明 `api` / `provider` 13.1.5 构建依赖（MIT），用于当前虚拟屏等平台适配。打包依赖不等于用户已经安装、启动或授权 Shizuku；缺少服务或权限时仍需明确降级。无线 ADB 配对是另一条授权链，不能从电脑 ADB 在线推断应用已经获权。

## 5. 内嵌引擎与快照依赖（不进 gradle 的第二依赖面）

- 引擎：`@deepseek-ai/dsh` 0.1.5-rc.1，快照内 `usr/lib/node_modules/@deepseek-ai/dsh`（EngineManager.kt:31 dshBin），web 模式监听 127.0.0.1:3080（--no-open，EngineManager.kt:559-561）；APK 版本与引擎版本解耦，桥协议版本化（androidBridge.version）。
- 公开基座的来源和摘要登记在 [source-provenance.json](../../../docs/source-provenance.json)。当前 `scripts/first-build.py` 在固定基座上装配本仓锁定的插件、补丁和原生组件；不要求私有协调仓，也不宣称从源码重编译全部 Termux/Node 包。
- 许可合规边界：全部第三方清单与许可证全文随包分发在 `assets/licenses/`（THIRD_PARTY_NOTICES.md + GPL-2.0/GPL-3.0/LGPL-2.1/LGPL-3.0 四全文）；本仓 `android-shell/scripts/check-third-party.mjs` 校验快照依赖清单（GPL 义务门禁），新增原生组件还需保留其许可证与来源回执。快照内依赖应以实际装配内容及相应第三方清单核对。

## 6. 升级策略建议

1. **低频原则**：依赖面服务于「稳定壳 + 云端自包含构建」，无功能需求不主动升级；AGP/Kotlin 升级必须连带验证 .github/workflows/build-apk.yml 与本地 `gradlew assembleDebug` 双链一致。
2. **必测真机回归项**（任何依赖变更后）：快照全量解压（指纹翻转 + `.snapshot-fingerprint` 更新，勿中途杀进程）；引擎冷启动探活与市场安装（linker64 回退 + termux-exec preload 链）；悬浮球三窗口显示/吸附 spring 手感（dynamicanimation 敏感）；SAF 目录选择与 All Files Access 分代（activity-ktx 契约敏感，26-29/30+/33+ 三档）；FileProvider 外部打开白名单（core-ktx）。
3. **commons-compress/xz 锁定**：与快照 tar 产物格式强耦合，仅在快照构建链同步验证后升级；解压失败 = 用户首启白屏级事故。
4. **新增依赖**：先过 GPL/许可合规（登记 scripts/third-party-licenses.json + THIRD_PARTY_NOTICES.md），再评估体积与 ABI 面。当前已有原生组件；新增项必须核对来源、摘要、许可证、目标 ABI、ELF/ZIP 对齐及动态库依赖闭包，不能假定 `.so` 文件存在就能执行。
