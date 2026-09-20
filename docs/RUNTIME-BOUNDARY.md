# 运行时边界与后续方向

这条路线不要求先把 Debian 打包进 APK。当前项目使用应用私有目录中的 Termux 用户态、Android 版 Node、配套 Harness 及 WebView；APK 原生层承担进程、生命周期和安卓能力桥接。模型推理本次位于用户提供的局域网服务器；TS/Node Agent 执行发生在安卓模拟器内。

坚持插件方向：保留 Harness 接口，通过 Android 插件适配平台能力。不要直接将较新的官方 checkout 替换进旧快照，也不要把模型业务逻辑堆进 Kotlin Activity。

## 本次已经复现

- 从 v0.13.3 壳源码构建 x86_64 和 ARM64 APK，使用发行版配套 Harness 0.1.2-rc.1 快照。
- 两个 ABI 均完成发行摘要验证、APK 内快照验证、6 项现有运行时门禁。
- JVM 16 项测试、UI 74 项测试通过；UI 与其余 5 个插件均完成源码编译。
- 在 Android 15 x86_64 模拟器内启动本地 APK，实际运行 Node 24.18.0、SQLite、Worker、Bash、Git 和中文文件读写。
- APK 内通过 OpenAI-compatible provider 调用 `192.0.2.10:5000/v1` 的 `qwen38-flash-next`，实际派发文件/命令工具。

## 没有声称复现

- 没有从 pristine Node/Termux/native addon 源码构建整套运行时。上游 snapshot 构建脚本仍依赖设备衍生的 base 归档；本机已下载并核验三个 base，但没有执行完整快照重建。
- 插件源码编译通过不代表新编译的插件已经装入本次 APK；APK 使用已核验的发行快照及项目原有启动补丁。
- 没有验证 ARM64 原生库在小米实际页大小、HyperOS、真实输入法和后台限制下的表现。
- PDF 路径出现缺少 `@napi-rs/canvas` 的回退提示；PDF、无线 ADB 提权、相册等能力尚未验收。

## 原始基线缺陷与当前修复：write 新建文件

Harness 的 `dsh-fs-local` 对 `createIfAbsent` 使用 `link(temp, target)`，在应用域中返回 EACCES。普通写入的 rename 分支不覆盖这个路径。项目 v0.13.3 的注释称 fs-local 补丁可退役，但实际新建文件工具仍失败。

模型用 Bash heredoc 成功绕过后，Python 执行及 read 核对通过。因此这是“任务可完成但标准新建工具有缺陷”，不能记为全绿。

后续独立任务要求禁止用 Bash 替代 edit：三次 edit 修改既有脚本成功，执行结果由 29 变为 42，read 与 ADB 直接读文件均确认正确。强制停止后重启，原会话、模型选择及结果仍在。

不要简单改成检查不存在后 rename：这会在并发情况下覆盖后来出现的目标，破坏 createIfAbsent 的保护语义。当前已用 dsh-android-fs 插件继承原 SandboxedFileSystem，通过固定版本的 internals.linkFile hook 接入 renameat2/RENAME_NOREPLACE。桥接复用已有 Python/ctypes，以相同 app UID 执行；不是模型调用 Bash/Python 的回退。10 项测试在 Ubuntu 与 APK 内各通过；模型标准 write/read/edit/read 通过，文件结果为43。完整记录见 FS-ADAPTER.md。
