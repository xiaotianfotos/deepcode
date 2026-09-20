import {statSync,readFileSync} from 'node:fs'
/** Read-only identity projection; never creates/resumes a thread or boots Codex. */
export function sessionLinkLookup(file){
 let stamp='',index=new Map()
 return threadId=>{
  try{
   const st=statSync(file),next=`${st.ino}:${st.mtimeMs}:${st.size}`
   if(next!==stamp){
    const sessions=JSON.parse(readFileSync(file,'utf8')).sessions??{},map=new Map()
    for(const [id,entry] of Object.entries(sessions)){
     if(!/^session-[\w-]+$/.test(id)||typeof entry?.threadId!=='string')continue
     map.set(entry.threadId,map.has(entry.threadId)?null:id)
    }
    index=map;stamp=next
   }
   return index.get(threadId)??null
  }catch{stamp='';index.clear();return null}
 }
}
