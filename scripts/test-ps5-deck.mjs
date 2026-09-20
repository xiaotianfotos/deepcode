/** Real Android key dispatch + four official editors + physical audio loopback. */
import {connect} from './lib/android-cdp.mjs'
import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import assert from 'node:assert/strict'
const [serial,folder]=process.argv.slice(2);if(!folder)throw new Error('SERIAL OUTPUT required')
mkdirSync(folder,{recursive:true});const ids=JSON.parse(readFileSync(folder+'/sessions.json'))
const c=await connect(serial),results=[],pause=ms=>new Promise(r=>setTimeout(r,ms))
const key=code=>execFileSync('adb',['-s',serial,'shell','input','gamepad','keyevent',String(code)])
const state=()=>c.evaluate(`({active:document.querySelector('[data-deck-lane][data-active="true"]')?.dataset.deckLane,focus:document.activeElement?.closest('[data-deck-lane]')?.dataset.deckLane,drafts:[...document.querySelectorAll('[data-deck-lane]')].map(e=>e.querySelector('[data-composer-input]')?.innerText?.replace(/^\\n$/, '')??''),errors:document.querySelectorAll('[data-slot-error]').length})`)
const go=async index=>{for(let n=0;n<4;n++){if((await state()).active===ids[index])break;key(103);await pause(100)}assert.equal((await state()).active,ids[index])}
const voice=()=>c.evaluate(`(()=>{const s=JSON.parse(androidBridge.voiceStatus());return {phase:s.phase,id:s.id,error:s.error,inputDevice:s.inputDevice,audioMs:s.audioMs,requestMs:s.requestMs,firstTextMs:s.firstTextMs,autoStopped:s.autoStopped}})()`)
try{
 await c.evaluate(`androidBridge.gamepadLease(0,false)`);await pause(900)
 let s=await state();assert.equal(s.errors,0);assert.equal(s.drafts.length,4)
 const timing=[]
 for(let i=0;i<20;i++){const before=(await state()).active,start=performance.now();key(103);await pause(20);const after=await state();assert.notEqual(after.active,before);assert.equal(after.focus,after.active);timing.push(performance.now()-start)}
 results.push({test:'20 Android R1 presses, one lane each and matching focus',passed:true,roundTripMs:timing})
 await go(2);assert.equal((await state()).drafts[2],'','Use a blank acceptance lane')
 await c.call('Input.insertText',{text:'测试🙂'});await pause(100);assert.equal((await state()).drafts[2],'测试🙂')
 key(99);await pause(150);assert.equal((await state()).drafts[2],'测试')
 key(99);key(99);await pause(150);assert.equal((await state()).drafts[2],'')
 results.push({test:'Square deletes Chinese and complete emoji through official Lexical editor',passed:true})
 const baseline=(await state()).drafts
 key(100)
 const deadline=Date.now()+95000
 while(Date.now()<deadline){const v=await voice();if(v.phase==='recording')break;if(v.phase==='error')throw new Error(v.error);await pause(150)}
 assert.equal((await voice()).phase,'recording');const started=await voice()
 const wav=readFileSync(new URL('../asr-lab/app/src/main/assets/samples/asr_zh.wav',import.meta.url)).toString('base64')
 const expression=`new Promise(async(resolve,reject)=>{const a=new Audio(${JSON.stringify('data:audio/wav;base64,'+wav)});window.__deckAudio=a;a.onended=()=>resolve(true);a.onerror=()=>reject(new Error('Playback failed'));try{await a.play()}catch(e){reject(e)}})`
 const playback=await c.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});assert(!playback.exceptionDetails,'Playback failed')
 assert.equal((await voice()).phase,'recording');const stopAt=Date.now();key(103);await pause(100);assert.equal((await state()).active,ids[3]);
 await c.call('Input.insertText',{text:'D保留'});await pause(100)
 let final
 while(Date.now()-stopAt<90000){final=await voice();if(final.phase==='idle')break;if(final.phase==='error')throw new Error(final.error);await pause(100)}
 assert.equal(final.phase,'idle');s=await state();assert(s.drafts[2].length>baseline[2].length);assert.equal(s.drafts[3],baseline[3]+'D保留');assert.equal(s.active,ids[3]);assert.equal(s.focus,ids[3]);assert.equal(s.errors,0)
 results.push({test:'C physical microphone -> Qwen0.6B; R1 finishes C, D typing and focus remain intact',passed:true,inputDevice:started.inputDevice,transcript:s.drafts[2],stopToDraftMs:Date.now()-stopAt,asr:final})
 const geometry=await c.evaluate(`[...document.querySelectorAll('[data-deck-lane]')].map(e=>({y:e.getBoundingClientRect().top,h:e.clientHeight,w:e.clientWidth}))`)
 assert.equal(new Set(geometry.map(r=>r.y)).size,1);assert.equal(new Set(geometry.map(r=>r.h)).size,1)
 assert.equal(await c.evaluate(`localStorage.getItem('dsh.android.performance.enabled')`),'false')
 results.push({test:'Four equal-height lanes with two visible columns; performance overlay stays disabled',passed:true,geometry})
 console.log(JSON.stringify(results,null,2))
}finally{
 await c.evaluate(`window.__deckAudio?.pause();delete window.__deckAudio;const s=JSON.parse(androidBridge.voiceStatus());if(['preparing','recording','transcribing'].includes(s.phase))androidBridge.voiceCancel(s.id)`).catch(()=>{})
 writeFileSync(folder+'/automated-input.json',JSON.stringify(results,null,2));c.close()
}
