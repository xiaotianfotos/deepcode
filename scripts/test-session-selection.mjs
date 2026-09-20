/** Exercise the staged upstream projection with its actual persistence writes. */
import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const source=readFileSync(process.argv[2],'utf8')
const start=source.indexOf('projectList() {')
const end=source.indexOf('/** Tear down scope',start)
assert(start>=0&&end>start)
const project=new Function('displayTitleOf',`return {${source.slice(start,end)}}.projectList`)((title,_cwd,id)=>title||id)
let saved={sessionId:'original'},state,view
const manager={selected:'original',getListSnapshot:()=>state}
const host={manager,selection:{getSnapshot:()=>saved,set:value=>{saved=value}},list:{set:value=>{view=value}},pruneScopes(){}}
state={items:[],current:undefined,phase:'pending',subagentsByParent:{},jobsBySession:{}}
project.call(host)
assert.deepEqual(saved,{sessionId:'original'},'reconnect gap must retain reload selection')
assert.equal(view.current,undefined,'masked view is still empty, not fabricated')
state={...state,phase:'ready',current:'original',items:[{sessionId:'original'}]}
project.call(host);assert.equal(view.current,'original');assert.equal(saved.sessionId,'original')
manager.selected=undefined;state={...state,current:undefined};project.call(host)
assert.deepEqual(saved,{},'explicit New Chat must stay blank after reload')
manager.selected='next';state={...state,current:'next',items:[{sessionId:'next'}]};project.call(host)
assert.equal(saved.sessionId,'next','explicit selection must replace old target')
console.log('Session selection: reconnect, reload persistence, explicit clear and switch passed')
