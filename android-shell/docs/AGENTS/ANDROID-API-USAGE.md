# ANDROID-API-USAGE.md — android.* 使用面分组登记

> 职责：壳源码 android/androidx 平台 API 的按域分组清单与 API 等级约束。统计口径：`grep "^import android"` 当场实测——android.* 导入行 205 处、去重 85 类，分布于 33/35 个源文件（仅 EngineProbe.kt 与 DebugLogExporter.kt 零 android 导入，纯 java.net/java.io）；androidx 导入 23 处、去重 6 类。源码根 `app/src/main/java/com/dsharnessmobile/shell/`。

## 1. 按域分组（85 类去重口径）

| 域 | 类 | 关键调用点 |
|---|---|---|
| WebView 全家桶（8） | WebView、WebViewClient、WebChromeClient、WebSettings、WebResourceRequest、JsResult、ValueCallback、JavascriptInterface | MainActivity.kt:313-393（配置 + shouldOverrideUrlLoading/onReceivedError/onPageFinished/onShowFileChooser/onJsAlert）、ConsoleActivity.kt:79-117、WebUiChrome.kt（主题/字体回推） |
| 通知（4） | NotificationChannel、NotificationManager、PendingIntent、（androidx）NotificationCompat | NotifyCenter.kt（task/todo/auth 三渠道+节流合并）、MainActivity.kt:608-632（showTestNotification）、EngineService.kt（前台通知）、WatchdogV2.kt |
| 存储 SAF / MediaStore（6） | DocumentsContract、MediaStore、ContentValues、Environment、MediaScannerConnection、provider.Settings | ConfigTransfer.kt:80-306（Directory/MediaPick 双控制器 + PickImageContract :412）、DownloadSaver.kt:185-193（MediaStore.Downloads + IS_PENDING + 200MB 上限）、EngineManager.kt:262（MediaScannerConnection.scanFile）、LogCollector.kt:76（落盘路径分代） |
| IME 输入法（3） | InputMethodService、InputMethodManager、EditorInfo（全限定引用） | AdbKeyboardService.kt:30-118（ADBKeyboard 协议 IME）、OverlayPanel.kt:241,535（IME_ACTION_SEND/DONE） |
| 悬浮窗 WindowManager（4） | WindowManager、PixelFormat、view.Gravity、MotionEvent | OverlayService.kt:173-256（TYPE_APPLICATION_OVERLAY 三窗口：球/光环/面板）、OverlayController.kt:33-65（canDrawOverlays 判定 + ACTION_MANAGE_OVERLAY_PERMISSION 授权页引导） |
| FileObserver（1） | os.FileObserver | OverlayLiveFeed.kt:26-50（.live.ndjson 的 MODIFY/CREATE + debug 注入文件 .overlay-test-pending） |
| 动效（9） | animation.ObjectAnimator、ValueAnimator、AlphaAnimation、PathInterpolator、graphics.LinearGradient、graphics.Shader、（androidx）SpringAnimation、SpringForce、DynamicAnimation | ShimmerTextView.kt（Deep diving 扫光，gradient 250% 平移）、OverlayService.kt:369-408（贴边吸附 spring 380/0.8）、OverlayHalo.kt:54-59（WORKING 呼吸脉动）、GuidePageRenderer.kt（引导页 stagger 入场）、DsUi.kt:8（PathInterpolator 缓动） |
| WakeLock（1） | os.PowerManager | MainActivity（FLAG_KEEP_SCREEN_ON 窗口前台常亮，onPause 清除，不再持 SCREEN_BRIGHT_WAKE_LOCK）、WatchdogV2.kt:125（PARTIAL_WAKE_LOCK 前台保活 + 30min 续期） |
| 剪贴板（2） | ClipData、ClipboardManager | MainActivity.kt:487-497、WebUiChrome.kt（copyText 桥）、ConsoleActivity.kt:154-163 |
| 广播（3） | BroadcastReceiver、IntentFilter、content.Intent | BootReceiver.kt（BOOT_COMPLETED）、AdbKeyboardReceiver.kt（ADB_INPUT_TEXT/ADB_CLEAR_TEXT，:14-19）、WatchdogV2.kt（用户交互复位监听） |
| 进程/线程基础（6） | os.Handler、os.Looper、os.Bundle、os.Build、os.IBinder、app.ActivityManager | 全壳主线程 post 面；Build 用于全部 SDK 分支；ActivityManager 用于 WatchdogV2 进程级检查 |
| 图形与控件（约 30） | GradientDrawable、RippleDrawable、LayerDrawable、ClipDrawable、ColorStateList、Typeface、TypedValue、Color + widget.LinearLayout/TextView/EditText/ImageView/Button/Spinner/ArrayAdapter/AdapterView/ScrollView/FrameLayout/ProgressBar 等 | GuideChrome/GuidePageRenderer/DsUi（引导页纯代码 UI）、OverlayPanel（面板）、OverlayService.buildRoot（白球黑鲸 Matrix 裁剪 :147-168） |
| 其他（4） | util.Base64、text.InputType、text.TextUtils、net.Uri | MuxClient.kt:75-97（WS 握手 key/accept 编解码）、OverlayPanel.kt:240（输入框类型）、FileIncoming.kt（Uri 白名单校验）、权限判定各处 |

androidx 面（6 类，23 处导入）：ComponentActivity、ActivityResultContracts / ActivityResultContract（目录/图片/权限三契约）、NotificationCompat、ViewCompat / WindowCompat / WindowInsetsCompat / WindowInsetsControllerCompat（insets 与沉浸式，MainActivity.kt:145-164、WebUiChrome.kt、ConsoleActivity.kt:107-116）。

## 2. 单文件导入密度（前 10，grep -c 实测）

MainActivity 31 / OverlayService 20 / OverlayPanel 15 / ConsoleActivity 15 / GuideChrome 14 / WebUiChrome 10 / GuidePageRenderer·DsUi·ConfigTransfer 各 9 / WatchdogV2·NotifyCenter·EngineService·AdbKeyboardService 各 8。引擎域文件（EngineManager 4、UndoGate 2、UpdateManager 2、MuxClient 2、SnapshotExtractor 1）刻意保持最小 android 面。

## 3. 线程与生命周期约束（与 API 使用强绑定，源码注释实测）

| 约束 | 锚点 | 要点 |
|---|---|---|
| @JavascriptInterface 跑在 JavaBridge 线程 | MainActivity.kt:473-474 注释 | WebView 方法必须切回主线程（runOnUiThread / webView.post）——textZoom/evaluateJavascript 全遵守 |
| EngineProbe 探活禁主线程 | EngineProbe.kt（check 注释 "never the main thread"） | 全部调用方自起线程或 Handler 后台 |
| FileObserver.onEvent 非主线程 | OverlayLiveFeed.kt:78（svc.main.post） | live 事件解析后统一 post 主线程再改状态 |
| MuxClient.onFrame 在客户端线程 | MuxClient.kt:25（上层自行 post 主线程） | OverlayPanel.handleMuxFrame 内 svc.main.post（:83-101） |
| evaluateJavascript 晚到回调 | MainActivity.kt:509-510、WebUiChrome.kt:148-149 | Runnable 体内 try/catch + onDestroy removeCallbacks（防销毁后主线程异常） |
| PendingIntent 必须 FLAG_IMMUTABLE | MainActivity.kt:620 | targetSdk 31+ 硬约束 |

## 4. API 等级约束（minSdk 26 / targetSdk 34 / compileSdk 36）

| 约束点 | 等级 | 守卫写法 |
|---|---|---|
| TYPE_APPLICATION_OVERLAY 悬浮球三窗口 | API 26+ | minSdk 26 直用，无分支（OverlayService.kt:175,199,242） |
| NotificationChannel | API 26+ | minSdk 26 直用（MainActivity.kt:616、NotifyCenter.kt） |
| isExternalStorageManager（All Files Access） | API 30 | 显式分支 7 处：AndroidBridge.kt:133、AdbState.kt:307、ConfigTransfer.kt:229,272、GuidePageRenderer.kt:161、LogCollector.kt:76、DownloadSaver.kt:140（SDK<30 走 SAF+legacy 权限分代，#120） |
| POST_NOTIFICATIONS 运行时权限 | API 33 | Build.VERSION 分支 + ActivityResult 请求（MainActivity.kt:84-85,598-613） |
| forceDark / GradientDrawable.setColors(colors, offsets) | API 29 | 分支降级（MainActivity.kt:330、ConsoleActivity.kt:90、OverlayHalo.kt:41） |
| 沉浸式 WindowInsetsController vs systemUiVisibility | API 30 | 双路分支（MainActivity.kt:243-268、WebUiChrome.kt:17-32） |
| security.android.exec xattr 补章 | Android 15+ 强制 | 无条件 setfattr 尽力而为（SnapshotExtractor.kt 类注释；不 enforcing 的内核为 no-op） |
| SYSTEM_ALERT_WINDOW | 全等级 | Settings.canDrawOverlays + 授权页引导 + onResume 补启（OverlayController.kt:33-65、MainActivity.kt:206） |
| WRITE_EXTERNAL_STORAGE | maxSdk 29 | manifest 分代声明（分区存储后不再需要） |
| READ_EXTERNAL_STORAGE | maxSdk 32 | Android 13+ 并入 READ_MEDIA_* 且工作区走 All Files Access |

## 5. SDK 档位理由（app/build.gradle.kts:13-16 注释为权威）

- **targetSdk 34**：Android 15+ 对 targetSdk 35+ 禁止 exec 应用数据目录 ELF（w^x）——内嵌引擎的 node/bash/全部子命令都是 app-data ELF，升 35 需要全部套 /system/bin/linker64 包装（现有回退只兜底直 exec 被拒场景，EngineManager.kt:581-598）；34 保有 Android 15/16 设备上的原生 exec。配套措施：SnapshotExtractor 对每个可执行文件补 security.android.exec 属性。
- **minSdk 26**：TYPE_APPLICATION_OVERLAY（悬浮球三窗口）与 NotificationChannel 均 API 26 起步；低于 26 需两套 overlay/通知降级路径，与壳定位（Android 8+ 设备）不符。
- **compileSdk 36**：跟随最新 SDK 编译取新 API 签名与 lint 规则；运行时行为由 targetSdk 34 封顶（gradle.properties 以 suppressUnsupportedCompileSdk=36 压制告警）。

## 6. 相关构建配置（与 android API 面配套，build.gradle.kts 实测）

- `androidResources.noCompress += "xz"`（build.gradle.kts 注释：snapshot.tar.xz 已 xz 压缩，AAPT 二次压缩会破坏 openFd/流式读取）——SnapshotExtractor 依赖拿到原始 xz 字节流。
- `usesCleartextTraffic="true"`（AndroidManifest.xml application 节点）：引擎是 http://127.0.0.1:3080 明文回环，WebView 与直连 RPC 均依赖。
- targetSdk 34 下前台服务启动须声明 foregroundServiceType（dataSync，EngineService/开机自启路径）。
