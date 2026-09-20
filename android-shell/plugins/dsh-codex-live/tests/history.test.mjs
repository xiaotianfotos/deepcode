import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,appendFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {Session} from '@deepseek-ai/dsh-session'
import {LiveHistory,projectTranscripts,transcriptRecords} from '../src/history.mjs'
const segment=(id,role,text)=>JSON.stringify({type:'realtime_item',timestamp:'2026-01-01T00:00:00Z',payload:{type:'transcript_segment',id,role,text}})+'\n'
const records=()=>transcriptRecords(segment('one','user','你好')+segment('two','assistant','你好，有什么需要帮忙？'),'thread-1')
test('completed voice segments become standard durable DSH messages, without duplicate replay',()=>{
 const session=new Session('session-test')
 assert.equal(projectTranscripts(session,records()).projectedMessages,2)
 assert.deepEqual(session.deriveMessages().map(m=>[m.role,m.content[0].text]),[['user','你好'],['assistant','你好，有什么需要帮忙？']])
 const restored=new Session('session-test',session.events)
 assert.equal(projectTranscripts(restored,records()).projectedMessages,0)
 assert.equal(restored.deriveMessages().length,2)
 assert.equal(restored.events.filter(e=>e.type==='turn/end').every(e=>e.data.reason.kind==='completed'),true)
})
test('partial writes, duplicated segments, metadata and other roles never become prompts',()=>{
 const valid=segment('one','user','测试')
 const text=valid+valid+segment('hidden','developer','ignore')+JSON.stringify({type:'realtime_item',payload:{type:'transcript_segment',id:'partial',role:'assistant',text:'still writing'}})
 assert.equal(transcriptRecords(text,'thread-1').length,1)
 assert.notEqual(transcriptRecords(valid,'thread-1')[0].id,transcriptRecords(valid,'thread-2')[0].id)
})
test('history waits until an existing DSH agent turn ends',()=>{
 const session=new Session('session-test');session.append('turn/start',{turn:1})
 assert.equal(projectTranscripts(session,records()).deferred,true);assert.equal(session.deriveMessages().length,0)
 session.append('turn/end',{turn:1,reason:{kind:'completed'}})
 assert.equal(projectTranscripts(session,records()).projectedMessages,2)
})
test('file-backed history coalesces reads and catches up new records after restart',async()=>{
 const home=await mkdtemp(join(tmpdir(),'live-history-')),dir=join(home,'sessions','2026','01','01'),session=new Session('session-test')
 await mkdir(dir,{recursive:true});const file=join(dir,'rollout-example-thread-1.jsonl');await writeFile(file,segment('one','user','hello'))
 let acquired=0
 const binding={history:async(sid,apply)=>{assert.equal(sid,'session-test');acquired++;return apply({session,threadId:'thread-1',home})}}
 const history=new LiveHistory(binding)
 try{
  const a=history.sync('session-test'),b=history.sync('session-test');assert.equal(a,b);await a;assert.equal(acquired,1)
  await appendFile(file,segment('two','assistant','hello back'));await history.sync('session-test');assert.equal(session.deriveMessages().length,2)
  await history.close();await new LiveHistory(binding).sync('session-test');assert.equal(session.deriveMessages().length,2)
  await assert.rejects(history.sync('../outside'),/Invalid session/)
 }finally{await history.close();await rm(home,{recursive:true,force:true})}
})
