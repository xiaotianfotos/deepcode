/** Fold workbench drawer, half-width mapping and endpoint session continuity. */
import{connect}from'./lib/android-cdp.mjs'
import{mkdirSync,writeFileSync}from'node:fs'
import assert from'node:assert/strict'
const dir='docs/validation/2026-09-11-fold-deck-layout';mkdirSync(dir,{recursive:true})
const c=await connect(process.argv[2]),pause=ms=>new Promise(r=>setTimeout(r,ms))
const geometry=()=>c.evaluate(`(()=>{const f=document.querySelector('[data-app-frame]'),g=document.querySelector('.dsh-deck-grid'),b=g.getBoundingClientRect(),lanes=[...g.querySelectorAll('[data-deck-lane]')];const visible=lanes.filter(e=>{const r=e.getBoundingClientRect();return Math.min(r.right,b.right)-Math.max(r.left,b.left)>r.width*.65});return{width:innerWidth,fold:f.hasAttribute('data-fold-workbench'),mobile:f.hasAttribute('data-mobile'),drawer:f.children[1].hasAttribute('data-open'),grid:b.toJSON(),stride:lanes[1].getBoundingClientRect().left-lanes[0].getBoundingClientRect().left,visible:visible.map(e=>e.dataset.deckLane),scrollbar:getComputedStyle(g).scrollbarWidth,webkitScrollbar:getComputedStyle(g,'::-webkit-scrollbar').display,scroll:g.scrollLeft,crop:window.__dshNavigationInset(innerWidth),navSvg:!!f.querySelector('[aria-label$="导航"] svg'),active:lanes.find(e=>e.dataset.active==='true')?.dataset.deckLane}})()`)
async function host(cover){await c.evaluate(`androidBridge.foldHostPreview(${cover})`);for(let i=0;i<40;i++){await pause(100);const d=await c.evaluate('JSON.parse(androidBridge.foldStatus()).dual');if(d.primaryCover===cover&&d.hostReady){await pause(500);return d}}throw Error('Host not ready')}
try{
 await c.evaluate(`document.activeElement?.blur()`);await pause(500)
 const before=await geometry();assert(before.fold&&!before.mobile&&!before.drawer&&before.navSvg);assert.equal(before.visible.length,2);assert(Math.abs(before.stride-before.width/2)<1);assert(before.scrollbar==='none'||before.webkitScrollbar==='none');assert.equal(before.crop,before.width/2)
 await c.evaluate(`window.__foldDeckCheck=[...document.querySelectorAll('[data-deck-lane]')].map(e=>({e,editor:e.querySelector('[contenteditable=true]'),text:e.querySelector('[contenteditable=true]').textContent}));true`)
 await c.evaluate(`document.querySelector('[aria-label="打开导航"]').click()`);await pause(500)
 const drawer=await geometry();assert(drawer.drawer);assert.equal(drawer.grid.width,before.grid.width);assert.equal(drawer.grid.x,before.grid.x)
 await c.evaluate(`document.querySelector('[aria-label="收起导航"]').click()`);await pause(400)
 const coverState=await host(true),cover=await geometry();assert(cover.mobile&&cover.fold&&!cover.drawer&&cover.navSvg);assert.deepEqual(cover.visible,[before.visible[1]])
 writeFileSync(dir+'/cover.png',Buffer.from((await c.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
 const innerState=await host(false),inner=await geometry();assert.deepEqual(inner.visible,before.visible)
 const same=await c.evaluate(`window.__foldDeckCheck.every(r=>r.e.isConnected&&r.editor===r.e.querySelector('[contenteditable=true]')&&r.text===r.editor.textContent)`);assert(same)
 // Hidden scrollbar still permits moving to the following lane pair.
 await c.evaluate(`document.querySelector('.dsh-deck-grid').scrollLeft+=${before.stride}`);await pause(450);const scroll=await geometry();assert(scroll.scroll>before.scroll+before.stride*.7)
 await c.evaluate(`document.querySelector('.dsh-deck-grid').scrollLeft=${before.scroll}`);await pause(400)
 writeFileSync(dir+'/inner.png',Buffer.from((await c.call('Page.captureScreenshot',{format:'png'})).data,'base64'))
 const result={before,drawer,cover,inner,hostReady:[coverState.hostReady,innerState.hostReady],sameEditorsAndDrafts:same,hiddenScrollbarStillScrolls:true,physicalFold:false,modelMessageSent:false}
 writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));console.log({equalHalves:true,drawerDoesNotResize:true,coverUsesRightLane:true,innerPairRestored:true,hiddenScrollbarStillScrolls:true,sameEditorsAndDrafts:true})
}finally{await c.evaluate('androidBridge.foldHostPreview(false);delete window.__foldDeckCheck').catch(()=>{});c.close()}
