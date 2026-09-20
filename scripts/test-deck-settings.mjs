import {connect} from './lib/android-cdp.mjs'
import {execFileSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const [serial,folder]=process.argv.slice(2),c=await connect(serial),results=[],pause=ms=>new Promise(r=>setTimeout(r,ms))
const click=async text=>{await c.evaluate(`[...document.querySelector('[role="dialog"]').querySelectorAll('button')].find(e=>e.textContent===${JSON.stringify(text)}).click()`);await pause(100)}
const selected=()=>c.evaluate(`document.querySelector('[data-deck-lane][data-active="true"]')?.dataset.deckLane`)
try{
 if(!await c.evaluate(`!!document.querySelector('[role="dialog"]')`))await c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent==='设置').click()`)
 await click('手柄输入');assert.equal(await c.evaluate(`document.querySelector('[data-plugin="gamepad-settings"] input').checked`),true)
 const before=await selected();execFileSync('adb',['-s',serial,'shell','input','gamepad','keyevent','103']);await pause(150);assert.equal(await selected(),before)
 results.push({test:'Settings modal does not route gamepad actions to lanes',passed:true})
 await c.evaluate(`document.querySelector('[data-plugin="gamepad-settings"] input').click()`);assert.equal(await c.evaluate(`localStorage.getItem('dsh.input.gamepad.enabled')`),'false')
 await click('关闭');await pause(800);execFileSync('adb',['-s',serial,'shell','input','gamepad','keyevent','103']);await pause(150);assert.equal(await selected(),before)
 results.push({test:'Disabled gamepad leaves lane unchanged',passed:true})
 await c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent==='设置').click()`);await click('手柄输入');await c.evaluate(`document.querySelector('[data-plugin="gamepad-settings"] input').click()`)
 await click('会话工作台');await c.evaluate(`document.querySelector('[data-plugin="deck-settings"] input').click()`);await pause(100);assert.equal(await c.evaluate(`!!document.querySelector('.dsh-deck')`),false)
 assert.equal(await c.evaluate(`!!document.querySelector('[data-composer-card]')`),true)
 await c.evaluate(`document.querySelector('[data-plugin="deck-settings"] input').click()`);await click('关闭');await c.evaluate(`document.querySelector('.dsh-deck-open').click()`);await pause(300)
 assert.equal(await c.evaluate(`document.querySelectorAll('[data-deck-lane]').length`),4)
 results.push({test:'Deck disable restores normal chat; enable retains four bindings',passed:true})
 console.log(JSON.stringify(results,null,2));writeFileSync(folder+'/settings-tests.json',JSON.stringify(results,null,2))
}finally{c.close()}
