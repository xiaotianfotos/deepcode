/** Physical Android WebView: two visible lanes, native key routing and touch scrolling. */
import {connect} from './lib/android-cdp.mjs'
import {execFileSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const [serial,folder]=process.argv.slice(2),c=await connect(serial),results=[]
const pause=ms=>new Promise(r=>setTimeout(r,ms))
const state=()=>c.evaluate(`(()=>{const grid=document.querySelector('.dsh-deck-grid'),box=grid.getBoundingClientRect();return {left:grid.scrollLeft,width:grid.clientWidth,box:box.toJSON(),focus:document.activeElement?.closest('[data-deck-lane]')?.dataset.deckLane,lanes:[...grid.querySelectorAll('[data-deck-lane]')].map(e=>{const r=e.getBoundingClientRect();return {id:e.dataset.deckLane,active:e.dataset.active==='true',x:r.x,y:r.y,width:r.width,height:r.height,visible:r.left>=box.left-2&&r.right<=box.right+2}})}})()`)
const key=async code=>{execFileSync('adb',['-s',serial,'shell','input','gamepad','keyevent',String(code)]);await pause(150)}
async function swipe(from,to){
 const s=await state(),y=s.box.y+250
 await c.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from,y}]})
 for(let n=1;n<=12;n++){await c.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from+(to-from)*n/12,y}]});await pause(22)}
 await c.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(1000)
}
try{
 await c.evaluate(`androidBridge.gamepadLease(0,false)`);await pause(900)
 for(let n=0;n<4;n++){if((await state()).lanes[0].active)break;await key(103)}
 let s=await state();assert(s.lanes[0].active);assert.equal(s.lanes.filter(l=>l.visible).length,2);assert(Math.abs(s.lanes[0].width*2+12-s.width)<2)
 for(let n=0;n<8;n++){await key(103);s=await state();const lane=s.lanes[(n+1)%4];assert(lane.active&&lane.visible);assert.equal(s.focus,lane.id);results.push({action:'R1',active:(n+1)%4+1,scrollLeft:s.left,visible:s.lanes.filter(l=>l.visible).map(l=>s.lanes.indexOf(l)+1)})}
 await swipe(s.box.right-90,s.box.left+100);s=await state();assert(s.left>100);assert.equal(s.focus,s.lanes.find(l=>l.active).id);assert(s.lanes.filter(l=>l.visible).at(-1).active)
 results.push({action:'swipe left to browse right',active:s.lanes.findIndex(l=>l.active)+1,scrollLeft:s.left})
 await swipe(s.box.left+90,s.box.right-100);s=await state();assert(s.lanes.filter(l=>l.visible)[0].active);assert.equal(s.focus,s.lanes.find(l=>l.active).id)
 results.push({action:'swipe right to browse left',active:s.lanes.findIndex(l=>l.active)+1,scrollLeft:s.left})
 const before=s.lanes.findIndex(l=>l.active),x=s.box.left+100,y=s.box.y+200
 await c.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await c.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+150}]});await c.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(500)
 assert.equal((await state()).lanes.findIndex(l=>l.active),before)
 results.push({action:'vertical gesture keeps selected lane',passed:true})
 writeFileSync(folder+'/two-columns.png',execFileSync('adb',['-s',serial,'exec-out','screencap','-p'],{maxBuffer:16*1024*1024}))
 console.log(JSON.stringify(results,null,2))
}finally{writeFileSync(folder+'/scroll-tests.json',JSON.stringify(results,null,2));c.close()}
