# 第三方组件与分发要求

本清单描述项目直接使用、打包或通过设备安装脚本提供的主要组件。版本以对应锁文件、构建脚本和实际发行物为准；它不是最终 APK 的完整传递依赖 SBOM，也不表示所有随包义务已验收。新增自有代码的 MIT 范围见 [LICENSING.md](../LICENSING.md)。

## 壳、引擎和插件

| 组件 / 来源 | 用途与当前来源 | 许可 | 分发材料 |
|---|---|---|---|
| [kelai141/dsh-mobile-apk](https://github.com/kelai141/dsh-mobile-apk) | Android 壳；固定提交见 `source-provenance.json` | MIT | 保留 kelai141 版权与 `android-shell/LICENSE`，说明下游修改 |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 与 Cordis 系包 | TS/Node Agent、设置、插件、聊天 UI；当前组合使用 DSH 0.1.5-rc.1 | MIT | 保留 DeepSeek、Shigma 等各包原始声明；补丁不替代原包许可 |
| dsh-client-ui-responsive、dsh-shell-termux、dsh-host-web-compat | 上游移动 UI、shell 与浏览器兼容 | MIT | 各目录 LICENSE/NOTICE；独立发行时随包携带 |
| [relay-dsh-plugin-codex](https://github.com/yangbobo2021/relay-dsh-plugin-codex)、[relay-dsh-plugin-session-import](https://github.com/yangbobo2021/relay-dsh-plugin-session-import) | Codex 适配与会话导入；vendored 0.2.3-rc.1 | MIT | 保留两份 vendor LICENSE、来源与本地适配说明 |
| [dshmarketplace-plugin](https://github.com/DshMarketPlace/dsh-plugins-store) | 插件市场；vendored 0.1.5 | MIT | 保留 DshMarketPlace 声明；市场中另装的插件单独核对 |
| [dsh-undo-savepoint](https://github.com/lire1131/dsh-undo-savepoint) | 撤销/保存点；vendored 0.3.8 | MIT | 保留 lire1131 声明 |
| React、Lexical、TanStack、xterm、ws 等 | 引擎/前端依赖、编辑器和 WebSocket | 多数 MIT；逐包确认 | 以 npm 闭包实际版本汇总原许可；ws 已有语音插件内声明 |
| Lucide 图标库 | 部分插件 UI 依赖 | ISC，另依随包声明 | 不得把图标库默认归为 MIT；保留对应许可 |
| [HomeRail](https://github.com/xiaotianfotos/homerail) 参考实现 | 语音波形、ASR/TTS 和 Live 设计参考 | 不将整套 HomeRail 服务作为 APK 依赖 | 复制的代码按来源许可核对；协议参考不等于分发整个服务器 |

npm 闭包登记入口：`android-shell/scripts/snapshot-config/engine-overlay-licenses.json`、各 package-lock 与实际运行时包内 LICENSE。登记中还有 OpenAI SDK（Apache-2.0）、Anthropic SDK（MIT）和 ACP SDK（Apache-2.0）；SDK 的开源许可不包含服务账号、额度或模型权利。

## Android 与原生语音

| 组件 / 来源 | 用途 | 许可 | 分发材料 |
|---|---|---|---|
| [OpenAI Codex](https://github.com/openai/codex) / Codex Termux | ARM64 App Server；`@mmmbuto/codex-cli-termux` 0.153.3，精确输入见 `runtime-lock.json` | Apache-2.0；含其他依赖许可 | 随包 LICENSE/NOTICE，保留 OpenAI 与移植作者 Davide A. Guglielmi 署名，保留 helper 文件名修改说明；不能只引用 Relay 的 MIT |
| [llama.cpp / ggml](https://github.com/ggml-org/llama.cpp) | 本地 ASR CPU/Vulkan 推理；提交见 `scripts/build-asr-lab.py` | MIT；其 vendor 分别核对 | 原 LICENSE、ggml/vendor 声明、准确来源与构建脚本 |
| [predict-woo/qwen3-asr.cpp](https://github.com/predict-woo/qwen3-asr.cpp) | ForcedAligner 原生实现 | MIT | 保留 Andrew Sangwoo Ye 和 ggml 声明，记录移植/设备选择补丁 |
| [Arm KleidiAI](https://github.com/ARM-software/kleidiai) | CPU 矩阵加速；v1.24.0 | 按文件 Apache-2.0 / BSD-3-Clause | 两类许可证与版权汇总；构建脚本生成随包 notice |
| [libfvad](https://github.com/dpirch/libfvad) | WebRTC VAD | BSD-3-Clause，附 PATENTS | 随包 LICENSE、PATENTS、AUTHORS，保留 WebRTC 和 Daniel Pirch 归属 |
| [WebRTC Android SDK](https://github.com/webrtc-sdk/android) | GPT Live 音频；150.7871.01 | SDK 包装 MIT；WebRTC 为 BSD 系及第三方许可 | `webrtc-sdk-LICENSE.txt` 和完整 `webrtc-NOTICES.md`，不是只附一个 MIT |
| [Shizuku API/provider](https://github.com/RikkaApps/Shizuku-API) | 可选特权/虚拟屏桥；13.1.5 | MIT | SDK 原许可；用户安装的 Shizuku 应用另计，不等同于 SDK |
| AndroidX / Kotlin 运行库 | Activity、Core、动画与 Kotlin 支持 | Apache-2.0 为主 | 按 Gradle 解析结果收集许可证和适用 NOTICE |
| Apache Commons Compress | 快照解压；1.28.0 | Apache-2.0 | LICENSE、NOTICE 和修改声明（若修改） |
| [XZ for Java](https://github.com/tukaani-project/xz-java) | xz 解压；1.10 | 0BSD | 保留包内 COPYING 作为发行说明；不要混淆原生 xz-utils 的混合许可 |
| NDK libc++、Vulkan/SPIR-V 相关代码 | 原生执行器及 GPU 构建依赖 | 按 NDK/各项目许可，非统一 MIT | 随包的运行库与编入程序的第三方内容收集 NOTICE；仅构建用头文件另标 |

JUnit、TypeScript、Gradle/AGP、CMake、Ninja 等属于构建/测试工具。没有随最终 APK 分发的工具，不应被误列为 APK 内置运行时；若分发工具链镜像或工具包，仍需按其实际内容核对。

## Linux 运行环境与可选媒体工具

| 组件 / 来源 | 形态 | 许可与需要做的事 |
|---|---|---|
| [Termux packages](https://github.com/termux/termux-packages) | APK 内嵌 Node、Git、Bash、Python、基础命令等；没有要求用户另装 Termux App | 按包混合 MIT/Apache/BSD/GPL/LGPL/PSF 等。不是将所有 Termux 相关内容统一当作某个许可证。保留包版权、准确版本、对应源码与构建配方 |
| [Debian](https://www.debian.org/legal/licenses/) rootfs | Debian 插件 bundle，后续 apt 可增加软件 | 发行版是软件集合，逐包许可；保留 `/usr/share/doc` 和 `/usr/share/common-licenses`。记录实际包/版本并准备对应源码，不能只给 Debian 首页 |
| [PRoot](https://github.com/termux/proot) | Linux 兼容执行器、APK loader | GPL-2.0-or-later；分发二进制须提供符合许可的对应源码方式，包含实际 Termux 补丁与构建步骤 |
| libtalloc / libandroid-shmem | PRoot 相关运行库 | 分别 LGPL-3.0-or-later / BSD-3-Clause；前者需核对库替换、链接及源码要求，后者保留声明 |
| Node.js / Python | 运行时 | Node 主体 MIT 并含第三方许可，Python PSF 系；保留各发行包完整声明 |
| Bash、Git、coreutils 等 | 内嵌命令行程序 | GPL 系；准备实际发行版本对应源码与改动/构建方式，不能只附 GPL 正文 |
| [FFmpeg](https://ffmpeg.org/legal.html) | 媒体安装脚本在 Debian 中安装 | 基础 LGPL-2.1-or-later；启用 GPL 部件/库时许可变化。以具体 Debian 构建配置为准；若打包进我们的快照，需同步对应源码、配置及适用许可。不要发布不可再分发的 nonfree 组合 |
| [Chromium](https://www.chromium.org/developers/how-tos/get-the-code/) | 可选 HTML/视频渲染环境 | BSD 系主体和大量第三方许可；保留完整版权/许可证闭包，不能只留 Chromium 主许可 |
| [HyperFrames](https://github.com/heygen-com/hyperframes) | 可选媒体脚本安装 `hyperframes` 0.8.33 | 该版本 npm 元数据声明 Apache-2.0；若随包分发，保留该版本 LICENSE/NOTICE 及依赖许可。仅有安装脚本不等于已经把 CLI 打进 APK |

Termux 包级矩阵见 [`android-shell/THIRD_PARTY_NOTICES.md`](../android-shell/THIRD_PARTY_NOTICES.md) 和 `scripts/third-party-licenses.json`；Debian 输入见 [`debian-inputs.lock.json`](debian-inputs.lock.json)。自有代码与独立 GPL 程序一起分发不自动将自有代码变为 GPL，但链接、衍生修改和实际组合须单独判断，不能仅凭“插件”名称免除义务。

## 模型与远端服务

[Qwen3-ASR-0.6B](https://huggingface.co/Qwen/Qwen3-ASR-0.6B) 与 [Qwen3-ForcedAligner-0.6B](https://huggingface.co/Qwen/Qwen3-ForcedAligner-0.6B) 官方模型卡标注 Apache-2.0。权重不进入 Git；若另外分发 GGUF 等转换/量化产物，应携带原许可、模型来源/版本、转换说明和适用声明。推理引擎的 MIT 不代替模型的许可。

Qwen 本地聊天服务、MiMo API、GPT Live 等可由用户配置远端服务。没有随仓库提供它们的模型权重或服务器，就不能把“支持调用”写成“已将模型开源分发”；不要包含预置 Key、登录态或内网地址。第三方服务按其服务条款使用。

## 实际交付清单

1. 源码：根 MIT、上游与 vendored 许可全文、来源/版本及修改说明。
2. APK：从 Gradle、npm 和 native 实际产物汇总 LICENSE/NOTICE，原生依赖和模型分别计入。现有清单是入口，需核对 APK 中真正存在的文件。
3. GPL/LGPL 运行时：与精确二进制匹配的源码、Termux/Debian 补丁和构建脚本，选择可持续履行的源码提供方式；发布时一起提供对应源码通常更易维护。静态/动态链接与替换要求分别检查。
4. 后装软件：分清用户从上游自行安装与我们分发预装快照；后一种要把新增 FFmpeg、Chromium 等一并纳入发行清单。
5. 素材：海底启动素材已获维护者授权，见素材 README；其他资源遵守各自来源许可。

法律文本参考：[MIT](https://opensource.org/license/mit)、[Apache-2.0 §4](https://www.apache.org/licenses/LICENSE-2.0)、[GNU 许可 FAQ](https://www.gnu.org/licenses/gpl-faq.html)、[FFmpeg 官方分发说明](https://ffmpeg.org/legal.html)。
