/** Physical WebView: velocity-sensitive release, no premature focus/snap. */
import {connect} from './lib/android-cdp.mjs'
import {writeFileSync,mkdirSync} from 'node:fs'
import assert from 'node:assert/strict'
const [serial,folder]=process.argv.slice(2),c=await connect(serial),pause=ms=>new Promise(r=>setTimeout(r,ms)),results=[]
mkdirSync(folder,{recursive:true})
const state=()=>c.evaluate(`(()=>{const g=document.querySelector('.dsh-deck-grid');return {left:g.scrollLeft,active:JSON.parse(localStorage.getItem('dsh.voice-deck.controller.v2')).active,snap:getComputedStyle(g).scrollSnapType,drafts:[...g.querySelectorAll('[data-composer-input]')].map(e=>e.innerText)}})()`)
async function reset(){await c.evaluate(`document.querySelector('[data-deck-lane] header strong').click();document.querySelector('.dsh-deck-grid').scrollLeft=0`);await pause(300)}
async function drag(dx,delay=15,hold=0){
 const p=await c.evaluate(`(()=>{const r=document.querySelector('.dsh-deck-grid').getBoundingClientRect(),x=r.right-120,y=r.y+230;return {x,y,chat:!!document.elementFromPoint(x,y)?.closest('.dsh-deck-chat')}})()`);assert(p.chat)
 await c.evaluate(`document.querySelector('.dsh-deck-grid').addEventListener('touchend',()=>{const g=document.querySelector('.dsh-deck-grid');window.__deckReleaseSample={left:g.scrollLeft,active:JSON.parse(localStorage.getItem('dsh.voice-deck.controller.v2')).active,snap:getComputedStyle(g).scrollSnapType}},{once:true,capture:true})`)
 await c.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]})
 const pending=[]
 for(let i=1;i<=4;i++){pending.push(c.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+dx*i/4,y:p.y}]}));await pause(delay)}
 if(hold)await pause(hold)
 pending.push(c.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}));await Promise.all(pending)
 const before=await c.evaluate(`window.__deckReleaseSample`)
 const released=await state(),samples=[]
 for(let i=0;i<13;i++){await pause(40);samples.push(await state())}
 return {before,released,samples,final:await state()}
}
let initial
try{
 for(let i=0;i<80;i++){if(await c.evaluate(`!!document.querySelector('.dsh-deck-grid')`))break;await pause(250)}
 assert(!await c.evaluate(`['recording','preparing','transcribing','permission'].includes(JSON.parse(androidBridge.voiceStatus()).phase)`))
 initial=await state();await reset()
 let r=await drag(-90);writeFileSync(folder+'/quick-flick-trace.json',JSON.stringify(r,null,2));assert(r.before.left>25&&r.before.left<150);assert(r.final.left>300,'Short quick flick must cross a lane');assert(r.samples.some(s=>s.left>r.before.left+10&&s.left<r.final.left-10),'Need intermediate animation frames');assert.equal(r.released.active,0,'Focus must wait until coast settles');assert.equal(r.final.snap,'x mandatory');const positions=[r.before.left,r.released.left,...r.samples.map(s=>s.left)];assert(positions.every((x,i)=>i===0||x>=positions[i-1]-2),'No backward tug during forward inertia');assert(positions.slice(1).every((x,i)=>Math.abs(x-positions[i])<230),'No instant full-lane jump');results.push({test:'90px quick flick advances a full lane smoothly',...r,passed:true})
 r=await drag(90);assert(r.final.left<5,'Reverse quick flick returns to previous lane');results.push({test:'Short reverse flick follows release direction',...r,passed:true})
 await reset();r=await drag(-90,100,160);assert(r.final.left<5,'Slow short drag should settle back');assert(r.released.left>25,'Must not jump to snap at release');assert(r.samples.some(s=>s.left>5&&s.left<r.before.left-5));results.push({test:'Slow short drag eases back without an instant snap',...r,passed:true})
 await reset();r=await drag(-90,12,240);assert(r.final.left<5,'Pause must discard stale velocity');results.push({test:'Holding before release discards old flick velocity',passed:true})
 await reset()
 const p=await c.evaluate(`(()=>{const r=document.querySelector('.dsh-deck-grid').getBoundingClientRect();return {x:r.right-120,y:r.y+230}})()`)
 const touch=(type,x)=>c.call('Input.dispatchTouchEvent',{type,touchPoints:x===undefined?[]:[{x,y:p.y}]})
 await touch('touchStart',p.x)
 for(let n=1;n<=4;n++){await touch('touchMove',p.x-25*n);await pause(12)}
 await touch('touchEnd');await pause(60);await touch('touchStart',p.x)
 const grabbed=await state();await pause(80);assert(Math.abs((await state()).left-grabbed.left)<3,'Touch must stop the ongoing animation')
 await touch('touchMove',p.x+25);await pause(12);await touch('touchMove',p.x+50);await touch('touchEnd');await pause(650)
 assert((await state()).left<5);results.push({test:'Touch interrupts momentum and a reverse drag takes control',passed:true})
 assert.deepEqual((await state()).drafts,initial.drafts)
 console.log(JSON.stringify(results.map(({test,passed,before,final})=>({test,passed,from:before?.left,to:final?.left})),null,2))
}finally{if(initial)await c.evaluate(`document.querySelectorAll('[data-deck-lane]')[${initial.active}]?.querySelector('header strong').click()`).catch(()=>{});writeFileSync(folder+'/inertia-tests.json',JSON.stringify(results,null,2));c.close()}
