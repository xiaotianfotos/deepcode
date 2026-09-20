import Schema from '@deepseek-ai/schemastery'
import {defineTool} from '@deepseek-ai/dsh-tools'
import {SayQueue,SAY_GUIDANCE} from './say.mjs'
import {installSaySkill} from './say-skill.mjs'
import {randomBytes} from 'node:crypto'
import {mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {endpoint,validateProfiles,requestProvider} from './providers.mjs'
import {StreamingAsr,streamTts,streamKind} from './streaming.mjs'
import {ResponseFeed} from './state.mjs'
export const name='dsh-speech-services', inject=['settings','webServer'], NAMESPACE='speech-services'
export const PATH='/api/android/speech'
const Service=Schema.object({id:Schema.string(),name:Schema.string(),baseUrl:Schema.string(),model:Schema.string(),voice:Schema.string().default('alloy'),instructions:Schema.string().default(''),speed:Schema.number().min(.25).max(4).default(1)})
export const Config=Schema.object({enabled:Schema.boolean().default(true),asrEnabled:Schema.boolean().default(true),ttsEnabled:Schema.boolean().default(false),overlayGamepad:Schema.boolean().default(true),asrProvider:Schema.string().default('local'),ttsProvider:Schema.string().default(''),services:Schema.array(Service).default([])})
export function apply(ctx,config={}){
 const scope=ctx.settings.register(NAMESPACE,Config,{base:config,applies:'live',validate:validateProfiles})
 const csrf=randomBytes(24).toString('hex'),feed=new ResponseFeed(),say=new SayQueue(),pending=new Set(),streams=new Map();let dead=false,revision=0
 const directory=join(homedir(),'.dsh','speech-services'),keyFile=join(directory,'credentials.json');let keys={}
 try{keys=JSON.parse(readFileSync(keyFile,'utf8'))}catch(e){if(e.code!=='ENOENT')throw Error('语音凭据文件不可读取，请检查应用私有配置')}
 const invalidate=()=>{revision++;for(const a of pending)a.abort();pending.clear();for(const s of streams.values())s.close();streams.clear();feed.clear();say.clear()}
 ctx.effect(()=>scope.watch(invalidate),'Speech configuration lifetime')
 ctx.on('session/event',(session,event)=>{if(!dead&&scope.get().enabled){feed.event(session,event);if(event.type==='turn/start')say.turn(session.id,event.data?.turn)}})
 ctx.on('agent/assistant-stream',payload=>{if(!dead&&scope.get().enabled)feed.stream(payload)})
 const canSay=()=>{const c=scope.get();return !dead&&c.enabled&&c.ttsEnabled&&c.services.some(s=>s.id===c.ttsProvider)}
 const speechStatus=id=>({...say.status(id),available:canSay()&&say.status(id).available})
 const enqueue=(id,text,phase)=>{if(phase==='status')return speechStatus(id);if(!canSay())throw Error('语音回复已关闭，请使用文字回复');return say.enqueue(id,text,phase)}
 ctx.inject(['tools','systemPrompt'],c=>{
  const tool=defineTool({name:'say',description:SAY_GUIDANCE,
   parameters:{text:{type:'string',description:'一句简短的话，最多 160 字；status 查询可省略'},phase:{type:'string',enum:['status','ack','progress','result'],description:'status 查询桌面语音；ack 开始确认；progress 实质进展；result 最终结果。省略时为 progress'}},
   output:{schema:{type:'object',additionalProperties:true,properties:{}},render:(_a,v)=>[{type:'text',text:JSON.stringify(v)}]},
   execute:async({text,phase},exec)=>enqueue(exec.agent?.session.id,text,phase)})
  let release
  const update=()=>{release?.();release=canSay()?c.tools.register(tool):null}
  c.effect(()=>{update();const unwatch=scope.watch(update);return()=>{unwatch();release?.()}})
  c.effect(()=>c.systemPrompt.section({name:'speech:say',order:2950,text:()=>canSay()?SAY_GUIDANCE:''}))
 })
 const skill=installSaySkill(join(homedir(),'.dsh','codex-android','home','skills','say'))
 const updateSkill=()=>skill.setEnabled(canSay())
 ctx.effect(()=>{updateSkill();const unwatch=scope.watch(updateSkill);return()=>{unwatch();skill.setEnabled(false)}})
 const handler=async(req,res)=>{
  const send=(code,value)=>{if(!res.destroyed&&!res.headersSent){res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value))}}
  let abort
  try{
   const c=scope.get();if(dead)throw Error('语音插件已卸载')
   if(req.method==='GET'){send(200,{...c,csrf,revision,keySet:Object.fromEntries(c.services.map(s=>[s.id,!!keys[s.id]]))});return}
   if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json')){send(405,{error:'JSON POST required'});return}
   let size=0,chunks=[];for await(const b of req){size+=b.length;if(size>3_000_000)throw Error('录音请求过大');chunks.push(b)}
   const b=JSON.parse(Buffer.concat(chunks).toString());if(b.csrf!==csrf)throw Error('请重新连接语音服务')
   if(b.action==='key'){
    if(!c.services.some(s=>s.id===b.id)||typeof b.key!=='string'||b.key.length>8192||/[\x00-\x1f\x7f]/.test(b.key))throw Error('无效服务凭据')
    const next={...keys};if(b.key)next[b.id]=b.key;else delete next[b.id]
    mkdirSync(directory,{recursive:true,mode:0o700});const tmp=keyFile+'.tmp';writeFileSync(tmp,JSON.stringify(next),{mode:0o600});renameSync(tmp,keyFile);keys=next;invalidate();send(200,{ok:true});return
   }
   if(!c.enabled)throw Error('语音服务插件已关闭')
   if(b.action==='feed'){
    const state={...feed.read(b.sessionId)}
    // Only the native playback consumer renews the focused-session lease.
    if(typeof b.sayReady==='boolean'&&typeof b.sessionId==='string')state.say=canSay()?say.poll(b.sessionId,b.sayReady,b.companionActive!==false):null
    send(200,state);return
   }
   if(b.action==='say'){
    if(b.revision!==revision)throw Error('语音配置已变化')
    if(typeof b.threadId!=='string'||!b.threadId)throw Error('当前 Codex 会话身份缺失')
    const links=JSON.parse(readFileSync(join(homedir(),'.dsh','codex-android','session-links.json'),'utf8')).sessions??{}
    const matches=Object.entries(links).filter(([,v])=>v.threadId===b.threadId)
    if(matches.length!==1)throw Error('无法唯一定位当前 Codex 会话')
    send(200,enqueue(matches[0][0],b.text,b.phase));return
   }
   if(!['asr','tts','asr-start','asr-chunk','asr-finish','asr-cancel','tts-stream'].includes(b.action))throw Error('未知语音操作')
   if(b.revision!==revision)throw Error('语音配置已变化，请重新录音')
   const isAsr=b.action.startsWith('asr');if(!(isAsr?c.asrEnabled:c.ttsEnabled))throw Error('语音功能已关闭')
   const id=isAsr?c.asrProvider:c.ttsProvider,service=c.services.find(s=>s.id===id);if(!service)throw Error('API 服务未配置')
   if(b.action.startsWith('asr-')){
    if(streamKind(service)!=='asr')throw Error('当前服务不支持流式识别')
    if(b.action==='asr-start'){
     if(streams.size>=2)throw Error('录音连接已占用')
     const id=randomBytes(24).toString('hex'),s=new StreamingAsr(service,keys[service.id]);streams.set(id,s)
     const drop=()=>{s.close();streams.delete(id)};const expiry=setTimeout(drop,95_000);s.done.finally(()=>{clearTimeout(expiry);streams.delete(id)}).catch(()=>{})
     try{await s.ready;if(dead||b.revision!==revision)throw Error('语音配置已变化');send(200,{streamId:id})}catch(e){drop();throw e}return
    }
    const s=streams.get(b.streamId);if(!s)throw Error('录音连接已失效，请重新录音')
    if(b.action==='asr-cancel'){s.close();streams.delete(b.streamId);send(200,{ok:true});return}
    try{send(200,b.action==='asr-chunk'?await s.append(Buffer.from(b.audio??'','base64'),b.sequence):await s.finish(b.sequence))}
    catch(e){s.close();streams.delete(b.streamId);throw e}return
   }
   if(pending.size>=2)throw Error('语音服务正在处理，请稍后重试')
   abort=new AbortController();pending.add(abort);const captured=revision
   const timeout=setTimeout(()=>abort.abort(),120000);const disconnect=()=>{if(!res.writableEnded)abort.abort()};res.on('close',disconnect)
   try{
    if(b.action==='tts-stream'){
     if(streamKind(service)!=='tts')throw Error('当前服务不支持流式朗读')
     res.writeHead(200,{'content-type':'application/x-ndjson','cache-control':'no-store'});res.flushHeaders?.()
     try{await streamTts(service,keys[id],b.text,abort.signal,e=>{if(res.destroyed||abort.signal.aborted)throw Error('朗读已取消');if(res.writableLength>2*1024*1024)throw Error('播放缓冲已满');res.write(JSON.stringify(e)+'\n')})}
     catch(e){if(!res.destroyed)res.write(JSON.stringify({type:'error',error:'流式朗读失败或已取消'})+'\n')}
     res.end();return
    }
    const result=await requestProvider(service,keys[id],b.action,isAsr?Buffer.from(b.audio??'','base64'):b.text,abort.signal);if(captured!==revision||dead||abort.signal.aborted)throw Error('语音请求已取消');send(200,result)}
   finally{clearTimeout(timeout);res.off('close',disconnect)}
  }catch(e){send(400,{error:e.name==='AbortError'?'语音请求已取消或超时':String(e.message).replace(/https?:\/\/\S+/g,'[服务地址]').slice(0,180)})}
  finally{if(abort)pending.delete(abort)}
 }
 ctx.effect(()=>ctx.webServer.register({kind:'exact',path:PATH,handler}),'Speech service API')
 ctx.effect(()=>()=>{dead=true;invalidate();keys={}},'Speech service cleanup')
}
