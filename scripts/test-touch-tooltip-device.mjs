/** Exercise Chromium's touch/mouse input on the installed Android WebView. */
import{connect}from'./lib/android-cdp.mjs'
import{writeFileSync,mkdirSync}from'node:fs'
import assert from'node:assert/strict'
const serial=process.argv[2];assert(serial)
const dir='docs/validation/2026-09-11-touch-deck';mkdirSync(dir,{recursive:true})
const c=await connect(serial),pause=ms=>new Promise(r=>setTimeout(r,ms))
const rect=()=>c.evaluate(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>/^(打开|收起|关闭)侧边栏$/.test(e.getAttribute('aria-label')??''));const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,label:e.getAttribute('aria-label')}})()`)
const tips=()=>c.evaluate(`[...document.querySelectorAll('[role=tooltip]')].filter(e=>e.getBoundingClientRect().width&&getComputedStyle(e).visibility!=='hidden').map(e=>e.textContent)`)
const tap=async()=>{const p=await rect();await c.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});await c.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(700);return p}
let initial
try{
 await c.evaluate('androidBridge.foldConfigure(true)');await pause(600)
 initial=await c.evaluate(`document.querySelector('[data-slot=root]>div').hasAttribute('data-sidebar-collapsed')`)
 const rows=[]
 for(let i=0;i<4;i++){const p=await tap();const t=await tips();assert.equal(t.length,0);rows.push({action:p.label,visibleTooltips:t.length,touch:await c.evaluate(`document.body.hasAttribute('data-dsh-touch-input')`)})}
 assert.equal(initial,await c.evaluate(`document.querySelector('[data-slot=root]>div').hasAttribute('data-sidebar-collapsed')`))
 const p=await rect();await c.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y,button:'none',pointerType:'mouse'});await pause(700)
 assert((await tips()).some(t=>/侧边栏/.test(t)))
 await tap();assert.equal((await tips()).length,0);await tap()
 const deck=await c.evaluate(`(()=>{const d=document.querySelector('.dsh-deck'),g=document.querySelector('.dsh-deck-grid'),r=g?.getBoundingClientRect();return {deck:d?.getBoundingClientRect().height,grid:r?.height,toolbar:!!document.querySelector('.dsh-deck-toolbar'),footer:!!document.querySelector('.dsh-deck>footer'),returnTab:[...document.querySelectorAll('[role=tab]')].some(e=>e.textContent==='对话'),fold:JSON.parse(androidBridge.foldStatus()).enabled}})()`)
 assert(deck.deck&&!deck.toolbar&&!deck.footer&&deck.returnTab&&deck.fold)
 // Verify the retained native conversation tab, then return to the deck.
 await c.evaluate(`(()=>{[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent==='对话').click()})()`);await pause(250)
 assert(!await c.evaluate(`!!document.querySelector('.dsh-deck')`))
 await c.evaluate(`(()=>{[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent==='会话工作台').click()})()`);await pause(400)
 assert(await c.evaluate(`!!document.querySelector('.dsh-deck')`))
 const result={input:'CDP touch/mouse on physical Fold WebView; system adb input injection unavailable',touches:rows,mouseTooltipVisible:true,touchAfterMouseHidesTooltip:true,returnToChatAndDeck:true,deck}
 writeFileSync(dir+'/result.json',JSON.stringify(result,null,2)+'\n')
 writeFileSync(dir+'/after.png',Buffer.from((await c.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
 console.log(result)
}finally{
 if(initial!==undefined){const now=await c.evaluate(`document.querySelector('[data-slot=root]>div').hasAttribute('data-sidebar-collapsed')`).catch(()=>initial);if(now!==initial)await tap().catch(()=>{})}
 c.close()
}
