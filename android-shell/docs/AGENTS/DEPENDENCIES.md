# DEPENDENCIES.md — 引用库权威登记

> 职责：APK 构建期依赖（gradle 5 项）、平台内置库、反射化零依赖项与内嵌引擎边界的登记与升级策略。版本号 2026-09-05 抄自 `app/build.gradle.kts`（依赖声明 :89-96）与根 `build.gradle.kts`；工具链实测：AGP 8.8.2 / Kotlin 2.0.21 / Gradle 8.11.1 / Java 17（compileOptions/target 17）。

## 1. 工具链（根 build.gradle.kts + gradle-wrapper.properties）

| 项 | 值 | 备注 |
|---|---|---|
| Android Gradle Plugin | 8.8.2 | 根 build.gradle.kts:2 |
| Kotlin Android 插件 | 2.0.21 | 根 build.gradle.kts:3（jvmTarget 17） |
| Gradle | 8.11.1 | gradle-wrapper.properties distributionUrl |
| compileSdk / targetSdk / minSdk | 36 / 34 / 26 | 理由见 docs/ANDROID-API-USAGE.md §5 |
| versionCode / versionName | 29 / 0.13.2 | app/build.gradle.kts:20-23（快照构建可加 -PversionNameSuffix） |
| 签名 | repoDebug（keystore/debug.keystore，CI 与本地字节兼容） | build.gradle.kts 签名块注释：跨机同签名是覆盖安装前提 |
| lint | checkReleaseBuilds=false / abortOnError=false | 离线环境无 lint 缓存，不在发布关键路径 |

## 2. gradle 依赖（app/build.gradle.kts:89-96，共 5 项，全部 implementation）

| 依赖 | 版本 | 用途（代码锚点） | 换掉的成本 |
|---|---|---|---|
| androidx.activity:activity-ktx | 1.10.1 | ComponentActivity 基类（MainActivity/ConsoleActivity）；ActivityResultContracts 目录/图片/权限三契约（ConfigTransfer.kt:412-421 PickImageContract、MainActivity.kt:84） | 自写 ActivityResult 分发与回调生命周期；选择器「字段初始化即注册」时序约束要重推 |
| androidx.core:core-ktx | 1.15.0 | FileProvider（外部阅读器打开，issue #52，manifest provider + res/xml/file_paths.xml 白名单）；ViewCompat/WindowInsetsCompat/WindowCompat（insets 三件套，MainActivity.kt:145-164） | FileProvider 可自实现 ContentProvider 但需自管 URI 授权与安全边界；insets 兼容层要回退平台 API 并全档自测 |
| androidx.dynamicanimation:dynamicanimation | 1.1.0 | 悬浮球 spring：SpringAnimation/SpringForce/DynamicAnimation（OverlayService.kt:369-408 贴边吸附 380/0.8） | 手写 spring 微分方程或降级 ValueAnimator；吸附手感需重调参 |
| org.apache.commons:commons-compress | 1.28.0 | 快照 xz tar 流式解压（TarArchiveInputStream/XZCompressorInputStream，SnapshotExtractor.kt:22-24）——154MB 快照逐文件解压 + owner-only 权限 + exec xattr 全走它 | 自实现 xz+tar 成本极高；换库需重验 4 万+ 文件流式解压与 symlink 保留 |
| org.tukaani:xz | 1.10 | xz 解码算法后端（commons-compress 依赖它做 XZ） | 与 commons-compress 绑定，单独换无意义 |

### 2.1 使用面实测（grep import 计数）

| 依赖 | 使用文件数 | 明细 |
|---|---|---|
| activity-ktx | 4 | MainActivity、ConsoleActivity、GuideChrome（ComponentActivity 引用）、ConfigTransfer（契约） |
| core-ktx | 6 | MainActivity、ConsoleActivity、WebUiChrome（insets）、EngineService、NotifyCenter（NotificationCompat）、FileIncoming |
| dynamicanimation | 1 | OverlayService（唯一 spring 使用方） |
| commons-compress | 2 | SnapshotExtractor（解压主路径）、EngineManager（快照刷新复用同一套 tar/xz 流） |
| xz | 0（间接） | 经 commons-compress 的 XZCompressorInputStream 间接使用 |

### 2.2 相关构建配置（build.gradle.kts 实测）

- `buildConfigField TERMUX_VERSION = "0.118.3"`（:24）：快照内 Termux 基线版本号，用于运行时一致性展示/诊断。
- `androidResources.noCompress += "xz"`（:33，注释：snapshot.tar.xz 已 xz 压缩，AAPT 二次压缩破坏流式读取）——commons-compress 依赖拿到原始字节流的前提。
- mergeDebugAssets/mergeReleaseAssets doFirst 校验（:74-89）：assets/snapshot.tar.xz 缺失即抛 GradleException 并给出下载指引（快照大文件不入库）。

## 3. 平台内置（无 gradle 依赖，勿加重复坐标）

- **org.json**（JSONObject/JSONArray/NULL 语义）：Android 平台内置，9 个文件使用——AndroidBridge、AdbState、EngineProbe、FileIncoming、OverlayLiveFeed、OverlayPanel、UpdateManager、OverlayService、WatchdogV2。注意桥返回 JSON 以真机内置实现为准（NULL 处理曾有 `optString` 对 NULL 返 "null" 字面量的坑，悬浮球会话标题已判空）。
- **手写 WebSocket**（MuxClient.kt，185 行）：java.net.Socket + Base64 + MessageDigest(SHA-1) + SecureRandom 完成 RFC6455 握手/帧解析/掩码——不引 OkHttp 等网络库（换掉的成本 = 新增 3-4MB 依赖面 + 回环信任围栏行为重验，且 downlink-only 语义要重验）。
- **其他 java.* 面**： HttpURLConnection（DownloadSaver/EngineProbe/OverlayService.postRpc/OverlayPanel.postRespond/UpdateManager）、ProcessBuilder（EngineManager/ConsoleSession/AdbState spawn adb 与 node）、java.nio.file.Files（EngineManager）——均标准库，零依赖。

## 4. 反射零依赖项

- **Shizuku**（ShizukuSupport.kt:18-58）：`Class.forName("rikka.shizuku.Shizuku")` 反射调 pingBinder/checkSelfPermission/getVersion 三静态方法，仅探活状态展示（EngineStartFlow.kt:393 引导页状态行）；gradle 不引入 dev.rikka.shizuku:*（省约 57KB aar），未安装/未运行优雅降级（文件头注释 2026-08-23 零依赖化决议）。不参与自写 ADB 提权链（AdbState）。若未来需 Shizuku newProcess（api 13.1.5 非公开）才评估转正式依赖。

## 5. 内嵌引擎与快照依赖（不进 gradle 的第二依赖面）

- 引擎：`@deepseek-ai/dsh` 0.1.1-rc.2，快照内 `usr/lib/node_modules/@deepseek-ai/dsh`（EngineManager.kt:31 dshBin），web 模式监听 127.0.0.1:3080（--no-open，EngineManager.kt:559-561）；APK 版本与引擎版本解耦，桥协议版本化（androidBridge.version）。
- 快照内 npm 依赖树（@deepseek-ai/* 包、react/shiki 等 cordis 装配）与 Termux 包（node/git/android-tools 36 等）由协调仓 `scripts/build-snapshot-013.mjs` 构建注入，**不在本仓库管理**。
- 许可合规边界：全部第三方清单与许可证全文随包分发在 `assets/licenses/`（THIRD_PARTY_NOTICES.md + GPL-2.0/GPL-3.0/LGPL-2.1/LGPL-3.0 四全文）；清单由协调仓 `scripts/check-third-party.mjs` 从快照 dpkg 清单生成（GPL 义务硬门禁）。本文件只登记构建期依赖；快照内依赖以该文件为权威。

## 6. 升级策略建议

1. **低频原则**：依赖面服务于「稳定壳 + 云端自包含构建」，无功能需求不主动升级；AGP/Kotlin 升级必须连带验证 .github/workflows/build-apk.yml 与本地 `gradlew assembleDebug` 双链一致。
2. **必测真机回归项**（任何依赖变更后）：快照全量解压（指纹翻转 + `.snapshot-fingerprint` 更新，勿中途杀进程）；引擎冷启动探活与市场安装（linker64 回退 + termux-exec preload 链）；悬浮球三窗口显示/吸附 spring 手感（dynamicanimation 敏感）；SAF 目录选择与 All Files Access 分代（activity-ktx 契约敏感，26-29/30+/33+ 三档）；FileProvider 外部打开白名单（core-ktx）。
3. **commons-compress/xz 锁定**：与快照 tar 产物格式强耦合，仅在快照构建链同步验证后升级；解压失败 = 用户首启白屏级事故。
4. **新增依赖**：先过 GPL/许可合规（登记 scripts/third-party-licenses.json + THIRD_PARTY_NOTICES.md），再评估体积与 ABI 面——当前零 JNI/.so 依赖，保持该状态。
