import WebSocket from 'ws'

export function streamKind(service) {
 if (!/^wss?:/.test(service?.baseUrl ?? '')) return ''
 const u=new URL(service.baseUrl)
 if(u.username||u.password||u.search||u.hash)throw Error('WebSocket 地址不能包含凭据或查询参数')
 if(u.pathname==='/v1/realtime')return 'asr'
 if(u.pathname==='/v1/audio/speech/stream')return 'tts'
 throw Error('不支持的语音 WebSocket 路径')
}
function socket(service,key){return new WebSocket(service.baseUrl,{headers:key?{Authorization:'Bearer '+key}:{},maxPayload:2*1024*1024,handshakeTimeout:5000,followRedirects:false})}
function send(ws,value){if(ws.readyState!==WebSocket.OPEN||ws.bufferedAmount>256*1024)throw Error('语音连接中断或发送积压');ws.send(JSON.stringify(value))}
function error(){return Error('流式语音服务失败，请检查服务和模型配置')}

/** One capture, explicit start/commit, replacement partials, never submits a prompt. */
export class StreamingAsr {
 constructor(service,key){
  this.ws=socket(service,key);this.text='';this.final='';this.bytes=0;this.sequence=0;this.finishing=false;this.failure=null
  this.ready=new Promise((resolve,reject)=>{this.resolveReady=resolve;this.rejectReady=reject})
  this.done=new Promise((resolve,reject)=>{this.resolveDone=resolve;this.rejectDone=reject})
  // A disconnect may happen before the consumer calls finish.
  this.ready.catch(()=>{});this.done.catch(()=>{})
  this.timer=setTimeout(()=>this.close(Error('流式录音超时')),95_000)
  this.ws.on('error',()=>this.close(error()))
  this.ws.on('close',()=>{if(!this.completed)this.close(Error('识别连接提前关闭'))})
  this.ws.on('message',(raw,binary)=>{
   try{
    if(binary)throw error()
    const e=JSON.parse(raw.toString())
    if(e.type==='error')throw error()
    if(e.type==='session.created'){
     if(e.sample_rate!==16000||e.format!=='pcm16'||e.protocol!=='qwen-local-asr-v1')throw Error('不兼容的 ASR WebSocket 协议')
     send(this.ws,{type:'session.update',model:service.model})
     send(this.ws,{type:'input_audio_buffer.commit'});this.resolveReady()
    }else if(e.type==='transcription.partial')this.text=String(e.text??'').slice(0,8000)
    else if(e.type==='transcription.final')this.final=String(e.text??'').slice(0,8000)
    else if(e.type==='session.done'){
     if(!this.finishing||!this.final.trim())throw Error('未识别到完整文字')
     this.completed=true;this.resolveDone({text:this.final.trim()});clearTimeout(this.timer);this.ws.close()
    }
   }catch(e){this.close(e)}
  })
 }
 async append(pcm,sequence){
  await this.ready;if(this.failure)throw this.failure
  if(this.finishing||sequence!==this.sequence||!pcm.length||pcm.length%2||pcm.length>32000||this.bytes+pcm.length>1_920_000)throw Error('录音分段顺序或长度无效')
  this.sequence++;this.bytes+=pcm.length;send(this.ws,{type:'input_audio_buffer.append',audio:pcm.toString('base64')})
  return {partial:this.text,sequence:this.sequence}
 }
 async finish(sequence){await this.ready;if(this.failure)throw this.failure;if(this.finishing||sequence!==this.sequence||!this.bytes)throw Error('录音未完整提交');this.finishing=true;send(this.ws,{type:'input_audio_buffer.commit',final:true});return this.done}
 close(reason=Error('录音已取消')){if(this.failure||this.completed)return;this.failure=reason;clearTimeout(this.timer);this.rejectReady(reason);this.rejectDone(reason);this.ws.terminate()}
}

/** PCM chunks are forwarded immediately; no whole-utterance audio buffer. */
export function streamTts(service,key,text,signal,emit){
 if(typeof text!=='string'||!text.trim()||text.length>3000)throw Error('朗读文字长度无效')
 return new Promise((resolve,reject)=>{
  const ws=socket(service,key);let ended=false,started=false,bytes=0,sentenceDone=false
  const finish=(err)=>{if(ended)return;ended=true;signal?.removeEventListener('abort',cancel);ws.terminate();err?reject(err):resolve()}
  const cancel=()=>finish(Error('朗读已取消'))
  signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted){cancel();return}
  ws.on('error',()=>finish(error()));ws.on('close',()=>{if(!ended)finish(Error('朗读连接提前关闭'))})
  ws.on('open',()=>{try{
   send(ws,{type:'session.config',model:service.model,voice:service.voice||'vivian',instructions:service.instructions||undefined,task_type:'CustomVoice',language:'Auto',response_format:'pcm',stream_audio:true,speed:service.speed||1})
   send(ws,{type:'input.text',text});send(ws,{type:'input.done'})
  }catch(e){finish(e)}})
  ws.on('message',(raw,binary)=>{try{
   if(binary){bytes+=raw.length;if(!started||raw.length%2||bytes>8*1024*1024)throw error();emit({type:'audio',audio:raw.toString('base64')});return}
   const e=JSON.parse(raw.toString())
   if(e.type==='error'||e.error)throw error()
   if(e.type==='audio.start'){
    if(e.format!=='pcm'||![16000,22050,24000,32000,44100,48000].includes(e.sample_rate))throw Error('不支持的 TTS 音频格式')
    if(started)throw Error('TTS 返回了意外的音频分段')
    started=true;emit({type:'format',sampleRate:e.sample_rate,channels:1,encoding:'pcm16'})
   }else if(e.type==='audio.done')sentenceDone=true
   else if(e.type==='session.done'){if(!bytes||!sentenceDone)throw Error('朗读音频不完整');emit({type:'done'});finish()}
  }catch(e){finish(e)}})
 })
}
