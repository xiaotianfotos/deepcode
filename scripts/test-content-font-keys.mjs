/** Actual Android hardware-key path (ADB keycombination), not synthetic DOM events. */
import { connect } from './lib/android-cdp.mjs'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const [serial, folder] = process.argv.slice(2)
if (!folder) throw new Error('Usage: SERIAL OUTPUT')
mkdirSync(folder, { recursive: true })
const c = await connect(serial), samples = [], pause = ms => new Promise(r => setTimeout(r, ms))
const observe = () => c.evaluate(`(()=>{const e=document.querySelector('[data-composer-input]'),b=document.querySelector('[aria-label="语音输入"]'),sidebar=document.querySelector('[role=tree]');return {contentFont:getComputedStyle(document.body).getPropertyValue('--dsh-content-font-size').trim(),editorFont:getComputedStyle(e).fontSize,width:innerWidth,scale:visualViewport.scale,buttonWidth:b?.getBoundingClientRect().width,sidebarWidth:sidebar?.getBoundingClientRect().width,draft:e.innerHTML}})()`)
const key = async (...keys) => { execFileSync('adb', ['-s', serial, 'shell', 'input', 'keycombination', 'KEYCODE_CTRL_LEFT', ...keys]); await pause(250) }
try {
  await c.evaluate(`document.querySelector('[data-composer-input]').focus()`)
  await key('KEYCODE_0'); const initial = await observe(); samples.push({ action: 'reset', ...initial }); assert.equal(initial.editorFont, '14px')
  for (const [keys, expected] of [[['KEYCODE_EQUALS'], '15px'], [['KEYCODE_SHIFT_LEFT', 'KEYCODE_EQUALS'], '16px'], [['KEYCODE_NUMPAD_ADD'], '17px'], [['KEYCODE_PLUS'], '17px'], [['KEYCODE_MINUS'], '16px'], [['KEYCODE_NUMPAD_SUBTRACT'], '15px'], [['KEYCODE_0'], '14px']]) {
    await key(...keys); const s = await observe(); samples.push({ action: keys.join('+'), ...s })
    assert.equal(s.contentFont, expected); assert.equal(s.editorFont, expected)
    for (const field of ['width', 'scale', 'buttonWidth', 'sidebarWidth', 'draft']) assert.equal(s[field], initial[field], field + ' changed')
  }
  await key('KEYCODE_EQUALS'); await c.call('Page.reload')
  let reloaded
  for (let i = 0; i < 100; i++) {
    await pause(100)
    reloaded = await c.evaluate(`(()=>{const e=document.querySelector('[data-composer-input]');return e&&getComputedStyle(e).fontSize})()`)
    if (reloaded === '15px') break
  }
  assert.equal(reloaded, '15px', 'Font preference lost after reload')
  await key('KEYCODE_0')
  assert.equal((await observe()).editorFont, '14px')
  writeFileSync(folder + '/persistence.json', JSON.stringify({ passed: true, afterReload: reloaded, restored: '14px' }, null, 2))
  writeFileSync(folder + '/receipt.json', JSON.stringify({ actualAndroidKeys: true, passed: true, samples }, null, 2)); console.log('Actual Android Ctrl +/-/0: font changes, viewport/buttons/sidebar/draft unchanged')
} finally { writeFileSync(folder + '/samples.json', JSON.stringify(samples, null, 2)); c.close() }
