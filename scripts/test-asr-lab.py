#!/usr/bin/env python3
"""Run the APK's 1 warmup + 3-repeat Chinese/English benchmark and sample RSS."""
import argparse
import json
from pathlib import Path
import subprocess
import time

p=argparse.ArgumentParser()
p.add_argument('serial')
p.add_argument('--model',choices=['1.7B','0.6B'],required=True)
p.add_argument('--backend',choices=['cpu','vulkan'],required=True)
p.add_argument('--attach',action='store_true')
p.add_argument('--silence',action='store_true',help='Also verify one second of digital silence yields no visible transcript')
p.add_argument('--output',type=Path,required=True)
args=p.parse_args()
args.output.mkdir(parents=True,exist_ok=True)
pkg='com.dsharnessmobile.asrlab'
def adb(*parts,check=True):
    result=subprocess.run(['adb','-s',args.serial,*parts],capture_output=True,text=True,timeout=20)
    if check and result.returncode:raise RuntimeError(result.stderr or result.stdout)
    return result.stdout
previous_run=None
if not args.attach:
    try:previous_run=json.loads(adb('shell','run-as',pkg,'cat','files/latest.json',check=False)).get('runId')
    except json.JSONDecodeError:pass
    adb('shell','am','force-stop',pkg)
    adb('shell','am','start','-n',pkg+'/.MainActivity','--es','mode','bench','--es','model',args.model,'--es','backend',args.backend,'--ez','silence',str(args.silence).lower())
start=time.monotonic();samples=[];report=None;complete=False
while time.monotonic()-start<900:
    try:
        raw=adb('shell','run-as',pkg,'cat','files/latest.json',check=False)
        current=json.loads(raw)
        if current.get('model')==args.model and current.get('backendRequested')==args.backend and current.get('runId')!=previous_run:
            report=current
            done=adb('shell','run-as',pkg,'cat','files/bench-done.json',check=False)
            try: complete=json.loads(done).get('runId')==report['runId']
            except json.JSONDecodeError:pass
            errors=[r for r in report['results'] if 'error' in r]
            if errors:break
        rows=adb('shell','ps','-A','-o','PID,UID,RSS,NAME',check=False).splitlines()
        own=[r.split() for r in rows if r.strip().endswith(pkg)]
        uid=own[0][1] if own else None
        procs=[r.split() for r in rows if len(r.split())==4 and r.split()[1]==uid]
        samples.append({'elapsedSeconds':time.monotonic()-start,'processes':procs,'rssKiB':sum(int(r[2]) for r in procs)})
        if complete:break
    except (RuntimeError,subprocess.TimeoutExpired,json.JSONDecodeError) as e:
        samples.append({'elapsedSeconds':time.monotonic()-start,'probeError':str(e)})
    time.sleep(2)
if report:
    (args.output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    log=adb('shell','run-as',pkg,'cat','files/'+report['runId']+'-engine.log',check=False)
    (args.output/'engine.log').write_text(log)
(args.output/'memory.json').write_text(json.dumps(samples,indent=2)+'\n')
receipt={'complete':complete,'model':args.model,'backend':args.backend,'monitorSeconds':time.monotonic()-start,
         'peakSampledRssKiB':max((s.get('rssKiB',0) for s in samples),default=0)}
(args.output/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt))
if not complete:raise SystemExit('Benchmark incomplete: inspect report and engine log')
if args.silence:
    silence=[r for r in report['results'] if r.get('label')=='silence-1s']
    if len(silence)!=1 or silence[0].get('text')!='' or silence[0].get('firstTextMs') is not None or silence[0].get('finishReason')!='stop':
        raise SystemExit('Silence regression failed: inspect report')
for lang in ['zh','en']:
    runs=[r for r in report['results'] if r.get('label','').startswith('sample-'+lang) and not r.get('warmup')]
    if len(runs)!=3 or any(not r.get('text') or r.get('finishReason')!='stop' for r in runs):
        raise SystemExit('Invalid output or truncated benchmark')
    import statistics
    print(lang,'median seconds',statistics.median(r['requestMs']/1000 for r in runs),'median RTF',statistics.median(r['rtf'] for r in runs), 'text',runs[-1]['text'])
