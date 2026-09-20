# dsh-model-capability — 自定义提供商能力发现（0.13.3，issue #122 后续）

> 状态：**核心与工具已落地并单测通过；尚未挂载进 profile 装配**（见文末「挂载」）。
> 这是刻意选择：能力发现会读端点、写模型级元数据，先让语义与测试稳定，再决定是否
> 随快照出厂。

## 解决的问题

用户自填的提供商路由（llm-pi-ai `providers.<route>`）没有能力元数据：设置页的自定义
提供商编辑器只写 `id/name/contextWindow/maxTokens`，所以输入框旁**没有可选的推理等级**，
模态（图片/音频）也只能手改 settings.yaml。本插件按「端点说了什么就记什么」的原则补上
这层元数据。

## 发现管线（严格顺序，任一阶段未声明即保持未知）

1. **被动 GET**：只读取配置端点**实际返回**的字段。`openai-completions`/`anthropic-messages`/
   `openrouter` 走 `GET <baseURL>/models`；`google-generative` 走 `GET <baseURL>/models?key=`；
   `ollama` 走 `GET <baseURL>/api/tags` + 只读元数据 `POST /api/show`（不发补全请求、不耗额度）。
2. **厂商描述符解析**：按**响应形状**（不是 URL 或模型名）识别显式能力 schema：
   - OpenAI 兼容：`data[].id`，若带 `context_length`/`max_output_tokens` 则读入；
   - OpenRouter 形态：`architecture.input_modalities` → 模态；`supported_parameters` 含
     `reasoning` 只说明「支持推理」，**等级词表仍未声明 → 保持未知并记注**；
     `reasoning_efforts` 显式给出等级词才写入（词表外单词丢弃并记注）；
   - Google：`models[].name`（剥 `models/` 前缀）、`inputTokenLimit`/`outputTokenLimit`；
   - Ollama：`/api/show.capabilities`（`vision` → 图片模态；`thinking` → 支持推理但等级未知）。
3. **主动探测**（**必须显式批准**）：对每个仍缺等级的模型发一次最小补全（`max_tokens: 1`），
   把候选等级逐一试出：2xx=接受、400/422 且正文提到 reasoning/effort=拒绝、其余=不确定。
   工具参数 `active=true` **且** `confirm=true` 才执行——它消耗 API 额度。

**不变量**：不做 URL/模型名启发式；未声明的能力保持缺席；每条能力都带 `source`
（`endpoint-descriptor` / `vendor-descriptor` / `active-probe`）；`reasoningEfforts`
永远是**模型级**值（引擎 `PiAiReasoningEfforts` 词表：`off/minimal/low/medium/high/xhigh/max`），
从不产生提供商级开关。

## 工具

`model_capability_probe`（参数：`provider` 必填；`active`/`confirm`/`levels` 可选）
返回摘要文本 + 结构化 `report`（`fetched` 审计抓取过的端点、`models[].sources` 标来源、
`unknown` 列未获元数据的模型、`notes` 记端点自述与丢弃的未知等级词）。

## 尚未做（下一步）

- **写回**：本版只报告、不写设置。写回必须走官方 settings 缝（`ctx.settings.mutate`，
  路径 `providers.<route>.models[i].reasoningEfforts` 或 `modelOverrides.<id>.reasoningEfforts`），
  只写模型级字段、只写端点明确声明的等级，并沿用 model-sync 的 revision/冲突重试语义。
- **挂载**：`scripts/profile-web.cordis.patch.yml` 加 insert + `build-apk-013.ps1` 的
  `--dsh-android` 列表加本目录，随后跑双模拟器回归（至少验证装配失败关闭、工具可调用、
  无 key 时零副作用）。
- **真端点验证**：需要一个真实自定义提供商（OpenRouter/自建网关/Ollama 任一）跑一次
  被动发现 + 一次经批准的主动探测。

## 开发

```powershell
cd plugins\dsh-model-capability
npm run build     # tsc
npm test          # build + node --test test/capability-probe.test.mjs（9 项）
```
