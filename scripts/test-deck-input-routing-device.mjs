/** Real session stores/attachment pipeline; test-only ASR text (no model send). */
import {connect} from './lib/android-cdp.mjs'
import {mkdirSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const serial=process.argv[2];assert(serial)
const dir='docs/validation/2026-09-11-deck-routing';mkdirSync(dir,{recursive:true})
const c=await connect(serial),pause=ms=>new Promise(r=>setTimeout(r,ms))
try{
 await c.evaluate('androidBridge.foldConfigure(true)');await pause(600)
 const ready=await c.evaluate(`(()=>{
   const lanes=[...document.querySelectorAll('[data-deck-lane]')];
   function props(element,predicate){let f=element[Object.keys(element).find(k=>k.startsWith('__reactFiber'))];while(f){if(predicate(f.memoizedProps))return f.memoizedProps;f=f.return}throw Error('Missing component')}
   const rows=lanes.map(l=>{const p=props(l.querySelector('[contenteditable=true]'),p=>p?.keyboard?.editor),v=props(l.querySelector('.dsh-voice-mic'),p=>!!p?.voice).voice;return {id:l.dataset.deckLane,element:l,p,voice:v,editorState:p.keyboard.editor.getEditorState(),draft:p.keyboard.snapshot.draft,images:[...p.keyboard.snapshot.imageIds]}});
   if(rows.some(r=>r.p.keyboard.editor.isComposing()||['recording','transcribing','preparing','permission'].includes(r.voice.snapshot().phase)))throw Error('User input busy');
   window.__routingCheck={rows,focus:document.activeElement};
   return {lanes:rows.length,distinct: new Set(rows.map(r=>r.p.keyboard.editor)).size===rows.length};
 })()`);assert(ready.lanes>=2&&ready.distinct)
 // Native file chooser completion reaches this real file input's onChange.
 const upload=async(index,name,drop=false)=>{
  await c.evaluate(`(()=>{const r=window.__routingCheck.rows[${index}],canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const ctx=canvas.getContext('2d');ctx.fillStyle='#ff8844';ctx.fillRect(0,0,32,32);const bytes=Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],${JSON.stringify(name)},{type:'image/png'}));if(${drop}){r.element.querySelector('[contenteditable=true]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}))}else{const input=r.element.querySelector('input[type=file]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}))}})()`)
  await pause(650)
 }
 await upload(1,'dsh-routing-right.png')
 const right=await c.evaluate(`window.__routingCheck.rows.map(r=>r.p.keyboard.snapshot.imageIds.length-r.images.length)`)
 assert.deepEqual(right,[0,1,...Array(ready.lanes-2).fill(0)])
 await upload(0,'dsh-routing-left.png',true)
 const left=await c.evaluate(`window.__routingCheck.rows.map(r=>r.p.keyboard.snapshot.imageIds.length-r.images.length)`)
 assert.deepEqual(left,[1,1,...Array(ready.lanes-2).fill(0)])
 // Complete the right owner's transcription after focus has moved to the left.
 const voice=await c.evaluate(`(()=>{const rows=window.__routingCheck.rows;rows[0].p.keyboard.editor.getRootElement().focus();const accepted=rows[1].voice.insert('右侧语音归属验证');return {accepted,changed:rows.map(r=>r.p.keyboard.snapshot.draft!==r.draft),rightHasText:rows[1].p.keyboard.snapshot.draft.includes('右侧语音归属验证')}})()`)
 assert(voice.accepted&&voice.rightHasText);assert.deepEqual(voice.changed,[false,true,...Array(ready.lanes-2).fill(false)])
 const result={fileChooserCompletionRightOnly:right,dropLeftOnly:left,transcriptAfterFocusSwitch:voice,asrAudioSimulated:true,modelMessageSent:false}
 writeFileSync(dir+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(result)
}finally{
 const restored=await c.evaluate(`(()=>{const s=window.__routingCheck;if(!s)return null;for(const r of s.rows){r.p.keyboard.editor.setEditorState(r.editorState,{tag:'skip-dom-selection'});for(const id of r.p.keyboard.snapshot.imageIds)if(!r.images.includes(id))r.p.removeImage(id)}s.focus?.focus({preventScroll:true});return s.rows.map(r=>({draft:r.p.keyboard.snapshot.draft===r.draft,images:JSON.stringify(r.p.keyboard.snapshot.imageIds)===JSON.stringify(r.images)}))})()`).catch(()=>null)
 await pause(200)
 writeFileSync(dir+'/restored.json',JSON.stringify(restored,null,2)+'\n')
 await c.evaluate('delete window.__routingCheck').catch(()=>{});c.close()
 assert(restored?.every(r=>r.draft&&r.images),'Original drafts/images not restored')
}
