# P01：Codex 关闭后释放 App Server，查看设置不能重新启动它

## 目标与用户行为

用户在“设置 → 插件 → Codex”关闭后端后，空闲 App Server 应退出。继续停留在设置页、关闭重开设置、页面重新加载，都不能再次启动进程。重新启用后，正常登录/读取账号或选择 Codex 时可以启动并恢复使用。账号授权、会话映射、项目和草稿保持完整。

本 issue 只实现停用生命周期，不重做插件配置页或引擎选择 UI。

## 当前可定位的问题

- `android-shell/plugins/dsh-android-codex/src/account.mjs`：`status()` 无条件 `client.start()`；`perform()` 在分支前也启动；`enable:false` 只调用 setEnabled 后再次 status。
- `src/client/index.tsx`：设置卡片每两秒刷新上述 API。
- `src/client.mjs`：enabled 当前只拒绝工作请求，start/boot 不受门控；close 和旧进程 exit 的并发要谨慎处理。
- `src/index.mjs`：enabled 读写私有 JSON，卸载时注册 close；Relay 使用这个 client。
- `tests/client.test.mjs` 现有“disabled backend rejects work but permits account access”允许禁用状态启动，这是旧行为，不应为保住此测试而维持错误契约。

证据级别：上述为源码可证明的调用关系；可用 Fake Client 计数复现关闭和轮询仍调用 start、未调用 close。实际设备进程行为需要后续独立验收，准备阶段不得宣称实机修复通过。

## 明确语义

1. **状态读取无唤醒**：enabled=false 时 status 返回 enabled=false、connected=false、csrf 及已有的脱敏展示信息或 account=null；不读取磁盘授权原文、不发送 account/read、不 boot。不硬编码 connected=true。
2. **关闭**：先校验 CSRF、动作和 boolean 参数；存在 active turn 或正在启动工作的 pending request 时拒绝，配置不变、进程不变。空闲时先建立不接收新工作的门控，再有序退出；返回前清理 pending/timer，后续轮询不重启。
3. **登录中关闭**：关闭是明确取消当前登录流程，不是退出账号。取消只对已有 loginId/进程执行，不能为取消专门启动进程；清理 login 展示。迟到 login/completed 必须不能复活旧状态。保留已完成授权的数据。
4. **停用时其他账号操作**：login/logout 返回“请先启用”；无活动登录的 cancel 可幂等返回状态；禁止这些动作绕过停用门控启动。用户仍能点击启用按钮。
5. **重新启用**：持久化并释放门控；允许下一次有意义的使用启动，一个并发周期只有一个子进程。开启本身可以保持懒启动，不强制启动。状态读取在启用状态可沿用当前账号读取方式。
6. **重复操作/失败**：重复关闭不重复杀进程；重复开启不双启；启动失败可以显式重试。停用写入失败不显示成功；停用已持久化但进程清理失败时维持 disabled，返回明确错误，不反向开启。
7. **异步隔离**：status 与关闭、start 与 close、旧子进程 exit 与新实例交错时，旧消息/退出不得清理新实例的 pending requests/状态。必须用实际实例身份或 generation 保证，不用 sleep 猜时序。
8. **真正卸载**：沿用 Cordis disposer 关闭所属进程；不删除 CODEX_HOME、settings.json、session-links、授权文件。

## 建议实现分工

层级：Android Codex 插件的 Host 账号控制器和进程 client。HomeRail Manager 不修改，Relay vendor 不修改，原生壳不修改。

这三个部件共享并发状态，合并为 **一个 implementer 工作项**，不要拆成同时修改 account/client 的两个 Worker：

- 将动作校验移到有副作用的启动之前；将停用状态返回独立出来，保存现有响应字段兼容性。
- 在账号动作串行队列与 client 生命周期间建立一致的启停边界；GET 状态也必须遵守关闭中的状态。不将状态 API 改为无条件自动 enable。
- 根据需要在 AndroidCodexClient 增加明确的暂停/恢复或启动门控；仍兼容固定 Relay 的 start/request/close 接口。不要把 Cordis 卸载后的永久销毁和用户可恢复的停用混为一谈。
- 使用 Fake Client 和 JSONL 子进程 fixture 补测试。Fake 记录 start、close、account/read、login/cancel；并发使用可控 Promise barrier，断言调用数量、进程退出、pending 归属。
- 设置卡片若需要，停用时禁用登录/退出并保留启用控件；HTTP 错误不可当成功状态覆盖。保留邮箱脱敏和 CSRF。

## 允许修改的路径

- `android-shell/plugins/dsh-android-codex/src/`
- `android-shell/plugins/dsh-android-codex/tests/`
- `android-shell/plugins/dsh-android-codex/README.md`

允许在该包新增测试 fixture/helper；本任务不新增依赖，不修改 package.json/lock，不重构构建系统。构建生成的 lib 是验证产物，按当前忽略规则处理。

只读上下文：固定 Relay vendor、rebuild-codex-shell.py、插件 package/build 文件、根 AGENTS、插件契约文档。禁止修改其他插件、原生 Kotlin/Java、快照/模型、签名、用户配置、AGENTS、HomeRail、CI。任务要求与历史文档冲突时按本任务更具体范围执行；发现必需越界时提交 blocker，不自行扩范围。

## 验收用例

- A01 初始 disabled：连续 3 次 status 不调用 start/request，返回 disconnected，启用入口仍可用。
- A02 已启用且空闲：关闭后 close 完成；随后至少 3 次状态读取不再启动。
- A03 执行中/启动工作请求未完成：关闭和 logout 被拒绝，原 enabled、进程和工作保留。
- A04 disabled→enabled→use→disabled→enabled→use：正常两轮，每轮单进程，没有多份监听器或悬挂 Promise。
- A05 CSRF 错误、未知 action、非法 enabled：不启动、不关闭、不写配置。
- A06 登录启动中与关闭交错：登录结果不残留，取消不启动新进程；迟到成功事件不改变关闭状态。
- A07 GET 轮询与关闭交错：关闭完成后零新增 boot，无后台“回魂”。
- A08 start/close/旧 exit 交错：旧回调不能拒绝新进程请求；close 可重复调用且有退出超时兜底。
- A09 原有邮箱脱敏、登录 URL 白名单、请求超时、crash 恢复、active turn 跟踪测试继续通过，按明确新语义更新旧 disabled 测试。
- A10 构建通过、产物和配置未泄露凭据；整个 diff 限于允许路径。

## 验证与交付

在隔离检出的源码中安装该插件固定 devDependencies（不执行第三方安装脚本），执行 Node account/client tests 和 npm build。具体命令由 caller 的不可变 task-plan 传入，不接受 Worker 任意省略失败测试。

交付：候选 patch、变更理由、用例与测试结果、已知限制。独立 reviewer 检查状态、副作用、并发和回归。没有实际运行的测试标明未验证；不能用“设计上通过”代替结果。不自动推送 NAS/GitHub、安装 APK 或操作任何设备。

集成后的平板验收另行进行：确认无运行 Agent 后升级，设置页反复启停并检查所属 App Server PID、模型菜单、账号脱敏与旧会话；新建小任务验证恢复。此步骤不在本次 HomeRail 准备 DAG 中执行。
