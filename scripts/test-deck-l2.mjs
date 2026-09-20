import {connect} from './lib/android-cdp.mjs'
import {execFileSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const [serial,folder]=process.argv.slice(2),c=await connect(serial),pause=ms=>new Promise(r=>setTimeout(r,ms)),samples=[]
const state=()=>c.evaluate(`(()=>{const grid=document.querySelector('.dsh-deck-grid'),r=grid.getBoundingClientRect(),a=grid.querySelector('[data-active="true"]'),b=a.getBoundingClientRect();return{x:r.x,width:r.width,active:a.dataset.deckLane,focus:document.activeElement?.closest('[data-deck-lane]')?.dataset.deckLane,visible:b.x>=r.x-2&&b.right<=r.right+2,drafts:[...grid.querySelectorAll('[data-composer-input]')].map(e=>e.innerText)}})()`)
try{
 const deadline=Date.now()+60000
 while(await c.evaluate(`['permission','preparing','recording','transcribing'].includes(JSON.parse(androidBridge.voiceStatus()).phase)`)){
   if(Date.now()>deadline)throw Error('Voice input is in use; retry after recording finishes')
   await pause(250)
 }
 await c.evaluate(`androidBridge.gamepadLease(0,false);document.querySelector('.dsh-deck-open')?.click()`);await pause(1000)
 const before=await state();samples.push(before)
 for(const long of [false,false,true,true]){
 execFileSync('adb',['-s',serial,'shell','input','gamepad','keyevent',...(long?['--longpress']:[]),'104']);await pause(550)
 const after=await state();assert.notEqual(after.x,samples.at(-1).x);assert.equal(after.active,before.active);assert.equal(after.focus,before.active);assert.equal(after.visible,true);assert.deepEqual(after.drafts,before.drafts);samples.push(after)
 }
 assert.equal(samples.at(-1).x,before.x)
 writeFileSync(folder+'/l2-tests.json',JSON.stringify({passed:true,sequence:['initial','press','press','long press','long press'],samples},null,2))
 console.log(JSON.stringify({passed:true,widths:samples.map(s=>s.width),sidebarEdges:samples.map(s=>s.x),focusKept:true,draftsKept:true}))
}finally{c.close()}
