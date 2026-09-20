# 用户指定的共享存储与外置项目

`0.13.3-local-storage` 支持把用户选择的本机共享目录、系统已挂载的 SD 卡 / USB 存储目录直接作为项目工作区。文件保留在原目录，文件管理器可以查看和管理；不复制到私有工作区，也没有后台双向同步副本。运行环境、模型凭据和会话数据库继续放在应用私有目录。

## 用户操作

1. 在左侧 Workspaces 点“添加项目”。首次使用时，应用会打开系统“所有文件访问权限”页面；开启后返回应用，自动继续系统目录选择器。
2. 选择内部存储下的 Documents/项目目录，或在侧栏选择 SD 卡 / U 盘，再进入项目目录。也可在选择器中创建新文件夹。
3. 点“使用此文件夹”并允许访问。应用先实际创建、读回、删除一个独占临时探针，再登记项目。失败时提示原因，不登记一个不可用的假路径。
4. 在该项目中新建会话。Agent 的标准 write/read/edit 直接操作所选目录。

Android 11+ 使用 `MANAGE_EXTERNAL_STORAGE`，权限由用户在系统设置中开启。它允许访问共享存储及挂载的 SD 卡、USB OTG 卷，不能读其他应用私有目录；系统目录选择器仍有限制，例如内置存储根目录和部分 Android 子目录不可选择。依据 [Android 全部文件访问文档](https://developer.android.com/training/data-storage/manage-all-files) 和 [目录选择限制](https://developer.android.com/training/data-storage/shared/documents-files)。这不是仅对一个目录的系统权限；原有 Bash adapter 也只声明部分隔离，不能把工作区选择当成对所有 Shell 命令的完整安全边界。

## 实现

- Kotlin `WorkspaceStorage` 查询 `StorageManager.storageVolumes`，只解析系统报告为可写挂载的本地卷。支持当前 Android 用户的 primary 目录和真实 UUID 卷，不再把其他卷的 `content://` 字符串交给 Node。
- `WorkspacePaths` 验证提供方、卷标、相对路径和 canonical 路径边界，拒绝未挂载卷、路径穿越和符号链接逃逸，并检查所选目录实际读写。
- `DirectoryPickerController` 只在确实等待全部文件权限时从 onResume 继续，不因普通目录选择返回而重复启动选择器。拒绝权限会显示错误，用户可以重新选择；SAF URI 授权也保留作记录。
- `dsh-host-web-compat` 插件接受内置用户目录与 UUID 卷路径，把明确拒绝原因显示给用户。云盘或其他没有可访问本地路径的 DocumentsProvider 目前明确拒绝，需要独立 SAF 内容 adapter 才能支持。
- `dsh-android-fs` 0.1.1 保留官方 TS 文件系统、版本检查和 workspace 策略，仅区分新建文件的发布方式。官方 Harness 内核保持不变。

## 共享文件系统的差别

真实 Agent 在共享存储上使用 `renameat2(RENAME_NOREPLACE)` 返回 EINVAL，因此不能把私有目录的原子发布原样用于 FUSE。

私有目录继续使用原子、不覆盖发布。共享卷新建文件先读完整暂存文件，再用 `open('wx')` 独占创建目标、写入并同步；并发创建只有一个成功，已存在目标不覆盖。**共享卷的新建不是原子发布：其他应用可能在写完之前看到文件，掉电、拔盘或 I/O 失败可能留下部分文件。** 发生错误时不删除这个文件，以免误删其他应用随后替换或编辑的内容；用户需检查后处理。测试包含中途写入失败时保留部分文件和保护原文件的验证。

已有文件 edit 继续使用上游版本检查及暂存后 rename。共享盘的 chmod、执行位、符号链接、文件锁能力受卷和系统限制；本轮不宣称任意 npm 依赖树、Git 工作流或二进制执行均兼容。Node/Python 等运行环境仍应位于私有运行时目录，项目源码和产物可放共享目录。

## 本轮验收

仅使用专用 Android 15 x86_64 模拟器，未连接实体平板。通过 `sm set-virtual-disk true` 创建此前不存在的独立虚拟磁盘，再将该新盘分为 public 卷；未格式化任何已有用户磁盘。测试卷 UUID `86FB-1E11`，测试后保持挂载并保留产物。

| 检查 | 结果 |
| --- | --- |
| Kotlin 单元测试 | 20 项通过，新增 4 项路径、提供方、越界和读写探针测试 |
| Web 路径验证 | 2 项通过，含 UUID 卷、不同 Android 用户、非法路径 |
| 文件系统插件 | Ubuntu / APK 内各 14 项通过，含并发独占与中途写入失败 |
| Documents 目录 | 标准 write/read/edit/read，实际中文 JSON sum=43，ADB 普通 shell 独立读回 |
| 虚拟外置卷 | 相同标准四工具链路通过，系统文件管理器可见产物 |
| 中文 / 空格项目目录 | 外置卷中含中文和空格的项目目录完成四工具链路 |
| UI 添加项目 | 实际经系统目录选择器添加两个工作区；登记路径均为 /storage 下原目录 |
| 权限拒绝 | 不授权返回时显示明确错误；撤权后 Agent 收到 EACCES，目标文件未生成 |
| 权限恢复 | 在错误框重选并授权后自动继续选择器；外置卷 Agent 再次写入成功 |
| 卷移除 | 卸载专用虚拟卷后创建会话明确失败，没有回退沙盒另存 |
| 重新挂载 / 冷启动 | 原文件 SHA-256 不变，两个项目身份保留，再次 Agent 写入成功 |

ADB `run-as` 在该模拟器上没有应用自身的共享存储 mount namespace，授权后也可能 EACCES；因此外部目录权限结论以实际 APK 引擎的模型工具调用为准。独立读回使用普通 ADB shell，证明数据位于应用外。内嵌代码单测仍可用 run-as 在私有测试目录执行。

截图和筛选后的测试记录见 [storage 验收目录](validation/2026-09-08-storage/)。测试中的提示、结果均为专用验收内容；未上传原始 engine.log、settings 或密钥。

## 安装和复验

```bash
cd /path/to/developer/work/deepseek-harness-android
source scripts/env.sh
python scripts/install-device.py SERIAL --storage
# 第一次运行时更新完成后
python scripts/accept-device.py SERIAL --storage
# 先通过界面选择用户自己的测试目录并授权，再传入真实路径
python scripts/test-storage-agent.py SERIAL --root /storage/emulated/0/Documents/你的测试项目
```

Agent 验收脚本会创建唯一命名的测试文件和会话，使用当前已配置的 `local-qwen / qwen38-flash-next`；不会迁移或清空原项目。它验证模型工具，统一基础验收入口本身不替代外置卷及权限 UI 测试。

候选包下载：[共享存储版 APK](http://192.0.2.40:8767/)。ARM64 用于平板，x86_64 用于模拟器。原 8766 下载目录继续保存此前 fs-adapter 版本；测试本功能应安装 `local-storage`。

复建：先按 FS-ADAPTER.md 构建插件，再执行 `overlay-fs-adapter.py ABI --storage` 和 `build-baseline.py ABI --storage`。overlay 包含 fs 插件及 Web 存储桥；运行时基础仍是验证过的发行快照，非全量源码重建。

明早实体平板重点验证：实际 HyperOS 权限页和目录提供方、实际 USB OTG 卷 / 文件系统、挂载与拔出提示、大文件写入，以及想使用的具体开发工具链。虚拟外置卷通过不能代替这些真机结果。

下载服务为用户级临时单元 `dsh-android-storage-downloads.service`。Ubuntu 需保持在线；重启后若单元不存在，可运行：

```bash
python scripts/prepare-delivery.py --release storage-preview-20260908
systemd-run --user --unit=dsh-android-storage-downloads \
  --property=WorkingDirectory=/path/to/developer/work/deepseek-harness-android \
  --property=Restart=on-failure \
  /usr/bin/python3 /path/to/developer/work/deepseek-harness-android/scripts/serve-delivery.py \
  --port 8767 --release storage-preview-20260908
```

本次同版本调试包覆盖后曾仍运行旧快照；最终在无活动任务、无快照事务时冷启动，确认指纹与清单一致后才复验交付。真机验收必须核对快照指纹，不能只看 APK 的版本文字。
