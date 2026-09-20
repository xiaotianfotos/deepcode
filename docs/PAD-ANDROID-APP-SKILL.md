# 平板 Android App 开发 Skill

设备：yingtian / M367FC。本次只配置平板，没有更新 Fold，也没有替换 DeepCode APK。

## 已部署内容

- 本机 ADB：沿用 APK 内置 adb，通过原生 AndroidBridge 完成应用自己的无线配对；T1、allowSwitch/paired/connected/authorized 均为 true。电脑与应用身份独立，不复制私钥。
- Debian：补齐 OpenJDK17、ARM64 aapt/zipalign、apksigner、android-framework-res、zip、Python Pillow；复制 API36 android.jar 与 Build Tools35 D8。真实版本在验收目录toolchain.log。
- `android-app-dev`：源码 `android-shell/codex-skills/android-app-dev`；设备安装到 `files/home/.dsh/codex-android/home/skills/android-app-dev`。
- `imagegen`：设备已有 `.system/imagegen`，保持原件；新增开发 Skill 引导按原 imagegen 规则调用内置工具并持久保存图标，未配置额外 API key。

## 用户如何使用

在平板 DeepCode 选择 Codex，打开或新建共享 work 中的安卓项目，正常描述需求即可。例如：

> 用 android-app-dev 帮我在平板上开发一个番茄钟。用 imagegen 生成应用图标，编译成 APK，安装在这台平板上，检查运行日志和截图。

已有验收会话“平板安卓应用开发 · Skill验证”，项目 `/storage/emulated/0/work/pad-app-lab`，可继续让它修改。Skill 允许正常自动发现，不需要每次写出全部绝对路径；明确使用技能名有助于新会话选中。

共享项目中的 `AndroidManifest.xml`、`src/`、`res/`、`assets/`、`app.apk`、`build-receipt.json` 均在平板。编译使用现有 Debian runner，ADB helper 运行在宿主 Termux Python；两层仍各有用途，不把 ADB 放入 Debian 当另一套身份。

## 能力与边界

| 入口 | 行为 |
|---|---|
| app.py doctor | 检查SDK输入、ADB程序、应用自身授权与连接 |
| app.py build --project ... | aapt资源/R.java→javac→D8→zipalign→签名，输出APK和SHA收据 |
| app.py install / launch | 核对当前项目包名、APK收据；本机覆盖安装与启动 |
| app.py logs / capture / ui | 限定包进程日志、PNG截屏、UI树 |
| app.py tap / key / text | 系统ADB输入；若被INJECT_EVENTS拒绝，报告实情 |
| icons.py | 在Debian用Pillow把项目图标转为传统多密度与自适应图标资源 |

图像创作调用当前 Codex 的内置 image_gen；尺寸转换由 Pillow 完成，两者职责分开。原图与 prompt 留在共享项目，APK 引用实际资源。工具不存在或生成失败时，Skill 要求如实报告，不自动切换到收费API/CLI。图像生成与模型推理是云服务，本机编译并不等于全离线AI。

自适应图标打包遵循 [Android官方分层/安全区说明](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive)，当前产物含传统mipmap和v26 adaptive-icon。不宣称此最小构建器已支持Android13 monochrome主题图标。

这是可复用的原生Java开发辅助Skill，不只是硬编码的单个计数器脚本。但完整Gradle/Kotlin/Compose/NDK工具链仍未验证；Google Linux原生宿主工具不能因目标支持ARM就假定可在ARM64上运行。当前API36 Java stub配API29资源框架，Manifest建议min26/target34，lambda用匿名类规避已知stub兼容问题。

保持设备无线调试与应用内授权。端口变化先让DeepCode重新发现连接；只在配对失效时重新配对。实际安装仍受HyperOS安装确认策略限制。开发签名留私有Debian目录，不导出到项目。helper拒绝覆盖DeepCode本体，日常App开发不改变账号、已有会话或其他设备。

## 维护

部署入口 `scripts/android-app-lab/deploy-pad-skill.py SERIAL` 核对yingtian与快照事务，投放Skill/SDK输入并校验SHA；不会替换APK或自动执行apt。`pad-setup-prompt.txt`、`pad-build-prompt.txt` 是实际平板Codex验证任务，可经参数化 `agent-turn.py` 执行。新建验证会话会临时选择Codex模型，并用settings revision恢复原全局默认。

长时间运行引擎的token启动行可能已从engine.log轮转消失；Device.authenticate现先复用壳已保存Cookie，并实际请求验证，只在内存使用，不输出或写入验收文档。

结果见 [实机验收目录](validation/2026-09-11-pad-app-dev/README.md)。
