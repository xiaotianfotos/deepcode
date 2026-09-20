---
name: android-app-dev
description: 在 DeepCode 所在的安卓手机或平板上开发、编译、安装和调试原生安卓应用；使用本机 ARM64 Debian 构建与应用自身无线 ADB，并可用 imagegen 生成应用图标。适用于本机 Android App 开发和修改任务。
---

# 在这台 Android 设备上开发 App

你就在 Android 设备上的 DeepCode/Codex 中。项目、编译、签名、安装都可以在本机完成。模型推理、图像生成仍需相应云服务；不要把本机编译说成离线 AI。

## 入口与工作目录

本 skill 位于 `$CODEX_HOME/skills/android-app-dev`，本机常见绝对路径为：
`/data/user/0/com.dsharnessmobile.shell/files/home/.dsh/codex-android/home/skills/android-app-dev`。

从当前 skill 实际路径定位 `scripts/app.py`，使用宿主 Termux Python 执行，**不要在 Debian 中直接执行 ADB helper**。项目优先使用用户指定的共享 `work/项目名`，比如 `/storage/emulated/0/work/my-app`。保留已有项目；新项目使用独立包名。

```bash
python "$CODEX_HOME/skills/android-app-dev/scripts/app.py" doctor
python "$CODEX_HOME/skills/android-app-dev/scripts/app.py" build --project /storage/emulated/0/work/my-app
python "$CODEX_HOME/skills/android-app-dev/scripts/app.py" install --project /storage/emulated/0/work/my-app
python "$CODEX_HOME/skills/android-app-dev/scripts/app.py" launch --project /storage/emulated/0/work/my-app --activity .MainActivity
python "$CODEX_HOME/skills/android-app-dev/scripts/app.py" capture --output /storage/emulated/0/work/my-app/check-01.png
python "$CODEX_HOME/skills/android-app-dev/scripts/app.py" logs --project /storage/emulated/0/work/my-app --tag AndroidAppDev
python "$CODEX_HOME/skills/android-app-dev/scripts/app.py" return
```

环境没有导出 CODEX_HOME 时，用上面的实际绝对路径；不要将 Ubuntu `/path/to/developer/...` 当作设备路径。build 会调用已经安装的 Debian runner，构建资源、R.java、Java、DEX、APK、签名，输出项目 app.apk 和 build-receipt.json。install 校验 Manifest 包名、产物 SHA 与收据，不覆盖 DeepCode 自身。

## 当前可用的构建路径

- 已部署的轻量 Java 工具链：OpenJDK17、D8、ARM64 aapt/zipalign、Java apksigner、系统 framework 资源。源码放 `src/包名目录/*.java`，项目根放 `AndroidManifest.xml`，可选 `res/`。Manifest 显式填写包名、版本、启动 Activity 的 exported、minSdk26/targetSdk34。没有代码模板要求，按用户任务实现功能。
- 使用 Android 标准 Activity/View；当前简化 bootclasspath 对 lambda 的 LambdaMetafactory stub 存在兼容问题，事件监听优先匿名类。现代 Gradle/Kotlin/Compose/NDK 并未因这套工具链而自动就绪。已有此类项目应先检查其真正依赖，不将项目擅自重写成 Java。
- Java 接口 android.jar 为 API36，但 aapt 使用 Debian API29 framework，不能假设更新的资源属性可用。生成新资源后 build 会生成并编译 R.java。
- 开发签名保存在私有 Debian `/root/android-app-lab/debug.keystore`，同一密钥用于更新；不把密钥拷到共享项目。版本升级保留包名与签名，递增 versionCode。

## 本机 ADB 与检查

helper 复用 DeepCode 自己的配对身份，通过动态端口连接 `127.0.0.1`，核对宿主与目标设备代号。电脑能连接不代表本应用已配对。doctor 的 adbConnected=false 时按实际错误处理：DeepCode 设置→开发者选项→安卓调试授权；不要复制其他设备/电脑的私钥，不反复索要已有效的授权。

安装用户当前要求开发/测试的应用属于该任务的一部分。保留其他应用和项目，不扩大为操作无关软件。遇到系统安装拒绝，报告系统提示，请用户处理确认后重试。

可用 `ui --output 新文件.xml` 获取界面树；`tap --x X --y Y`、`key --keycode N` 和 `text --text ...` 做系统输入。坐标为当前实际截图像素，旋转后重新获取；系统 text 对中文输入有限。若报 INJECT_EVENTS，不把失败当成功，也不循环盲点。可给自己的 debug App 提供 intent self_test + 按钮 performClick 断言；launch 支持 --self-test / --revision N，但需要你实现对应逻辑。明确区分程序自测与真实触屏验收。

构建成功后实际安装、启动、看限定进程/标签的日志和截图。退出测试 App 后 return 回 DeepCode，减少后台冻结影响。报告 App 名、共享项目/APK路径、实际检查结果和未验证部分。

## 用 imagegen 做应用图标

本机同时安装了 `imagegen` skill。需要 AI 生成的栅格应用图标时，读取其 SKILL.md 并调用**当前 Codex 的内置图像生成工具**。优先方形、主体居中、边缘留安全空间、缩小时轮廓可辨；按用户视觉要求设计，不凭空添加品牌。已经有原生 SVG 图标体系时按原项目方式维护。

内置图像工具是否可用以当前工具列表与实际调用为准。缺少工具就明确告知；不要因为此 skill 存在就假造生图成功，也不要擅自改走收费 API/要求用户提供 API key。遵循 imagegen 的显式 CLI 回退要求。

生成后先查看图像，将选定原图从工具返回路径复制到当前共享项目 `assets/`，不能只留在 `$CODEX_HOME/generated_images`。再用下面的 helper 在 Debian 中**只做尺寸/资源打包**，它不负责生成或创造性编辑：

```bash
python "$CODEX_HOME/skills/android-app-dev/scripts/icons.py" --project /storage/emulated/0/work/my-app --source assets/icon.png
```

它生成传统多密度 mipmap PNG、自适应图标前景和 XML；Manifest 加 `android:icon="@mipmap/ic_launcher"` 与 `android:roundIcon="@mipmap/ic_launcher"`，重新 build/install 验证。默认背景深灰，可用 --background '#RRGGBB' 指定。完整方形图片也能打包但可能看出图像自身底色；真正分层的自适应图标，优先让 imagegen 生成保留 alpha 的独立前景。不得把填充了背景的图片宣称为透明。

图标安全区与分层尺寸依据 [Android 官方自适应图标文档](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive)。
