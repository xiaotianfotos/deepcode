/** Real soft-keyboard geometry on the Fold; no draft mutations or model sends. */
import{connect}from'./lib/android-cdp.mjs'
import{mkdirSync,writeFileSync}from'node:fs'
import assert from'node:assert/strict'
const c=await connect(process.argv[2]),pause=ms=>new Promise(r=>setTimeout(r,ms)),dir='docs/validation/2026-09-11-deck-ime'
mkdirSync(dir,{recursive:true})
const sample=()=>c.evaluate(`(()=>{const vv=visualViewport,frame=document.querySelector('[data-app-frame]');return{ime:parseFloat(document.documentElement.style.getPropertyValue('--dsh-android-ime-bottom'))||0,height:vv.height,offset:vv.offsetTop,frame:frame.getBoundingClientRect().toJSON(),inlineHeight:frame.style.height,translate:frame.style.translate,cards:[...document.querySelectorAll('[data-deck-lane] [data-composer-card]')].map(e=>e.getBoundingClientRect().toJSON())}})()`)
try{
 // Match the reported two-visible-lane layout; sidebar was collapsed in before.json.
 await c.evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')==='收起侧边栏');b?.click()})()`);await pause(600)
 const results=[]
 for(const lane of [0,1]){
 const p=await c.evaluate(`(()=>{const e=document.querySelectorAll('[data-deck-lane]')[${lane}].querySelector('[contenteditable=true]');e.closest('[data-deck-lane]').scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2-visualViewport.offsetLeft,y:r.y+r.height/2-visualViewport.offsetTop}})()`)
 await c.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await c.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(1000)
 const open=await sample();assert(open.ime>0,'Native keyboard did not open');assert(Math.abs(open.frame.height-open.height)<1);assert(Math.abs(open.frame.top-open.offset)<1)
 for(const card of open.cards){assert(card.top>=open.offset-1);assert(card.bottom<=open.offset+open.height+1)}
 await c.evaluate('document.activeElement?.blur()');await pause(800)
 const closed=await sample();assert.equal(closed.ime,0);assert.equal(closed.inlineHeight,'');assert.equal(closed.translate,'')
 results.push({lane:lane+1,open,closed})
 }
 writeFileSync(dir+'/cycles.json',JSON.stringify({nativeKeyboard:true,modelMessageSent:false,results},null,2))
 console.log({cycles:results.length,keyboardHeight:results.map(r=>r.open.ime),viewportHeight:results.map(r=>r.open.height),frameTopMatchesViewport:true,allCardsAboveKeyboard:true,closedStylesRestored:true})
 // Leave the right editor and real IME open, matching the user's latest state.
 const p=await c.evaluate(`(()=>{const e=document.querySelectorAll('[data-deck-lane]')[1].querySelector('[contenteditable=true]'),r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)
 await c.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await c.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(800)
 writeFileSync(dir+'/final-web.png',Buffer.from((await c.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
}finally{c.close()}
