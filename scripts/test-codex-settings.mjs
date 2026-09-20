/** Physical WebView check: standard plugin card, masked address, persisted switch. */
import {connect} from './lib/android-cdp.mjs'
import {execFileSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const serial=process.argv[2],out='docs/validation/2026-09-10-codex'
execFileSync('adb',['-s',serial,'shell','input','keyevent','KEYCODE_WAKEUP'])
execFileSync('adb',['-s',serial,'shell','wm','dismiss-keyguard'])
const c=await connect(serial),pause=ms=>new Promise(r=>setTimeout(r,ms))
const card='[data-plugin="android-codex-settings"]'
let original
try{
 if(!await c.evaluate(`!!document.querySelector('[role="dialog"]')`))await c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent==='设置').click()`)
 await pause(300)
 assert(!await c.evaluate(`[...document.querySelectorAll('[role="dialog"] button')].some(e=>e.textContent==='Codex')`),'No standalone Codex navigation item')
 await c.evaluate(`[...document.querySelectorAll('[role="dialog"] button')].find(e=>e.textContent==='插件').click()`)
 await pause(500)
 await c.evaluate(`[...document.querySelectorAll('[role="dialog"] [role="tab"]')].find(e=>e.textContent==='插件配置')?.click()`)
 for(let i=0;i<40;i++){if(await c.evaluate(`!!document.querySelector('${card} input:not(:disabled)')`))break;await pause(250)}
 const state=await c.evaluate(`(async()=>{const e=document.querySelector('${card}');if(!e)throw Error('Codex plugin card absent');const r=await fetch('/api/android/codex/account').then(r=>r.json());return {found:true,enabled:r.enabled,loggedIn:!!r.account,masked:typeof r.account?.email==='string'&&r.account.email.includes('****'),rendered:!!r.account?.email&&e.innerText.includes(r.account.email)}})()`)
 original=state.enabled
 assert(state.loggedIn&&state.masked&&state.rendered)
 await c.evaluate(`document.querySelector('${card} input').click()`);await pause(500)
 const toggled=await c.evaluate(`fetch('/api/android/codex/account').then(r=>r.json()).then(r=>r.enabled)`)
 assert.equal(toggled,!original)
 await c.evaluate(`document.querySelector('${card} input').click()`);await pause(500)
 assert.equal(await c.evaluate(`fetch('/api/android/codex/account').then(r=>r.json()).then(r=>r.enabled)`),original)
 await c.evaluate(`document.querySelector('${card}').scrollIntoView({block:'center'})`)
 writeFileSync(out+'/plugin-settings.png',execFileSync('adb',['-s',serial,'exec-out','screencap','-p'],{maxBuffer:16*1024*1024}))
 const result={passed:true,...state,switchPersisted:true,originalStateRestored:true}
 writeFileSync(out+'/plugin-settings.json',JSON.stringify(result,null,2));console.log(result)
}finally{
 if(original!==undefined)await c.evaluate(`(async()=>{const r=await fetch('/api/android/codex/account').then(r=>r.json());if(r.enabled!==${JSON.stringify(original)})await fetch('/api/android/codex/account',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'enable',enabled:${JSON.stringify(original)},csrf:r.csrf})})})()`)
 c.close()
}
