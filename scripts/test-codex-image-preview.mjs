/** Confirm a real attachment is decoded by Android WebView, not just model text. */
import {connect} from './lib/android-cdp.mjs'
import {execFileSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const serial=process.argv[2],out='docs/validation/2026-09-10-codex'
for(const args of [['input','keyevent','KEYCODE_WAKEUP'],['wm','dismiss-keyguard'],['am','start','-n','com.dsharnessmobile.shell/.MainActivity']])execFileSync('adb',['-s',serial,'shell',...args],{stdio:'ignore'})
const c=await connect(serial),pause=ms=>new Promise(r=>setTimeout(r,ms))
try{
 await c.evaluate(`[...document.querySelectorAll('[role="treeitem"]')].find(e=>[...e.querySelectorAll('span')].some(x=>x.textContent==='Codex 后端验收 A')).click()`)
 let images=[]
 for(let i=0;i<60;i++){
  images=await c.evaluate(`[...document.querySelectorAll('img')].filter(e=>e.getBoundingClientRect().width>60).map(e=>({loaded:e.complete&&e.naturalWidth>0,width:e.naturalWidth,height:e.naturalHeight}))`)
  if(images.some(e=>e.loaded&&e.width===1254&&e.height===1254))break
  await pause(250)
 }
 assert(images.some(e=>e.loaded&&e.width===1254&&e.height===1254),'Original generated image must be decoded and visible')
 await c.evaluate(`[...document.querySelectorAll('img')].find(e=>e.naturalWidth===1254&&e.naturalHeight===1254)?.scrollIntoView({block:'center'})`)
 await pause(300)
 const result={passed:true,images}
 writeFileSync(out+'/native-image-display.json',JSON.stringify(result,null,2))
 writeFileSync(out+'/native-image-display.png',execFileSync('adb',['-s',serial,'exec-out','screencap','-p'],{maxBuffer:16*1024*1024}))
 console.log(result)
}finally{c.close()}
