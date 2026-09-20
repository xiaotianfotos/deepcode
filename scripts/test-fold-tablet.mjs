/** Tablet rotation regression; does not type, send messages, or start recording. */
import{connect}from './lib/android-cdp.mjs'
import{execFileSync}from'node:child_process'
import{mkdirSync,writeFileSync}from'node:fs'
import assert from'node:assert/strict'
const[serial,folder]=process.argv.slice(2),c=await connect(serial),pause=ms=>new Promise(r=>setTimeout(r,ms));mkdirSync(folder,{recursive:true})
const adb=(...a)=>execFileSync('adb',['-s',serial,...a],{encoding:'utf8'}).trim(),rotation=adb('shell','wm','user-rotation');let baseline
const read=()=>c.evaluate(`(()=>{const els=[...document.querySelectorAll('[data-composer-input]')],s=getSelection();return {width:innerWidth,timeOrigin:performance.timeOrigin,fold:JSON.parse(androidBridge.foldStatus()),drafts:els.map(e=>e.innerText),same:!!window.__tabletEditors&&els.every((e,i)=>e===window.__tabletEditors[i]),active:JSON.parse(localStorage.getItem('dsh.voice-deck.controller.v2')).active,caret:s?.anchorOffset,voice:JSON.parse(androidBridge.voiceStatus()).phase}})()`)
try{
 adb('shell','input','keyevent','KEYCODE_WAKEUP');adb('shell','wm','dismiss-keyguard');
 for(let n=0;n<40;n++){if(await c.evaluate(`document.visibilityState==='visible'&&innerWidth>0`))break;await pause(100)}
 baseline=await read();assert(!['recording','preparing','transcribing','permission'].includes(baseline.voice));assert(baseline.width>0)
 await c.evaluate(`void(window.__tabletEditors=[...document.querySelectorAll('[data-composer-input]')])`)
 const pid=adb('shell','pidof','com.dsharnessmobile.shell'),results=[]
 for(const turn of [0,1,0,1]){
  adb('shell','wm','user-rotation','lock',String(turn));await pause(900);const s=await read();assert.deepEqual(s.drafts,baseline.drafts);assert.equal(s.active,baseline.active);assert(s.same);assert.equal(s.timeOrigin,baseline.timeOrigin);assert.equal(adb('shell','pidof','com.dsharnessmobile.shell'),pid);assert.equal(s.fold.phase,'idle');results.push({rotation:turn,width:s.width,fold:s.fold,editorsRetained:s.same,draftsPreserved:true})
 }
 assert(results.some(r=>r.fold.completed>0));assert(new Set(results.map(r=>r.width)).size>1)
 writeFileSync(folder+'/tablet-tests.json',JSON.stringify({passed:true,serial,model:adb('shell','getprop','ro.product.model'),sdk:adb('shell','getprop','ro.build.version.sdk'),foldHardwareTested:false,results},null,2));console.log(JSON.stringify({passed:true,rotations:results.length,blurCompletions:results.at(-1).fold.completed}))
}finally{const parts=rotation.split(/\s+/);adb('shell','wm','user-rotation',...parts);c.close()}
