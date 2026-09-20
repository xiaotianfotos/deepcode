#!/usr/bin/env node
/**
 * boot-pending-G1 回归测试（issue #126 P3）。
 *
 * 断言「第三方插件 pending 不再阻断 web boot，官方包 pending / 任何 FAILED 仍然致命」。
 * 直接调用 dsh-app-boot 导出的 assertEntriesActivated，用最小 stub ctx 驱动，
 * 不需要真实 cordis 树。
 *
 * 目标文件来源同 pi-toolcall.test.mjs（--boot <path> / DSH_BOOT_FILE / 默认 stage）。
 * 找不到时跳过（退出码 0）。
 *
 * 用法：node scripts/tests/boot-pending.test.mjs [--boot <path>]
 */
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import test from 'node:test'

const DEFAULT_BOOT = '.deploy-tmp/snapshot-013/x86_64/stage/root/usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js'

const argv = process.argv.slice(2)
const flagIndex = argv.indexOf('--boot')
const target = resolve(flagIndex >= 0 && argv[flagIndex + 1] ? argv[flagIndex + 1] : (process.env.DSH_BOOT_FILE ?? DEFAULT_BOOT))

if (!existsSync(target)) {
  console.log(`[skip] dsh-app-boot 目标文件不在场：${target}`)
  process.exit(0)
}

const { assertEntriesActivated } = await import(pathToFileURL(target).href)

const ACTIVE = 2
const PENDING = 0
const FAILED = 3

function entry(name, state, { missingService = 'uiConversation', error } = {}) {
  return {
    options: { name },
    disabled: false,
    fiber: {
      state,
      inject: state === PENDING ? { [missingService]: true } : {},
      ctx: { get: () => undefined },
      await: async () => { if (error) throw error },
    },
  }
}

function ctxOf(entries) {
  return { loader: { entries: () => entries } }
}

async function capture(fn) {
  const warnings = []
  const original = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    await fn()
    return { threw: undefined, warnings }
  } catch (error) {
    return { threw: error, warnings }
  } finally {
    console.warn = original
  }
}

test('第三方 pending 不再阻断 boot，并留下降级告警', async () => {
  const { threw, warnings } = await capture(() => assertEntriesActivated(
    ctxOf([entry('@deepseek-ai/dsh-base', ACTIVE), entry('@nanmicoder/dsh-agent-teams', PENDING)]),
    'web boot',
  ))
  assert.equal(threw, undefined, '第三方 pending 不应抛错')
  assert.ok(warnings.some((line) => line.includes('dsh-mobile boot tolerance (G1)')), '必须留下降级告警')
  assert.ok(warnings.some((line) => line.includes('@nanmicoder/dsh-agent-teams')), '告警需点名未激活插件')
})

test('官方包 pending 仍然致命', async () => {
  const { threw } = await capture(() => assertEntriesActivated(
    ctxOf([entry('@deepseek-ai/dsh-web-app', PENDING)]),
    'web boot',
  ))
  assert.ok(threw, '官方包 pending 必须抛错')
  assert.match(String(threw.message), /did not activate/)
})

test('FAILED 仍然致命（第三方也不例外）', async () => {
  const { threw } = await capture(() => assertEntriesActivated(
    ctxOf([entry('@third/party', FAILED, { error: new Error('boom') })]),
    'web boot',
  ))
  assert.ok(threw, 'FAILED 必须抛错')
  assert.match(String(threw.message), /did not activate/)
})

test('全部 active 时既不抛错也不告警', async () => {
  const { threw, warnings } = await capture(() => assertEntriesActivated(
    ctxOf([entry('@deepseek-ai/dsh-base', ACTIVE), entry('@third/party', ACTIVE)]),
    'web boot',
  ))
  assert.equal(threw, undefined)
  assert.equal(warnings.length, 0)
})

test('第三方 pending 与官方 pending 混合：仍因官方包失败', async () => {
  const { threw, warnings } = await capture(() => assertEntriesActivated(
    ctxOf([entry('@third/party', PENDING), entry('@deepseek-ai/dsh-web-app', PENDING)]),
    'web boot',
  ))
  assert.ok(threw, '官方包 pending 在场时仍必须失败')
  assert.ok(warnings.some((line) => line.includes('@third/party')), '第三方降级告警仍应输出')
})
