/** Dedicated fold emulator: real display switching, native animation and retained editor state. */
import{connect}from './lib/android-cdp.mjs'
import{execFileSync}from'node:child_process'
import{writeFileSync,mkdirSync}from'node:fs'
import assert from'node:assert/strict'
const [serial,folder]=process.argv.slice(2);assert.equal(serial,'emulator-5582','Dedicated emulator only')
mkdirSync(folder,{recursive:true});const c=await connect(serial),pause=ms=>new Promise(r=>setTimeout(r,ms)),results=[]
const adb=(...a)=>execFileSync('adb',['-s',serial,...a],{encoding:'utf8'}).trim()
const read=()=>c.evaluate(`(()=>{const g=document.querySelector('.dsh-deck-grid'),els=[...document.querySelectorAll('[data-composer-input]')],s=getSelection();return {width:innerWidth,mobile:!!document.querySelector('[data-mobile]'),fold:JSON.parse(androidBridge.foldStatus()),grid:g&&{w:g.clientWidth,columns:getComputedStyle(g).gridTemplateColumns,left:g.scrollLeft},drafts:els.map(e=>e.innerText),same:!!window.__foldEditors&&els.every((e,i)=>e===window.__foldEditors[i]),caret:s?.anchorOffset,focus:document.activeElement?.closest('[data-deck-lane]')?.dataset.deckLane,timeOrigin:performance.timeOrigin}})()`)
const capture=name=>writeFileSync(folder+'/'+name+'.png',execFileSync('adb',['-s',serial,'exec-out','screencap','-p','-d',name==='fold'?'4619827551948147201':'4619827259835644672'],{maxBuffer:16*1024*1024}))
async function fold(command){adb('emu',command);const trace=[];for(let i=0;i<30;i++){trace.push(await read());await pause(35)}return trace}
try{
 assert.equal(await c.evaluate(`document.querySelectorAll('[data-deck-lane]').length`),4)
 await c.evaluate(`document.querySelector('[data-deck-lane] header strong').click()`);await pause(100)
 await c.call('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await c.call('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65})
 await c.call('Input.insertText',{text:'折叠草稿🙂keep'})
 await c.evaluate(`(()=>{window.__foldEditors=[...document.querySelectorAll('[data-composer-input]')];const e=window.__foldEditors[0];e.focus();const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),n=w.nextNode(),r=document.createRange();r.setStart(n,2);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()`)
 const initial=await read();const pid=adb('shell','pidof','com.dsharnessmobile.shell');capture('inner-before')
 assert(initial.grid.w>680,'Inner display should fit two lanes')
 for(const command of ['fold','unfold','fold','unfold']){
  const trace=await fold(command),end=trace.at(-1);writeFileSync(folder+'/'+command+'-trace.json',JSON.stringify(trace,null,2))
  assert.equal(adb('shell','pidof','com.dsharnessmobile.shell'),pid)
  assert.equal(end.timeOrigin,initial.timeOrigin,'WebView navigation/reload forbidden')
  assert.deepEqual(end.drafts,initial.drafts);assert(end.same,'Editor DOM must stay mounted')
  assert.equal(end.caret,2,'Caret must not jump to end during fold')
  assert.equal(end.fold.phase,'idle');assert.equal(end.mobile,command==='fold')
  assert(end.fold.animationMs>=180 && end.fold.animationFrames>=2,'Native animation must render multiple frames for the intended duration')
  const column=parseFloat(end.grid.columns)
  assert(command==='fold'?Math.abs(column-end.grid.w)<3:Math.abs(column*2+12-end.grid.w)<3,'Responsive lane width')
  capture(command);results.push({test:command+' preserves editor/state and completes blur',passed:true,end,phases:[...new Set(trace.map(s=>s.fold.phase))]})
 }
 await c.evaluate('androidBridge.foldConfigure(false)');await pause(100);const count=(await read()).fold.transitions
 const off=await fold('fold');assert(off.every(s=>s.fold.phase==='idle'));assert.equal(off.at(-1).fold.transitions,count);assert.deepEqual(off.at(-1).drafts,initial.drafts)
 results.push({test:'Disabled animation still adapts layout and preserves drafts',passed:true})
 await c.evaluate('androidBridge.foldConfigure(true)');await fold('unfold')
 console.log(JSON.stringify(results.map(({test,passed,phases})=>({test,passed,phases})),null,2))
}finally{writeFileSync(folder+'/fold-tests.json',JSON.stringify(results,null,2));c.close()}
