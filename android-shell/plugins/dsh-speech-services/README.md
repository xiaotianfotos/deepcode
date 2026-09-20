# Speech services

DSH 可配置插件：`speech-services` namespace 与 `settings.plugin.item`。本机/HTTP/WebSocket ASR 可选，TTS 独立启用且默认关闭，启用后由 Agent 调用 `say` 按需简短回应，不自动朗读回复，桌面直接语音兼容已有 DSH/Codex 会话。

依赖 Host settings/webServer；DSH 通过可选 tools/systemPrompt 注入专用 say 工具与提示段，Codex 使用托管 say 技能，以及客户端 settingsScope/slots。原生适配由 Android 壳提供。普通网页没有原生悬浮窗或本机 ASR 能力。

配置、接口、关停与构建说明见 [语音服务维护文档](../../../docs/development/SPEECH-SERVICES.md)。插件测试使用 fake HTTP/WebSocket 与真实 Cordis 生命周期，不下载模型、不访问用户服务。运行 `npm ci && npm test`。
