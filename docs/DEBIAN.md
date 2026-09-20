# Debian 执行环境

保留 Android 原生 TS/Node Harness，通过 `@dsh-android/dsh-android-debian` 插件提供 Linux 软件兼容环境，不宣称强安全沙箱。后台运行需核实设备省电配置；媒体 CLI 的软件渲染能力不能直接等同完整生产管线支持。

## 用户入口

按 [首次构建与部署](FIRST-DEPLOY.md) 安装包含 Debian 插件和 bundle 的 APK 后选择一个项目，可以直接告诉 Agent：

> 用 debian_status 检查环境；如未安装，调用 debian_install。然后用 debian_exec 安装需要的软件，长任务放后台，输出保存到 /workspace。

首次 `debian_install` 使用 APK 内已校验的 Debian 12/bookworm rootfs，解包无需联网。安装 FFmpeg、Python 开发包等需要联网访问 Debian 软件仓库。例如：

```sh
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl ffmpeg python3 python3-venv python3-dev build-essential nodejs npm
```

这是 **Debian 内**的命令，应由 `debian_exec` 执行。原生 `bash` 工具仍处于 Android/Termux 环境，两个环境的 Node、Python、包管理和系统库相互独立。

## 插件接口

| 工具 | 行为 |
| --- | --- |
| `debian_status` | 查看是否安装、rootfs 来源、ABI、DNS、本会话任务状态 |
| `debian_install` | 默认后台安装；重复调用不覆盖已安装环境；`reset=true` 新建 generation，保留原 generation |
| `debian_exec` | 当前会话项目映射到 `/workspace`，执行 Bash 命令；支持 `background` 与 `timeoutMs` |
| `debian_tasks` | 查询本会话持久任务记录；`cancelTaskId` 取消任务，拒绝跨会话取消 |

执行经 Harness 标准 Bash 工具管线，沿用策略、审批、输出上限和后台 job。后台返回的 `jobId` 可用于 `job_output` / `job_kill`；`taskId` 用于 Debian 的持久任务状态。默认命令时限 120 秒，显式设置最多一小时，外层 Bash 留出五秒清理宽限。

只读权限模式拒绝安装和命令执行。宿主退出时监督进程终止 guest；重启仅恢复状态，不自动重新运行命令。标准 Bash 的历史 jobId 不保证跨引擎重启继续有效。

## 文件位置与重建

```text
files/usr/share/dsh-debian/        固定 rootfs 归档、proot 与来源清单
APK nativeLibraryDir/            可执行的静态 proot loader
files/home/.dsh/debian/
  current -> generations/<id>    当前 Debian 环境
  generations/<id>/              系统、已安装软件、/root、缓存
  jobs/                           命令请求与任务状态（应用私有）
用户选择的安卓目录                guest 的 /workspace，源码和产物原地读写
```

`.dsh/debian` 已列入快照升级保留清单。重建采用新目录解包、校验、原子切换 current；安装失败或取消保留旧环境。运行中的 Debian 任务持有共享租约，重建要求独占租约，忙时明确失败。旧 generation 不自动删除，因此多次重建会增加占用；不把清理旧环境混入本里程碑。

这是应用级共享 Debian 环境，多个项目共享已安装软件；需要项目依赖隔离时使用独立 Python venv 等。共享存储的执行位、符号链接、文件锁能力不会因 proot 改变：把编译工具、node_modules、venv 和构建缓存放 `/root` 下专用目录，把源码和输出放 `/workspace`。不承诺任意 npm 项目可直接在共享盘原地安装依赖。

## 构建与安装

当前 ARM64 完整装配使用 [首次构建与部署](FIRST-DEPLOY.md) 的 `scripts/first-build.py`。其 inputs 阶段准备固定 Debian/PRoot 输入，assemble 阶段装配插件和 bundle，最终 APK 由 `artifacts/first-build.json` 定位。安装前运行 `scripts/deploy-source.py --check --serial <完整serial>`；全部预检通过且获得目标设备更新授权后才显式 `--install`，不得卸载或清除已有 Debian 数据。

### 历史双 ABI 预览链（仅 0.13.3 基线维护）

以下命令仅适用于匹配的旧基线与锁文件；当前首次构建不用该 overlay/build-baseline 链。根目录执行：

```sh
source scripts/env.sh
python3 scripts/fetch-debian-inputs.py
cd android-shell/plugins/dsh-android-debian
npm ci --legacy-peer-deps
npm run build
npm test
cd ../../..
python3 scripts/prepare-debian-bundle.py x86_64
python3 scripts/prepare-debian-bundle.py arm64
python3 scripts/overlay-fs-adapter.py x86_64 --debian
python3 scripts/overlay-fs-adapter.py arm64 --debian
python3 scripts/build-baseline.py x86_64 --debian
python3 scripts/build-baseline.py arm64 --debian
```

两个 ABI 的 Gradle 构建必须串行，它们共用 assets。PRoot loader 通过 `jniLibs` 安装，并禁用剥离；不能仅将它放进可写 rootfs，否则普通应用域返回 EACCES。`run-as` 成功不代表普通应用域成功，必须由 APK 中的 Agent 验收。

`docs/debian-inputs.lock.json` 固定 rootfs OCI manifest/layer 和三个 Termux 包的 SHA-256；只有主动运行 `fetch-debian-inputs.py --resolve` 才刷新锁。这里复现的是固定基础环境；后续 apt 使用正常软件仓库，包版本可能变化，不能据此声称任意未来的 apt 安装按字节复现。工具安装命令与本次版本清单随验收记录保存。

历史预览包使用 `releases/debian-preview-20260909/manifest.json`，该本地产物清单不随源码提供。以下旧安装和验收脚本仅适用该基线及其 fixture，不能用于当前 APK 或新设备的通用安装：

```sh
python3 scripts/install-device.py DEVICE_SERIAL --debian
python3 scripts/accept-device.py DEVICE_SERIAL --debian
```

基础验收不替代 Debian Agent 功能验收。第一次升级需等待新快照指纹生效；解压事务期间不得强制停止。

## 已发现并处理的问题

- Android 不允许普通硬链接：安装器对归档硬链接复制内容，保留可执行权限；所有路径和符号链接先检查归档边界。
- `./` 是合法归档根目录项，应在父目录越界检查前处理；官方 rootfs 已实际解包验证。
- 普通应用域禁止从可写 app-data 直接执行静态 loader：将 loader 随 APK 原生文件安装。
- guest 不继承 Android 的 LD_PRELOAD 和宿主模型凭据环境；只提供明确列出的 Linux 环境变量。
- guest DNS 使用 Android 当前网络地址。当前在引擎启动时刷新，切换网络后如 DNS 失效可重启应用，或配置插件的 `dnsServers`；不硬编码开发机 DNS 到交付包。
- APK 更新必须保留 `.dsh/debian`；相关升级事务回归覆盖用户已安装软件目录。
- 外部项目在执行前显式检查壳导出的 All Files Access；壳在引擎启动及返回前台时刷新状态。未授权时工具返回 EACCES。后台原地撤权、已有文件句柄的即时失效仍依赖 Android，当前不承诺主动停止全部在途任务。
- 存储撤权测试同时撤销 UID/package app-op，清理残留引擎并重建进程。仅依赖底层写入失败不可靠：模拟器曾在撤权后继续允许写入。关闭引擎新增本应用完整引擎路径匹配，清理句柄丢失后的原生孤儿。

## 安全与平台边界

PRoot 是路径兼容层，不提供内核级 namespace/cgroup/seccomp 容器隔离。我们没有将整个 Android HOME、共享存储根目录或模型凭据文件映射进去；只映射当前项目、/dev 和 /proc，并清理 guest 环境变量。但应用域、网络和内核仍然共享，不能用这套机制承载需要强隔离的不可信代码。

本次专用 canary 探测中，guest 通过普通宿主绝对路径、`/proc/self/root` 以及指定宿主进程 root 路径均未读取到 canary，guest 环境中也没有宿主模型 API key 变量。宿主独立确认 canary 存在。这是有限路径探测，不是安全审计或不可逃逸证明。

Android 后台时限、Doze 和澎湃 OS 进程管理仍然适用；可启动 Web 服务不等于可以永久在线。当前应用的“划掉最近任务=关闭”行为保留。HyperFrames 完整浏览器渲染、Docker daemon、systemd 和任意特权内核功能都不在本次支持范围内。

## ARM64 / 小米平板验收清单

1. 用 ARM64 APK，记录 Android/HyperOS 版本、CPU ABI、页大小和 WebView 版本。
2. 首次安装 Debian，验证 glibc、apt、DNS 和软件安装；实际运行 FFmpeg 与原生扩展。
3. 在 Documents 和真实 USB/SD 目录生成文件，由系统文件管理器读回。
4. 检查切后台、熄屏、主动取消、划掉关闭和重新进入后的任务状态。
5. 验证真实外置盘拔出、权限撤销/恢复、APK 升级后的环境和项目保留。
6. 再根据温度、内存、电量和耗时确定实际使用上限；模拟器结果不作为平板性能承诺。

## 历史预览验收记录

以下记录仅描述旧预览版本的覆盖范围，不代表当前 checkout、首次构建或新设备已完成相同验收。

专用 Android 15 / x86_64 模拟器 `emulator-5580`，实际 APK Agent 使用局域网模型执行工具；不是只通过 adb/run-as 手工运行 Linux 程序。

| 检查 | 结果与边界 |
| --- | --- |
| rootfs / apt | 离线安装 Debian 12；在线安装 FFmpeg、Python 开发包、GCC、Node 和 npm |
| 媒体 | FFmpeg 生成 H.264 320×240、1 秒、10 帧视频；ffprobe 与 Python 断言通过 |
| 原生开发 | GCC 编译 Python C 扩展，导入返回 42；venv/pip 与 Debian Node 运行成功 |
| 用户存储 | 私有项目、Documents 和虚拟外置卷生成文件，宿主独立读取视频复核；撤销授权后工具拒绝且无新文件；卸载卷后项目拒绝访问 |
| 升级 / 重建 | APK 更新保留原 generation 与已装 FFmpeg；reset 新建干净 generation，旧软件仍在，项目视频 SHA-256 不变 |
| 后台服务 | Python HTTP 服务在确认 Asleep 状态下持续 60 秒，13 次 HTTP 200；不是长期 Doze/HyperOS 保活承诺 |
| 划掉关闭 | 实际移除最近任务卡片后，引擎与 guest HTTP 停止，任务 cancelled；观察 12.15 秒无重启，随后手动重开 |
| 主动取消 | 任务记为 cancelled，服务端口关闭；忙时重建被共享租约拒绝 |
| 引擎异常退出 | 最终包实测 guest 约 0.29 秒停止，引擎约 11.68 秒恢复；任务 interrupted，无自动重放 |
| 回归 | 20 项 JVM 测试；安装器与工具守卫测试通过；每个 ABI 6 项运行时门禁；APK 内 14 项文件系统测试通过 |
| 双 ABI | x86_64 199,923,685 字节；ARM64 202,232,740 字节；原生 loader ELF 架构和包内字节一致，签名验证通过 |

软件版本：glibc 2.36-9+deb12u14、FFmpeg 5.1.9、Python 3.11.2、Node 18.20.4、GCC 元包 12.2.0、npm 9.2.0。完整 Debian 包版本以验证目录的 `debian-package-versions.txt` 为准。

构建基准提交 `bde88c5a705b671a4cd8d88e7cc5f4eaeab0725e`。最终候选包对升级、媒体/原生编译、撤权、异常中断及基础回归重新验收；其余功能探索记录来自此前同一里程碑的开发候选。筛选后的工具结果、独立文件/进程校验和构建记录在 [验证目录](validation/2026-09-09-debian/)。

[局域网下载](http://192.0.2.40:8768/)；[发布清单](../releases/debian-preview-20260909/manifest.json)。两个 APK 均经 LAN 完整下载重新计算 SHA-256，不只检查页面可访问。

## 来源

- [Debian 官方容器镜像源码](https://github.com/debuerreotype/docker-debian-artifacts)
- [Termux proot 配方](https://github.com/termux/termux-packages/blob/master/packages/proot/build.sh)
- [PRoot-Distro 限制](https://github.com/termux/proot-distro#limitations)
- [Android 前台服务超时](https://developer.android.com/develop/background-work/services/fgs/timeout)

第三方原生组件的版权与许可随 bundle 分发；Debian 包内的 `/usr/share/doc` 和 `/usr/share/common-licenses` 保留。固定二进制输入来自上游发布包，本里程碑没有声称从源代码重编 Node、PRoot 或 Debian。
