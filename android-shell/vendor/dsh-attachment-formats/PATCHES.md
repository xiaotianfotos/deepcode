# dsh-attachment-formats 0.6.4：按会话分发图片

上游：https://github.com/linkingoscar/dsh-attachment-formats ，包声明 Apache-2.0。
`client.original.js` / `package.original.json` 保存当前已部署快照中的原始文件，未修改；客户端 SHA256 为 `35911f6da9af3363a185b6b1564f813eb249a9d99a68f52bd56400be84bb2f98`。

`scripts/patch-attachment-session.py` 使用 SHA 和唯一替换守卫生成 APK 的 `attachment-session-client.js`。原始全局 `document.dispatchEvent(drop)` 会让多个工作台编辑器竞争图片；新版向 `deckInput.for(sessionId).addImages` 投递。该适配器转交目标 InputBar 的原有 intakeImages，保留忙态、数量、类型、大小校验。目标不存在或拒绝时显示错误，不回退到其他编辑器。

按钮的 sessionId 来自其插槽；拖放/粘贴从事件所在泳道解析。异步处理前固定目标及工作目录；每个会话独立请求序号，避免跨泳道取消。正文文档卡片仍使用上游原有存储模型，本次不宣称全面支持多会话文档卡片；此补丁验收范围为图片归属。

2026-09-11 修改者：DeepCode Android 项目。生成文件依然包含原插件注释；完整原始快照与来源记录由项目 downloads 维护。

原插件 composerReady 依赖旧 textarea；当前修复读取指定会话的输入状态，不再以全页第一个输入框判断能否添加。
