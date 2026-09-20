// Capability probe regression (2026-09-08): the discovery pipeline must report only
// what the configured endpoint explicitly states — never a URL or model-name guess.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  THINKING_LEVELS,
  effortsFrom,
  parseDescriptor,
  parseOllamaShow,
  probePassive,
  probeReasoningEfforts,
} from '../lib/capability-probe.js'
import { providerFromSettings } from '../lib/settings-config.js'

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) }
}

test('generic OpenAI /models yields ids only and states why', () => {
  const parsed = parseDescriptor({ object: 'list', data: [{ id: 'my-model-a' }, { id: 'my-model-b' }] }, 'https://gw.example/v1/models')
  assert.deepEqual(parsed.models.map((m) => m.id), ['my-model-a', 'my-model-b'])
  for (const model of parsed.models) {
    assert.equal(model.input, undefined)
    assert.equal(model.reasoningEfforts, undefined)
  }
  assert.ok(parsed.notes.some((note) => note.includes('model ids only')))
})

test('OpenRouter descriptor reads declared modalities but never invents effort levels', () => {
  const parsed = parseDescriptor({
    data: [{
      id: 'vendor/model-x',
      architecture: { input_modalities: ['text', 'image', 'video'] },
      supported_parameters: ['temperature', 'reasoning'],
      context_length: 200000,
    }],
  }, 'https://openrouter.ai/api/v1/models')
  const model = parsed.models[0]
  assert.deepEqual(model.input, ['text', 'image'])
  assert.equal(model.contextWindow, 200000)
  assert.equal(model.reasoningEfforts, undefined)
  assert.ok(parsed.notes.some((note) => note.includes('levels stay unknown')))
})

test('explicit reasoning_efforts maps only the engine vocabulary', () => {
  const parsed = parseDescriptor({
    data: [{ id: 'vendor/model-y', reasoning_efforts: ['low', 'medium', 'high', 'turbo'] }],
  }, 'https://gw.example/v1/models')
  assert.deepEqual(parsed.models[0].reasoningEfforts, { low: 'low', medium: 'medium', high: 'high' })
  assert.ok(parsed.notes.some((note) => note.includes('turbo')))
  const { efforts, dropped } = effortsFrom(['HIGH', 'max', 'none'])
  assert.deepEqual(efforts, { high: 'high', max: 'max' })
  assert.deepEqual(dropped, ['none'])
})

test('Google descriptor strips the models/ prefix and reads declared limits', () => {
  const parsed = parseDescriptor({
    models: [{ name: 'models/gemini-x', inputTokenLimit: 1048576, outputTokenLimit: 8192, supportedGenerationMethods: ['generateContent'] }],
  }, 'https://generativelanguage.googleapis.com/v1beta/models')
  assert.deepEqual(parsed.models, [{ id: 'gemini-x', contextWindow: 1048576, maxTokens: 8192 }])
})

test('Ollama tags give ids and /api/show gives explicit capabilities', () => {
  const tags = parseDescriptor({ models: [{ name: 'qwen3:8b', size: 5 }] }, 'http://127.0.0.1:11434/api/tags')
  assert.deepEqual(tags.models, [{ id: 'qwen3:8b' }])
  const show = parseOllamaShow({ model: 'qwen3:8b', capabilities: ['completion', 'vision', 'thinking'], model_info: { 'llm.context_length': 40960 } })
  assert.deepEqual(show.models[0].input, ['image'])
  assert.equal(show.models[0].contextWindow, 40960)
  assert.ok(show.notes.some((note) => note.includes('effort vocabulary')))
})

test('passive probe fetches only the configured endpoint and reports unknowns', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init?.headers ?? {} })
    return jsonResponse({ data: [{ id: 'known-model', context_length: 8192 }] })
  }
  const report = await probePassive({
    route: 'my-gateway',
    api: 'openai-completions',
    baseURL: 'https://gw.example/v1/',
    apiKey: 'secret-key',
    models: ['known-model', 'declared-but-absent'],
  }, { fetchImpl })

  assert.deepEqual(calls.map((c) => c.url), ['https://gw.example/v1/models'])
  assert.equal(calls[0].headers.authorization, 'Bearer secret-key')
  assert.equal(report.fetched.length, 1)
  assert.deepEqual(report.models.map((m) => m.id), ['known-model'])
  assert.equal(report.models[0].contextWindow, 8192)
  assert.equal(report.models[0].sources.contextWindow, 'endpoint-descriptor')
  assert.deepEqual(report.unknown, ['declared-but-absent'])
})

test('anthropic-shaped routes authenticate with x-api-key', async () => {
  let seen = {}
  const fetchImpl = async (url, init) => {
    seen = init?.headers ?? {}
    return jsonResponse({ data: [{ id: 'claude-x' }] })
  }
  await probePassive({ route: 'claude', api: 'anthropic-messages', baseURL: 'https://api.example', apiKey: 'k' }, { fetchImpl })
  assert.equal(seen['x-api-key'], 'k')
  assert.equal(seen.authorization, undefined)
})

test('active probe classifies acceptance, rejection and uncertainty', async () => {
  const fetchImpl = async (_url, init) => {
    const level = JSON.parse(init.body).reasoning_effort
    if (level === 'low') return jsonResponse({ ok: true })
    if (level === 'medium') return { ok: false, status: 400, text: async () => 'unsupported reasoning_effort' }
    return { ok: false, status: 500, text: async () => 'upstream exploded' }
  }
  const result = await probeReasoningEfforts({
    url: 'https://gw.example/v1/chat/completions',
    headers: { authorization: 'Bearer k' },
    levels: ['low', 'medium', 'high'],
    fetchImpl,
    body: (level) => ({ model: 'm', messages: [], max_tokens: 1, reasoning_effort: level }),
  })
  assert.deepEqual(result.accepted, ['low'])
  assert.deepEqual(result.rejected, [{ level: 'medium', status: 400 }])
  assert.equal(result.inconclusive.length, 1)
  assert.equal(result.inconclusive[0].level, 'high')
  assert.deepEqual(result.efforts, { low: 'low' })
})

test('providerFromSettings maps declared models and never fabricates a route', () => {
  const settings = {
    describe: () => [{
      ns: 'llm-pi-ai',
      revision: 7,
      value: {
        providers: {
          'my-gateway': {
            api: 'openai-completions',
            baseURL: 'https://gw.example/v1',
            apiKey: 'k',
            headers: { 'x-tenant': 't' },
            models: [{ id: 'a' }, 'b'],
          },
          'no-base-url': { models: ['c'] },
        },
      },
    }],
  }
  const config = providerFromSettings(settings, 'my-gateway')
  assert.deepEqual(config, {
    route: 'my-gateway',
    api: 'openai-completions',
    baseURL: 'https://gw.example/v1',
    apiKey: 'k',
    headers: { 'x-tenant': 't' },
    models: ['a', 'b'],
  })
  assert.equal(providerFromSettings(settings, 'no-base-url'), undefined)
  assert.equal(providerFromSettings(settings, 'unknown'), undefined)
  assert.equal(providerFromSettings(undefined, 'my-gateway'), undefined)
  assert.ok(THINKING_LEVELS.includes('medium'))
})

test('多命名空间时按 ns 查找 llm-pi-ai，而不是取第一个（0.13.5 实机踩坑回归）', () => {
  // describe(options) 的实现忽略 options，返回全部命名空间；若用 [0] 会拿到 llm-deepseek，
  // 自定义路由永远查不到 → 自动补全静默失效（2026-09-10 模拟器实测）。
  const settings = {
    describe: () => [
      { ns: 'llm-deepseek', value: { apiKeyEnv: 'DEEPSEEK_API_KEY' }, revision: 3 },
      {
        ns: 'llm-pi-ai',
        value: { providers: { mhs: { api: 'openai-completions', baseURL: 'https://api.mhsapi.top/v1', apiKeyEnv: 'MHS_API_KEY', models: ['glm-5.3-flash'] } } },
        revision: 4,
      },
    ],
  }
  const config = providerFromSettings(settings, 'mhs')
  assert.deepEqual(config, {
    route: 'mhs',
    api: 'openai-completions',
    baseURL: 'https://api.mhsapi.top/v1',
    apiKey: undefined,
    apiKeyEnv: 'MHS_API_KEY',
    headers: undefined,
    models: ['glm-5.3-flash'],
  })
})
