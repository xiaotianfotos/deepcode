# Voice Deck 来源与公共接口参考

活动插件在 `../dsh-client-ui-voice-deck/`，已适配单麦、PS5 与 Android 语音桥。未接入的 WebHID 多麦插件和旧版 Deck 副本不再随仓库维护。

## 来源

- 来源仓库：https://github.com/xiaotianfotos/deepseek-harness
- 原始上游：https://github.com/deepseek-ai/deepseek-harness
- 来源分支：`codex/voice-plugins`
- 导入基线：`f4fd5f005636cdcbf9d95f70f04d05afa8c0db54`
- 导入包含该基线上的未提交改动；不能把基线提交当作当前插件的精确源码摘要。
- 导入源码的 MIT 声明见 `LICENSE`；当前插件保留已有及导入来源的版权声明。

## 保留的接口参考

`harness-integration.patch` 保存来源工作区的非 ASR 公共接口设计，包括 `sessions.acquireStage`、`workspaceSessionClaims`、侧栏插槽及配套测试接口。它是维护适配层时的接口参考，**不是当前构建会直接应用的补丁**，不能直接覆盖任意新版上游。

当前实际装配使用根目录 `scripts/patch-voice-deck.py` 对固定 DSH 引擎施加版本守卫补丁，并由 `scripts/rebuild-codex-shell.py` 打包活动插件。具体契约见根目录 `docs/PS5-VOICE-DECK-DESIGN.md`。

`SHA256SUMS.json` 只校验本目录保留的原始接口补丁，路径相对于仓库根。旧导入清单与移出的源码保存在本地归档，不作为构建输入；不把历史摘要重新标成活动插件的摘要。
