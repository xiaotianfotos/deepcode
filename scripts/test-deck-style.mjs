import {connect} from './lib/android-cdp.mjs'
import {writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const [serial,folder]=process.argv.slice(2),c=await connect(serial),pause=ms=>new Promise(r=>setTimeout(r,ms))
const sample=deck=>c.evaluate(`(()=>{const root=${deck?"document.querySelectorAll('[data-deck-lane]')[2]":"document"},answer=[...root.querySelectorAll('[data-chat-flow-kind="assistant-step"]')].at(-1);const selectors=['h1','p','strong','ul','ol','pre','table','blockquote','code'];return {nodes:selectors.map(selector=>{const el=answer.querySelector(selector);if(!el)return{selector,missing:true};const s=getComputedStyle(el);return {selector,tag:el.tagName,className:el.className,text:el.textContent,font:s.fontSize,lineHeight:s.lineHeight,fontFamily:s.fontFamily,weight:s.fontWeight,marginTop:s.marginTop,marginBottom:s.marginBottom,whiteSpace:s.whiteSpace}}),card:(()=>{const s=getComputedStyle(root.querySelector('[data-composer-card]'));return{radius:s.borderRadius,padding:s.padding,font:s.fontSize,lineHeight:s.lineHeight}})()}})()`)
const ready=async deck=>{
 await c.evaluate(`(()=>{const root=${deck?"document.querySelectorAll('[data-deck-lane]')[2]":"document"};${deck?"root.querySelector('header strong').click();":""}const answer=[...root.querySelectorAll('[data-chat-flow-kind="assistant-step"]')].at(-1);answer.querySelector('pre').scrollIntoView({block:'center',inline:'nearest'})})()`)
 const end=Date.now()+10000
 while(Date.now()<end){const value=await sample(deck);if(value.nodes.find(n=>n.selector==='pre')?.className.includes('shiki'))return value;await pause(100)}
 throw Error('Visible fixture syntax highlighting did not finish')
}
try{
 await c.evaluate(`document.querySelector('.dsh-deck-open').click()`);await pause(500)
 const deck=await ready(true);assert(deck.nodes.every(n=>!n.missing))
 await c.evaluate(`(()=>{let e=document.querySelectorAll('.dsh-deck-chat')[2].firstElementChild,f=e[Object.keys(e).find(k=>k.startsWith('__reactFiber'))];for(;f;f=f.return)if(f.memoizedProps?.part==='chat'&&typeof f.memoizedProps.openView==='function'){f.memoizedProps.openView('chat','');return}})()`)
 await pause(500);assert.equal(await c.evaluate(`!!document.querySelector('.dsh-deck')`),false)
 const original=await ready(false)
 assert.deepEqual(deck,original,'Same message nodes and original typography/card styling')
 writeFileSync(folder+'/style-comparison.json',JSON.stringify({passed:true,deck,original},null,2));console.log(JSON.stringify({passed:true,tags:deck.nodes.map(n=>n.tag),composer:deck.card}))
}finally{await c.evaluate(`document.querySelector('.dsh-deck-open')?.click()`).catch(()=>{});c.close()}
