// issue #134 回归：目录同名模型跨厂商方言不一致时，禁止写入 reasoningEfforts
// （pi-ai 会按探测默认方言序列化，真实网关可能直接 400），方言统一时连同 compat 一起写。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeCatalog, patchesFrom, pickDialect } from '../lib/index.js'

const conflictSnapshot = {
  source: 'test',
  models: {
    'glm-5.3-flash': [
      {
        provider: 'opencode-go', api: 'openai-completions', reasoning: true,
        thinkingLevelMap: { low: 'low', high: 'high', max: 'max' },
        compat: { maxTokensField: 'max_tokens' },
      },
      {
        provider: 'zai', api: 'openai-completions', reasoning: true,
        thinkingLevelMap: { low: 'low', high: 'high', max: 'max' },
        compat: { thinkingFormat: 'zai', supportsReasoningEffort: true, maxTokensField: 'max_tokens' },
      },
    ],
    'zai-only': [
      {
        provider: 'zai', api: 'openai-completions', reasoning: true,
        thinkingLevelMap: { low: 'low', high: 'high' },
        compat: { thinkingFormat: 'zai', supportsReasoningEffort: true },
      },
    ],
  },
}

function emptyReport(route) {
  return { route, fetched: [], models: [], unknown: [], notes: [] }
}

test('pickDialect requires a thinkingFormat and drops unrelated compat keys', () => {
  assert.equal(pickDialect(undefined), undefined)
  assert.equal(pickDialect({ maxTokensField: 'max_tokens' }), undefined)
  assert.deepEqual(
    pickDialect({ thinkingFormat: 'zai', supportsReasoningEffort: true, chatTemplateArgs: {} }),
    { thinkingFormat: 'zai', supportsReasoningEffort: true },
  )
})

test('mergeCatalog skips reasoningEfforts when the catalog dialect conflicts', () => {
  const merged = mergeCatalog(emptyReport('mhs'), ['glm-5.3-flash'], conflictSnapshot, 'openai-completions')
  const model = merged.models.find((m) => m.id === 'glm-5.3-flash')
  assert.equal(model.reasoningEfforts, undefined)
  assert.equal(model.compat, undefined)
  assert.ok(merged.notes.some((note) => note.includes('方言不明')))
})

test('mergeCatalog writes the dialect beside efforts when the catalog is unanimous', () => {
  const merged = mergeCatalog(emptyReport('zai'), ['zai-only'], conflictSnapshot, 'openai-completions')
  const model = merged.models.find((m) => m.id === 'zai-only')
  assert.deepEqual(model.reasoningEfforts, { low: 'low', high: 'high' })
  assert.deepEqual(model.compat, { thinkingFormat: 'zai', supportsReasoningEffort: true })
  const patches = patchesFrom(merged)
  assert.deepEqual(patches[0].compat, { thinkingFormat: 'zai', supportsReasoningEffort: true })
  assert.deepEqual(patches[0].reasoningEfforts, { low: 'low', high: 'high' })
})
