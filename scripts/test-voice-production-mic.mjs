/** Bounded physical loopback; no session draft changes or agent submission. */
import{connect}from'./lib/android-cdp.mjs'
import{readFileSync,writeFileSync,mkdirSync}from'node:fs'
import{execFileSync}from'node:child_process'
const[serial,folder,restoreVolume]=process.argv.slice(2)
if(!folder)throw Error('Usage SERIAL OUTPUT [RESTORE_VOLUME]')
mkdirSync(folder,{recursive:true});const c=await connect(serial),rows=[]
const pause=ms=>new Promise(r=>setTimeout(r,ms))
try{
 const before=await c.evaluate('[...document.querySelectorAll("[data-composer-input]")].map(e=>e.innerText)')
 const id='production-mic-'+Date.now(),r=await c.evaluate(`JSON.parse(androidBridge.voiceStart('${id}'))`)
 if(!r.ok)throw Error(r.error)
 let s
 for(let i=0;i<450;i++){s=await c.evaluate('JSON.parse(androidBridge.voiceStatus())');if(s.phase==='recording')break;if(s.phase==='error')throw Error(s.error);await pause(200)}
 if(s.phase!=='recording')throw Error('Mic not ready')
 const wav=readFileSync('asr-lab/app/src/main/assets/samples/asr_zh.wav').toString('base64')
 const play=await c.call('Runtime.evaluate',{expression:`(async()=>{const a=new Audio(${JSON.stringify('data:audio/wav;base64,'+wav)});window.__productionMicAudio=a;await a.play();return true})()`,userGesture:true,awaitPromise:true,returnByValue:true})
 if(play.exceptionDetails)throw Error('Playback failed')
 for(let i=0;i<300;i++){s=await c.evaluate('JSON.parse(androidBridge.voiceStatus())');rows.push({phase:s.phase,engine:s.engine,capturedMs:s.capturedMs,speechDetected:s.speechDetected,silenceMs:s.silenceMs,autoStopped:s.autoStopped,level:s.level});if(['done','error','canceled'].includes(s.phase))break;await pause(200)}
 const unchanged=JSON.stringify(await c.evaluate('[...document.querySelectorAll("[data-composer-input]")].map(e=>e.innerText)'))===JSON.stringify(before)
 const result={source:'speaker -> real microphone -> VAD -> production SSE',passed:unchanged&&s.phase==='done'&&s.engine==='kleidiai'&&s.autoStopped&&s.silenceMs===5000,draftsUnchanged:unchanged,phase:s.phase,error:s.error,engine:s.engine,text:s.text,requestMs:s.requestMs,audioMs:s.audioMs,inputDeviceType:s.inputDeviceType,autoStopped:s.autoStopped,silenceMs:s.silenceMs,samples:rows}
 writeFileSync(folder+'/microphone.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,samples:undefined}))
 await c.evaluate(`androidBridge.voiceAcknowledge('${id}')`)
 if(!result.passed)process.exitCode=1
}finally{
 await c.evaluate('window.__productionMicAudio?.pause();delete window.__productionMicAudio;androidBridge.voiceRelease()').catch(()=>{});c.close()
 if(restoreVolume!==undefined){if(!/^\d+$/.test(restoreVolume))throw Error('Invalid volume');execFileSync('adb',['-s',serial,'shell','cmd','media_session','volume','--stream','3','--set',restoreVolume],{timeout:10000})}
}
