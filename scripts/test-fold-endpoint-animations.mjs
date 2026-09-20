/** Inspect real WebView CSS animation frames during native endpoint rehosting. */
import {connect} from './lib/android-cdp.mjs'
import {mkdirSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const serial=process.argv[2];assert(serial)
const c=await connect(serial),sleep=ms=>new Promise(r=>setTimeout(r,ms))
const dir=process.argv[3]??'docs/validation/2026-09-11-fold-endpoint';mkdirSync(dir,{recursive:true})
let initial
try{
 initial=await c.evaluate('JSON.parse(androidBridge.foldStatus())');assert(initial.foreground&&(initial.hingeDegrees>175||initial.hingeDegrees<=3)&&initial.dual.leasedState===5)
 await c.evaluate('androidBridge.foldHostPreview(false)');await sleep(650)
 await c.evaluate(`window.__endpointEditor={editor:document.querySelector('[contenteditable=true]'),draft:document.querySelector('[contenteditable=true]')?.textContent,origin:performance.timeOrigin};true`)
 const results=[]
 for(const cover of [true,false]){
  await c.evaluate(`(()=>{const start=performance.now();window.__endpointFrames=[];function sample(){const s=JSON.parse(androidBridge.foldStatus());window.__endpointFrames.push({t:performance.now()-start,width:innerWidth,cover:s.dual.primaryCover,hostReady:s.dual.hostReady,transitions:document.getAnimations().filter(a=>a.constructor.name==='CSSTransition'&&/mobileDrawer|mobileSheet/.test(a.effect?.target?.className??'')).map(a=>({property:a.transitionProperty,target:a.effect.target.className}))});if(performance.now()-start<900)requestAnimationFrame(sample)}requestAnimationFrame(sample);androidBridge.foldHostPreview(${cover})})()`)
  await sleep(1100)
  const frames=await c.evaluate('window.__endpointFrames');results.push({cover,frames})
  assert(frames.some(f=>f.cover===cover&&f.hostReady),'Destination did not become ready')
  assert.equal(frames.flatMap(f=>f.transitions).length,0,'Responsive remap still slides a panel')
 }
 // User-initiated drawer actions must keep their existing animation.
 await c.evaluate('androidBridge.foldHostPreview(true)');await sleep(800)
 assert.equal(await c.evaluate('document.querySelector("[data-mobile-topbar]").nextElementSibling.hasAttribute("data-open")'),false)
 await c.evaluate('document.querySelector("[aria-label=打开导航]").click()');await sleep(80)
 const manual=await c.evaluate(`document.getAnimations().some(a=>a.transitionProperty==='margin-left'&&/mobileDrawer/.test(a.effect?.target?.className??''))`)
 await c.evaluate('document.querySelector("[aria-label=打开导航]").click()');await sleep(350)
 assert(manual,'Manual drawer transition was disabled')
 const coverLayout=await c.evaluate(`(()=>{const bar=document.querySelector('[data-mobile-topbar]'),f=bar.parentElement,button=bar.querySelector('button'),title=bar.children[1],r=button.getBoundingClientRect(),body=f.children[2].getBoundingClientRect(),seat=document.querySelector('[data-composer-seat]')?.getBoundingClientRect(),header=document.querySelector('[data-slot=\"conversation.session.header\"]>header'),tabs=header?.children[1]?.getBoundingClientRect();return {navigationAboveTabs:!!tabs&&r.bottom<=tabs.top,compact:f.hasAttribute('data-compact-header'),wordmarkHidden:getComputedStyle(title).display==='none',bodyTop:body.top,buttonVisible:r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1,composerFits:!!seat&&seat.left>=-1&&seat.right<=innerWidth+1}})()`)
 assert(coverLayout.navigationAboveTabs && coverLayout.compact && coverLayout.wordmarkHidden && coverLayout.buttonVisible && coverLayout.composerFits)
 assert.equal(coverLayout.bodyTop,0,'Brand header still reserves a layout row')
 const continuity=await c.evaluate(`(()=>{const s=window.__endpointEditor,e=document.querySelector('[contenteditable=true]');return {sameEditor:s.editor===e,sameDraft:s.draft===e?.textContent,sameDocument:s.origin===performance.timeOrigin}})()`)
 assert(Object.values(continuity).every(Boolean))
 const summary={automaticPanelTransitions:0,manualDrawerTransition:manual,coverLayout,...continuity,physicalFoldVerified:false,results}
 writeFileSync(dir+'/after-dom.json',JSON.stringify(summary,null,2)+'\n')
 console.log({...summary,results:results.map(x=>({cover:x.cover,frames:x.frames.length}))})
}finally{
 await c.evaluate(`(()=>{const bar=document.querySelector('[data-mobile-topbar]');if(bar?.nextElementSibling?.hasAttribute('data-open'))bar.querySelector('button')?.click();androidBridge.foldHostPreview(${initial?.hingeDegrees<=3});delete window.__endpointEditor;delete window.__endpointFrames})()`).catch(()=>{});c.close()
}
