import test from 'node:test'
import assert from 'node:assert/strict'
import {WebSocketServer} from 'ws'
import {once} from 'node:events'
import {StreamingAsr,streamTts,streamKind} from '../src/streaming.mjs'
import {validateProfiles} from '../src/providers.mjs'

async function server(t,path,onConnection){
 const wss=new WebSocketServer({port:0,host:'127.0.0.1'});await once(wss,'listening');wss.on('connection',onConnection)
 t.after(()=>{for(const c of wss.clients)c.terminate();wss.close()})
 return {baseUrl:`ws://127.0.0.1:${wss.address().port}${path}`,model:'fixture'}
}
const created={type:'session.created',sample_rate:16000,format:'pcm16',protocol:'qwen-local-asr-v1'}
test('streaming ASR starts before audio, replaces partials, requires final and ordered chunks',async t=>{
 let count=0,started=false
 const s=await server(t,'/v1/realtime',w=>{w.send(JSON.stringify(created));w.on('message',raw=>{const e=JSON.parse(raw);if(e.type==='input_audio_buffer.commit'){
  if(!e.final){started=true;return}
  w.send(JSON.stringify({type:'transcription.final',text:'完整转录'}));w.send(JSON.stringify({type:'session.done'}))
 }else if(e.type==='input_audio_buffer.append'){assert.ok(started);w.send(JSON.stringify({type:'transcription.partial',text:++count===1?'草稿':'修订'}))}})})
 const asr=new StreamingAsr(s,'');t.after(()=>asr.close());await asr.ready
 await asr.append(Buffer.alloc(6400),0);await new Promise(r=>setTimeout(r,10));assert.equal(asr.text,'草稿')
 await asr.append(Buffer.alloc(6400),1);await new Promise(r=>setTimeout(r,10));assert.equal(asr.text,'修订')
 await assert.rejects(asr.append(Buffer.alloc(6400),1),/顺序/)
 assert.deepEqual(await asr.finish(2),{text:'完整转录'})
})
test('ASR disconnect/cancel rejects partial-only input; no fallback resubmission',async t=>{
 const s=await server(t,'/v1/realtime',w=>{w.send(JSON.stringify(created));w.on('message',raw=>{if(JSON.parse(raw).final)w.close()})})
 const asr=new StreamingAsr(s,'');await asr.append(Buffer.alloc(640),0);await assert.rejects(asr.finish(1),/提前关闭/)
 const canceled=new StreamingAsr(s,'');await canceled.ready;canceled.close();await assert.rejects(canceled.append(Buffer.alloc(640),0),/取消/)
})
test('TTS forwards PCM before done and cancellation closes the socket',async t=>{
 let finish;const wait=new Promise(r=>finish=r)
 const s=await server(t,'/v1/audio/speech/stream',w=>w.on('message',raw=>{
  const e=JSON.parse(raw);if(e.type==='session.config'){assert.equal(e.stream_audio,true);assert.equal(e.response_format,'pcm');assert.equal(e.instructions,'自然交流')}
  if(e.type==='input.done'){w.send(JSON.stringify({type:'audio.start',format:'pcm',sample_rate:24000}));w.send(Buffer.alloc(480));wait.then(()=>{if(w.readyState===1){w.send(JSON.stringify({type:'audio.done'}));w.send(JSON.stringify({type:'session.done'}))}})}
 }))
 const events=[];let audio;const first=new Promise(r=>audio=r)
 s.instructions='自然交流';const done=streamTts(s,'','测试',new AbortController().signal,e=>{events.push(e);if(e.type==='audio')audio()})
 await first;assert.deepEqual(events.map(e=>e.type),['format','audio']);finish();await done;assert.equal(events.at(-1).type,'done')
 const abort=new AbortController();const canceled=streamTts(s,'','测试',abort.signal,()=>{});abort.abort();await assert.rejects(canceled,/取消/)
})
test('WS profiles reject mismatched defaults, credentials in URL and unknown paths',()=>{
 assert.equal(streamKind({baseUrl:'http://example.test'}),'')
 assert.throws(()=>streamKind({baseUrl:'ws://example.test/unknown'}))
 assert.throws(()=>streamKind({baseUrl:'ws://user:secret@example.test/v1/realtime'}))
 const c={asrProvider:'local',ttsProvider:'tts',ttsEnabled:true,services:[{id:'tts',model:'tts',baseUrl:'ws://example.test/v1/audio/speech/stream'}]}
 assert.doesNotThrow(()=>validateProfiles(c));assert.throws(()=>validateProfiles({...c,asrProvider:'tts'}),/不匹配/)
})
