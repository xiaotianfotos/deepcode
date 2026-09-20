import {useEffect,useState} from 'react'
const endpoint='/api/android/codex/account'
type State={enabled:boolean;connected:boolean;csrf:string;account?:{email?:string;planType?:string;type:string}|null;login?:{authUrl:string}|null;error?:string|null}
export const inject=['slots']
export function apply(ctx:any){
  function Settings(){
    const [state,setState]=useState<State|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
    const refresh=async()=>{try{const response=await fetch(endpoint);const next=await response.json();setState(next)}catch{setError('无法连接 Codex，请重新打开应用')}}
    useEffect(()=>{void refresh();const timer=setInterval(refresh,2000);return()=>clearInterval(timer)},[])
    const action=async(name:string,extra:object={})=>{
      if(!state||busy)return;setBusy(true);setError('')
      try{
        const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:name,csrf:state.csrf,...extra})})
        const next=await response.json();if(!response.ok)throw new Error(next.error??'操作失败');setState(next)
        // MainActivity intercepts this external HTTPS navigation and opens the
        // system browser. WebView stays on its authenticated engine document.
        if(name==='login'&&next.login?.authUrl)window.location.assign(next.login.authUrl)
      }catch(e){setError(e instanceof Error?e.message:'操作失败')}finally{setBusy(false)}
    }
    return <section data-plugin="android-codex-settings" style={{padding:20,maxWidth:640}}><h2>Codex</h2>
      <p>选择 Codex Harness 后，由 Codex 执行会话，聊天界面和输入方式保持一致。</p>
      <label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={state?.enabled??true} disabled={!state||busy} onChange={e=>void action('enable',{enabled:e.target.checked})}/>启用 Codex 后端</label>
      <p>{state?.account?`已登录 · ${state.account.email??'Codex 账号'}${state.account.planType?' · '+state.account.planType:''}`:state?.login?'等待浏览器授权，完成后返回此处':'尚未登录'}</p>
      <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
        {!state?.account&&<button disabled={!state||busy||!state.enabled} onClick={()=>void action('login')}>{busy?'正在连接…':state?.login?'重新登录':'登录 Codex'}</button>}
        {state?.login&&<><a href={state.login.authUrl}>打开授权页面</a><button disabled={busy} onClick={()=>void action('cancel')}>取消登录</button></>}
        {state?.account&&<button disabled={busy||state?.enabled===false} onClick={()=>void action('logout')}>退出登录</button>}
      </div>
      {(error||state?.error)&&<p role="alert">{error||state?.error}</p>}
      <p style={{opacity:.65}}>新建会话时，在 Harness 菜单选择 Codex；模型和推理强度在原有模型菜单中选择。</p>
      <p style={{opacity:.65}}>当前 Android 运行时需要会话选择“完全访问”，可访问本应用已获授权的文件；暂不提供工作区级隔离。</p>
    </section>
  }
  ctx.slots.inject('settings.plugin.item',()=>ctx.slots.register({name:'settings.plugin.item',key:'android-codex',order:85},Settings))
}
