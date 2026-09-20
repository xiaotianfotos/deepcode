/** Exercise shipped Relay event producers against the 0.1.5 settlement contract. */
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import assert from 'node:assert/strict'
const code=readFileSync('android-shell/vendor/relay-dsh-plugin-codex/lib/host-plugin.js','utf8')
const method=code.slice(code.indexOf('\tappendActivity('),code.indexOf('\n};',code.indexOf('\tappendActivity(')))
const Projector=vm.runInNewContext('(class {'+method+'})',{
 activityItemId:item=>item.id,mergeActivityItem:(_,item)=>item,
 activityPayload:(_,__,item)=>({activity:{title:item.id,status:'completed'}}),
 toolCallId:id=>id,createMessage:m=>m,CODEX_PROVIDER:'relay-codex',CODEX_ACTIVITY_TOOL:'relay_codex_activity',
})
const assertSettlements=events=>{
 const messages=events.filter(e=>e.type==='assistant/message')
 assert.ok(messages.length)
 for(const {data} of messages){assert.ok(Array.isArray(data.stream));assert.equal(data.stream.length,0);assert.ok(Array.isArray(data.message.content))}
}
test('live Codex activities settle with stream metadata and balanced tool calls',()=>{
 const events=[],agent={session:{append:(type,data)=>events.push({type,data})}}
 const state={location:{turn:1,step:1},activityItems:new Map(),startedActivities:new Set(),completedActivities:new Set()}
 const p=new Projector(),item={id:'command'}
 p.appendActivity(agent,'thread','turn',item,'started',state)
 p.appendActivity(agent,'thread','turn',item,'completed',state)
 assertSettlements(events)
 assert.deepEqual(events.map(e=>e.type),['assistant/message','tool/call','tool/result'])
})
const project=vm.runInNewContext(code.slice(code.indexOf('function appendProjectedTurn('),code.indexOf('function projectionMessageIds('))+';appendProjectedTurn',{
 MessageId:id=>id,toolCallId:id=>id,freezeMessage:m=>m,CODEX_PROVIDER:'relay-codex',
})
test('history import covers both plain messages and activity messages',()=>{
 const events=[]
 project((type,data)=>events.push({type,data}),{timeline:[
  {kind:'message',role:'assistant',id:'reply',text:'hello'},
  {kind:'activity',callId:'call',requestId:'req',resultId:'res',toolName:'fixture',arguments:'{}',resultContent:[],isError:false},
 ],endReason:{kind:'completed'}},1)
 assertSettlements(events)
 assert.equal(events.filter(e=>e.type==='assistant/message').length,2)
 assert.equal(events.at(-1).type,'turn/end')
})
