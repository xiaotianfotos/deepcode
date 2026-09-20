#!/usr/bin/env python3
"""Exercise the Debian plugin through the APK's actual model/tool pipeline."""
import argparse
import json
import time
import uuid
from pathlib import Path
from lib.dsh_device import Device, ROOT

p = argparse.ArgumentParser()
p.add_argument('serial')
p.add_argument('--root', required=True)
p.add_argument('--prompt-file', required=True)
p.add_argument('--timeout', type=int, default=600)
p.add_argument('--session')
p.add_argument('--label', default='debian')
a = p.parse_args()
d = Device(a.serial)
run = a.label + '-' + uuid.uuid4().hex[:8]
report = {'serial': a.serial, 'run_id': run, 'root': a.root}
try:
    d.authenticate()
    sid = a.session or d.rpc('session/create', {'request': {'cwd': a.root, 'agentPreset': 'standard'}})['sessionId']
    report['session_id'] = sid
    d.rpc('session/rename', {'request': {'sessionId': sid, 'title': 'Debian 验收 ' + run}})
    d.rpc('session/selectModel', {'request': {'sessionId': sid, 'provider': 'local-qwen', 'model': 'qwen38-flash-next'}})
    before = len(d.session_records(sid))
    d.rpc('session/prompt', {'request': {'sessionId': sid, 'requestId': run, 'mode': 'queue',
        'content': [{'type': 'text', 'text': Path(a.prompt_file).read_text()}]}})
    deadline = time.monotonic() + a.timeout
    while time.monotonic() < deadline:
        time.sleep(2)
        row = next(x for x in d.rpc('session/list', {'_request': {}})['items'] if x['sessionId'] == sid)
        if row['running']: continue
        events = [r.get('event', {}) for r in d.session_records(sid)][before:]
        if any(e.get('type') == 'turn/end' for e in events): break
    else: raise RuntimeError('Agent timeout; inspect session before another test')
    report['tools'] = [e['data'].get('name') for e in events if e.get('type') == 'tool/call']
    texts = [b.get('text', '') for e in events if e.get('type') == 'assistant/message'
             for b in e['data']['message']['content'] if b.get('type') == 'text']
    report['final_text'] = texts[-1] if texts else ''
    # Test prompts contain only disposable fixtures. Save tool results, never
    # hidden reasoning, engine logs, model settings or credentials.
    report['results'] = [e['data'] for e in events if e.get('type') == 'tool/result']
    report['passed'] = report['final_text'].strip() == 'DEBIAN_TEST_OK'
except Exception as error:
    report.update(passed=False, error=str(error))
finally:
    d.close()
    (ROOT/'artifacts'/f'{run}.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({k:v for k,v in report.items() if k!='results'}, ensure_ascii=False, indent=2), flush=True)
if not report.get('passed'): raise SystemExit(1)
