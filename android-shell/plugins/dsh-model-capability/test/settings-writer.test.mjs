// 写回语义回归（0.13.5 W3）：只补缺、只写模型级、不覆盖用户值、冲突重试一次。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyModelPatch, planModelPatch } from '../lib/settings-writer.js'

const declared = [
  { id: 'glm-5.3-flash', name: 'GLM-5.3-Flash', contextWindow: 1000000, input: ['text'] },
  { id: 'other-model', name: 'Other', reasoningEfforts: { high: 'high' } },
  'string-form-model',
]

test('只补缺失字段，已有字段原样保留', () => {
  const plan = planModelPatch(declared, [
    { id: 'glm-5.3-flash', reasoningEfforts: { low: 'low', high: 'high', max: 'max' }, input: ['text', 'image'], maxTokens: 131072, source: 'engine-catalog' },
  ])
  const model = plan.models[0]
  assert.deepEqual(model.reasoningEfforts, { low: 'low', high: 'high', max: 'max' })
  assert.deepEqual(model.input, ['text'], '用户已声明的 input 不得被覆盖')
  assert.equal(model.maxTokens, 131072)
  assert.equal(model.contextWindow, 1000000)
  assert.ok(plan.changes.some((line) => line.includes('reasoningEfforts')))
  assert.ok(!plan.changes.some((line) => line.includes('input=')), 'input 已存在，不应记为变更')
})

test('用户已声明 reasoningEfforts 时绝不改写', () => {
  const plan = planModelPatch(declared, [
    { id: 'other-model', reasoningEfforts: { low: 'low', high: 'high' } },
  ])
  assert.deepEqual(plan.models[1].reasoningEfforts, { high: 'high' })
  assert.equal(plan.changes.length, 0)
})

test('路由未声明的模型不凭空创建条目', () => {
  const plan = planModelPatch(declared, [{ id: 'not-declared', reasoningEfforts: { high: 'high' } }])
  assert.equal(plan.models.length, declared.length)
  assert.ok(plan.skipped.some((line) => line.includes('not-declared')))
})

test('字符串形态条目在需要写入时升格为对象', () => {
  const plan = planModelPatch(declared, [{ id: 'string-form-model', contextWindow: 4096 }])
  assert.deepEqual(plan.models[2], { id: 'string-form-model', contextWindow: 4096 })
})

test('compat 逐键合并，不覆盖已有键', () => {
  const models = [{ id: 'm', compat: { thinkingFormat: 'deepseek' } }]
  const plan = planModelPatch(models, [{ id: 'm', compat: { thinkingFormat: 'zai', supportsReasoningEffort: true } }])
  assert.deepEqual(plan.models[0].compat, { thinkingFormat: 'deepseek', supportsReasoningEffort: true })
})

test('没有声明任何模型时不写入', () => {
  const plan = planModelPatch(undefined, [{ id: 'm', reasoningEfforts: { high: 'high' } }])
  assert.equal(plan.changes.length, 0)
  assert.ok(plan.skipped.length > 0)
})

function fakeSettings(initialModels, options = {}) {
  const state = {
    value: { providers: { route: { baseURL: 'https://gw.example/v1', models: initialModels } } },
    revision: 7,
    writes: [],
    conflictsLeft: options.conflicts ?? 0,
  }
  return {
    state,
    describe() {
      return [{ ns: 'llm-pi-ai', value: state.value, revision: state.revision }]
    },
    async mutate(ns, ops, revision) {
      state.writes.push({ ns, ops, revision })
      if (state.conflictsLeft > 0) {
        state.conflictsLeft -= 1
        state.revision += 1
        const error = new Error('conflict')
        error.code = 'SETTINGS_CONFLICT'
        throw error
      }
      if (revision !== state.revision) {
        const error = new Error('stale revision')
        error.code = 'SETTINGS_CONFLICT'
        throw error
      }
      for (const op of ops) {
        if (op.op === 'set') {
          const [, route, key] = op.path
          state.value.providers[route][key] = op.value
        }
      }
    },
  }
}

test('applyModelPatch 写回单一路径 set 且带 revision', async () => {
  const settings = fakeSettings([{ id: 'm' }])
  const result = await applyModelPatch(settings, 'route', [{ id: 'm', reasoningEfforts: { high: 'high' }, source: 'engine-catalog' }])
  assert.equal(result.wrote, true)
  assert.equal(settings.state.writes.length, 1)
  assert.deepEqual(settings.state.writes[0].ops[0].path, ['providers', 'route', 'models'])
  assert.equal(settings.state.writes[0].revision, 7)
  assert.deepEqual(settings.state.value.providers.route.models[0].reasoningEfforts, { high: 'high' })
})

test('SETTINGS_CONFLICT 重读 revision 后重试一次即成功', async () => {
  const settings = fakeSettings([{ id: 'm' }], { conflicts: 1 })
  const result = await applyModelPatch(settings, 'route', [{ id: 'm', reasoningEfforts: { high: 'high' } }])
  assert.equal(result.wrote, true)
  assert.equal(settings.state.writes.length, 2)
  assert.equal(settings.state.writes[1].revision, 8)
})

test('无变更时不发 mutate', async () => {
  const settings = fakeSettings([{ id: 'm', reasoningEfforts: { high: 'high' } }])
  const result = await applyModelPatch(settings, 'route', [{ id: 'm', reasoningEfforts: { high: 'high' } }])
  assert.equal(result.wrote, false)
  assert.equal(result.reason, 'no-change')
  assert.equal(settings.state.writes.length, 0)
})

test('settings 缺失时返回 settings-unavailable，不抛错', async () => {
  const result = await applyModelPatch(undefined, 'route', [{ id: 'm', reasoningEfforts: { high: 'high' } }])
  assert.equal(result.wrote, false)
  assert.equal(result.reason, 'settings-unavailable')
})
