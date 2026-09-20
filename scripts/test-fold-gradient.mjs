import {requireFoldDevice} from './lib/device-target.mjs'
/** Real Android compositor pixel check. Preview is bounded and never sends chat input. */
import {connect} from './lib/android-cdp.mjs'
import {execFileSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const [serial,folder]=process.argv.slice(2)
requireFoldDevice(serial)
mkdirSync(folder,{recursive:true})
const c=await connect(serial),pause=ms=>new Promise(r=>setTimeout(r,ms))
const adb=(...a)=>execFileSync('adb',['-s',serial,...a],{maxBuffer:32*1024*1024})
const state=()=>c.evaluate(`({fold:JSON.parse(androidBridge.foldStatus()),timeOrigin:performance.timeOrigin,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,drafts:[...document.querySelectorAll('[data-composer-input]')].map(e=>e.innerText)})`)
const capture=name=>{
 const info=adb('shell','dumpsys','display').toString().split('\n').find(l=>l.includes('DisplayDeviceInfo{')&&/state ON[, ]/.test(l))
 const id=info?.match(/StablePhysical\{id=(\d+)/)?.[1];assert(id,'No active physical display')
 const raw=adb('exec-out','screencap','-p','-d',id),start=raw.indexOf(Buffer.from([137,80,78,71,13,10,26,10]));assert(start>=0)
 writeFileSync(`${folder}/${name}.png`,raw.subarray(start))
}
let initial
try {
 initial=await state();assert(initial.fold.foreground,'Keep DeepCode in foreground and unlocked')
 await c.evaluate(`(()=>{
  androidBridge.foldConfigure(true);
  const e=document.createElement('canvas');e.id='__foldGradientPattern';e.width=Math.round(innerWidth*devicePixelRatio);e.height=Math.round(innerHeight*devicePixelRatio);
  e.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:2147483647;pointer-events:none';document.body.append(e);
  const ctx=e.getContext('2d'),w=e.width,h=e.height,data=ctx.createImageData(w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let v=225;if(y>h*.25&&y<h*.4)v=128+110*Math.sin(x*Math.PI/16);
    if(y>h*.55&&y<h*.7)v=128+110*Math.sin(y*Math.PI/16);
    const i=(y*w+x)*4;data.data[i]=data.data[i+1]=data.data[i+2]=v;data.data[i+3]=255;
  }
  ctx.putImageData(data,0,0);ctx.fillStyle='#202124';ctx.font=(24*devicePixelRatio)+'px sans-serif';
  for(let x=0;x<3;x++){ctx.fillText('DeepCode · 9:41',w*(.03+x*.33),h*.16);ctx.fillText('聊天文字 ABC',w*(.03+x*.33),h*.87)}
 })()`)
 await pause(200);capture('clear')
 const samples=[]
 for(const amount of [.5,1]) {
  await c.evaluate(`androidBridge.foldPreview(${amount})`);await pause(250)
  const s=await state();assert.equal(s.fold.phase,'preview');assert.equal(s.fold.blurMode,'horizontal-gradient');assert.equal(s.fold.shaderError,null)
  assert(s.fold.sigmaLeftPx>s.fold.sigmaCenterPx);assert.equal(s.fold.sigmaRightPx,0)
  capture('gradient-'+amount);samples.push(s)
 }
 await pause(4100);const end=await state();assert.equal(end.fold.phase,'idle');assert.equal(end.fold.blurAmount,0)
 capture('cleared');assert.equal(end.timeOrigin,initial.timeOrigin);assert.deepEqual(end.drafts,initial.drafts)
 writeFileSync(folder+'/gpu-preview.json',JSON.stringify({previewOnly:true,physicalFoldTested:false,initial,samples,end},null,2))
 console.log(JSON.stringify({previewCompleted:true,shaderError:end.fold.shaderError,window:[end.width,end.height],pixelAnalysisPending:true}))
} finally {
 await c.evaluate(`document.getElementById('__foldGradientPattern')?.remove();androidBridge.foldConfigure(false);androidBridge.foldConfigure(${initial?.fold.enabled??true})`).catch(()=>{})
 c.close()
}
