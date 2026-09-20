/** Real tablet speaker -> AudioRecord -> local model -> official editor insertion. */
import {connect} from './lib/android-cdp.mjs'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import assert from 'node:assert/strict'
const [serial,folder]=process.argv.slice(2);if(!folder)throw new Error('Usage: SERIAL OUTPUT')
mkdirSync(folder,{recursive:true});const c=await connect(serial),samples=[],pause=ms=>new Promise(r=>setTimeout(r,ms));let initial
const observe=()=>c.evaluate(`({voice:JSON.parse(androidBridge.voiceStatus()),draft:document.querySelector('[data-composer-input]')?.innerText,performance:JSON.parse(androidBridge.performanceSample()),prompt:document.querySelector('.dsh-voice-status')?.innerText,editorHtml:document.querySelector('[data-composer-input]')?.innerHTML})`)
try{
 const requests=[];c.on('Network.requestWillBeSent',e=>{requests.push(new URL(e.request.url).pathname)});await c.call('Network.enable');
 initial=await observe();const beforeRefs=await c.evaluate(`[...document.querySelectorAll('[data-composer-chip=reference]')].map(e=>e.outerHTML)`);assert(['idle','canceled','error'].includes(initial.voice.phase),'Do not interrupt an active user recording')
 await c.evaluate(`document.querySelector('[aria-label="语音输入"]').click()`)
 const start=Date.now();let ready=false
 while(Date.now()-start<95000){const s=await observe();if(s.prompt?.includes('请在应用前台'))throw new Error('Wake and foreground the tablet before testing');samples.push({elapsedMs:Date.now()-start,...s});if(s.voice.phase==='recording'){ready=true;break}if(s.voice.phase==='error')throw new Error(s.voice.error);await pause(200)}
 assert(ready,'Microphone not ready')
 const wav=readFileSync(new URL('../asr-lab/app/src/main/assets/samples/asr_zh.wav',import.meta.url)).toString('base64')
 const expression=`new Promise(async(resolve,reject)=>{try{const a=new Audio(${JSON.stringify('data:audio/wav;base64,'+wav)});window.__voiceTestAudio=a;a.onended=()=>resolve({played:true,duration:a.duration});a.onerror=()=>reject(new Error('Sample playback failed'));await a.play()}catch(e){reject(e)}})`
 const play=await c.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(play.exceptionDetails)throw new Error(JSON.stringify(play.exceptionDetails));await pause(350)
 await c.evaluate(`document.querySelector('[aria-label="停止录音并转成文字"]').click()`);const stopAt=Date.now();let result
 while(Date.now()-stopAt<120000){result=await observe();samples.push({elapsedMs:Date.now()-start,afterStopMs:Date.now()-stopAt,...result});if(['idle','error'].includes(result.voice.phase))break;await pause(60)}
 await pause(200);result=await observe();
 assert.equal(result.voice.phase,'idle',result.prompt);assert(!result.prompt?.includes('草稿暂不可编辑'),result.prompt);assert(result.draft.startsWith(initial.draft),'Original draft lost');assert(result.draft.length>initial.draft.length,'No transcript inserted')
 const afterRefs=await c.evaluate(`[...document.querySelectorAll('[data-composer-chip=reference]')].map(e=>e.outerHTML)`);assert.deepEqual(afterRefs,beforeRefs,'File reference modified');
 assert(!requests.some(p=>p.includes('/api/session/prompt')),'Unexpected agent submission');
 const receipt={agentPromptRequests:requests.filter(p=>p.includes('/api/session/prompt')).length,referenceCount:beforeRefs.length,referencesPreserved:true,source:'tablet speaker -> physical microphone -> AudioRecord -> 0.6B CPU -> official editor',initialDraft:initial.draft,finalDraft:result.draft,stopToDraftMs:Date.now()-stopAt,requestMs:result.voice.requestMs,firstTextMs:result.voice.firstTextMs,audio:play.result.value}
 writeFileSync(folder+'/receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2))
 const shot=await c.call('Page.captureScreenshot',{format:'png'});writeFileSync(folder+'/result.png',Buffer.from(shot.data,'base64'))
}finally{await c.evaluate(`(()=>{const a=window.__voiceTestAudio;if(a){a.pause();a.removeAttribute('src')};const s=JSON.parse(androidBridge.voiceStatus());if(['preparing','recording','transcribing'].includes(s.phase))androidBridge.voiceCancel(s.id)})()`).catch(()=>{});writeFileSync(folder+'/samples.json',JSON.stringify(samples,null,2));await c.evaluate('delete window.__voiceTestAudio').catch(()=>{});c.close()}
