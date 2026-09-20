import {readdir,readFile,stat,realpath} from 'node:fs/promises'
import {join,resolve,sep} from 'node:path'

// Completed upstream segments are authoritative; partial/delta events are never
// appended as user prompts. Stable IDs make replay after restart idempotent.
export function transcriptRecords(text,threadId){
 const result=[],seen=new Set()
 const lines=text.split('\n');lines.pop() // writer may still be appending its last line
 for(const line of lines){
  let record;try{record=JSON.parse(line)}catch{continue}
  const p=record.payload
  if(record.type!=='realtime_item'||p?.type!=='transcript_segment'||!['user','assistant'].includes(p.role)||typeof p.id!=='string'||typeof p.text!=='string'||!p.text.trim())continue
  const id=`gpt-live:${threadId}:${p.id}`
  if(seen.has(id))continue;seen.add(id)
  result.push({id,role:p.role,text:p.text,timestamp:record.timestamp})
 }
 return result
}
export function projectTranscripts(session,records,freeze=x=>x){
 const events=typeof session.snapshotEvents==='function'?session.snapshotEvents():session.events
 if(!Array.isArray(events))throw Error('Session event log unavailable')
 // Never insert historical turns inside an agent's live turn.
 const lastStart=events.findLastIndex(e=>e.type==='turn/start'),lastEnd=events.findLastIndex(e=>e.type==='turn/end')
 if(lastStart>lastEnd)return {projectedMessages:0,deferred:true}
 const existing=new Set(session.deriveMessages().map(m=>String(m.id)))
 const v3=(session.header?.version??0)>=3
 let needsHead=v3&&!events.some(e=>e.type==='system/message')
 if(needsHead&&session.deriveMessages().length)throw Error('Legacy voice history needs migration before projection')
 let turn=events.filter(e=>e.type==='turn/start').length+1,count=0
 for(const r of records){
  if(existing.has(r.id))continue
  const message=freeze({id:r.id,role:r.role,content:[{type:'text',text:r.text}],source:r.role==='user'?{kind:'user'}:{kind:'model',provider:'relay-codex',model:'gpt-live-1-codex'}})
  session.append('turn/start',{turn})
  const step=needsHead&&r.role==='assistant'?2:1
  if(needsHead){
   // Native V3 reserves its empty system head before any transcript surface.
   session.append('step/start',{turn,step:1})
   session.append('system/message',{turn,step:1,message:freeze({id:`live-system:${r.id}`,role:'system',source:{kind:'plugin',plugin:'@dsh-android/dsh-codex-live'},content:[]})},{surfaceOp:'append'})
   session.append('step/end',{turn,step:1})
   needsHead=false
  }
  if(r.role==='user')session.append('user/message',message,{surfaceOp:'append'})
  else {
   session.append('step/start',{turn,step})
   session.append('assistant/message',{turn,step,message,...(v3?{stream:[]}:{})},{surfaceOp:'append'})
   session.append('step/end',{turn,step})
  }
  session.append('turn/end',{turn,reason:{kind:'completed'}})
  existing.add(r.id);turn++;count++
 }
 return {projectedMessages:count,deferred:false}
}
async function findRollout(home,threadId){
 if(!/^[a-zA-Z0-9-]+$/.test(threadId))throw Error('Invalid Codex thread')
 const root=resolve(home,'sessions')
 async function walk(dir,depth){
  let entries;try{entries=await readdir(dir,{withFileTypes:true})}catch(e){if(e.code==='ENOENT')return null;throw e}
  for(const e of entries){
   if(e.isFile()&&e.name.startsWith('rollout-')&&e.name.endsWith(`-${threadId}.jsonl`))return join(dir,e.name)
   if(depth<3&&e.isDirectory()&&/^\d{2,4}$/.test(e.name)){const found=await walk(join(dir,e.name),depth+1);if(found)return found}
  }
  return null
 }
 const file=await walk(root,0)
 if(!file)return null
 const [base,actual]=await Promise.all([realpath(root),realpath(file)])
 if(!actual.startsWith(base+sep))throw Error('Codex history path escapes session storage')
 return actual
}
export class LiveHistory {
 constructor(binding){this.binding=binding;this.pending=new Map();this.files=new Map()}
 sync(sessionId){
  if(!/^session-[A-Za-z0-9-]+$/.test(sessionId))return Promise.reject(Error('Invalid session'))
  if(this.pending.has(sessionId))return this.pending.get(sessionId)
  const operation=this.binding.history(sessionId,async({session,threadId,home,freeze})=>{
   let file=this.files.get(threadId)
   if(!file){file=await findRollout(home,threadId);if(file)this.files.set(threadId,file)}
   if(!file)return {projectedMessages:0}
   const meta=await stat(file);if(meta.size>64*1024*1024)throw Error('语音历史文件过大，暂未同步')
   const records=transcriptRecords(await readFile(file,'utf8'),threadId)
   return projectTranscripts(session,records,freeze)
  }).finally(()=>this.pending.delete(sessionId))
  this.pending.set(sessionId,operation);return operation
 }
 async close(){await Promise.allSettled(this.pending.values());this.files.clear()}
}
