#!/usr/bin/env python3
"""Create isolated fold acceptance sessions on the dedicated emulator only."""
import json,sys,os
MODEL_BASE_URL = os.environ["DSH_TEST_MODEL_BASE_URL"]
from pathlib import Path
from lib.dsh_device import Device,PKG
serial,folder=sys.argv[1:];d=Device(serial);out=Path(folder);out.mkdir(parents=True,exist_ok=True)
try:
 d.emulator_only();d.authenticate()
 provider='fold-validation';model='qwen38-flash-next';ref='DSH_FOLD_VALIDATION_LOCAL'
 d.rpc('credentials/set',{'ref':ref,'value':'local-no-auth'})
 d.rpc('settings/update',{'ns':'llm-pi-ai','patch':{'providers':{provider:{'displayName':'Fold validation LAN','api':'openai-completions','baseURL':MODEL_BASE_URL,'apiKeyEnv':ref,'models':[{'id':model,'name':'Fold validation','contextWindow':262144,'maxTokens':2048,'reasoningEfforts':False}]}}}})
 cwd='/data/data/'+PKG+'/files/home/projects/fold-validation'
 d.shell('run-as',PKG,'mkdir','-p',cwd)
 ids=[]
 for letter in 'ABCD':
  sid=d.rpc('session/create',{'request':{'cwd':cwd,'agentPreset':'standard'}})['sessionId']
  d.rpc('session/rename',{'request':{'sessionId':sid,'title':'折叠验收 '+letter}})
  d.rpc('session/selectModel',{'request':{'sessionId':sid,'provider':provider,'model':model}})
  ids.append(sid)
 (out/'sessions.json').write_text(json.dumps(ids,indent=2)+'\n');print(json.dumps({'created':len(ids)}))
finally:d.close()
