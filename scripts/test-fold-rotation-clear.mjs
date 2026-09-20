/** A rotation changes layout, but must no longer play a fold transition. */
import {connect} from './lib/android-cdp.mjs'
import {execFileSync} from 'node:child_process'
import {writeFileSync,mkdirSync} from 'node:fs'
import assert from 'node:assert/strict'
const [serial,folder]=process.argv.slice(2),c=await connect(serial)
const adb=(...a)=>execFileSync('adb',['-s',serial,...a],{encoding:'utf8'}).trim(),prior=adb('shell','wm','user-rotation')
const read=()=>c.evaluate(`({fold:JSON.parse(androidBridge.foldStatus()),timeOrigin:performance.timeOrigin,width:innerWidth,drafts:[...document.querySelectorAll('[data-composer-input]')].map(e=>e.innerText)})`)
let initial;const states=[]
try {
 await c.evaluate('androidBridge.foldConfigure(true)');initial=await read();assert(initial.fold.hingeDegrees>=170,'Fully unfold before rotation check')
 for(const rotation of [0,1,0,1]){
  adb('shell','wm','user-rotation','lock',String(rotation))
  for(let i=0;i<12;i++){states.push(await read());await new Promise(r=>setTimeout(r,70))}
 }
 assert(new Set(states.map(s=>s.width)).size>1,'Test must actually rotate the window')
 assert(states.every(s=>s.fold.transitions===initial.fold.transitions),'Rotation triggered a fold animation')
 assert(states.every(s=>s.fold.blurAmount===0),'Rotation blurred content')
 assert(states.every(s=>s.timeOrigin===initial.timeOrigin),'WebView reloaded')
 for(const s of states)assert.deepEqual(s.drafts,initial.drafts)
 mkdirSync(folder,{recursive:true});const result={passed:true,rotations:4,widths:[...new Set(states.map(s=>s.width))],transitionsBefore:initial.fold.transitions,transitionsAfter:states.at(-1).fold.transitions,blurAmountAlwaysZero:true,webViewAndDraftsPreserved:true}
 writeFileSync(folder+'/rotation-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}finally{adb('shell','wm','user-rotation',...prior.split(/\s+/));c.close()}
