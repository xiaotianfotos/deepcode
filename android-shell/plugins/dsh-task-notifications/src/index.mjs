import Schema from '@deepseek-ai/schemastery'
import {mkdirSync,writeFileSync,renameSync,appendFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'
export const name='dsh-task-notifications',inject=['settings']
export const Config=Schema.object({enabled:Schema.boolean().default(true),progress:Schema.boolean().default(true),quietWhenVisible:Schema.boolean().default(true)})
export function apply(ctx,config={}){
 const scope=ctx.settings.register('task-notifications',Config,{base:config,applies:'live'})
 const dir=process.env.DSH_HOME||join(homedir(),'.dsh'),path=join(dir,'.task-notifications.json')
 const publish=value=>{mkdirSync(dir,{recursive:true});writeFileSync(path+'.tmp',JSON.stringify(value),{mode:0o600});renameSync(path+'.tmp',path)}
 ctx.effect(()=>{publish(scope.get());const off=scope.watch(()=>publish(scope.get()));return()=>{off();publish({enabled:false})}},'native notification policy')
 // Existing bridge owns final reports, approvals and todo updates. Emit only turn start.
 ctx.on('session/event',(session,event)=>{
  if(event.type!=='turn/start'||!scope.get().enabled||!scope.get().progress)return
  try{appendFileSync(join(dir,'.notify.ndjson'),JSON.stringify({kind:'todo',event:'task-start',sessionId:session.id,current:'正在处理',total:0,done:0,ts:new Date().toISOString()})+'\n')}catch{/* never block the agent */}
 })
}
