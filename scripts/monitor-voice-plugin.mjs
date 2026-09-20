/** Observe a user-operated microphone test without starting recording or reading other sessions. */
import {connect} from './lib/android-cdp.mjs'
import {mkdirSync,writeFileSync} from 'node:fs'
const [serial,folder,duration='180']=process.argv.slice(2)
if(!serial||!folder)throw new Error('Usage: node scripts/monitor-voice-plugin.mjs SERIAL OUTPUT [SECONDS]')
mkdirSync(folder,{recursive:true});const c=await connect(serial),start=Date.now(),samples=[];let phase='';let recorded=false
try{
 while(Date.now()-start<Number(duration)*1000){
  const value=await c.evaluate(`({voice:JSON.parse(androidBridge.voiceStatus()),draft:document.querySelector('[data-composer-input]')?.innerText,overlay:document.querySelector('aside.dsh-performance-overlay')?.innerText,prompt:document.querySelector('.dsh-voice-status')?.innerText})`)
  samples.push({elapsedMs:Date.now()-start,...value});writeFileSync(folder+'/mic-observation.json',JSON.stringify(samples,null,2))
  if(value.voice.phase!==phase){phase=value.voice.phase;console.log(JSON.stringify(samples.at(-1)));if(phase==='recording')recorded=true}
  if(recorded && ['idle','error','canceled'].includes(phase)){
   const shot=await c.call('Page.captureScreenshot',{format:'png'});writeFileSync(folder+'/mic-result.png',Buffer.from(shot.data,'base64'));break
  }
  await new Promise(r=>setTimeout(r,120))
 }
}finally{c.close()}
