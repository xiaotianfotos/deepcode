import {timingSafeEqual,randomBytes} from 'node:crypto'
export const ACCOUNT_PATH='/api/android/codex/account'
export function maskEmail(email){
  if(typeof email!=='string'||!email)return null
  const at=email.lastIndexOf('@')
  if(at<1)return '****'
  const local=Array.from(email.slice(0,at)),domain=email.slice(at)
  if(local.length===1)return '****'+domain
  const prefix=local.slice(0,Math.min(3,Math.floor(local.length/2))).join('')
  return prefix+'****'+(local.length>2?local.at(-1):'')+domain
}
export class CodexAccount {
  constructor(client,{enabled=()=>true,setEnabled=()=>{},hasActiveTurns=()=>false,onBoot=null}={}) {
    Object.assign(this,{client,enabled,setEnabled,hasActiveTurns,onBoot});this.login=null;this.error=null;this.account=null;this.csrf=randomBytes(24).toString('hex');this.operation=Promise.resolve()
    client.on('notification',message=>{
      // Strict guard: a late completion without a matching live login must not
      // revive cleared login/error state after a disable.
      if(message.method==='account/login/completed'&&this.login&&message.params.loginId===this.login.loginId){
        this.login=null;this.error=message.params.success?null:'授权未完成，请重试登录'
      }
    })
  }
  view(connected){return {enabled:this.enabled(),connected,account:this.account,login:this.login,error:this.error,csrf:this.csrf}}
  async status() {
    // A disabled backend answers from cached display state only: no OAuth read,
    // no account/request and no boot a settings poll could wake.
    if(!this.enabled())return this.view(false)
    // Read-only settings polling must never retry a dead boot: after a failed
    // spawn or handshake the client latched an honest failure and there is no
    // process to query, so answer from that state and keep the retryable
    // error. Only an explicit enable/login action may boot the backend again.
    if(this.client.bootFailure&&!this.client.process){
      if(!this.error)this.error='启动失败，请重试开启'
      return this.view(false)
    }
    // An in-flight failure settling under this poll must still answer with
    // consistent honest fields instead of throwing fabricated connection data.
    try{await this.client.start()}catch{if(!this.error)this.error='启动失败，请重试开启';return this.view(false)}
    const result=await this.client.request('account/read',{refreshToken:false})
    // Whitelist only display fields: no OAuth token crosses the bridge.
    const a=result.account
    this.account=a?{type:a.type,email:maskEmail(a.email),planType:a.planType??null}:null
    return this.view(true)
  }
  action(body){
    const result=this.operation.then(()=>this.perform(body))
    this.operation=result.catch(()=>{})
    return result
  }
  async perform(body) {
    const token=typeof body.csrf==='string'?Buffer.from(body.csrf):Buffer.alloc(0),expected=Buffer.from(this.csrf)
    if(token.length!==expected.length||!timingSafeEqual(token,expected))throw new Error('Invalid account request')
    // Every validation completes before the first side effect: a rejected or
    // malformed request never boots, closes or writes configuration.
    if(body.action==='enable'){
      if(typeof body.enabled!=='boolean')throw new Error('Invalid enabled value')
      if(!body.enabled){
        // Repeat disable is an idempotent no-op: no rewrite, no second kill.
        if(!this.enabled())return this.view(false)
        if(this.hasActiveTurns())throw new Error('请先停止正在执行的 Codex 会话')
        // The persistible gate lands first so later polls cannot boot; a write
        // failure surfaces as an error and keeps configuration untouched.
        this.setEnabled(false)
        const login=this.login;this.login=null
        // Cancelling only touches an existing login on a live process; a stop
        // never boots App Server just to cancel a login.
        // Best-effort cancel with a short ceiling: an unresponsive server must
        // not stall the explicit stop for the full request timeout.
        if(login&&this.client.process){try{await this.client.request('account/login/cancel',{loginId:login.loginId},{timeoutMs:5000})}catch{}}
        await this.client.close()
        return this.view(false)
      }
      this.setEnabled(true)
      // Release the park for callers that awaited start() while disabled.
      this.client.resume?.()
      // An explicit enable eagerly awaits the shared boot: the pinned relay
      // adapter runs its one-shot activation start() once and then issues
      // request('thread/start') directly from createSession, so a fully lazy
      // enable would fail immediate post-enable use until a settings poll or
      // account action booted the client. Dedup on the client's single
      // starting handle keeps exactly one child per cycle. A boot failure
      // keeps enabled=true with an explicit retryable error (semantics 6).
      // Clear the retryable error only when the boot actually resolved. A
      // leaked-but-truthy process handle must never wipe a real startup
      // failure: that lie let the first enable report connected=true while
      // the rejected child stayed alive.
      try{await this.client.start()}catch{this.error='启动失败，请重试开启';return this.view(false)}
      this.error=null
      // Vendor activation recovery: the pinned Relay host only retries its
      // cached activation attempt through the attached refresh, and the only
      // honest trigger is this explicit enable after the shared boot resolved.
      // A refresh failure keeps enabled=true with the same retryable error;
      // it never silently reports connected.
      if(this.onBoot){try{await this.onBoot()}catch{this.error='启动失败，请重试开启';return this.view(false)}}
      return this.view(!!this.client.process)
    }
    if(!['login','cancel','logout'].includes(body.action))throw new Error('Unknown account action')
    if(!this.enabled()){
      // Cancelling without a live login is an idempotent status read; login and
      // logout must not bypass the stop gate.
      if(body.action==='cancel'){this.login=null;return this.view(false)}
      throw new Error('请先在设置中启用 Codex 后端')
    }
    if(body.action==='logout'&&this.hasActiveTurns())throw new Error('请先停止正在执行的 Codex 会话')
    await this.client.start()
    switch(body.action){
      case 'login': {
        if(this.login)await this.client.request('account/login/cancel',{loginId:this.login.loginId})
        this.error=null
        const result=await this.client.request('account/login/start',{type:'chatgpt'})
        const url=new URL(result.authUrl)
        if(url.protocol!=='https:'||!['auth.openai.com','auth0.openai.com','chatgpt.com'].includes(url.hostname))throw new Error('Codex 返回了不支持的授权地址')
        this.login={loginId:result.loginId,authUrl:result.authUrl};return this.status()
      }
      case 'cancel':if(this.login)await this.client.request('account/login/cancel',{loginId:this.login.loginId});this.login=null;return this.status()
      case 'logout':await this.client.request('account/logout');this.login=null;this.account=null;return this.status()
    }
  }
  handler=async(request,response)=>{
    const send=(status,value)=>{response.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});response.end(JSON.stringify(value))}
    try{
      if(request.method==='GET'){send(200,await this.status());return}
      if(request.method!=='POST'){send(405,{error:'Method not allowed'});return}
      if(!request.headers['content-type']?.startsWith('application/json')){send(415,{error:'JSON required'});return}
      let text='';for await(const chunk of request){text+=chunk;if(text.length>4096)throw new Error('Request too large')}
      send(200,await this.action(JSON.parse(text)))
    }catch(error){send(400,{error:String(error.message).slice(0,300),connected:!!this.client.process,enabled:this.enabled(),csrf:this.csrf})}
  }
}
