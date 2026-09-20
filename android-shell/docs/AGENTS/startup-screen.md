# 原生启动页

`GuideChrome.kt` 构建海底鲸鱼启动页，`GuidePageRenderer.kt` 把现有 GuidePhase 映射为简短状态。引擎启动、快照事务、重试与回撤机制仍由 EngineStartFlow 管理。不要为播完视频延迟进入 Web UI。

## 视觉与布局

- `app/src/main/res/raw/startup_ocean_loop.mp4` 是用户提供的海底鲸鱼视频，随 APK 分发，不依赖网络；H.264 / 2560×1440 / 24fps / 3秒。来自用户提供的约5.17秒视频，源文件保存在 `artwork/startup/ocean-source.mp4`；按 `loop.json` 截取帧8到79（第80帧为近似重合端点，不重复），去除音轨，不申请音频焦点。
- `drawable-nodpi/startup_ocean.png` 是视频首帧，供初始化及解码失败时兜底。品牌、状态和不定进度均为原生控件，不能烧入视频或展示假进度。
- `StartupOceanVideo` 用单个 TextureView/MediaPlayer 原生循环这段72帧完整周期，保持正常运动方向，不倒放、不交叠淡化。准备阶段显示同一首帧，视频实际输出第一帧后才显露。通过根目录 `scripts/prepare-startup-loop.py` 从固定 SHA 源素材重建视频和首帧。
- 视频图层与首帧背景按相同中心裁剪规则铺满窗口。文字区锚定16:9画布的下部，避开系统栏/键盘；窄屏、短窗口及大字体下允许滚动，保留至少48dp的详情/恢复点击区域。
- 普通启动只显示“正在准备…”；首次准备明确说明需要几分钟。失败/关闭展示恢复入口。状态通过无障碍 live region 通知。
- “启动详情”弹窗保留实时技术状态、解压进度、最近日志及复制、存储授权、控制台、检查更新。进入 Web UI 或 Activity 销毁必须关闭弹窗及状态动画。

素材公开许可见 [启动素材说明](../../artwork/startup/README.md)：维护者确认其为自有 AI 生成素材，允许随项目按根 MIT 分发与修改；该授权仅覆盖说明中列出的源视频、循环视频及首帧。

## 播放生命周期与资源

仅启动页可见且 Activity 已恢复时创建单个解码器。进入聊天、退到后台或移除视图立即停止定时器、释放播放器与 Surface；重新显示时重新准备。解码失败退回同一首帧，不影响引擎启动及恢复按钮。应用页不保留后台视频解码循环。

更新视频时同时替换其首帧；保持无文字、中央主体及下部留白。需要检查多次循环的鲸鱼轮廓/光线衔接、冷启动与返回前台、横竖屏裁剪和进入聊天后的播放器释放。一次性截图、录屏、安装回执只放 `.local/validation/`。

## 插件与网页加载交接

`plugins/dsh-startup-appearance` 拥有 `startup-appearance.enabled`，默认开启，统一位于可配置插件列表。Host settingsScope 与 revision 是配置真源，`StartupAppearance` 仅保存本地启动缓存。关闭/卸载时原生播放立即释放，关闭后使用原有 StandardGuideChrome。APK 不重新插入已卸载的插件，不覆盖用户修改的插件文件。

启用期间 GuidePageRenderer 让 WebView 在原生动画下方加载，检测标准 `conversation/sidebar` 槽位后等待 WebView VisualStateCallback，再撤掉加载层；不会露出正常初始化中的默认网页 Logo。独立20秒超时会显露原网页，保留加载失败时的诊断，不无限遮挡。页面导航使用 generation 排除旧回调；原生失败页取消网页交接。系统栏随当前可见界面切换暗色/原网页颜色。
