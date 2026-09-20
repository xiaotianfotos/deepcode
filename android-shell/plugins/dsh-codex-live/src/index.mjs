import {homedir} from 'node:os'
import {join} from 'node:path'
import {sessionLinkLookup} from './session-links.mjs'
import Schema from '@deepseek-ai/schemastery'
import {CodexLive,LIVE_PATH} from './live.mjs'

export const name='dsh-codex-live'
export const inject=['settings','webServer']
export const NAMESPACE='codex-live'

export const Config=Schema.object({enabled:Schema.boolean().default(true),showCommentary:Schema.boolean().default(true),speakCommentary:Schema.boolean().default(false)})

export function apply(ctx,config={}) {
 let live=null, runtime=null, disposed=false
 const sessionForThread=sessionLinkLookup(join(process.env.DSH_HOME||join(homedir(),'.dsh'),'codex-android','session-links.json'))
 const scope=ctx.settings.register(NAMESPACE,Config,{
  base:config,applies:'live',
  validate:value=>{if(!value.enabled && live?.busy)throw Error('GPT Live 正在使用中，请先结束语音，再关闭插件功能。')}
 })
 const activate=()=>{
  if(disposed||live||!runtime||!scope.get().enabled)return
  const owner=runtime
  live=new CodexLive(owner.client,{enabled:()=>!disposed&&scope.get().enabled&&owner.enabled(),progressConfig:()=>scope.get(),sessionForThread})
  Object.defineProperty(live,'binding',{get:()=>owner.binding})
  owner.voice=live
 }
 const deactivate=async(old=live,owner=runtime)=>{
  if(live===old)live=null
  if(owner?.voice===old)owner.voice=null
  // Unloading media must not silently interrupt an already submitted Codex task.
  await old?.close({interrupt:false})
 }
 ctx.effect(()=>ctx.webServer.register({kind:'exact',path:LIVE_PATH,handler:(req,res)=>{
  if(live)return live.handler(req,res)
  res.writeHead(req.method==='GET'?200:409,{'content-type':'application/json','cache-control':'no-store'})
  res.end(JSON.stringify({enabled:scope.get().enabled,available:false,active:null,error:scope.get().enabled?'Codex 后端尚未就绪':'GPT Live 插件已关闭'}))
 }}),'GPT Live API')
 ctx.on('llm/stream',(options,next)=>{if(live?.ownsSession(options.sessionId))throw Error('请先结束 GPT Live 再发送文字任务');return next()},{global:true,prepend:true})
 ctx.effect(()=>scope.watch(async value=>{if(value.enabled)activate();else await deactivate()}),'GPT Live preference')
 ctx.inject(['androidCodexRuntime'],child=>{
  const owner=child.androidCodexRuntime
  runtime=owner;activate()
  child.effect(()=>async()=>{
   const old=owner.voice
   if(runtime===owner)runtime=null
   await deactivate(old,owner)
  },'GPT Live Codex dependency')
 })
 ctx.effect(()=>async()=>{disposed=true;await deactivate()},'GPT Live lifetime')
}
