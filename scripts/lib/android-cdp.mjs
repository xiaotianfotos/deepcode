/** Debug-build WebView inspection. Only public page state is returned; never log auth URLs. */
import { execFileSync } from 'node:child_process'
export async function connect(serial) {
  const adb=(...args)=>execFileSync('adb',['-s',serial,...args],{encoding:'utf8'}).trim()
  const pid=adb('shell','pidof','com.dsharnessmobile.shell').split(' ')[0]
  const port=adb('forward','tcp:0',`localabstract:webview_devtools_remote_${pid}`)
  const pages=await(await fetch(`http://127.0.0.1:${port}/json`)).json()
  const page=pages.find(p=>p.type==='page' && p.url.includes(':3080'))
  if(!page)throw new Error('Harness WebView not ready')
  const ws=new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})})
  let seq=0;const pending=new Map(),listeners=new Map()
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);const p=pending.get(m.id);if(m.method)for(const listener of listeners.get(m.method)??[])listener(m.params);if(p){pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result)}})
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method))},120000);pending.set(id,{resolve(value){clearTimeout(timer);resolve(value)},reject(error){clearTimeout(timer);reject(error)}});ws.send(JSON.stringify({id,method,params}))})
  return {call,on(method,listener){const callbacks=listeners.get(method)??[];callbacks.push(listener);listeners.set(method,callbacks)},async evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text+': '+r.exceptionDetails.exception?.description);return r.result.value},close(){ws.close();adb('forward','--remove',`tcp:${port}`)}}
}
