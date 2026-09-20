import {memo,useEffect,useLayoutEffect,useRef,useSyncExternalStore} from 'react'
import {SessionSurface} from '@deepseek-ai/dsh-client-ui-renderer'
import type {Context,Source,Intent,VoiceService,Gamepad} from './contracts.ts'
import {adjacent,assign,type DeckState} from './state.ts'
import {css} from './style.ts'
import {attachChatSwipe} from './chat-swipe.ts'

const KEY='dsh.voice-deck.controller.v2'
function useSource<T>(source:Source<T>):T{return useSyncExternalStore(fn=>source.subscribe(fn),()=>source.getSnapshot())}
export const inject=['layout','slots','sessions','uiSession','uiConversation','conversation','deckInput']
export function apply(ctx:Context) {
  let state:DeckState={enabled:false,lanes:[null,null,null,null],active:0,notice:''}
  try {const saved=JSON.parse(localStorage.getItem(KEY)??'null');const old=JSON.parse(localStorage.getItem('dsh.voice-deck.lanes.v1')??'null');const ids=saved?.lanes??old;
    if(Array.isArray(ids))state={...state,enabled:saved?.enabled===true,active:Number.isInteger(saved?.active)?Math.max(0,Math.min(3,saved.active)):0,lanes:Array.from({length:4},(_,i)=>typeof ids[i]==='string' && ids.indexOf(ids[i])===i?ids[i]:null)}
  }catch{}
  const listeners=new Set<()=>void>(),leases=new Map<string,()=>void>()
  let cancelSwipe:(()=>void)|undefined
  let mounted=0,disposeView:(()=>void)|undefined
  // Optional inputs are captured by dedicated child sub-plugins (ctx.inject)
  // so a voice/gamepad uninstall only reloads that child fiber, never the deck
  // parent. The parent reads these holders, never an undeclared service.
  let voice:VoiceService|undefined,gamepad:Gamepad|undefined,gamepadBind:(()=>void)|undefined,disposed=false
  // Real Cordis disposes the parent fiber before React's view effect cleanup
  // runs, and every service accessor on the then-inactive ctx throws. Capture
  // the required layout service while the ctx is usable so workbench state can
  // always be reset exactly once per mount without touching an inactive ctx;
  // detachMount is the single owned-cleanup function shared by view unmount
  // and parent unload (whichever runs first; the later call is a no-op).
  const layout=ctx.layout
  let detachMount:(()=>void)|undefined
  const syncGamepad=()=>{
    if(disposed||!state.enabled||!gamepad||!mounted){const off=gamepadBind;if(off){gamepadBind=undefined;off()}}
    else if(!gamepadBind){
      // Each bind is a fenced generation: releasing it permanently fences
      // this callback, so a withdrawn/replaced provider, a closed view, a
      // disabled deck or an unloaded plugin can never send again through it.
      let live=true
      const off=gamepad.bind(action=>{if(live)intent(action)})
      gamepadBind=()=>{live=false;off()}
    }
  }
  const store={getSnapshot:()=>state,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}}}
  const publish=(next:Partial<DeckState>)=>{state={...state,...next};localStorage.setItem(KEY,JSON.stringify({...state,notice:''}));listeners.forEach(fn=>fn())}
  const notice=(text:string)=>publish({notice:text})
  const activeId=()=>state.lanes[state.active]
  const syncLeases=()=>{
    const list=ctx.sessions.list.getSnapshot()
    const ids=new Set(mounted && state.enabled?state.lanes.filter((id):id is string=>!!id && !!list.byId[id]):[])
    for(const [id,release] of leases)if(!ids.has(id)){release();leases.delete(id)}
    for(const id of ids)if(!leases.has(id))leases.set(id,ctx.sessions.acquireStage(id))
  }
  const hardwareKeyboard=()=>{
    const bridge=(window as unknown as {androidBridge?:{hasHardwareKeyboard?:()=>boolean}}).androidBridge
    if(!bridge)return matchMedia('(hover: hover) and (pointer: fine)').matches
    try{return bridge.hasHardwareKeyboard?.()===true}catch{return false}
  }
  const focus=(atEnd=false)=>{const id=activeId();if(!id||!hardwareKeyboard())return;requestAnimationFrame(()=>{if(!disposed && activeId()===id && mounted && hardwareKeyboard())ctx.deckInput.for(id).focus(atEnd)})}
  const activate=(index:number)=>{
    if(disposed)return
    const old=activeId(); if(!state.lanes[index])return
    if(old && ctx.deckInput.for(old).composing()){notice('请先完成输入法拼字');return}
    cancelSwipe?.()
    gamepad?.stopRepeat()
    if(old && old!==state.lanes[index])voice?.leave(old)
    if(old!==state.lanes[index] && !hardwareKeyboard()){
      const focused=document.activeElement
      if(focused instanceof HTMLElement && focused.closest('[data-deck-lane]')?.getAttribute('data-deck-lane')===old)focused.blur()
    }
    publish({active:index,notice:''});focus(old!==state.lanes[index])
  }
  const bindLane=(index:number,id:string|null)=>{
    if(disposed)return
    if(id && !ctx.sessions.list.getSnapshot().byId[id])return
    const old=state.lanes[index];if(old && old!==id)voice?.leave(old)
    publish({lanes:assign(state.lanes,index,id)});syncLeases()
    if(id)activate(index);else activate(adjacent(state.lanes,state.active,1))
  }
  const setView=(view:string,id=ctx.sessions.list.getSnapshot().current,focusTarget?:string)=>{
    if(!id)return
    const entry=ctx.slots.entries('conversation.session')[0];if(!entry)return
    const binding=ctx.uiSession.adapter.resolve(id)
    const store=ctx.slots.resolveStore(entry.store,binding)
    ctx.uiConversation.binding(id).activate(view)
    if(focusTarget!==undefined)store.actions.openView(view,focusTarget);else store.actions.setView(view)
  }
  const open=()=>{
    if(disposed||!state.enabled)return
    const list=ctx.sessions.list.getSnapshot();const id=list.current??state.lanes.find(id=>id && list.byId[id])??list.ids[0]
    if(!id){notice('先创建一个会话，再打开工作台');return}
    if(!list.current)ctx.sessions.open(id)
    setView('voice-deck',id)
  }
  const intent=(action:Intent)=>{
    if(disposed||!state.enabled||!mounted)return
    if(action==='sidebar'){gamepad?.stopRepeat();ctx.layout.toggleSidebar();focus();return}
    if(action==='previous'||action==='next'){activate(adjacent(state.lanes,state.active,action==='previous'?-1:1));return}
    const id=activeId();if(!id){notice('先将会话加入工作台');return}
    const editor=ctx.deckInput.for(id)
    if(action==='delete'){if(!editor.deleteBackward())notice('输入框暂不可编辑，请先完成输入法拼字');return}
    if(action==='send'){
      if(voice&&['permission','preparing','recording','transcribing'].includes(voice.for(id).snapshot().phase)){notice('请先结束录音并等待转录完成');return}
      gamepad?.stopRepeat()
      if(!editor.send())notice('草稿为空或暂不可发送');else {notice('');focus()}
      return
    }
    if(!voice){notice('未安装语音输入插件，录音不可用；可直接使用文字输入和附件');return}
    if(!voice.enabled()){notice('请在设置中启用语音输入');return}
    const lane=voice.for(id),phase=lane.snapshot().phase
    if(phase==='recording'){lane.stop();return}
    if(voice.busy()){notice('正在处理上一段语音，完成后再按 △');return}
    if(editor.composing()||editor.state.getSnapshot().phase!=='plain'){notice('请先完成当前输入');return}
    focus();lane.start()
  }
  const setEnabled=(enabled:boolean)=>{
    if(disposed)return
    if(!enabled)setView('chat')
    publish({enabled});disposeView?.();disposeView=undefined
    if(enabled)disposeView=ctx.slots.register({name:'conversation.view',id:'voice-deck',label:'会话工作台',order:5},Deck)
    // Release/rebind synchronously: the gamepad sink must not stay bound
    // during the disabled -> deferred React unmount gap.
    syncGamepad();syncLeases()
  }
  function Slots({wide=true}:{wide?:boolean}){
    const s=useSource(store),list=useSource(ctx.sessions.list)
    if(!s.enabled)return null
    return <div className="dsh-deck-pins" data-plugin="deck-pins"><button className="dsh-deck-open" onClick={open}>{wide?'会话工作台':'▦'}</button>{wide&&<div className="dsh-deck-pins-grid">{s.lanes.map((id,i)=><div key={i} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();bindLane(i,e.dataTransfer.getData('text/plain'));open()}}>
      <label><span>{i+1}</span><select aria-label={`泳道 ${i+1} 会话`} value={id??''} onChange={e=>{bindLane(i,e.target.value||null);open()}}><option value="">添加会话</option>{list.ids.map(id=><option key={id} value={id}>{list.byId[id]?.displayTitle??id}</option>)}</select></label>
    </div>)}</div>}</div>
  }
  const Lane=memo(function Lane({id,index,active}:{id:string;index:number;active:boolean}){
    const root=useRef<HTMLElement>(null),block=useSource(ctx.conversation.blocks.storeFor(id))
    const list=useSource(ctx.sessions.list),row=list.byId[id]
    useEffect(()=>ctx.deckInput.for(id).attach(),[id])
    useLayoutEffect(()=>{if(active){root.current?.scrollIntoView({block:'nearest',inline:'nearest'});focus(true)}},[active,id])
    useLayoutEffect(()=>{
      const lane=root.current,composer=lane?.querySelector<HTMLElement>('.dsh-deck-composer')
      if(!lane||!composer)return
      // Keep the existing scoped menus inside this lane, including when the
      // keyboard, voice dock, or a multiline draft changes the available space.
      const measure=()=>{
        const card=composer.querySelector<HTMLElement>('[data-composer-card]'),header=lane.querySelector('header')
        if(card&&header)composer.style.setProperty('--dsh-deck-menu-height',`${Math.max(0,Math.floor(card.getBoundingClientRect().top-header.getBoundingClientRect().bottom-12))}px`)
      }
      const resize=new ResizeObserver(measure)
      resize.observe(lane);resize.observe(composer);measure()
      return()=>resize.disconnect()
    },[id])
    const openView=(view:string,target:string)=>{if(disposed)return;voice?.leave(id);ctx.sessions.open(id);setView(view,id,target)}
    return <section ref={root} className="dsh-deck-lane" data-deck-lane={id} data-active={active} onClickCapture={()=>{if(!active)activate(index)}}>
      <header><span className="dsh-deck-number">{index+1}</span><strong title={row?.displayTitle}>{row?.displayTitle??'会话不可用'}</strong>{row?.running&&<span className="dsh-deck-running">运行中</span>}<button aria-label={`移出泳道 ${index+1}`} onClick={()=>bindLane(index,null)}>×</button></header>
      <div className="dsh-deck-chat" data-conversation-scroll=""><SessionSurface sessionId={id} part="chat" openView={openView}/></div>
      <div className="dsh-deck-composer"><SessionSurface sessionId={id} part="composer" blocked={block} openView={openView}/></div>
    </section>
  })
  function Deck(){
    const s=useSource(store),list=useSource(ctx.sessions.list)
    const grid=useRef<HTMLDivElement>(null)
    useEffect(()=>{
      const element=grid.current;if(!element)return
      const chatSwipe=attachChatSwipe(element,()=>settle())
      cancelSwipe=chatSwipe.cancel
      let gesture:{left:number;ended:boolean}|undefined,timer:ReturnType<typeof setTimeout>|undefined
      const settle=()=>{
        if(!gesture?.ended||chatSwipe.busy())return
        const delta=element.scrollLeft-gesture.left;gesture=undefined
        if(Math.abs(delta)<24)return
        const bounds=element.getBoundingClientRect()
        const visible=[...element.querySelectorAll<HTMLElement>('[data-deck-lane]')].filter(lane=>{
          const box=lane.getBoundingClientRect();return Math.min(box.right,bounds.right)-Math.max(box.left,bounds.left)>box.width*.65
        })
        const target=delta>0?visible.at(-1):visible[0]
        const index=state.lanes.indexOf(target?.dataset.deckLane??null)
        if(target && index>=0)activate(index)
      }
      const schedule=()=>{clearTimeout(timer);timer=setTimeout(settle,160)}
      const start=()=>{clearTimeout(timer);gesture={left:element.scrollLeft,ended:false}}
      const end=()=>{if(gesture)gesture.ended=true;schedule()}
      let width=element.clientWidth
      let innerPair:{right:string;left:string}|undefined
      const isFold=()=>element.closest('[data-fold-workbench]')!==null
      const rememberPair=()=>{
        if(!isFold() || element.clientWidth<=680 || element.clientWidth!==width)return
        const bounds=element.getBoundingClientRect(),lanes=[...element.querySelectorAll<HTMLElement>('[data-deck-lane]')]
        const nearest=(x:number)=>lanes.reduce<HTMLElement|undefined>((best,lane)=>{
          const box=lane.getBoundingClientRect(),old=best?.getBoundingClientRect()
          return !old || Math.abs((box.left+box.right)/2-x)<Math.abs((old.left+old.right)/2-x)?lane:best
        },undefined)?.dataset.deckLane
        const left=nearest(bounds.left+bounds.width*.25),right=nearest(bounds.left+bounds.width*.75)
        if(left&&right)innerPair={left,right}
      }
      rememberPair()
      // Native keeps the previous right-half pixels visible until this hook
      // confirms the destination lane has committed and is in view. A viewport
      // resize alone precedes ResizeObserver/React and is not a ready frame.
      const hostWindow=window as unknown as {__dshFoldDeckReady?:(cover:boolean)=>boolean}
      const align=(id:string)=>{
        const lane=[...element.querySelectorAll<HTMLElement>('[data-deck-lane]')].find(l=>l.dataset.deckLane===id)
        if(lane)element.scrollLeft+=lane.getBoundingClientRect().left-element.getBoundingClientRect().left
        return lane
      }
      const hostReady=(cover:boolean)=>{
        if(disposed)return true
        if(!isFold() || !innerPair)return true
        if(cover){
          if(element.clientWidth>680)return false
          const index=state.lanes.indexOf(innerPair.right)
          if(index<0)return true
          if(state.active!==index)activate(index)
          const lane=align(innerPair.right)
          return !!lane && lane.dataset.active==='true' && Math.abs(lane.getBoundingClientRect().left-element.getBoundingClientRect().left)<2
        }
        // Portrait inner screens may also use one column; only restore a pair
        // when the destination actually has room for two.
        if(element.clientWidth>680)align(innerPair.left)
        return true
      }
      hostWindow.__dshFoldDeckReady=hostReady
      element.addEventListener('scroll',rememberPair,{passive:true})
      const resize=new ResizeObserver(()=>{
        if(element.clientWidth===width)return
        const wasWide=width>680
        width=element.clientWidth
        chatSwipe.cancel()
        if(isFold() && innerPair){
          if(wasWide && width<=680){
            const index=state.lanes.indexOf(innerPair.right)
            if(index>=0)activate(index)
            align(innerPair.right)
            return
          }else if(!wasWide && width>680){
            const left=innerPair.left
            requestAnimationFrame(()=>{
              align(left)
              rememberPair()
            })
          }
        }
        element.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'})
        if(wasWide && width>680)rememberPair()
      })
      resize.observe(element)
      element.addEventListener('touchstart',start,{passive:true})
      element.addEventListener('touchend',end,{passive:true})
      element.addEventListener('touchcancel',end,{passive:true})
      element.addEventListener('scroll',schedule,{passive:true})
      element.addEventListener('scrollend',settle)
      return()=>{if(hostWindow.__dshFoldDeckReady===hostReady)delete hostWindow.__dshFoldDeckReady;if(cancelSwipe===chatSwipe.cancel)cancelSwipe=undefined;chatSwipe.dispose();resize.disconnect();clearTimeout(timer);element.removeEventListener('touchstart',start);element.removeEventListener('touchend',end);element.removeEventListener('touchcancel',end);element.removeEventListener('scroll',schedule);element.removeEventListener('scroll',rememberPair);element.removeEventListener('scrollend',settle)}
    },[])
    useEffect(()=>{
      mounted++;layout.setWorkbenchActive?.(true);syncLeases();syncGamepad();focus(true)
      const reset=()=>{const id=activeId();if(id)voice?.leave(id)}
      window.addEventListener('dsh-gamepad-reset',reset)
      // One-shot owned-UI detach. Deferred React unmount invokes it, and the
      // parent ctx.effect cleanup invokes the same function while the ctx is
      // still usable, so a plugin unload with React cleanup deferred (or
      // never run) has already dropped the listener, sink, workbench flag,
      // voice lanes and leases. The later call is inert and touches no ctx.
      let done=false
      const detach=()=>{
        if(done)return
        done=true
        if(detachMount===detach)detachMount=undefined
        window.removeEventListener('dsh-gamepad-reset',reset)
        mounted--;layout.setWorkbenchActive?.(false);syncGamepad()
        for(const id of state.lanes)if(id)voice?.for(id).cancel()
        syncLeases()
      }
      detachMount=detach
      return detach
    },[])
    return <div className="dsh-deck" data-plugin="voice-deck" data-conversation-composer-overlay="">
      <div ref={grid} className="dsh-deck-grid" data-count={s.lanes.filter(Boolean).length}>{s.lanes.map((id,i)=>id&&list.byId[id]?<Lane key={id} id={id} index={i} active={s.active===i}/>:<div className="dsh-deck-empty" key={`empty-${i}`} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();bindLane(i,e.dataTransfer.getData('text/plain'))}}><span>{i+1}</span><p>从左侧拖入会话</p><select aria-label={`添加到泳道 ${i+1}`} value="" onChange={e=>bindLane(i,e.target.value)}><option value="">选择会话</option>{list.ids.map(id=><option key={id} value={id}>{list.byId[id]?.displayTitle??id}</option>)}</select></div>)}</div>
      {s.notice&&<footer role="status">{s.notice}</footer>}
    </div>
  }
  function Settings(){const s=useSource(store);const held=voice?.held()??[];return <section style={{padding:20}} data-plugin="deck-settings"><h2>会话工作台</h2><label><input type="checkbox" checked={s.enabled} onChange={e=>setEnabled(e.target.checked)}/> 启用四会话工作台</label><p>从左侧添加会话，用一个麦克风和手柄切换输入。语音只写入草稿。语音或手柄插件未安装时，其余输入、附件与文字发送不受影响。</p>{s.enabled&&<button onClick={open}>打开工作台</button>}{held.length>0&&<details><summary>待插入语音</summary>{held.map(v=><div key={v.sessionId}><p>{ctx.sessions.list.getSnapshot().byId[v.sessionId]?.displayTitle??'原会话不可用'}</p><pre>{v.text}</pre><button onClick={()=>voice?.for(v.sessionId).retry()}>插入原会话</button><button onClick={()=>voice?.for(v.sessionId).discard()}>丢弃</button></div>)}</details>}</section>}
  ctx.provide('voiceDeck',{...store,setEnabled,assign:bindLane,activate,open,intent})
  ctx.effect(()=>{const style=document.createElement('style');style.textContent=css;style.dataset.plugin='voice-deck';document.head.append(style);const off=ctx.sessions.list.subscribe(syncLeases);return()=>{off();const detach=detachMount;detachMount=undefined;detach?.();disposed=true;const offBind=gamepadBind;if(offBind){gamepadBind=undefined;offBind()}const offView=disposeView;disposeView=undefined;offView?.();for(const release of leases.values())release();leases.clear();style.remove()}},'voice deck lifecycle')
  ctx.slots.inject('sidebar.workspaces.before',()=>ctx.slots.register({name:'sidebar.workspaces.before',id:'voice-deck',order:-100},Slots))
  ctx.slots.inject('conversation.view',()=>{if(state.enabled)setEnabled(true);return()=>{disposeView?.();disposeView=undefined}})
  ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'voice-deck',label:()=> '会话工作台',order:87},Settings))
  // Optional inputs run as isolated child fibers: Cordis only loads each
  // callback while its service exists and unloads/re-runs it on withdrawal
  // or replacement, so the deck parent fiber (slots, leases, lanes, active)
  // never restarts when an input plugin comes or goes.
  ctx.inject(['androidVoice'],c=>{
    voice=c.androidVoice;publish({})
    c.effect(()=>()=>{voice=undefined;publish({})},'voice deck optional voice')
  })
  ctx.inject(['gamepadInput'],c=>{
    gamepad=c.gamepadInput;syncGamepad()
    c.effect(()=>()=>{gamepad=undefined;syncGamepad()},'voice deck optional gamepad')
  })
}
