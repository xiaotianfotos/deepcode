import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import Schema from '@deepseek-ai/schemastery'
import * as relay from 'relay-dsh-plugin-codex'
import {AndroidCodexClient} from './client.mjs'
import {CodexAccount,ACCOUNT_PATH} from './account.mjs'
export const name='dsh-android-codex'
export const inject=[...relay.inject,'settings']
function platformError(message){return Object.assign(new Error(message),{code:'ANDROID_CODEX_PERMISSION_REQUIRED'})}
export async function apply(ctx,config={}) {
  // The standard configurable-plugin list pairs Host namespaces with client
  // cards. Account actions stay on the authenticated API, never in settings JSON.
  ctx.settings.register('android-codex',Schema.object({}),{base:{}})
  const home=process.env.DSH_HOME||path.join(os.homedir(),'.dsh')
  const state=path.join(home,'codex-android');fs.mkdirSync(state,{recursive:true,mode:0o700})
  const settings=path.join(state,'settings.json')
  let enabled=true;try{enabled=JSON.parse(fs.readFileSync(settings,'utf8')).enabled!==false}catch(e){if(e.code!=='ENOENT')throw e}
  // Vendor activation recovery opt-in (see vendor ANDROID-PATCHES.md): the
  // host re-reads the current activation attempt through this gate, and only
  // the explicit enable action may call the attached refresh. Unmounting
  // permanently closes the gate so nothing retries after disposal.
  let disposed=false,activationRefresh=null
  const activationRecovery={enabled:()=>enabled&&!disposed,attach(api){activationRefresh=api.refresh}}
  let command=config.command??'codex',args=config.args??['-c','features.shell_snapshot=false','-c','features.code_mode_host=true','app-server']
  const env={...process.env,CODEX_HOME:path.join(state,'home')}
  fs.mkdirSync(env.CODEX_HOME,{recursive:true,mode:0o700})
  if(process.platform==='android') {
    const prefix=process.env.TERMUX__PREFIX
    if(!prefix)throw new Error('Android runtime prefix missing')
    const native=JSON.parse(fs.readFileSync(path.join(path.dirname(prefix),'network-dns.json'),'utf8')).nativeLibraryDir
    const binary=path.join(native,'libdsh_codex.so')
    if(!fs.existsSync(binary))throw new Error('此 APK 未包含 Codex ARM64 runtime')
    command=path.join(native,'libdsh_codex_launcher.so');env.DSH_CODEX_NATIVE_DIR=native;env.LD_LIBRARY_PATH=native;delete env.LD_PRELOAD
    const shellDir=path.join(state,'bin');fs.mkdirSync(shellDir,{recursive:true,mode:0o700})
    const shell=path.join(shellDir,'bash'),shellTarget=path.join(native,'libdsh_codex_shell.so')
    try{if(fs.readlinkSync(shell)!==shellTarget)fs.unlinkSync(shell)}catch(e){if(e.code!=='ENOENT')throw e}
    if(!fs.existsSync(shell))fs.symlinkSync(shellTarget,shell)
    env.CODEX_SELF_EXE=binary;env.SHELL=shell
    env.DSH_CODEX_SHELL=shell
    // Child shells need the relocated Termux prefix even when Codex filters
    // ambient environment variables according to its own execution policy.
    args=['-c','shell_environment_policy.set.TERMUX__PREFIX='+JSON.stringify(prefix),...args]
    env.PATH=path.join(prefix,'bin')+':/system/bin'
  }
  args=['-c','features.realtime_conversation=true',...args]
  const client=new AndroidCodexClient({command,args,env,cwd:os.homedir(),enabled:()=>enabled,validateRequest:(method,params)=>{
    if(process.platform!=='android')return
    const execution=/^(thread\/(start|resume|fork)|turn\/start|command\/exec)$/.test(method)
    if(!execution)return
    const mode=params.sandbox??params.sandboxPolicy?.type??params.permissions
    if(!['danger-full-access','dangerFullAccess',':danger-full-access'].includes(mode))throw platformError('此 Codex Android runtime 仅支持应用权限范围内的完全访问。请在会话权限菜单选择完全访问；它不提供工作区级隔离。')
    if(params.cwd){
      const workspace=fs.realpathSync(params.cwd),prefix=process.env.TERMUX__PREFIX
      const files=fs.realpathSync(path.dirname(prefix)),relative=path.relative(files,workspace)
      if(relative==='..'||relative.startsWith('../')||path.isAbsolute(relative)){
        const native=JSON.parse(fs.readFileSync(path.join(path.dirname(prefix),'network-dns.json'),'utf8'))
        if(native.allFilesAccessRequired!==false&&native.allFilesAccessGranted!==true)throw platformError('请先授予外部工作区存储权限，并返回应用')
      }
    }
  }})
  const runtime={client,enabled:()=>enabled,binding:null,voice:null}
  ctx.provide('androidCodexRuntime',runtime)
  const account=new CodexAccount(client,{enabled:()=>enabled,hasActiveTurns:()=>client.hasActiveWork||!!runtime.voice?.busy,setEnabled:value=>{
    const temp=settings+'.tmp';fs.writeFileSync(temp,JSON.stringify({enabled:value}),{mode:0o600});fs.renameSync(temp,settings);enabled=value
    // Wake cold-start callers that parked on the disable gate (the pinned relay
    // awaits start() once at activation); a write failure never reaches here.
    if(value)client.resume()
  },onBoot:()=>{if(activationRefresh)return activationRefresh()}})
  ctx.effect(()=>ctx.webServer.register({kind:'exact',path:ACCOUNT_PATH,handler:account.handler}),'android codex account')
  // Unmount permanently disposes the owned process; user-facing disable is the
  // recoverable enabled gate + close handled by the account API.
  ctx.effect(()=>()=>{disposed=true;return client.dispose()},'android codex process')
  // Native mode lets Codex own its tools and context; DSH remains presentation.
  await relay.apply(ctx,{codex:{client,onLiveRuntime:binding=>{runtime.binding=binding}},codexHome:env.CODEX_HOME,codexExecutionMode:'native',codexExecutionGuidance:false,codexLinkPath:path.join(state,'session-links.json'),codexActivationRecovery:activationRecovery})
}
