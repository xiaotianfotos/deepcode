# Android 语音输入插件

在官方 `conversation.input.right` 插入麦克风，在 `settings.section` 保留“语音输入”入口和本机启停开关。默认启用、固定使用本地 Qwen3-ASR-0.6B / CPU，无模型参数配置。

点击录音后，官方 `conversation.input.dock` 在输入框上方展示 Homerail AgentVoiceCockpit 的 SVG 三曲线（52px 高、与输入框同宽、间隔 8px）。WebRTC VAD 连续 5 秒无语音自动结束，也可点“完成”或“取消”；无语音不请求模型；有语音先裁剪静音并保留前后 300ms，再整段转录追加到当前可编辑草稿，由用户确认发送。通过官方带 draftRev 的 insert-text 事件写入，按 occurrences 将 clipboard 投影折算为 detect 坐标（每个引用卡片一格）。不替换整个草稿，不调用 submit。

Android 能力来自壳的 VoiceInputController：RECORD_AUDIO、16k PCM、最多 60 秒、取消/会话卸载/退出前台清理、两分钟空闲卸载模型。失败的转录保留在提示中供复制。模型与正式引擎构建说明见根目录 docs/VOICE-KLEIDIAI-PRODUCTION.md；一次性实机记录仅保存在本地。

```sh
npm ci --legacy-peer-deps
npm test
```

安装：本地总仓构建 `--voice-debug`；独立部署时将包加入 web profile patch。仅客户端组件；服务端 apply 是标准空挂载。语音开关独立于性能插件。
