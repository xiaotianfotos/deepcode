# dsh-android-debian

可选的 Debian/proot 执行环境插件。Harness 仍使用 Android 原生 Node；Linux 工具在单独 rootfs 中运行。`enforcement: partial`，不提供内核级安全隔离。

工具：

- `debian_status`：环境、来源、主机 ABI、DNS 和本会话任务状态。
- `debian_install`：离线解包 APK 内固定版本 rootfs。默认后台执行；`reset=true` 新建环境并保留旧 generation，项目不动。
- `debian_exec`：在当前项目对应的 `/workspace` 中执行 Linux 命令；可以使用 apt。`background=true` 返回标准 Bash jobId 和持久 taskId。
- `debian_tasks`：本会话任务状态与取消。标准 `job_output` / `job_kill` 也可用于 Bash jobId。

所有执行委托到 Harness 标准 Bash 工具策略、审批与任务管线。只读模式拒绝安装和命令执行。Shell 本身仍是部分隔离，不能把配置的 workspace-write 标签当作任意程序的强制目录边界。

安装文件来自 `scripts/fetch-debian-inputs.py` 的锁定输入，经 `scripts/prepare-debian-bundle.py` 生成。静态 proot loader 必须作为 APK 原生文件安装，不能只从可写 app-data 执行。原生桥导出 DNS、nativeLibraryDir 与存储授权状态；外部项目执行前检查 All Files Access；插件的执行请求不传宿主凭据给 guest 环境。

Debian、apt 包和缓存位于 `files/home/.dsh/debian`，该目录在 APK 快照升级时保留；用户源码和产物仍位于当前项目原目录。共享卷可能不支持执行位/软链接，编译依赖放 `/root`，输出写 `/workspace`。

使用 `npm ci --legacy-peer-deps && npm run build` 构建。`npm test` 验证安装器的归档边界、硬链接、失败恢复和环境清理；完整 APK 验收见仓库根 `docs/DEBIAN.md`。
