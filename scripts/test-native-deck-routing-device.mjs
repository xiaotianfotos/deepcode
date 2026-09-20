/** Native menu + voice button routes in the installed WebView. Native results are fixtures; no send. */
import{connect}from'./lib/android-cdp.mjs'
import{writeFileSync,mkdirSync}from'node:fs'
import assert from'node:assert/strict'
const serial=process.argv[2];assert(serial)
const dir='docs/validation/2026-09-11-deck-routing/followup';mkdirSync(dir,{recursive:true})
const c=await connect(serial),pause=ms=>new Promise(r=>setTimeout(r,ms))
const tap=async selector=>{
 const box=await c.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Target missing');const b=e.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()`)
 await c.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...box,radiusX:2,radiusY:2}]})
 await c.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(650)
}
try{
 await c.evaluate(`(()=>{const menu=document.querySelector('[role=listbox]');menu?.parentElement.querySelector('input')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))})()`);await pause(200);
 const ready=await c.evaluate(`(()=>{
 const elements=[...document.querySelectorAll('[data-deck-lane]')];
 function props(e,predicate){let f=e[Object.keys(e).find(k=>k.startsWith('__reactFiber'))];while(f){if(predicate(f.memoizedProps))return f.memoizedProps;f=f.return}throw Error('Component unavailable')}
 const rows=elements.map(element=>{const p=props(element.querySelector('[contenteditable=true]'),p=>p?.keyboard?.editor),voice=props(element.querySelector('.dsh-voice-mic'),p=>p?.voice).voice;return{element,p,voice,editorState:p.keyboard.editor.getEditorState(),draft:p.keyboard.snapshot.draft,images:[...p.keyboard.snapshot.imageIds]}});
 if(rows.length<2||rows.some(r=>r.p.keyboard.editor.isComposing()||['recording','preparing','transcribing','permission'].includes(r.voice.snapshot().phase)))throw Error('Input busy or missing lanes');
 const original=window.androidBridge,state={rows,original,hardware:original.hasHardwareKeyboard(),keyboard:original.hasHardwareKeyboard(),voice:{ok:true,id:'',phase:'idle'},calls:[],active:JSON.parse(localStorage.getItem('dsh.voice-deck.controller.v2')).active,scroll:document.querySelector('.dsh-deck-grid').scrollLeft};
 window.__nativeRouting=state;window.__testTapTrace=[];state.listener=e=>window.__testTapTrace.push({type:e.type,tag:e.target.tagName,label:e.target.closest?.('button')?.getAttribute('aria-label')});document.addEventListener('click',state.listener,true);
 window.androidBridge=new Proxy(original,{get(target,key){
 if(key==='hasHardwareKeyboard')return()=>state.keyboard;
 if(key==='pickImage')return id=>state.calls.push(id);
 if(key==='voiceStart')return id=>JSON.stringify(state.voice={ok:true,id,phase:'recording'});
 if(key==='voiceStatus')return()=>JSON.stringify(state.voice);
 if(key==='voiceStop')return id=>{if(state.voice.id===id)state.voice.phase='transcribing'};
 if(key==='voiceAcknowledge')return()=>{state.voice={ok:true,id:'',phase:'idle'}};
 if(key==='voiceCancel')return()=>{state.voice={ok:true,id:'',phase:'canceled'}};
 const value=target[key];return typeof value==='function'?value.bind(target):value;
 }});
 document.activeElement?.blur();document.querySelector('.dsh-deck-grid').scrollLeft=0;
 return{lanes:rows.length,hardware:state.hardware,titleHeight:document.querySelector('[data-deck-header]')?.firstElementChild?.getBoundingClientRect().height};
 })()`)
 assert.equal(ready.hardware,false,'Requires touch-only device');assert.equal(ready.titleHeight,0)
 await tap('[data-deck-lane]:nth-child(1) header');await tap('[data-deck-lane]:nth-child(2) header')
 const noFocus=await c.evaluate('!document.activeElement?.matches("[contenteditable=true],textarea")');assert(noFocus)
 await c.evaluate(`document.querySelectorAll('[data-deck-lane]')[1].querySelector('[aria-label="指令"]').click()`);await pause(300)
 await c.evaluate(`document.querySelector('[data-dsh-image-pick]').click()`);await pause(300)
 assert.equal(await c.evaluate('window.__nativeRouting.calls.length'),1)
 await tap('[data-deck-lane]:nth-child(1) header')
 await c.evaluate(`(()=>{const s=window.__nativeRouting,canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const ctx=canvas.getContext('2d');ctx.fillStyle='#5599bb';ctx.fillRect(0,0,32,32);window.__dshBridge.onImagePicked(s.calls[0],{name:'dsh-native-routing-fixture.png',mediaType:'image/png',dataUrl:canvas.toDataURL()})})()`)
 await pause(700)
 const image=await c.evaluate('window.__nativeRouting.rows.map(r=>r.p.keyboard.snapshot.imageIds.length-r.images.length)');assert.deepEqual(image,[0,1,...Array(ready.lanes-2).fill(0)])
 await c.evaluate(`document.querySelectorAll('[data-deck-lane]')[1].querySelector('.dsh-voice-mic').click()`);await pause(200)
 assert.equal(await c.evaluate('window.__nativeRouting.rows[1].voice.snapshot().phase'),'recording')
 await tap('[data-deck-lane]:nth-child(1) header')
 await c.evaluate(`window.__nativeRouting.voice={...window.__nativeRouting.voice,phase:'done',text:'原生回调右侧语音归属验证'}`)
 await pause(400)
 const voice=await c.evaluate('window.__nativeRouting.rows.map(r=>r.p.keyboard.snapshot.draft!==r.draft)');assert.deepEqual(voice,[false,true,...Array(ready.lanes-2).fill(false)])
 await c.evaluate('window.__nativeRouting.keyboard=true')
 await tap('[data-deck-lane]:nth-child(2) header')
 const focus=await c.evaluate(`(()=>{const r=window.__nativeRouting.rows[1],root=r.p.keyboard.editor.getRootElement(),s=getSelection(),range=document.createRange();range.selectNodeContents(root);if(!root.contains(s.focusNode))return{focused:false};range.setEnd(s.focusNode,s.focusOffset);return{focused:document.activeElement===root,end:range.toString().length===root.textContent.length}})()`);assert(focus.focused&&focus.end)
 const result={menuAndVoiceButtons:'DOM click; lane switching CDP touch',nativeMenuCallbackAfterSwitch:image,voiceButtonPollAfterSwitch:voice,touchSwitchDoesNotFocus:noFocus,hardwareKeyboardBranchSimulated:focus,headerTitleHeight:ready.titleHeight,nativeChooserPayloadSimulated:true,asrAudioSimulated:true,modelMessageSent:false}
 writeFileSync(dir+'/native-path-result.json',JSON.stringify(result,null,2));console.log(result)
}catch(error){console.log(await c.evaluate(`({menu:!!document.querySelector('[role=listbox]'),trace:window.__testTapTrace,active:document.activeElement?.tagName})`));console.error(error);throw error}finally{
 const restored=await c.evaluate(`(()=>{const s=window.__nativeRouting;if(!s)return null;for(const r of s.rows){r.voice.cancel();if(!r.editorState.isEmpty())r.p.keyboard.editor.setEditorState(r.editorState,{tag:'skip-dom-selection'});else if(r.p.keyboard.snapshot.draft!==r.draft)r.p.keyboard.actions.setDraft(r.draft);for(const id of r.p.keyboard.snapshot.imageIds)if(!r.images.includes(id))r.p.removeImage(id)}window.androidBridge=s.original;document.removeEventListener('click',s.listener,true);delete window.__testTapTrace;document.activeElement?.blur();s.rows[s.active]?.element.querySelector('header')?.click();document.querySelector('.dsh-deck-grid').scrollLeft=s.scroll;const result=s.rows.map(r=>({draft:r.p.keyboard.snapshot.draft===r.draft,images:JSON.stringify(r.p.keyboard.snapshot.imageIds)===JSON.stringify(r.images)}));delete window.__nativeRouting;return result})()`).catch(()=>null)
 writeFileSync(dir+'/native-path-restored.json',JSON.stringify(restored,null,2));c.close();assert(restored?.every(r=>r.draft&&r.images),'Draft restoration failed')
}
