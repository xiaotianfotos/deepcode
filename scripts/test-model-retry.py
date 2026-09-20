#!/usr/bin/env python3
"""Model HTTP failure/retry through an isolated, temporary provider and proxy."""
import argparse
import os
UPSTREAM_MODEL_URL = os.environ["DSH_TEST_MODEL_ORIGIN"].rstrip("/")
import http.server
import json
import threading
import time
import urllib.error
import urllib.request
import uuid
from lib.dsh_device import Device, ROOT, PKG

parser=argparse.ArgumentParser();parser.add_argument('serial');args=parser.parse_args()
d=Device(args.serial);state={'fail':True,'failed_requests':0,'forwarded_requests':0}
run_id='retry-'+uuid.uuid4().hex[:10];provider='validation-'+run_id;credential='DSH_VALIDATION_'+uuid.uuid4().hex.upper()
report={'serial':args.serial,'physical_device_tested':False,'run_id':run_id}
server=None;port=None;sid=None;configured=False;credential_set=False;original_default=None
class Proxy(http.server.BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_POST(self):
        body=self.rfile.read(int(self.headers.get('Content-Length','0')))
        if self.path!='/v1/chat/completions':self.send_error(404);return
        if state['fail']:
            state['failed_requests']+=1
            status=503;ctype='application/json';data=json.dumps({'error':{'message':'MODEL_SERVICE_UNAVAILABLE_TEST','type':'server_error','code':'test_unavailable'}}).encode()
        else:
            state['forwarded_requests']+=1
            req=urllib.request.Request(UPSTREAM_MODEL_URL+self.path,data=body,headers={'Content-Type':'application/json'})
            try:
                with urllib.request.urlopen(req,timeout=120) as upstream:
                    status=upstream.status;ctype=upstream.headers.get('Content-Type','application/json');data=upstream.read()
            except urllib.error.HTTPError as error:
                status=error.code;ctype='application/json';data=error.read()
        self.send_response(status);self.send_header('Content-Type',ctype);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)

def wait_turn(previous):
    deadline=time.monotonic()+180
    while time.monotonic()<deadline:
        row=next(x for x in d.rpc('session/list',{'_request':{}})['items'] if x['sessionId']==sid)
        if not row['running']:
            records=[r.get('event',{}) for r in d.session_records(sid)]
            ends=[e for e in records if e.get('type')=='turn/end']
            if len(ends)>previous:return records,ends[-1]['data']['reason']
        time.sleep(2)
    raise RuntimeError('Timed out waiting for model turn')

def prompt(text):
    return d.rpc('session/prompt',{'request':{'sessionId':sid,'requestId':uuid.uuid4().hex,'mode':'queue','content':[{'type':'text','text':text}]}})

try:
    d.emulator_only();d.authenticate()
    if any(s['running'] for s in d.rpc('session/list',{'_request':{}})['items']):raise RuntimeError('Another Agent is active; run retry test after it completes')
    original_default=next(n['user'] for n in d.rpc('settings/describe',{})['namespaces'] if n['ns']=='agent-default-model')
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Proxy);port=server.server_port
    threading.Thread(target=server.serve_forever,daemon=True).start()
    d.command('reverse',f'tcp:{port}',f'tcp:{port}')
    config={'displayName':'Validation retry','api':'openai-completions','baseURL':f'http://127.0.0.1:{port}/v1','apiKeyEnv':credential,
            'retryPolicy':{'mode':'normal','maxRetries':0},
            'models':[{'id':'qwen38-flash-next','name':'Qwen validation','contextWindow':262144,'maxTokens':1024,'reasoningEfforts':False}]}
    d.rpc('credentials/set',{'ref':credential,'value':'local-no-auth'});credential_set=True
    d.rpc('settings/update',{'ns':'llm-pi-ai','patch':{'providers':{provider:config}}});configured=True
    cwd='/data/data/'+PKG+'/files/home/.dsh/workspaces/incoming/'+run_id
    d.shell('run-as',PKG,'mkdir','-p',cwd)
    sid=d.rpc('session/create',{'request':{'cwd':cwd,'agentPreset':'standard'}})['sessionId'];report['session_id']=sid
    d.rpc('session/rename',{'request':{'sessionId':sid,'title':'模型失败与重试验收'}})
    d.rpc('session/selectModel',{'request':{'sessionId':sid,'provider':provider,'model':'qwen38-flash-next'}})
    prompt('这是一项模型网络重试测试。不要调用工具，只回复 MODEL_RETRY_OK。')
    failed,reason=wait_turn(0)
    report['failure_reason']=reason;report['http_503_requests']=state['failed_requests']
    assert state['failed_requests']>=1 and reason.get('kind')!='completed','Expected visible failed turn after HTTP 503'
    assert 'MODEL_SERVICE_UNAVAILABLE_TEST' in json.dumps(reason),'Error reason did not retain controlled model failure'
    state['fail']=False
    prompt('服务已恢复，请重试。不要调用工具，只回复 MODEL_RETRY_OK。')
    records,retry_reason=wait_turn(1)
    texts=[]
    for event in records:
        if event.get('type')=='assistant/message':
            for block in event['data']['message']['content']:
                if block.get('type')=='text':texts.append(block.get('text',''))
    assert retry_reason.get('kind')=='completed' and any('MODEL_RETRY_OK' in t for t in texts)
    report.update(passed=True,retry_reason=retry_reason,forwarded_requests=state['forwarded_requests'],final_reply='MODEL_RETRY_OK')
except Exception as error:
    report.update(passed=False,error=str(error))
finally:
    cleanup=[]
    actions=[]
    if sid:actions.append(('session/selectModel',{'request':{'sessionId':sid,'provider':'local-qwen','model':'qwen38-flash-next'}}))
    if original_default is not None:actions.append(('settings/replace',{'ns':'agent-default-model','section':original_default}))
    if configured:actions.append(('settings/mutate',{'ns':'llm-pi-ai','ops':[{'op':'unset','path':['providers',provider]}]}))
    if credential_set:actions.append(('credentials/unset',{'ref':credential}))
    for method,payload in actions:
        try:d.rpc(method,payload)
        except Exception as error:cleanup.append(str(error))
    if port:d.command('reverse','--remove',f'tcp:{port}',check=False)
    if server:server.shutdown();server.server_close()
    d.close()
    report['temporary_provider_removed']=not cleanup and configured
    if cleanup:report.update(passed=False,cleanup_errors=cleanup)
    (ROOT/'artifacts').mkdir(exist_ok=True)
    (ROOT/'artifacts/model-retry-stability.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2))
if not report.get('passed'):raise SystemExit(1)
