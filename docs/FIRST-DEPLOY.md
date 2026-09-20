# 从公开源码首次构建与部署

这是当前 ARM64 首次构建入口。仅使用当前 checkout、公开固定依赖及操作者自己的配置；不要借旧 APK、维护者 `.tools`、已装设备运行时或私有回执。流程不自动连接设备，不附带模型、账号或远程服务。

## 1. 明确任务与边界

从公开仓库新建独立 checkout，所有后续命令从它的根目录运行。记录本次 SHA，避免把另一目录的构建结果当成本次结果：

```bash
git clone https://github.com/xiaotianfotos/deepcode.git
cd deepcode
git rev-parse HEAD
git status --short
```

若维护者指定待验证的分支或提交，先切到该明确版本；不要混入未提交的修改。

先读取根 AGENTS、[Android 构建环境](ANDROID-BUILD-ENVIRONMENT.md)和设备操作规则。确认 Linux x86_64 宿主、Python 3.11+、Node22、Git、CMake、Ninja、xz、tar 等系统工具。SDK 许可由操作者决定是否接受。预留工具链、编译和解压空间；不要下载用户无需的 ASR 模型。

```bash
python3 scripts/bootstrap-android-host.py --check
# 缺少工具时，按输出准备系统依赖，然后安装本checkout的Android工具链：
python3 scripts/bootstrap-android-host.py --install
# 非交互环境仅在操作者已授权接受 SDK 许可时追加 --accept-licenses。
source scripts/env.sh
python3 scripts/bootstrap-android-host.py --check
```

旧 `env.sh` 不安装工具；当前版本保留已有 JAVA_HOME/ANDROID_HOME。不要继承另一项目的缓存路径；独立复现应使用本 checkout 新建的缓存。

## 2. 构建完整 ARM64 运行时与 APK

```bash
source scripts/env.sh
python3 scripts/first-build.py
```

内部顺序及断点恢复：

| phase | 内容 |
|---|---|
| plugins | 从锁文件安装并构建随包插件，不使用维护者 node_modules |
| inputs | 校验下载 0.14 snapshot、Debian 与 PRoot，生成 ABI bundle |
| native | 从公开来源准备 Codex、VAD、ASR、CPU/Vulkan 对齐引擎及许可证 |
| assemble | 全新解压基线，装配插件、补丁、Debian bundle、可选技能，生成权限规范化快照 |
| verify | 检查引擎版本/补丁、权限、敏感文件、许可证和 ELF/原生文件 |
| apk | 验证输入，运行 JVM 测试和 Gradle 打包，核对实际 APK 的 snapshot/native 哈希、签名及对齐 |

故障恢复使用 `python3 scripts/first-build.py --phase <phase>`；只在本轮前序步骤已成功且输入未变时从断点继续，随后按表执行剩余步骤。`assemble` 会重新创建脚本自己的暂存目录，不复用已打过补丁的 runtime。修改源码后必须重新构建相关前序步骤；不要改哈希、禁用门禁或伪造回执。

原生构建和装配会更新 `android-shell/app/src/main/assets/voice-engine.json`、`assets/patched/` 中的生成文件；这些变化不等于手工修改业务源码。续跑前先记录 `git status` 和本轮生成文件清单，遇到 Git 更新冲突时保存生成文件的本地证据，再按生成步骤重建；不要执行整个仓库的 `reset --hard` 或丢弃用户修改。`first-build.json` 的 `source_dirty` 如实反映打包时的工作树状态，不能仅凭该字段判断源代码是否发生人工修改。

输出为 `artifacts/deepcode-source-arm64.apk`、`artifacts/first-build.json`。它们属于本机产物，不提交。首次流程不会读取 `build-arm64-codex.json`；旧 rebuild 脚本仅保留为旧增量链维护工具。

当前链不承诺逐字节可复现，也不从头编译所有 Termux/Node 二进制：基座采用固定摘要的公开上游 snapshot。公开原生组件的包/源码来源由相应 lock 与构建脚本锁定，禁止从手机提取作为输入。

## 3. 部署前检查

只操作用户指定设备；用 adb devices / mDNS 发现后，以完整 serial 核对型号、ABI和SDK。遵循 [设备调试规则](../android-shell/docs/AGENTS/devices-and-debugging.md)。不要把文档示例设备当授权对象。

此部署器固定包名 `com.dsharnessmobile.shell`，仅支持 Android 主用户（user 0）及 debug APK；已有包还必须允许 `run-as`。没有改包名共存选项。同签 release 包仍可能无法读取状态，不能通过清数据解决。设备尚未安装此包时，可用自己的调试签名首装。

已有 DeepCode 的设备必须保留用户数据、确认没有 Agent 或快照事务运行，并且应用不持有双屏租约。新 checkout 的调试签名通常不同于维护者旧包；若签名不兼容，停止覆盖安装，报告需由用户选择具备相同签名的正式更新或另行准备空白测试设备。**不得卸载、清数据、复制维护者密钥或降级。**

构建成功不代表部署成功。仅在预检全部通过后才执行明确 serial 的安装。引擎就绪后核对版本、snapshot 指纹、插件实际落地，不能只看到启动页就算通过。预检与安装命令如下；默认仅检查，安装必须显式指定 `--install`。已有应用需打开到可读状态的前台 WebView，语音/Live/双屏退出到空闲，且引擎能认证。任何未知状态失败关闭，不自动停止任务或切换插件。不要用旧 `install-device.py` 的默认 baseline 覆盖新包。

```bash
read -r -p "目标设备完整 ADB serial: " device_serial
python3 scripts/deploy-source.py --check --serial "$device_serial"
# 只有上一命令通过，且用户已授权更新此设备，才运行：
python3 scripts/deploy-source.py --install --serial "$device_serial"
```

参数 `--receipt` 默认读取 `artifacts/first-build.json`，`--timeout` 默认给安装后初始化 1200 秒。退出码 0 表示当前检查或安装步骤通过；2 表示阻塞，须读取脱敏提示，不代表已经安装成功。正常关闭 Live 功能不影响预检；旧版或整个插件被卸载导致状态 API 缺失时会保守阻塞，不能用启用录音来解决。

安装失败会报告退出码及可识别的 `INSTALL_FAILED_*` / `INSTALL_PARSE_FAILED_*` 错误码，不输出完整 ADB 日志，也不自动重试。`INSTALL_FAILED_USER_RESTRICTED` 需要操作者处理系统安装确认或 OEM 的 USB 安装设置；超时表示结果未知，先检查包是否已安装及当前系统页面，再决定是否重试。

该工具只在临时目录读取已装 APK 的签名用于比较，不把它当构建 donor；不会自动备份用户数据，重要数据仍应按用户自己的策略保管。安装后初始化超时会保留进程运行并报阻塞，禁止强杀解压流程。

## 4. 第一次使用与功能分级

安装后的共享存储、通知、麦克风、桌面浮层等权限按所选功能在设备授权；不需要的插件保持关闭。Codex 由用户自行登录，模型服务地址与 API key 在设置中输入，禁止把这些保存进源码或日志。应用本身的无线 ADB 身份需单独配对，电脑在线不代表应用已授权。

- **基础聊天**：配置一个可用后端，发送真实消息并验证用户项目读写。
- **Codex**：确认插件启用、App Server 就绪、用户登录后模型可选；验证一个无破坏性的工具任务。
- **语音**：可直接选择用户自己的 API ASR/TTS。要本机 ASR 再按 `asr-lab/models.json` 下载所选模型及匹配 mmproj，验证摘要并放入插件要求的位置；模型权重不在 APK 中。对齐模型单独选择。
- **Debian**：按 [Debian 插件说明](DEBIAN.md) 初始化用户 rootfs；验证 Debian 命令，不把插件卡片存在当作环境已好。
- **Android 小应用开发**：按 [构建环境第二节](ANDROID-BUILD-ENVIRONMENT.md#2-让设备里的-agent-编译-android-小应用) 准备设备内工具链，再运行技能 doctor 和最小真实编译。随包技能不表示其依赖已安装。
- **媒体工具**：另装 FFmpeg/Chromium/HyperFrames 与字体；本仓不部署用户的远程 Qwen/ASR/TTS 服务器。
- **imagegen**：当前账号/运行时确实提供技能与工具时才调用；缺失不阻塞无AI图标的安卓编译。

## 5. Agent 遇到阻塞时如何反馈

记录提交、阶段、命令的脱敏形式、退出码、错误位置、缺失前提及是否写过设备；一次性记录放 `.local/`，不入库。分别报告“构建”“安装”“引擎启动”“功能验收”。外部账号/签名/系统确认无法替用户完成时停在相应边界；源码或公开文档问题由维护者修复后，再用独立 checkout 复验。


## 6. 维护者的独立复现循环

委托另一个 Agent 复现时，只给公开仓库 URL、固定提交、空工作目录和操作者授权的设备连接信息。它应先读本仓文档；不要补发只有维护者知道的构建命令、私有下载地址、旧 APK 或回执。设备身份只通过本地交接提供，不写入公共文档。

1. 从空 checkout 按本文执行；记录首个真实阻塞后停止依赖该步骤的操作。
2. 区分源码缺陷、文档缺漏和外部条件（签名、用户账号、系统授权）。前两种修复进仓库，外部条件明确报告，不放宽安全检查。
3. 修复提交后，由复现 Agent 获取公开提交重新验证。允许复用它自己本轮下载且摘要通过的公开输入；源码改动涉及的阶段必须重跑。
4. 验收报告明确当前提交和仍未验证的阶段。构建产物、测试日志、设备信息均留本地，公共仓库只补可复用的步骤、脚本、回归测试和边界。
