/** Real WebView touch/mouse input; inspect lengths only, never save chat text. */
import {connect} from './lib/android-cdp.mjs'
import {writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const c=await connect(process.argv[2]),pause=ms=>new Promise(r=>setTimeout(r,ms))
const result={inputSource:'CDP into Android WebView (not physical fingers/mouse)',samples:[]}
try {
 assert(await c.evaluate('document.body.hasAttribute("data-dsh-native-interaction")'))
 await c.evaluate(`window.__interactionCheck={drafts:[...document.querySelectorAll('[contenteditable=true]')].map(e=>[e,e.textContent]),scroll:[...document.querySelectorAll('.dsh-deck-grid,.dsh-deck-chat *')].filter(e=>e.scrollTop||e.scrollLeft).map(e=>[e,e.scrollTop,e.scrollLeft])};true`)
 const targets=await c.evaluate(`(()=>{let a=[];for(const flow of document.querySelectorAll('.dsh-deck-chat [data-chat-flow]')){let w=document.createTreeWalker(flow,NodeFilter.SHOW_TEXT);for(let n;n=w.nextNode();){if(n.length<8||getComputedStyle(n.parentElement).userSelect!=='text')continue;let r=document.createRange();r.setStart(n,0);r.setEnd(n,Math.min(8,n.length));let b=r.getBoundingClientRect();if(b.top>100&&b.bottom<innerHeight-180&&b.left>0&&b.right<innerWidth&&n.parentElement.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))){a.push({x:b.x,y:b.y+b.height/2,w:b.width});break}}}return a})()`)
 assert(targets.length>=1,'Need a visible lane message text node')
 const selection=()=>c.evaluate(`({length:getSelection()?.toString().length??0,inMessage:!!getSelection()?.anchorNode?.parentElement?.closest('.dsh-deck-chat [data-chat-flow]')})`)
 for(const [lane,t] of targets.entries()) {
  await c.evaluate('getSelection()?.removeAllRanges()')
  await c.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:t.x+t.w/2,y:t.y}]})
  await pause(900)
  await c.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  await pause(200)
  const touch=await selection();result.samples.push({lane,gesture:'touch-longpress',...touch});/* CDP bypasses Android's native longpress recognizer; physical confirmation is separate. */
  await c.evaluate('getSelection()?.removeAllRanges()')
  await c.call('Input.dispatchMouseEvent',{type:'mousePressed',x:t.x+2,y:t.y,button:'left',buttons:1,clickCount:1})
  for(let i=1;i<=5;i++)await c.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:t.x+2+(t.w-5)*i/5,y:t.y,button:'left',buttons:1})
  await c.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:t.x+t.w-3,y:t.y,button:'left',buttons:0,clickCount:1})
  const mouse=await selection();result.samples.push({lane,gesture:'mouse-drag',...mouse});assert(mouse.length>0&&mouse.inMessage)
 }
 await c.evaluate('getSelection()?.removeAllRanges()')
 result.policy=await c.evaluate(`(()=>{const test=e=>{if(!e)return null;const events=['contextmenu','selectstart'].map(name=>{let v=new Event(name,{bubbles:true,cancelable:true});e.dispatchEvent(v);return !v.defaultPrevented});return {select:getComputedStyle(e).userSelect,allowed:events}};return {title:test(document.querySelector('.dsh-deck-lane header')??document.querySelector('.dsh-deck-title')),button:test(document.querySelector('button')),editor:test(document.querySelector('[contenteditable=true]')),message:test(document.querySelector('[data-chat-flow] p'))}})()`)
 assert.deepEqual(result.policy.button.allowed,[false,false]);assert.deepEqual(result.policy.editor.allowed,[true,true]);assert.deepEqual(result.policy.message.allowed,[true,true])
 result.draftsUnchanged=await c.evaluate('window.__interactionCheck.drafts.every(([e,t])=>e.isConnected&&e.textContent===t)');assert(result.draftsUnchanged)
 console.log(JSON.stringify(result,null,2));writeFileSync('docs/validation/2026-09-11-native-interaction/device.json',JSON.stringify(result,null,2)+'\n')
} finally {
 await c.evaluate(`getSelection()?.removeAllRanges();if(window.__interactionCheck){for(const [e,t,l] of window.__interactionCheck.scroll){e.scrollTop=t;e.scrollLeft=l}delete window.__interactionCheck};true`).catch(()=>{})
 c.close()
}
