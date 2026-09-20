# 单麦会话工作台

可选的四会话 Deck。

## 依赖关系

- 工作台自身必需：协调仓运行时与 UI 服务（`dsh.client.inject` 中保留的包：runtime、responsive、settings、conversation、chat、renderer、workspace），以及 `layout/slots/sessions/uiSession/uiConversation/conversation/deckInput` 服务。缺少这些才会在 `dsh.client.inject` 层被联动卸载。
- 可选输入：`@dsh-android/dsh-android-voice-input`（androidVoice）与 `@dsh-android/dsh-client-input-gamepad`（gamepadInput）。两者已从包级 `dsh.client.inject` 和客户端 `inject` 中移除，各自通过独立的 `ctx.inject([name], cb)` 子插件在服务到达时捕获、在服务卸载/替换时经子 ctx effect 释放；子插件生命周期不影响工作台父 fiber（泳道注册、active、stage 租约、草稿均保持不变）。
- 缺失时行为：语音与手柄均不存在时工作台仍可启用，会话选择、触屏横滑、草稿、附件和文字发送全部正常；缺语音时按 △/录音给出“未安装语音输入插件”的明确提示，文字发送不受影响；缺手柄时无手柄绑定，触屏路径不变。
- 热卸载策略：提供方重载或替换后只重新捕获一次；手柄仅在启用、视图挂载且持有服务时绑定一次。每次 bind 都是独立的围栏代次：释放（提供方撤回/替换、关闭工作台、视图退出、插件卸载）先把该代次的回调永久作废，再调用旧 bind 的 disposer（含重复按键状态释放），因此被撤回或替换的提供方即便持有旧回调，也永远无法再发送、删除或录音；关闭开关会同步释放绑定，不等待视图卸载，enabled 关闭到 React 清理完成之间的窗口内不存在滞留的 sink；父插件卸载在上下文仍可用时同步完成全部自有清理：视图挂载 effect 与父 ctx effect 共享同一个幂等的一次性 detach（谁先执行谁生效，后一次是无操作、不触碰失效上下文），移除 `dsh-gamepad-reset` 监听、复位工作台 layout 标记、释放语音泳道并归还 stage 租约；随后再释放手柄 sink、视图注册与样式。因此即使 React 视图清理被推迟或从未执行，卸载后工作台标记也不会滞留；视图内滞留入口（Lane 的 openView、折叠对齐 hook、聚焦 rAF）与公开动作（setEnabled/assign/activate/open/intent）在卸载后直接返回，不再访问已失效的上下文、编辑器或草稿。新代次绑定仍各生效一次，无新增 `dsh-gamepad-reset` 监听、无残留定时器，也不会调用已卸载的语音实例。语音的会话归属与 held 文本机制保持不变。
- 原生硬件按键与真实麦克风不属于本地模拟覆盖，在平板上补验；实际 Cordis 服务生命周期由监督者独立验收（本地测试用披露范围的 React/DOM/ctx mock 执行真实集成代码）。

- 左侧每行一个会话槽；中间每屏两个泳道，横向滑动和吸附，纵向独立滚动。
- L2 展开/收起会话栏；L1/R1 循环切换并聚焦草稿末尾；△ 开始/结束录音；□ 退格并支持长按。
- 手指横滑结束后选中新出现的会话；只使用当前单个麦克风。
- 复用官方 SessionSurface/编辑器，语音结果按原 sessionId 追加草稿，不自动发送。
- 设置内独立开关；四槽绑定和草稿持久化。无 LARK/WebHID 依赖。

构建：`npm ci && npm test`。运行依赖协调仓 `scripts/patch-voice-deck.py` 对固定引擎的版本守卫补丁；不能直接在未适配的任意上游版本使用。

完整设计与实机证据见协调仓 `docs/PS5-VOICE-DECK-DESIGN.md`、`docs/PS5-VOICE-DECK-MILESTONE.md`。
导入来源与公共接口参考见相邻 `voice-plugin-import/README.md`；活动实现以本目录和构建期补丁为准。


2026-09-09 增量：○ 发送沿用官方 InputBar 守卫，长按不重复。`/`、`@` 官方菜单允许向上绘制且按泳道高度限制；正文横滑由 chat-swipe.ts 按方向路由，纵向滚动保留原生，宽代码/表格优先内部横滚。实机与快照证据见根目录 docs/PS5-VOICE-DECK-MILESTONE.md。

横滑惯性补充：短快甩按释放速度跨列，慢拖就近缓动吸附；动画结束后才恢复 CSS snap/焦点。支持触摸中途接手，手柄切换取消旧动画。
