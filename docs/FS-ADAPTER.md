# 标准 write 安卓适配：实现与验证

2026-09-08，本轮目标完成：保留官方 TS/Node 内核，通过文件系统插件修复 Android 的标准 write 新建失败；已在模拟器完成模型驱动验证，ARM64 安装包已就绪。

## 问题与实现

旧快照的 createIfAbsent 使用硬链接提交暂存文件，Android 应用域返回 EACCES。`dsh-android-fs` 继承原 SandboxedFileSystem，仅替换 `internals.linkFile`，复用已有 Python/ctypes 调用 libc `renameat2(RENAME_NOREPLACE)`。没有使用普通 rename 或复制退化，也没有改写官方 fs-local 文件。

原有文件解析、权限策略、只读模式、工作区限制、版本检查、读取、编辑、暂存同步与清理仍由原实现执行。模型使用标准 write 工具；Python 只作为插件内部系统调用桥，不是模型的 Bash/Python 工具回退。每次原子新建会增加一个短生命周期 Python 子进程；本轮未进行性能基准评测。

此 hook 上游标为测试用途，并非稳定插件 ABI。因此依赖固定 0.1.2-rc.1，升级前必须重新验证。缺失 Python、ctypes、renameat2 或文件系统不支持时拒绝写入。当前部署替换 Web host 的 fs-sandbox 服务；未单独验收其他自定义/隔离的 fs provider 或 agent preset。

## 验证结果

| 验证 | 结果 |
| --- | --- |
| 原始故障与替代原语 | 同一 Android app UID：link 返回 EACCES，renameat2 新建成功 |
| Ubuntu 测试 | 10 / 10 通过 |
| APK 内测试 | 10 / 10 通过，调用安装包提供的实际插件代码 |
| 并发保护 | 12 个独立发布进程竞争同一个目标，仅 1 个成功，其余 EEXIST |
| 其他保护 | 已存在目标、预检查后竞争、只读、工作区边界、符号链接逃逸、取消、失败清理、缺失助手、悬空符号链接均覆盖 |
| 安装后字节核对 | 9 个 overlay 文件摘要匹配；官方 fs-local 与固定 npm 包逐字节相同 |
| 标准工具端到端 | qwen38-flash-next 实际调用 Write、Read、Edit、Read，4 次，无 Bash 工具调用 |
| 文件产物 | sum=43、verified=true、中文内容正确，ADB 独立读文件核对 |
| 双 ABI 打包 | 两个 ABI 各 6 项运行时门禁通过；签名与 APK 内快照摘要通过 |

模型任务 UI 显示耗时 17 秒，仅为单次功能测试。模拟器从原基线升级，快照事务完成后原会话与模型设置仍可用。没有连接实体小米平板；ARM64/HyperOS、真实页大小、长期后台仍须实测。

## 本地重建

```bash
cd /path/to/developer/work/deepseek-harness-android
source scripts/env.sh
cd android-shell/plugins/dsh-android-fs
npm ci --legacy-peer-deps --cache "$DSH_ANDROID_ROOT/.tools/npm-cache"
npm run build
npm test
cd "$DSH_ANDROID_ROOT"
python scripts/overlay-fs-adapter.py x86_64
python scripts/overlay-fs-adapter.py arm64
python scripts/build-baseline.py x86_64 --fs-adapter
python scripts/build-baseline.py arm64 --fs-adapter
```

两个 overlay 可独立并行，APK 构建因共享 assets 必须串行。叠加层只包含本插件和 Web 装配；其他插件、官方内核及 Termux/Node 来自已验证的发行快照。没有从源重建整个运行时。

模拟器安装后等待 `.snapshot-fingerprint` 匹配且快照事务消失，运行：

```bash
python scripts/test-fs-adapter-device.py emulator-5580
```

该脚本先验证已装 APK 提供的文件，再只复制测试文件到应用内执行；不会以开发目录的 lib 覆盖安装包代码。模型复现提示在 `e2e-fs-adapter-prompt.txt`，再次执行应选新的目标文件名。

## 安装包与取证

- ARM64：`artifacts/dsh-v0.13.3-local-fs-adapter-arm64.apk`，174589578 字节，SHA-256 `b0a9c5a7e2ce3c65bdb42965935bd442a8c62e0ef18e8f77a5e4929c53d75c73`。
- x86_64：`artifacts/dsh-v0.13.3-local-fs-adapter-x86_64.apk`，171956034 字节，SHA-256 `738ff88af4971bbf33e98a951fd803e7f6117fb472adb22f9d06b2d8123c1f82`。
- [验证记录](validation/2026-09-08-fs-adapter/) 与 [截图](validation/2026-09-08-fs-adapter/fs-adapter-e2e.png) 已纳入 Git；APK/下载快照留本地。

构建在提交前完成：报告中的 source_commit 是修改基点 e1b2156，本轮适配来自当时尚未提交的工作区。overlay 报告记录实际装入包内每个文件的 SHA-256；这些文件也已和安装后字节核对。不要把基点提交误认为含完整新实现的提交。

## 待真机

按 DEVICE-ACCEPTANCE.md 使用 `install-device.py SERIAL --fs-adapter`。除标准工具链路外，重点验证该设备 libc/文件系统支持、实际页大小、HyperOS 后台和输入法。原始 baseline 包仍保留用于对照和回归。

## 共享存储增补

以上记录对应 0.1.0 私有目录原子发布。0.1.1 新增 Android 共享卷的独占创建策略，保证已有文件不被覆盖，但不提供原子可见性，失败可留部分文件。最新设计与实测见 [STORAGE.md](STORAGE.md)。旧版快照/报告保留作历史对照。
