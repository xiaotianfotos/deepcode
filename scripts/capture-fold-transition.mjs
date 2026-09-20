import{connect}from './lib/android-cdp.mjs'
import{execFileSync}from'node:child_process'
import{writeFileSync}from'node:fs'
const c=await connect('emulator-5582'),folder='docs/validation/2026-09-10-foldable/dsh',pause=ms=>new Promise(r=>setTimeout(r,ms))
const emu=cmd=>execFileSync('adb',['-s','emulator-5582','emu',cmd])
const capture=name=>{const png=execFileSync('adb',['-s','emulator-5582','exec-out','screencap','-p','-d','4619827259835644672'],{maxBuffer:16*1024*1024});if(png.subarray(1,4).toString()!=='PNG')throw Error('Invalid PNG');writeFileSync(folder+'/'+name+'.png',png)}
try{
 await c.evaluate(`document.querySelectorAll('[data-deck-lane]')[1].querySelector('header strong').click()`);await pause(200)
 emu('fold');await pause(1000);emu('unfold');let captured=false
 for(let i=0;i<50;i++){const s=await c.evaluate('JSON.parse(androidBridge.foldStatus())');if(s.phase==='animating'||s.phase==='waiting'){capture('transition');writeFileSync(folder+'/transition-capture.json',JSON.stringify(s,null,2));captured=true;break}await pause(10)}
 if(!captured)throw Error('No transition observed');await pause(900);capture('transition-complete')
}finally{emu('unfold');c.close()}
