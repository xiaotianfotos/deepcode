/** Isolated physical WebView acceptance: real menus, reference node and native Circle. */
import {connect} from './lib/android-cdp.mjs'
import {execFileSync} from 'node:child_process'
import {writeFileSync,readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const [serial,folder,sid,mode]=process.argv.slice(2),c=await connect(serial),pause=ms=>new Promise(r=>setTimeout(r,ms)),results=[]
const prefix=`[data-deck-lane="${sid}"]`,q=s=>JSON.stringify(prefix+' '+s)
const key=async(code,long=false)=>{execFileSync('adb',['-s',serial,'shell','input','gamepad','keyevent',...(long?['--longpress']:[]),String(code)]);await pause(200)}
const pref=()=>c.evaluate(`JSON.parse(localStorage.getItem('dsh.voice-deck.controller.v2'))`)
let original,sidebarOpened=false
const choose=async(index,id)=>{await c.evaluate(`(()=>{const s=document.querySelector('select[aria-label="泳道 ${index+1} 会话"]');if(!s)throw Error('Sidebar select absent');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(id)});s.dispatchEvent(new Event('change',{bubbles:true}))})()`);await pause(500)}
const type=async text=>{await c.evaluate(`(()=>{document.querySelector(${q('header strong')}).click();const e=document.querySelector(${q('[data-composer-input]')});e.focus();const r=document.createRange();r.selectNodeContents(e);getSelection().removeAllRanges();getSelection().addRange(r)})()`);await c.call('Input.insertText',{text});await pause(450)}
const visibleOption=async contains=>c.evaluate(`(()=>{const m=document.querySelector(${q('[role=listbox]')}),o=[...m?.querySelectorAll('[role=option]')??[]].find(e=>e.innerText.includes(${JSON.stringify(contains)}));if(!o)throw Error('Candidate absent');const mr=m.getBoundingClientRect(),or=o.getBoundingClientRect();if(or.bottom>mr.bottom)m.scrollTop+=or.bottom-mr.bottom;if(or.top<mr.top)m.scrollTop-=mr.top-or.top;const r=o.getBoundingClientRect(),x=r.x+Math.min(30,r.width/2),y=r.y+Math.min(15,r.height/2);return {x,y,hit:o.contains(document.elementFromPoint(x,y)),text:o.innerText,rect:m.getBoundingClientRect().toJSON()}})()`)
const tap=async p=>{assert(p.hit,'Candidate is clipped');await c.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});await c.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(400)}
try{
 assert(!await c.evaluate(`['recording','transcribing','preparing','permission'].includes(JSON.parse(androidBridge.voiceStatus()).phase)`))
 original=await pref();writeFileSync(folder+'/test-preferences.json',JSON.stringify(original,null,2))
 await c.evaluate(`androidBridge.gamepadLease(0,false)`);await pause(850)
 if(!await c.evaluate(`!!document.querySelector('select[aria-label="泳道 3 会话"]')`)){await key(104);sidebarOpened=true}
 await choose(2,sid)
 await type('/feedback');const slash=await visibleOption('feedback');await tap(slash)
 const claimed=await c.evaluate(`({phase:document.querySelector(${q('[data-composer-input]')}).dataset.phase,text:document.querySelector(${q('[data-composer-input]')}).innerText})`)
 assert(claimed.text.startsWith('/feedback'));results.push({test:'Slash visible, touch selects original command',claimed,passed:true})
 await type('@deck-menu');await pause(1000);let file=await visibleOption('deck-menu-probe.txt');for(let i=0;i<10&&!file.hit;i++){await pause(100);file=await visibleOption('deck-menu-probe.txt')}if(!file.hit)console.log('File hit failure',file,await c.evaluate(`document.elementFromPoint(${file.x},${file.y})?.outerHTML.slice(0,600)`));assert(file.hit)
 await c.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await c.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await pause(400)
 const reference=await c.evaluate(`({text:document.querySelector(${q('[data-composer-input]')}).innerText,html:document.querySelector(${q('[data-composer-input]')}).innerHTML})`)
 assert(reference.html.includes('contenteditable="false"'));assert(reference.text.includes('deck-menu-probe.txt'));results.push({test:'File search scoped to workspace; Enter inserts real reference node',passed:true,reference})
 writeFileSync(folder+'/file-reference.png',execFileSync('adb',['-s',serial,'exec-out','screencap','-p'],{maxBuffer:16*1024*1024}))
 await type('@deck-menu');await pause(800);let touchFile=await visibleOption('deck-menu-probe.txt');for(let i=0;i<10&&!touchFile.hit;i++){await pause(100);touchFile=await visibleOption('deck-menu-probe.txt')}await tap(touchFile);assert(await c.evaluate(`!!document.querySelector(${q('[data-composer-chip=reference]')})`));results.push({test:'Touch selects file suggestion and creates original reference chip',passed:true})
 if(mode!=='menus-only'){
 await type('不要调用工具，只回复 CIRCLE_SEND_OK。')
 await key(97,true);await pause(700)
 assert.equal(await c.evaluate(`document.querySelector(${q('[data-composer-input]')}).innerText.trim()`),'')
 assert(await c.evaluate(`!!document.querySelector('.dsh-deck')`));await key(97);results.push({test:'Native BUTTON_B long press submits once; empty Circle keeps Deck open',passed:true})
 }else{await type(' ');await c.evaluate(`document.execCommand('delete')`)}
 console.log(JSON.stringify(results.map(r=>({...r,reference:r.reference?{text:r.reference.text}:undefined})),null,2))
}finally{
 if(original){
  const current=await pref().catch(()=>null)
  if(current?.lanes[2]===sid)await choose(2,original.lanes[2]??'').catch(()=>{})
  if(sidebarOpened)await key(104).catch(()=>{})
  await c.evaluate(`document.querySelector('[data-deck-lane="${original.lanes[original.active]}"] header strong')?.click()`).catch(()=>{})
 }
 await c.evaluate(`if(!['recording','preparing','transcribing','permission'].includes(JSON.parse(androidBridge.voiceStatus()).phase))androidBridge.gamepadLease(0,false)`).catch(()=>{})
 writeFileSync(folder+(mode==='menus-only'?'/menus-touch-tests.json':'/menus-send-tests.json'),JSON.stringify(results,null,2));c.close()
}
