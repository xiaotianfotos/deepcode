# 从公开源码首次构建与部署

这是当前 ARM64 首次构建入口。仅使用当前 checkout、公开固定依赖及操作者自己的配置；不要借旧 APK、维护者 `.tools`、已装设备运行时或私有回执。流程不自动连接设备，不附带模型、账号或远程服务。

## 1. 明确任务与边界

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

输出为 `artifacts/deepcode-source-arm64.apk`、`artifacts/first-build.json`。它们属于本机产物，不提交。首次流程不会读取 `build-arm64-codex.json`；旧 rebuild 脚本仅保留为旧增量链维护工具。

当前链不承诺逐字节可复现，也不从头编译所有 Termux/Node 二进制：基座采用固定摘要的公开上游 snapshot。公开原生组件的包/源码来源由相应 lock 与构建脚本锁定，禁止从手机提取作为输入。

## 3. 部署前检查

只操作用户指定设备；用 adb devices / mDNS 发现后，以完整 serial 核对型号、ABI和SDK。遵循 [设备调试规则](../android-shell/docs/AGENTS/devices-and-debugging.md)。不要把文档示例设备当授权对象。

已有 DeepCode 的设备必须保留用户数据、确认没有 Agent 或快照事务运行，并且应用不持有双屏租约。新 checkout 的调试签名通常不同于维护者旧包；若签名不兼容，停止覆盖安装，报告需由用户选择具备相同签名的正式更新或另行准备空白测试设备。**不得卸载、清数据、复制维护者密钥或降级。**

构建成功不代表部署成功。仅在预检全部通过后才执行明确 serial 的安装。引擎就绪后核对版本、snapshot 指纹、插件实际落地，不能只看到启动页就算通过。安全预检/部署入口参照 `scripts/deploy-source.py --help`（存在时）；不得用旧 `install-device.py` 的默认 baseline 覆盖新包。

## 4. 第一次使用与功能分级

安装后的共享存储、通知、麦克风、桌面浮层等权限按所选功能在设备授权；不需要的插件保持关闭。Codex 由用户自行登录，模型服务地址与 API key 在设置中输入，禁止把这些保存进源码或日志。应用本身的无线 ADB 身份需单独配对，电脑在线不代表应用已授权。

- **基础聊天**：配置一个可用后端，发送真实消息并验证用户项目读写。
- **Codex**：确认插件启用、App Server 就绪、用户登录后模型可选；验证一个无破坏性的工具任务。
- **语音**：可直接选择用户自己的 API ASR/TTS。要本机 ASR 再按 `asr-lab/models.json` 下载所选模型及匹配 mmproj，验证摘要并放入插件要求的位置；模型权重不在 APK 中。对齐模型单独选择。
- **Debian**：安装 bundle 后首次运行仍要初始化用户 rootfs；验证 Debian 命令，不把插件卡片存在当作环境已好。
- **Android 小应用开发**：按 [构建环境第二节](ANDROID-BUILD-ENVIRONMENT.md#2-让设备里的-agent-编译-android-小应用) 准备设备内工具链，再运行技能 doctor 和最小真实编译。随包技能不表示其依赖已安装。
- **媒体工具**：另装 FFmpeg/Chromium/HyperFrames 与字体；本仓不部署用户的远程 Qwen/ASR/TTS 服务器。
- **imagegen**：当前账号/运行时确实提供技能与工具时才调用；缺失不阻塞无AI图标的安卓编译。

## 5. Agent 遇到阻塞时如何反馈

记录提交、阶段、命令的脱敏形式、退出码、错误位置、缺失前提及是否写过设备；一次性记录放 `.local/`，不入库。分别报告“构建”“安装”“引擎启动”“功能验收”。外部账号/签名/系统确认无法替用户完成时停在相应边界；源码或公开文档问题由维护者修复后，再用独立 checkout 复验。
