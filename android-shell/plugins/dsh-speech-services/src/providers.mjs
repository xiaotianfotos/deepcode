import {streamKind} from './streaming.mjs'
export const MAX_AUDIO=2_000_044
export function endpoint(base,path){
 const u=new URL(base);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error('服务地址必须是 HTTP(S) base URL')
 u.pathname=u.pathname.replace(/\/+$/,'').replace(/\/v1$/,'')+'/v1/'+path;return u.toString()
}
export function validateProfiles(c){
 const ids=new Set(['local']);if(!Array.isArray(c.services)||c.services.length>12)throw Error('最多配置 12 个语音服务')
 for(const s of c.services){if(!/^[a-zA-Z0-9_-]{1,48}$/.test(s.id)||ids.has(s.id)||['__proto__','constructor','prototype'].includes(s.id))throw Error('服务 ID 无效或重复');ids.add(s.id);if(s.instructions!=null&&(typeof s.instructions!=='string'||s.instructions.length>500))throw Error('声音风格最多 500 字');if(!s.model?.trim()||s.model.length>160)throw Error('请填写模型名称');if(!streamKind(s))endpoint(s.baseUrl,'audio/transcriptions')}
 if(!ids.has(c.asrProvider)||c.ttsProvider&&!ids.has(c.ttsProvider)||c.ttsProvider==='local')throw Error('默认语音服务不存在')
 for(const [id,kind] of [[c.asrProvider,'asr'],[c.ttsProvider,'tts']]){const s=c.services.find(s=>s.id===id);if(s&&streamKind(s)&&streamKind(s)!==kind)throw Error('默认服务的 WebSocket 类型不匹配')}
 if(c.ttsEnabled&&!c.ttsProvider)throw Error('请先选择 TTS 服务')
}
export async function boundedBody(response,limit){
 const chunks=[];let size=0
 for await(const chunk of response.body??[]){size+=chunk.length;if(size>limit)throw Error('服务响应过大');chunks.push(chunk)}
 return Buffer.concat(chunks)
}
export function isMimo(service){
 return service.model?.startsWith('mimo-') || new URL(service.baseUrl).hostname==='api.xiaomimimo.com'
}
function wavFromPcm(pcm){
 if(pcm.length%2)throw Error('TTS PCM 数据不完整')
 const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(pcm.length+36,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(24000,24);h.writeUInt32LE(48000,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);return Buffer.concat([h,pcm])
}
export async function requestProvider(service,key,kind,value,signal,fetcher=fetch){
 const mimo=isMimo(service),headers=key?(mimo?{'api-key':key}:{Authorization:'Bearer '+key}):{};let body
 if(kind==='asr'){
  if(!Buffer.isBuffer(value)||value.length<44||value.length>MAX_AUDIO||value.toString('ascii',0,4)!=='RIFF'||value.toString('ascii',8,12)!=='WAVE')throw Error('无效或过长的录音')
  if(mimo){headers['content-type']='application/json';body=JSON.stringify({model:service.model,messages:[{role:'user',content:[{type:'input_audio',input_audio:{data:'data:audio/wav;base64,'+value.toString('base64')}}]}],asr_options:{language:'auto'}})}
  else{body=new FormData();body.set('model',service.model);body.set('response_format','json');body.set('file',new Blob([value],{type:'audio/wav'}),'speech.wav')}
 }else{
  headers['content-type']='application/json';const input=String(value).slice(0,3000)
  body=JSON.stringify(mimo?{model:service.model,messages:[{role:'user',content:'Read the assistant message aloud in the specified voice.'},{role:'assistant',content:input}],audio:{format:'wav',voice:!service.voice||service.voice==='alloy'?'mimo_default':service.voice}}:{model:service.model,input,instructions:service.instructions||undefined,voice:service.voice||'alloy',speed:service.speed||1,response_format:'mp3'})
 }
 const r=await fetcher(endpoint(service.baseUrl,mimo?'chat/completions':kind==='asr'?'audio/transcriptions':'audio/speech'),{method:'POST',headers,body,signal,redirect:'error'})
 if(!r.ok){await r.body?.cancel();throw Error('语音服务返回 HTTP '+r.status)}
 const b=await boundedBody(r,kind==='asr'?128*1024:mimo?12*1024*1024:8*1024*1024)
 if(kind==='asr'){const x=JSON.parse(b.toString()),text=mimo?x.choices?.[0]?.message?.content:x.text;if(typeof text!=='string'||!text.trim())throw Error('未识别到文字');return {text:text.trim()}}
 if(mimo){
  const encoded=JSON.parse(b.toString()).choices?.[0]?.message?.audio?.data
  if(typeof encoded!=='string'||!encoded||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw Error('TTS 未返回有效音频')
  const audio=Buffer.from(encoded,'base64');if(!audio.length||audio.length>8*1024*1024)throw Error('TTS 音频大小无效')
  const wav=audio.toString('ascii',0,4)==='RIFF'&&audio.toString('ascii',8,12)==='WAVE'?audio:wavFromPcm(audio)
  return {audio:wav.toString('base64'),mime:'audio/wav'}
 }
 const mime=r.headers.get('content-type')?.split(';')[0];if(!mime?.startsWith('audio/'))throw Error('TTS 未返回音频');return {audio:b.toString('base64'),mime}
}
