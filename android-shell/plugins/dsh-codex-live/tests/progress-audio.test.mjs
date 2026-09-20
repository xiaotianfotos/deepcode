import test from 'node:test'
import assert from 'node:assert/strict'
import {ProgressAudio} from '../src/client/progress-audio.mjs'
async function fixture(run){
 const oldFetch=globalThis.fetch,oldContext=globalThis.AudioContext,calls=[],contexts=[]
 class Audio {
  constructor(){this.state='running';this.at=Date.now();contexts.push(this)}
  get currentTime(){return (Date.now()-this.at)/1000}
  async resume(){}
  async close(){this.state='closed'}
  createBuffer(channels,length,rate){const data=new Float32Array(length);this.data=data;return {length,duration:length/rate,getChannelData:()=>data}}
  createBufferSource(){return {connect(){},start:()=>calls.push('play')}}
 }
 globalThis.AudioContext=Audio
 const config={enabled:true,ttsEnabled:true,csrf:'test',revision:1,ttsProvider:'tts',services:[{id:'tts',baseUrl:'ws://example.test/v1/audio/speech/stream'}]}
 globalThis.fetch=async(path,options)=>{calls.push({path,options});if(!options?.method)return Response.json(config)
  return new Response([{type:'format',sampleRate:24000,channels:1,encoding:'pcm16'},{type:'audio',audio:Buffer.from([0,0,0,64,0,128]).toString('base64')},{type:'done'}].map(x=>JSON.stringify(x)).join('\n'))}
 try{await run({calls,contexts,config})}finally{globalThis.fetch=oldFetch;globalThis.AudioContext=oldContext}
}
test('foreground TTS consumes the configured PCM stream and closes its audio context',async()=>fixture(async({calls,contexts})=>{
 const states=[],a=new ProgressAudio(()=>true,s=>states.push(s));await a.play('正在检查。')
 assert.ok(states.includes('playing'));assert.equal(states.at(-1),'idle');assert.equal(contexts[0].state,'closed')
 assert.deepEqual([...contexts[0].data],[0,.5,-1]);assert.equal(calls.filter(x=>x==='play').length,1)
 const req=calls.find(c=>c.options?.method);assert.equal(JSON.parse(req.options.body).action,'tts-stream');assert.equal(JSON.parse(req.options.body).text,'正在检查。')
}))
test('focus/microphone loss aborts in-flight synthesis without scheduling late audio',async()=>fixture(async({contexts})=>{
 let allowed=true,started
 const ready=new Promise(r=>started=r),a=new ProgressAudio(()=>allowed)
 const original=globalThis.fetch
 globalThis.fetch=async(path,options)=>{
  if(!options?.method)return original(path,options)
  started();return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}))
 }
 const playing=a.play('正在检查。');await ready;allowed=false
 await assert.rejects(playing,/aborted/);assert.equal(contexts[0].state,'closed')
}))
test('disabled TTS fails before any audio context or provider request',async()=>fixture(async({config,contexts,calls})=>{
 config.ttsEnabled=false;const a=new ProgressAudio()
 await assert.rejects(a.play('no'),/TTS/);assert.equal(contexts.length,0);assert.equal(calls.length,1)
}))
