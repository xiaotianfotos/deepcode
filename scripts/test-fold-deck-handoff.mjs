/** Inspect every WebView animation frame, not only the settled endpoint. */
import {connect} from './lib/android-cdp.mjs'
import {mkdirSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const serial=process.argv[2],c=await connect(serial),sleep=ms=>new Promise(r=>setTimeout(r,ms))
const dir=process.argv[3]??'docs/validation/2026-09-11-fold-deck-handoff'
mkdirSync(dir,{recursive:true})
let initial
try{
  initial=await c.evaluate('JSON.parse(androidBridge.foldStatus())')
  assert(initial.foreground&&initial.dual.leasedState===5)
  await c.evaluate('androidBridge.foldHostPreview(false)');await sleep(800)
  await c.evaluate(`document.activeElement?.blur();document.querySelector('.dsh-deck-open')?.click()`);await sleep(600)
  assert(await c.evaluate(`innerWidth>680&&!!document.querySelector('.dsh-deck-grid')`))
  await c.evaluate(`window.__deckHandoff={scroll:document.querySelector('.dsh-deck-grid').scrollLeft,active:document.querySelector('[data-deck-lane][data-active=true]')?.dataset.deckLane,origin:performance.timeOrigin,editors:[...document.querySelectorAll('[data-deck-lane] [contenteditable=true]')].map(e=>({e,text:e.textContent}))};true`)
  const rounds=[]
  for(const selected of [0,1,0]){
    await c.evaluate(`androidBridge.foldHostPreview(false)`);await sleep(700)
    const pair=await c.evaluate(`(()=>{const g=document.querySelector('.dsh-deck-grid');g.scrollLeft=0;const lanes=[...g.querySelectorAll('[data-deck-lane]')];lanes[${selected}].querySelector('header strong').click();return lanes.slice(0,2).map(e=>e.dataset.deckLane)})()`)
    await sleep(180)
    await c.evaluate(`(()=>{const start=performance.now();window.__deckFrames=[];function sample(){const s=JSON.parse(androidBridge.foldStatus()),g=document.querySelector('.dsh-deck-grid'),b=g.getBoundingClientRect();window.__deckFrames.push({t:performance.now()-start,width:innerWidth,cover:s.dual.primaryCover,ready:s.dual.hostReady,error:s.dual.mirrorError,visible:[...g.querySelectorAll('[data-deck-lane]')].filter(e=>{const r=e.getBoundingClientRect();return Math.min(r.right,b.right)-Math.max(r.left,b.left)>r.width*.65}).map(e=>e.dataset.deckLane)});if(performance.now()-start<1200)requestAnimationFrame(sample)}requestAnimationFrame(sample);androidBridge.foldHostPreview(true)})()`)
    await sleep(1400)
    const frames=await c.evaluate('window.__deckFrames'),shown=frames.filter(f=>f.cover&&f.ready)
    rounds.push({selected,pair,frames});writeFileSync(dir+'/frames.json',JSON.stringify(rounds,null,2))
    assert(shown.length>5,'No settled destination frames')
    for(const f of shown){assert.deepEqual(f.visible,[pair[1]],`Wrong lane shown at ${f.t} ms`);assert.equal(f.error,null)}
  }
  const continuous=await c.evaluate(`window.__deckHandoff.origin===performance.timeOrigin&&window.__deckHandoff.editors.every(r=>r.e.isConnected&&r.e.textContent===r.text)`)
  assert(continuous)
  console.log({rounds:rounds.length,inspectedFrames:rounds.reduce((n,r)=>n+r.frames.length,0),wrongVisibleLaneFrames:0,sameEditorsAndDrafts:continuous,physicalFold:false})
}finally{
  await c.evaluate('androidBridge.foldHostPreview(false)');await sleep(700)
  await c.evaluate(`(()=>{const o=window.__deckHandoff,g=document.querySelector('.dsh-deck-grid');if(o&&g){[...g.querySelectorAll('[data-deck-lane]')].find(e=>e.dataset.deckLane===o.active)?.querySelector('header strong')?.click();g.scrollLeft=o.scroll}delete window.__deckHandoff;delete window.__deckFrames;androidBridge.foldHostPreview(${initial?.dual.primaryCover===true})})()`).catch(()=>{})
  c.close()
}
