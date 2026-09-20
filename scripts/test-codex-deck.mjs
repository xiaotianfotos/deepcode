/** Real WebView/native gamepad acceptance; restores the user's lane bindings. */
import {connect} from './lib/android-cdp.mjs'
import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const serial=process.argv[2],folder='docs/validation/2026-09-10-codex'
const ids=JSON.parse(readFileSync(folder+'/sessions.json','utf8'))
for(const args of [['input','keyevent','KEYCODE_WAKEUP'],['wm','dismiss-keyguard'],['am','start','-n','com.dsharnessmobile.shell/.MainActivity']])execFileSync('adb',['-s',serial,'shell',...args],{stdio:'ignore'})
const c=await connect(serial),pause=ms=>new Promise(r=>setTimeout(r,ms))
for(let i=0;i<40;i++){if(await c.evaluate(`document.visibilityState==='visible'&&innerWidth>0`))break;await pause(100)}
const original=await c.evaluate(`JSON.parse(localStorage.getItem('dsh.voice-deck.controller.v2'))`)
const wasOpen=await c.evaluate(`!!document.querySelector('.dsh-deck')`)
writeFileSync(folder+'/deck-preferences-before.json',JSON.stringify(original,null,2))
const choose=async(index,id)=>{await c.evaluate(`(()=>{const s=document.querySelector('select[aria-label="泳道 ${index+1} 会话"]');if(!s)throw Error('Lane selector absent');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(id)});s.dispatchEvent(new Event('change',{bubbles:true}))})()`);await pause(300)}
const key=async code=>{execFileSync('adb',['-s',serial,'shell','input','gamepad','keyevent',String(code)]);await pause(300)}
const report={}
try{
 assert(!await c.evaluate(`['recording','preparing','transcribing','permission'].includes(JSON.parse(androidBridge.voiceStatus()).phase)`))
 await choose(2,ids[0]);await choose(3,ids[1])
 if(!wasOpen)await c.evaluate(`document.querySelector('.dsh-deck-open').click()`)
 await pause(1500)
 report.lanes=await c.evaluate(`[...document.querySelectorAll('[data-deck-lane]')].map(e=>({id:e.dataset.deckLane,composer:!!e.querySelector('[data-composer-input]'),markdown:!!e.querySelector('p'),height:e.clientHeight,width:e.clientWidth}))`)
 assert.equal(report.lanes.length,4);assert(report.lanes.every(e=>e.composer&&e.height>0&&e.width>0));assert.equal(new Set(report.lanes.map(e=>e.height)).size,1)
 const selector=`[data-deck-lane="${ids[0]}"]`
 await c.evaluate(`document.querySelector('${selector} header strong').click()`);await pause(400)
 const beforeMarkers=await c.evaluate(`(document.querySelector('${selector} .dsh-deck-chat').innerText.match(/CODEX_DECK_CIRCLE_OK/g)||[]).length`)
 await c.call('Input.insertText',{text:'不要调用工具，只回复 CODEX_DECK_CIRCLE_OK。'})
 await key(103);await key(102)
 report.caret=await c.evaluate(`(()=>{const e=document.querySelector('${selector} [data-composer-input]'),s=getSelection(),r=document.createRange();r.selectNodeContents(e);r.setEnd(s.focusNode,s.focusOffset);return {focused:e.contains(document.activeElement)||document.activeElement===e,atEnd:r.toString().length===e.textContent.length}})()`)
 assert(report.caret.focused&&report.caret.atEnd)
 await key(97)
 assert.equal(await c.evaluate(`document.querySelector('${selector} [data-composer-input]').innerText.trim()`),'')
 const samples=[]
 for(let i=0;i<60;i++){
  const state=await c.evaluate(`(()=>{const e=document.querySelector('${selector}');return {text:e.querySelector('.dsh-deck-chat').innerText,running:!!e.querySelector('.dsh-deck-running')}})()`)
  samples.push({at:Date.now(),length:state.text.length,running:state.running})
  if((state.text.match(/CODEX_DECK_CIRCLE_OK/g)||[]).length>=beforeMarkers+2&&!state.running){report.circle=true;break}
  await pause(500)
 }
 assert(report.circle,'Native circle must submit to the Codex lane and render its reply')
 report.samples=samples
 report.voiceUI=await c.evaluate(`!!document.querySelector('${selector} [data-plugin="android-voice-input"]')`)
 writeFileSync(folder+'/deck.png',execFileSync('adb',['-s',serial,'exec-out','screencap','-p'],{maxBuffer:16*1024*1024}))
 assert(report.voiceUI,'Original microphone input remains available')
 report.passed=true
}finally{
 await choose(2,original.lanes[2]);await choose(3,original.lanes[3])
 await c.evaluate(`document.querySelector('[data-deck-lane="${original.lanes[original.active]}"] header strong')?.click()`)
 if(!wasOpen)await c.evaluate(`document.querySelector('.dsh-deck-toolbar button')?.click()`)
 report.restored=await c.evaluate(`JSON.stringify(JSON.parse(localStorage.getItem('dsh.voice-deck.controller.v2')).lanes)===${JSON.stringify(JSON.stringify(original.lanes))}`)
 writeFileSync(folder+'/deck.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));c.close()
}
