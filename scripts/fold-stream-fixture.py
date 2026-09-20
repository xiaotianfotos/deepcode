#!/usr/bin/env python3
"""Deterministic OpenAI SSE fixture, never a model performance benchmark."""
import http.server,json,threading,time,sys,uuid
from lib.dsh_device import Device
serial,sid,marker=sys.argv[1:];d=Device(serial);d.emulator_only();provider='fold-validation';requests=0
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):
  global requests
  self.rfile.read(int(self.headers.get('Content-Length','0')));requests+=1
  self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
  def send(delta,finish=None):
   chunk={'id':'fold-fixture','object':'chat.completion.chunk','created':int(time.time()),'model':'qwen38-flash-next','choices':[{'index':0,'delta':delta,'finish_reason':finish}]}
   self.wfile.write(('data: '+json.dumps(chunk)+'\n\n').encode());self.wfile.flush()
  send({'role':'assistant'})
  for n in range(1,101):send({'content':f'{n}. 折叠连续性测试文本。\n'});time.sleep(.10)
  send({'content':marker});send({},'stop');self.wfile.write(b'data: [DONE]\n\n');self.wfile.flush()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);port=server.server_port
original=None
try:
 original=next(n['user'] for n in d.rpc('settings/describe',{})['namespaces'] if n['ns']=='llm-pi-ai')['providers'][provider]
 config={**original,'baseURL':f'http://127.0.0.1:{port}/v1','retryPolicy':{'mode':'normal','maxRetries':0}}
 d.command('reverse',f'tcp:{port}',f'tcp:{port}');threading.Thread(target=server.serve_forever,daemon=True).start()
 d.rpc('settings/update',{'ns':'llm-pi-ai','patch':{'providers':{provider:config}}})
 previous=max([r['event']['seq'] for r in d.session_records(sid) if r['type']=='event'] or [-1])
 d.rpc('session/prompt',{'request':{'sessionId':sid,'requestId':uuid.uuid4().hex,'mode':'queue','content':[{'type':'text','text':'流式传输测试：请返回一组编号列表。此测试使用可控响应服务。'}]}})
 print('READY',flush=True)
 for _ in range(90):
  events=[r['event'] for r in d.session_records(sid) if r['type']=='event' and r['event']['seq']>previous and r['event']['type']=='turn/end']
  if events:
   reason=events[-1]['data']['reason'];assert reason['kind']=='completed',reason;assert requests==1,requests
   print(json.dumps({'completed':True,'requests':requests,'source':'deterministic SSE fixture'}),flush=True);break
  time.sleep(.5)
 else:raise RuntimeError('Fixture turn timed out')
finally:
 if original:d.rpc('settings/update',{'ns':'llm-pi-ai','patch':{'providers':{provider:original}}})
 d.command('reverse','--remove',f'tcp:{port}',check=False);server.shutdown();d.close()
