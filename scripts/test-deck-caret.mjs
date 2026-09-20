/** Preserve real drafts; verify native lane switching collapses selection at the end. */
import {connect} from './lib/android-cdp.mjs'
import {execFileSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const [serial,folder]=process.argv.slice(2),c=await connect(serial),pause=ms=>new Promise(r=>setTimeout(r,ms)),results=[]
mkdirSync(folder,{recursive:true})
const key=async code=>{execFileSync('adb',['-s',serial,'shell','input','gamepad','keyevent',String(code)]);await pause(180)}
const state=()=>c.evaluate(`(()=>{const lanes=[...document.querySelectorAll('[data-deck-lane]')],root=document.activeElement,selection=getSelection();let remaining=null;if(root?.matches('[data-composer-input]') && selection?.rangeCount && root.contains(selection.focusNode)){const range=document.createRange();range.selectNodeContents(root);range.setStart(selection.focusNode,selection.focusOffset);remaining=range.toString()}return {ids:lanes.map(e=>e.dataset.deckLane),drafts:lanes.map(e=>e.querySelector('[data-composer-input]').innerText),active:lanes.findIndex(e=>e.dataset.active==='true'),focus:root?.closest('[data-deck-lane]')?.dataset.deckLane,remaining,collapsed:selection?.isCollapsed}})()`)
const go=async index=>{for(let i=0;i<4;i++){if((await state()).active===index)return;await key(103)}assert.equal((await state()).active,index)}
const atStart=async()=>{await c.evaluate(`(()=>{const root=document.activeElement,r=document.createRange();r.selectNodeContents(root);r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r)})()`);await pause(120);assert((await state()).remaining.length>0)}
try{
 assert(!await c.evaluate(`['permission','preparing','recording','transcribing'].includes(JSON.parse(androidBridge.voiceStatus()).phase)`),'Recording in progress; run later')
 await c.evaluate(`document.querySelector('.dsh-deck-open')?.click();androidBridge.gamepadLease(0,false)`);await pause(900)
 const initial=await state(),target=initial.drafts.findIndex(s=>s.trim().length>0);assert(target>=0)
 await go(target);await atStart();await key(103);await key(102)
 let s=await state();assert.equal(s.active,target);assert.equal(s.focus,s.ids[target]);assert.equal(s.remaining,'');assert(s.collapsed);assert.deepEqual(s.drafts,initial.drafts)
 results.push({test:'R1 away and L1 back: old start caret becomes collapsed end caret',passed:true})
 await atStart();await key(104);s=await state();assert(s.remaining.length>0);assert.equal(s.active,target);await key(104)
 results.push({test:'L2 collapse/expand retains manually placed caret',passed:true})
 await key(103);await c.evaluate(`document.querySelectorAll('[data-deck-lane]')[${target}].querySelector('header strong').click()`);await pause(200);s=await state();assert.equal(s.active,target);assert.equal(s.remaining,'');assert(s.collapsed)
 results.push({test:'Touch selection also focuses at draft end',passed:true})
 await c.call('Input.insertText',{text:'🧪'});await pause(100);s=await state();assert.equal(s.drafts[target],initial.drafts[target]+'🧪');await key(99);s=await state();assert.deepEqual(s.drafts,initial.drafts)
 results.push({test:'Square removes the trailing test emoji and all original drafts remain intact',passed:true})
 console.log(JSON.stringify(results,null,2))
}finally{writeFileSync(folder+'/caret-tests.json',JSON.stringify(results,null,2));await c.evaluate(`if(!['permission','preparing','recording','transcribing'].includes(JSON.parse(androidBridge.voiceStatus()).phase))androidBridge.gamepadLease(0,false)`).catch(()=>{});c.close()}
