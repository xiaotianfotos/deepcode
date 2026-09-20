#!/usr/bin/env python3
"""Account-free Android App Server compatibility probe in an isolated directory."""
import json,pathlib,queue,shlex,subprocess,sys,threading,time
serial=sys.argv[1];pkg='com.dsharnessmobile.shell'
root='/data/data/'+pkg+'/files/home/.dsh/codex-probe-20260910'
subprocess.run(['adb','-s',serial,'shell',shlex.join(['run-as',pkg,'mkdir','-p',root+'/state'])],check=True)
command=['run-as',pkg,'/system/bin/env','LD_LIBRARY_PATH='+root,'CODEX_HOME='+root+'/state','CODEX_SELF_EXE='+root+'/codex.bin','SHELL=/system/bin/sh','PATH=/data/data/'+pkg+'/files/usr/bin:/system/bin','/system/bin/linker64',root+'/codex.bin','-c','features.code_mode_host=false','-c','features.shell_snapshot=false','app-server']
if '--installed' in sys.argv:
    native=json.loads(subprocess.check_output(['adb','-s',serial,'exec-out','run-as',pkg,'cat','files/network-dns.json']))['nativeLibraryDir']
    prefix='/data/data/'+pkg+'/files/usr'
    shell=root+'/bash'
    subprocess.run(['adb','-s',serial,'shell',shlex.join(['run-as',pkg,'ln','-sfn',native+'/libdsh_codex_shell.so',shell])],check=True)
    values={'DSH_CODEX_NATIVE_DIR':native,'TERMUX__PREFIX':prefix,'CODEX_HOME':root+'/state','SHELL':shell,'PATH':prefix+'/bin:/system/bin'}
    args=[native+'/libdsh_codex_launcher.so','-c','features.code_mode_host=false','-c','features.shell_snapshot=false','-c','shell_environment_policy.set.TERMUX__PREFIX='+json.dumps(prefix),'app-server']
    command=['run-as',pkg,'/system/bin/sh','-c',' '.join(k+'='+shlex.quote(v) for k,v in values.items())+' '+shlex.join(args)]
proc=subprocess.Popen(['adb','-s',serial,'shell',shlex.join(command)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
messages=queue.Queue()
def read(stream,label):
    for line in stream:messages.put((label,line))
for stream,label in [(proc.stdout,'out'),(proc.stderr,'err')]:threading.Thread(target=read,args=(stream,label),daemon=True).start()
def rpc(id,method,params):
    proc.stdin.write(json.dumps({'id':id,'method':method,'params':params})+'\n');proc.stdin.flush()
    end=time.monotonic()+30
    while time.monotonic()<end:
        try:label,line=messages.get(timeout=1)
        except queue.Empty:
            if proc.poll() is not None:raise RuntimeError('App Server exited before reply')
            continue
        if label=='err':
            print('probe stderr:',line[:500],file=sys.stderr,flush=True);continue
        value=json.loads(line)
        if value.get('id')==id:return value
    raise TimeoutError(method)
results={}
try:
    results['initialize']=rpc(1,'initialize',{'clientInfo':{'name':'dsh_android_probe','version':'0.1.0'},'capabilities':{'experimentalApi':True}})
    proc.stdin.write('{"method":"initialized"}\n');proc.stdin.flush()
    results['account']=rpc(2,'account/read',{'refreshToken':False})
    catalog=rpc(3,'model/list',{'limit':50});results['models']=[x['id'] for x in catalog.get('result',{}).get('data',[])];results['modelError']=catalog.get('error')
    thread=rpc(4,'thread/start',{'cwd':root,'ephemeral':True,'sandbox':'read-only','approvalPolicy':'on-request'})
    results['thread']={'id':thread.get('result',{}).get('thread',{}).get('id'),'error':thread.get('error')}
    results['command']=rpc(5,'command/exec',{'command':[shell if '--installed' in sys.argv else '/system/bin/sh','-c','echo DSH_CODEX_ANDROID_OK; node --version; git --version'],'cwd':root,'sandboxPolicy':{'type':'dangerFullAccess'}})
    results['readOnlyProbe']=rpc(6,'command/exec',{'command':['/system/bin/sh','-c','echo probe > '+root+'/readonly-probe.txt'],'cwd':root,'sandboxPolicy':{'type':'readOnly'}})
    print(json.dumps(results,ensure_ascii=False,indent=2),flush=True)
finally:
    proc.stdin.close()
    try:proc.wait(timeout=8)
    except subprocess.TimeoutExpired:proc.terminate();proc.wait(timeout=5)
