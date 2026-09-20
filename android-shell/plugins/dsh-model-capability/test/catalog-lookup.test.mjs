// engine-catalog 阶段回归（0.13.5 W3，issue #125）：
// 目录是厂商声明，按精确 id 查表；多目录不一致时不写入。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effortsOf, hasCapabilities, lookupCatalog } from '../lib/catalog-lookup.js'

const snapshot = {
  source: 'test',
  models: {
    'glm-5.3-flash': [
      {
        provider: 'opencode-go', api: 'openai-completions', reasoning: true,
        thinkingLevelMap: { off: null, minimal: null, low: 'low', medium: null, high: 'high', xhigh: null, max: 'max' },
        input: ['text', 'image'], contextWindow: 1000000, maxTokens: 131072,
        compat: { maxTokensField: 'max_tokens' },
      },
      {
        provider: 'zai', api: 'openai-completions', reasoning: true,
        thinkingLevelMap: { off: null, minimal: null, low: 'low', medium: null, high: 'high', xhigh: null, max: 'max' },
        input: ['text', 'image'], contextWindow: 1000000, maxTokens: 131072,
        compat: { thinkingFormat: 'zai', supportsReasoningEffort: true, maxTokensField: 'max_tokens' },
      },
    ],
    'conflict-model': [
      { provider: 'a', api: 'openai-completions', reasoning: true, thinkingLevelMap: { low: 'low', high: 'high' } },
      { provider: 'b', api: 'openai-completions', reasoning: true, thinkingLevelMap: { low: 'low', high: 'max' } },
    ],
    'no-reasoning-model': [
      { provider: 'a', api: 'openai-completions', reasoning: false, input: ['text'], contextWindow: 8192 },
    ],
  },
}

test('exact id lookup derives thinking levels from thinkingLevelMap wire values', () => {
  const match = lookupCatalog(snapshot, 'glm-5.3-flash', 'openai-completions')
  assert.deepEqual(match.providers, ['opencode-go', 'zai'])
  assert.deepEqual(match.capabilities.reasoningEfforts, { low: 'low', high: 'high', max: 'max' })
  assert.deepEqual(match.capabilities.input, ['text', 'image'])
  assert.equal(match.capabilities.contextWindow, 1000000)
  assert.equal(match.capabilities.maxTokens, 131072)
  // 方言键（thinkingFormat/supportsReasoningEffort）在部分声明时记冲突——见下方专项用例。
  assert.deepEqual(match.conflicts, [
    'compat.thinkingFormat: 仅部分目录声明（方言不明）',
    'compat.supportsReasoningEffort: 仅部分目录声明（方言不明）',
  ])
})

test('方言键严格口径（issue #134）：只有部分目录声明 thinkingFormat 时不采用，并记冲突', () => {
  const match = lookupCatalog(snapshot, 'glm-5.3-flash')
  // opencode-go 只声明 maxTokensField、zai 才声明 thinkingFormat——方言不明，
  // 不能拿 zai 的方言去配任意自定义网关（否则 reasoning_effort 可能被网关拒绝）。
  assert.equal(match.capabilities.compat?.thinkingFormat, undefined)
  assert.equal(match.capabilities.compat?.supportsReasoningEffort, undefined)
  assert.equal(match.capabilities.compat?.maxTokensField, 'max_tokens')
  assert.ok(match.conflicts.some((line) => line.includes('compat.thinkingFormat') && line.includes('仅部分目录声明')))
})

test('目录声明冲突时不采用该字段并给出冲突说明', () => {
  const match = lookupCatalog(snapshot, 'conflict-model')
  assert.equal(match.capabilities.reasoningEfforts, undefined)
  assert.ok(match.conflicts.some((line) => line.includes('reasoningEfforts')))
})

test('非推理模型不产生 reasoningEfforts，但仍给出模态与上下文', () => {
  const match = lookupCatalog(snapshot, 'no-reasoning-model')
  assert.equal(match.capabilities.reasoningEfforts, undefined)
  assert.deepEqual(match.capabilities.input, ['text'])
  assert.equal(match.capabilities.contextWindow, 8192)
  assert.ok(hasCapabilities(match))
})

test('未命中的 id 返回空结果（unknown 保持 unknown）', () => {
  const match = lookupCatalog(snapshot, 'not-in-catalog')
  assert.deepEqual(match.providers, [])
  assert.equal(hasCapabilities(match), false)
})

test('api 过滤：路由声明的线协议不匹配时不采用该条目', () => {
  const match = lookupCatalog(snapshot, 'glm-5.3-flash', 'anthropic-messages')
  assert.deepEqual(match.providers, [])
  assert.equal(hasCapabilities(match), false)
})

test('effortsOf 只保留非空字符串 wire 值', () => {
  assert.deepEqual(effortsOf({ provider: 'x', thinkingLevelMap: { off: null, low: 'low', high: '' } }), { low: 'low' })
  assert.equal(effortsOf({ provider: 'x', thinkingLevelMap: { off: null } }), undefined)
  assert.equal(effortsOf({ provider: 'x' }), undefined)
})
