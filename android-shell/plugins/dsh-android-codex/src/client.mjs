import {EventEmitter} from 'node:events'
import {spawn} from 'node:child_process'
import readline from 'node:readline'

// Same JSONL interface consumed by the pinned Relay adapter. Account values are
// never logged. Each failure settles outstanding callers instead of replaying work.
export class AndroidCodexClient extends EventEmitter {
  constructor({command,args=[],env,cwd,requestTimeoutMs=60000,initializeTimeoutMs=20000,enabled=()=>true,validateRequest=()=>{}}) {
    super();Object.assign(this,{command,args,env,cwd,requestTimeoutMs,initializeTimeoutMs,enabled,validateRequest})
    this.pending=new Map();this.nextId=1;this.process=null;this.starting=null;this.startingGeneration=null;this.booting=0;this.closed=false
    // disposed is the permanent Cordis-unmount destroy; closed marks the
    // recoverable user-facing stop that a later enable can boot past again.
    this.disposed=false;this.closing=null;this.generation=0
    // Public latch of the most recent failed boot (spawn ENOENT, handshake
    // error/timeout). Read-only consumers use it to answer honestly instead
    // of re-spawning a dead backend on every poll; any new non-deduped boot
    // clears it, so explicit enable/retry and direct start() retries stay
    // exactly as before.
    this.bootFailure=null
    // Parked start() calls wait for the recoverable enable gate. The pinned
    // relay adapter awaits start() once at activation and caches that promise,
    // so a disabled boot must never reject: a poisoned one-shot ready would
    // survive re-enable until a host restart.
    this.parked=[]
    this.activeTurns=new Set();this.finishedTurns=new Set()
  }
  get hasActiveWork(){return this.booting>0||this.activeTurns.size>0||[...this.pending.values()].some(p=>/^(turn\/(start|steer)|thread\/(start|resume|fork))$/.test(p.method))}
  async start() {
    // The user-recoverable enable switch gates boot as well as work: while
    // disabled no start path may spawn App Server, so status polling cannot
    // silently wake a stopped backend.
    if(this.disposed)throw new Error('Codex 客户端已卸载')
    if(!this.enabled()){
      // Gate parks instead of rejecting: spawn nothing, settle nothing until
      // resume() after a re-enable, or an explicit stop/卸载 aborts the wait.
      return new Promise((resolve,reject)=>{this.parked.push({resolve,reject})})
    }
    if(this.starting)return this.starting
    // An in-flight boot is active work with an accurate lifetime: only the
    // non-deduped boot path increments and the settle clears it exactly once.
    // Keying this off this.starting instead would keep the client permanently
    // busy, because a resolved starting handle stays cached until close/exit.
    this.booting++
    this.bootFailure=null
    // boot() bumps the generation synchronously at spawn, so tagging the
    // latch with the expected generation keeps an old failed boot from
    // latching over a newer in-flight or healthy one.
    const expectedGeneration=this.generation+1
    const run=this.boot().catch(error=>{
      if(this.starting===run)this.starting=null
      if(this.generation===expectedGeneration)this.bootFailure=error
      throw error
    })
    const settle=()=>{this.booting--}
    run.then(settle,settle)
    this.starting=run
    return run
  }
  resume() {
    // Enable persistence wakes parked cold starts. Woken callers share the one
    // this.starting boot, so a concurrent cycle still spawns a single child.
    const waiters=this.parked;this.parked=[]
    for(const waiter of waiters)this.start().then(waiter.resolve,waiter.reject)
  }
  failParked(error){const waiters=this.parked;this.parked=[];for(const waiter of waiters)waiter.reject(error)}
  async boot() {
    this.closed=false
    const generation=++this.generation
    // Tag the dedup handle with its boot generation so an old close can tell
    // its own stale boot apart from a newer generation's starting promise.
    this.startingGeneration=generation
    const child=spawn(this.command,this.args,{env:this.env,cwd:this.cwd,stdio:['pipe','pipe','pipe']})
    this.process=child
    // A dying child's stdout must not dispatch notifications or turn state
    // into a newer generation; response settlement is already generation-tagged.
    readline.createInterface({input:child.stdout}).on('line',line=>{
      if(this.generation===generation&&this.process===child)this.receive(line)
    })
    // Runtime stderr can include requests and login URLs. Keep it out of DSH logs.
    child.stderr.resume()
    // Stale-instance callbacks must only settle work tagged with this boot.
    child.stdin.on('error',error=>this.failGeneration(generation,error))
    // 'exit' alone is not a terminal guarantee: a failed spawn (ENOENT) emits
    // async 'error'+'close' but never 'exit', and a handle killed after its
    // streams died may never emit 'exit' at all. Treat whichever terminal
    // event lands first as authoritative so this.process never remains a
    // dead-but-truthy child (truthful failure) and close() can bounded-wait.
    // All listeners register synchronously at spawn, so an exit/error that
    // races explicit close still lands here before any later handler.
    let terminated=false
    const terminate=(code,signal,failure)=>{
      if(!terminated){
        terminated=true
        // Belt-and-braces flag for a close() that captured this child before
        // the identity check below could null it out.
        child.dshTerminated=true
        // The public exit event is generation-isolated too: the pinned runtime
        // subscribes here and fails active turns on every event, so a stale
        // child's delayed exit must never disconnect the current session.
        if(this.process===child){
          this.process=null;this.starting=null;this.activeTurns.clear();this.finishedTurns.clear()
          this.emit('exit',{code,signal})
        }
      }
      this.failGeneration(generation,failure??new Error(`Codex runtime exited (${signal??code})`))
    }
    child.once('exit',terminate)
    child.once('close',terminate)
    child.once('error',error=>{
      // A spawn-time failure leaves child.pid undefined and 'exit' will never
      // follow, so settle terminally right here — synchronously ahead of the
      // rejection surfacing — instead of leaving a dead truthy handle until
      // the later 'close' event. Post-spawn errors (kill/stdio) keep the
      // live process and only settle this generation's outstanding work.
      if(child.pid===undefined)terminate(null,null,error)
      else this.failGeneration(generation,error)
    })
    // A child that answers initialize with {id,error} (or never answers within
    // the injectable handshake ceiling) is a live orphan if this boot merely
    // rejects: the old handle stays truthy, the next enable boots a second
    // child, and account state trusts the leak. Settle the captured child
    // before surfacing the ORIGINAL error. starting stays set until boot
    // settles (start()'s catch) so cleanup can never double-boot; process is
    // nulled only under the captured-child identity guard so a newer
    // generation's state is never touched.
    let initializeFailure=null
    try{await this.request('initialize',{clientInfo:{name:'dsh_android',title:'DSH Android',version:'0.1.0'},capabilities:{experimentalApi:true}},{timeoutMs:this.initializeTimeoutMs})}
    catch(error){initializeFailure=error}
    if(this.disposed||this.closed) {
      // close()/dispose() landed while initialize was in flight; a late result
      // must never leave a runnable process or reset the stop gate.
      child.kill('SIGKILL');throw new Error(this.disposed?'Codex 客户端已卸载':'Codex 已关闭')
    }
    if(initializeFailure){
      if(this.process===child)this.process=null
      if(!child.dshTerminated){
        try{child.stdin.end()}catch{}
        child.kill('SIGKILL')
        // Await this captured child's death so a failed enable never returns
        // with the orphan still live. Bounded: a vanished handle may never
        // emit a terminal event.
        await new Promise(resolve=>{
          if(child.dshTerminated||child.exitCode!==null||child.signalCode!==null)return resolve()
          const done=()=>{clearTimeout(cap);resolve()}
          const cap=setTimeout(done,2000)
          child.once('exit',done);child.once('close',done)
        })
      }
      this.failGeneration(generation,initializeFailure)
      throw initializeFailure
    }
    if(this.process!==child) {
      // Lost a close/replace race after initialize resolved: never leave the
      // stale child runnable and never reset a newer generation's state.
      child.kill('SIGKILL');throw new Error('Codex 已关闭')
    }
    this.notify('initialized',{})
  }
  request(method,params={}, {timeoutMs=this.requestTimeoutMs}={}) {
    try{this.validateRequest(method,params)}catch(error){return Promise.reject(error)}
    if(!this.enabled() && /^(turn\/|thread\/(start|resume|fork)|command\/|process\/)/.test(method))return Promise.reject(Object.assign(new Error('请先在设置中启用 Codex 后端'),{code:'ANDROID_CODEX_DISABLED'}))
    if(!this.process?.stdin.writable)return Promise.reject(new Error('Codex 尚未启动，请在设置中重新连接'))
    const id=this.nextId++
    return new Promise((resolve,reject)=>{
      const timer=timeoutMs===null?null:setTimeout(()=>{this.pending.delete(id);reject(new Error(`${method} 超时`))},timeoutMs)
      this.pending.set(id,{resolve,reject,timer,method,generation:this.generation})
      try{this.write({id,method,params})}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e)}
    })
  }
  notify(method,params={}){this.write({method,params})}
  respond(id,result){this.write({id,result})}
  respondError(id,code,message){this.write({id,error:{code,message}})}
  write(message){if(!this.process?.stdin.writable)throw new Error('Codex 已断开');this.process.stdin.write(JSON.stringify(message)+'\n')}
  receive(line) {
    let message;try{message=JSON.parse(line)}catch{this.emit('diagnostic','Codex returned invalid JSON');return}
    if(message.id!=null && ('result' in message||'error' in message)) {
      const pending=this.pending.get(message.id);if(!pending)return
      clearTimeout(pending.timer);this.pending.delete(message.id)
      if(message.error){const error=new Error(message.error.message??'Codex request failed');error.code=message.error.code;pending.reject(error)}else {
        const turn=message.result?.turn
        if(pending.method==='turn/start'&&turn?.id&&!this.finishedTurns.has(turn.id)&&turn.status==='inProgress')this.activeTurns.add(turn.id)
        pending.resolve(message.result)
      }
    }else if(message.id!=null && message.method)this.emit('serverRequest',message)
    else if(message.method){
      const id=message.params?.turn?.id
      if(message.method==='turn/started'&&id&&!this.finishedTurns.has(id))this.activeTurns.add(id)
      if(message.method==='turn/completed'&&id){
        this.activeTurns.delete(id);this.finishedTurns.add(id)
        if(this.finishedTurns.size>1000)this.finishedTurns.delete(this.finishedTurns.values().next().value)
      }
      this.emit('notification',message)
    }
  }
  fail(error){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error)}this.pending.clear()}
  failGeneration(generation,error){for(const[id,p]of [...this.pending])if(p.generation===generation){clearTimeout(p.timer);this.pending.delete(id);p.reject(error)}}
  async close() {
    // Re-entrant for the same child, but the shared run is keyed to the exact
    // process being stopped: if a re-enable boots a newer generation inside a
    // SIGTERM-stubborn escalation window, a second disable must kill that new
    // child instead of returning the stale run and leaving a live process.
    this.closed=true
    this.failParked(new Error('Codex 已关闭'))
    const child=this.process
    if(this.closing&&this.closing.child===child)return this.closing.run
    // Capture the generation being stopped: with a stubborn child the exit
    // wait can outlive a newer boot, so the kill/exit tail below must settle
    // only this captured generation and never touch newer state.
    const generation=this.generation
    // Clear the dedup handle only when it belongs to the generation being
    // stopped; a newer boot's starting must survive an old close.
    if(this.starting&&this.startingGeneration===generation)this.starting=null
    const run=(async()=>{
      // A child already settled by the boot-time terminal handler (including
      // an ENOENT spawn that never emits 'exit') must not restart a wait that
      // could hang; skip straight to settling this generation's work.
      let terminatedConfirmed=true
      if(child&&!child.dshTerminated){
        child.stdin.end();child.kill('SIGTERM')
        // Bound the exit wait three ways: 'exit' for normal death, 'close' to
        // cover spawns/teardowns that skip 'exit', and a hard post-SIGKILL
        // ceiling so close/dispose can never hang on a vanished handle. The
        // ceiling proves the wait ended, not that the child died: a stopped
        // child (SIGKILL delivery pending) must surface as a failed cleanup
        // instead of pretending the process was released.
        terminatedConfirmed=await new Promise(resolve=>{
          let hardCap=null
          const done=ok=>{clearTimeout(timer);if(hardCap)clearTimeout(hardCap);resolve(ok)}
          const timer=setTimeout(()=>{child.kill('SIGKILL');hardCap=setTimeout(()=>done(false),2000)},2000)
          child.once('exit',()=>done(true));child.once('close',()=>done(true))
        })
      }
      this.failGeneration(generation,new Error('Codex 已关闭'))
      if(!terminatedConfirmed)throw new Error('Codex 进程未能确认退出，请稍后重试关闭')
    })()
    const entry={child,run,generation}
    // Assign first, then clear via an identity-checked finally. Clearing
    // closing inside the body races the outer assignment and strands a stale
    // resolved promise, so a later close() would skip the live child entirely.
    this.closing=entry
    try{await run}finally{if(this.closing===entry)this.closing=null}
  }
  async dispose(){this.disposed=true;this.failParked(new Error('Codex 客户端已卸载'));await this.close()}
}
