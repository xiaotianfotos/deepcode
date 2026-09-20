> 当前状态（2026-09-11）：旧全量透视被用户判定过强，已改成受限位移；显示策略已更换为前台持续 state 5，真实对照获“不黑”反馈。集成版已安装并完成六次窗口迁移检查，完整开合及外屏输入验收进行中。以下前段为演进记录，最新方案见文末。

# 折叠透视采样增量（2026-09-11）

状态：教程先行完成；已实现固定正视角透视采样、20项折叠JVM测试通过、ARM64综合APK构建及签名/对齐校验通过。已安装Fold，0/60/120/180°注入预览在两块物理屏上渲染无着色器错误，编辑器/草稿/文档保持；真实视觉待用户确认。不能把数学或截图测试当成光学效果验收。

教程位于 `/path/to/developer/videos/2026/Q3/xiaomi-o3/小米平板与折叠手机使用DeepCode教程与项目全记录.md`。按用户要求先完成完整项目说明，再进入本次代码修改。

## 为什么要改

现有FoldProjection仅计算清晰/模糊分界；每个模糊等级仍在原坐标采样。参考[Solotilt](https://solotilt.com/)公开[着色器](https://solotilt.com/_app/immutable/nodes/2.CLft3SKH.js)，物理屏幕已经产生视角缩短，内容应按观察射线回投到虚拟平面采样，而不是再把整个WebView压成梯形。此次未能连接交互浏览器，网站结论来自公开源码，未声称亲自体验其运动。

## 本次数学与范围

坐标x/y归一化，宽高比a，观察距离d=2.4*max(panelAspect,1)，单位为屏幕高度。panelAspect在内屏为a/2、外屏为a；首版误用整幅内屏a，已修正。观察点位于铰链横坐标、画面垂直中点。

- 内屏：铰链h=.5，右半固定；只对x<h计算，旋角φ=π−θ。
- 外屏：铰链h=0，旋角φ=min(θ,π/2)。超过侧视时正面不可见，预览保持侧视，不翻转采样。
- 深度z=abs(x−h)*a*sinφ，比例k=d/(d−z)。
- 采样u=h+(x−h)*cosφ*k，v=.5+(y−.5)*k。
- 内屏完全展开、外屏完全闭合为恒等映射；内屏固定右半和铰链线不移动。
- 采样超出图像平面返回黑色边界，不重复拉伸边缘像素。最大深度小于观察距离，不存在分母穿零。

FoldGradientBlur在每个高斯层使用同一坐标映射；原有模糊权重仍按屏幕位置计算，保留用户已接受的方向和速度。外屏使用visibleOffset/visibleWidth扣除侧栏裁取偏移。普通非折叠预览没有透视。

没有增加运动传感器；没有改变WebView布局/宽度、双屏供电策略、会话、Codex和输入路由。此次为约定观察姿势的近似效果：两屏仍沿用原来的画面裁取关系，没有完成任意视角、精确眼距、实际铰链厚度/屏幕间距的统一标定。不宣称光学透明重建。

## 验证

`FoldPerspectiveTest`新增4项：端点恒等与固定半屏、铰链锚定/上下对称、已知60°射线解、全角度多宽高比有限性。既有16项Fold测试继续通过。JVM只验证数学和已有状态策略，不编译AGSL GPU代码。

构建：`source scripts/env.sh` 后运行 `python3 scripts/rebuild-codex-shell.py`，保持已验证snapshot，候选包以 `artifacts/build-arm64-codex.json` 的SHA为准。本次收据与测试摘要在 `docs/validation/2026-09-11-fold-perspective/build-and-tests.json`。

已确认无运行任务/快照事务，释放双屏租约后安装。网格检查：120°内屏固定右半ROI相对180°像素差最大值0，左半变化；外屏60°呈对称透视边界，0°无顶部黑边。注入预览后清理测试图并恢复折叠开关。仍需实际慢开合检验透明感。手机普通移动不应触发；原供电闪黑问题不属于本次已解决范围。

## 连接恢复与复测入口

测试时发现应用ADB仍连接旧34783端口，而无线调试已改43159。AdbState现仅在旧连接失败后使用已有的本机端口发现（系统属性/按本机地址过滤的NSD），凭原配对身份连接成功才更新保存端口；不新增授权、不复制私钥。该流程在实机成功，随后通过应用自己的ADB取得/释放副屏租约。

历史脚本最初使用FoldSecondaryCommands；当前 `scripts/test-fold-perspective.mjs SERIAL [OUTPUT]` 已改用下述稳定state5测试及像素门禁。要求完全展开和无活动Agent，短暂覆盖网格，不发送会话请求；finally移除并恢复，watchdog防止显示租约遗留。生成器的临时入口包装acquire/heartbeat/release，可按同包Java类重建，不属于APK运行依赖。

证据：`docs/validation/2026-09-11-fold-perspective/native-shader.json`、`pixel-checks.json`、两屏PNG；最新版安装/账号/模型/补丁哈希校验见 `docs/validation/2026-09-10-fold-deploy/runtime-final.json`。实际开合只读采样入口 `scripts/watch-fold-secondary.mjs SERIAL 秒数 输出目录` 现支持动态serial并核对lhasa，不再硬编码旧端口。

## 本轮真实开合记录

`physical/result.json`：60秒327次采样，真实铰链0–178°，142次双屏活动样本，主屏角色两种均出现；编辑器、文档、草稿全程保持，着色器/镜像错误集合为空。结束2°，租约0、共享画布关闭、偏移恢复0。日志仍含系统OFF/ON，未宣称消除闪黑。用户对透视美感尚未给出验收结论。

## 用户反馈后的面板尺度与交接修正

用户确认形变已有效果，但比例仍怪；外屏合盖仍闪黑/闪新界面。旧实折trace证实末段CSS宽880→424及mobile状态切换，同时含系统OFF/ON；不能把两者都归为响应式。

本次修正：

- 观察距离按单块物理面板宽高比计算，内屏使用画布半宽；加入等尺寸内外面板在相同倾角/离铰链距离下纵向放大相等的测试。仍是固定观察点，没有完成精确眼位和屏幕毫米标定。
- FoldDualDisplay不再在ADB释放开始前收窄WebView；等释放回执之后再恢复正常手机布局。如果用户在等待中重新打开，保留共享画布及角色标记，不制造两次宽窄切换。
- 共享画布refresh分支仅在leased=desired=1时启动镜像，禁止把freezeForHandoff刚冻结的镜像下一tick又启动，避免采到交接重排帧。
- 没有将宽桌面页面永久裁在外屏上，否则正常输入框/发送入口可能越出可触区域；没有全局强制mobile。

21项Fold JVM测试、最新APK安装/数据保留校验、双屏四角度AGSL及固定右半像素回归通过。证据 `panel-match/`；具体美感与闪界面改善待本轮实际反馈，不能宣称消除系统断电黑帧。

修正版60秒观察窗口：339样本均为179°，没有实际折叠，不能用该窗口验证释放重排修复；无错误、无活动租约、草稿保持。实折反馈仍待补。

## 当前候选：受限透视 + 固定双屏窗口（2026-09-11）

用户再次反馈“变形太厉害，闪黑没解决”。本轮目标包含真实实机视觉验收，不以编译、网格或日志单独替代。

### 透视收敛

上述射线公式保留为 `FoldPerspective.project`，实际采样 `sample` 与 AGSL 同步改为：

- `strength = 0.18 * sin(clamp(angle,0,180))`。
- 混合位移 `delta = (projected - original) * strength`。
- 横向 delta 限制在 ±4.5% 单面板宽（内屏全画布 ±2.25%），纵向 ±2% 高度。
- 两个端点均回到恒等采样，内屏固定右半不变，模糊方向和边界速度沿用已接受的投影遮挡模型。

这是为实际观感收敛的温和修饰，并非完整物理投影。22 项 Fold JVM 测试覆盖有限性、端点、面板尺度及位移上限；仍需用户在真实视角确认美感。

### 黑屏隔离实验

| 实验 | 实际角度 / 状态 | 结果 |
|---|---|---|
| 固定 state 3，加 enable-display 1 | 0–179°，base 随折叠变更 | 系统仍关闭外屏；用户“外屏没内容了” |
| 固定 state 5 OPENED_PRESENTATION | 0–179°，base 3/2/0/1，committed 恒为5 | 60秒无OFF/ON；用户“不黑了” |

证据：`docs/validation/2026-09-11-fold-fixed-state/result.json` 和 `state-5/result.json`。脚本 `scripts/probe-fold-fixed-state.mjs SERIAL SECONDS STATE` 有60秒上限、独立owner/token、watchdog、finally恢复。不能在正式状态5租约未释放时重复对照，也不能重置其他调用者的override。

### 当前集成

`FoldDualDisplay` 仅在已授权、前台未锁屏、开启功能的 lhasa 上持续申请 state5；真实铰链端点不再释放租约，也不请求state6。后台/关闭时归还，心跳3秒，watchdog检查token、owner和进程。

`FoldMirror` 在合盖≤3°稳定150ms时，将同一个 WebView 移到外屏 Presentation；展开≥10°时移回内屏。原图先垫底，布局变更后等待 Chromium visual-state callback 再显示。没有第二个 React 页面/编辑器/会话；正常闭合时手机布局仍可以完整操作，不能靠永久裁去宽界面来掩盖交接。外屏window接收自己的系统栏/IME inset；手柄焦点按WebView所属窗口判断。

`foldHostPreview(bool)` 为debug15秒测试入口。`scripts/test-fold-window-host.mjs` 六次交接得到CSS宽424/859交替，同一文档/编辑器/草稿，无shader/mirror错误，零OFF/ON；证据 `docs/validation/2026-09-11-fold-stable-host/result.json`。这是宿主交接测试，不是实际折叠，也没有证明物理触摸或输入法。ADB input 在此机被系统拒绝 INJECT_EVENTS；CDP能输入临时测试框，但不能以此声称外屏软键盘通过。

当前候选 APK `240b2e9fd3ba08cd476a3a70b9e709dfc1c84938e63bef0ead00bb729711e35e` 已安装，snapshot不变；Codex账号、原生文件、Debian、ASR模型hash及运行时补丁校验通过。后续新包以构建/安装收据为准。

待完成：真实开合的窗口/供电记录、外屏触摸与IME、闭合启动/前后台恢复、温和透视的用户视觉确认。系统显示策略对照成功不等于所有功能已经验收。

集成版第一段120秒只读记录：663样本均179°，没有实际折叠；状态5持续、无错误、无电源事件，文档/草稿不变。此段只证明展开静置稳定，不能作为真实开合通过。对应 `fold-stable-host/physical/result.json`；已请求用户补充实际开合与外屏键盘验证。

## 持续验证补充：生命周期与像素门禁

- `scripts/test-fold-host-lifecycle.mjs SERIAL` 已在当前安装包运行：内屏宿主、模拟外屏宿主各一轮退出至系统设置/返回。后台lease=0、镜像关闭、override为空；恢复lease=5、hostReady=true；文档、编辑器、草稿保持。证据 `fold-stable-host/lifecycle.json`。不代表闭合冷启动或真实外屏键盘通过。
- 连续180秒第二段记录仍是179°静置，970样本无错误/电源切换；`physical-2/result.json`不能当作开合验收。
- 查像素发现旧shader验证脚本仍用enable-display副屏租约，外屏120/60/0°截图实际全黑，虽mirrorShowing/frames正常也不算通过。该失败证据保留在`bounded-shader/`，已纠正测试结论，不能将其写为双屏通过。
- 当前shader验证脚本编译仓内`fixtures/fold/FoldLeaseMain.java`生成与APK一致的owner-checked state5租约；每角度心跳，finally只释放自己的租约并恢复功能。重跑`bounded-shader-state5/`，0/60/120/180°八张物理截图均非黑屏（有效像素覆盖96.3%–100%），120°内屏固定右半对180°最大像素差0。着色器无错误且同文档/编辑器/草稿；末尾测试图已移除，probe idle，正式state5恢复。
- 新`check-fold-perspective-pixels.py`拒绝全黑/严重裁剪图及内屏固定右半变化，已纳入脚本成功门禁。静态GPU检查仍不验证真实开合的视觉闪帧、美感或物理触摸。

## 用户反馈“快合上画面飞走、底部UI留下”的修正

实际WebView逐帧复现：859→424px时，mobileDrawer从x=0滑至屏外，mobileSheet从y≈487滑至622；两条CSSTransition分别为margin-left/transform、持续300ms。原生宿主交接只等待120ms再请求首帧，不能以此保证CSS过渡完成，故换宿主后露出面板滑动。证据`docs/validation/2026-09-11-fold-endpoint/before-dom.json`。

AppFrame移动/桌面布局切换时，layout effect设置data-layout-changing；只在两帧布局提交阶段关闭相关transition，之后恢复。未改state5供电/铰链模糊/透视公式。已构建安装APK5b4140330dd23665609df8586f73a2fef2f9f92e5978720dd43617ed09b1bcee；14项相关前端测试通过，安装后snapshot/nativeCodex/账号/模型/Debian及管理补丁校验通过。

`test-fold-endpoint-animations.mjs SERIAL` 实测原生窗口往返，101/55帧中自动面板transition为0；手动展开drawer仍有300ms动画；同编辑器/同文档/同草稿。`after-dom.json`为证据。脚本允许完全展开或闭合稳定端点开始，finally按起始真实角度恢复debug宿主，15秒后覆盖失效。当前手机已合盖，测试结束恢复可交互外屏，未改用户草稿。尚需真实合盖复验飞屏现象；该记录不能宣称所有闪黑问题已验收。

## 用户确认的外屏布局边界

用户指出“合盖后出现DeepSeek Harness标志，和内屏左侧不一致”；随后明确选择 **合盖后文字重排，但不显示顶部标志**，而非永久裁取宽画布加横移操作。当前继续允许859→424px重排以保留完整输入和发送区，Fold原生设备的mobile模式改为compact header：没有额外品牌行，导航44px按钮放到既有会话标题左侧，正文容器y=0，不影响其他设备默认移动布局。

中间版bf4145f…实机自动面板transition=0、wordmarkHidden=true、bodyTop=0、composerFits=true。但截图发现导航y=50压住“对话”标签，原因是WebView保留46px旧safe-area top。后续改为既有会话header首行y=12，增加navigationAboveTabs像素矩形门禁。最终构建为0db5baac138ed4db79fd2f3c9eaaf832d59ff343fadee218765222d9645fb3b2；安装和完整检查结果以compact-final目录及当前部署收据为准，不提前宣称实折通过。

最终compact修正版已安装且安装/数据核验通过。`compact-final/after-dom.json`：自动panel过渡0、手动drawer动画true、wordmarkHidden=true、bodyTop=0、navigationAboveTabs=true、composerFits=true，同文档/编辑器/草稿；`cover.png`为原生物理屏截图。仍需真实合盖确认本次体验，未标记整项目完成。

最新集成版真实开合记录已完成：120秒606样本，真实铰链0–179°，两种编辑器宿主均出现；606样本保持state5双屏活动，电源OFF/ON事件0，shader/mirror/lease错误0，同文档/编辑器/草稿。结束完全展开179°、内屏宿主hostReady，证据`compact-final/physical/result.json`和trace。此为新版真实开合供电与连续性证据；用户对最终飞屏观感、透视和实际外屏键盘的反馈仍独立待确认。

## 2026-09-11 用户暂停研发

用户反馈当前基本可用；短暂壁纸试验后取消皮肤，要求停止研发、保留透明特效。已移除试验皮肤挂载并恢复深色背景，本轮未修改原生折叠实现。后续方向记录：外屏与内屏右侧在视线投影下需要内容一致并对齐；不在本轮继续实现。
