#!/usr/bin/env python3
"""Read an existing ASR session and sample RSS; never starts/stops recording."""
import argparse, json, subprocess, time, statistics
from pathlib import Path

p=argparse.ArgumentParser()
p.add_argument('serial')
p.add_argument('--seconds',type=float,default=180)
p.add_argument('--output',type=Path,required=True)
args=p.parse_args();args.output.mkdir(parents=True,exist_ok=True)
pkg='com.dsharnessmobile.asrlab'
def adb(*parts):
    return subprocess.check_output(['adb','-s',args.serial,*parts],text=True,timeout=15)
start=time.monotonic();samples=[];seen=set();doc=None;rows=[]
try:
    while time.monotonic()-start<args.seconds:
        try:
            doc=json.loads(adb('shell','run-as',pkg,'cat','files/latest.json'))
            rows=[r for r in doc['results'] if r.get('label','').startswith('mic-')]
            args.output.joinpath('report.json').write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n')
            for r in rows:
                identity=(doc['runId'],r['label'])
                if identity not in seen:
                    seen.add(identity);print(json.dumps(r,ensure_ascii=False),flush=True)
            ps=[line.split() for line in adb('shell','ps','-A','-o','PID,UID,RSS,NAME').splitlines()]
            own=next((r for r in ps if len(r)==4 and r[3]==pkg),None)
            procs=[r for r in ps if own and len(r)==4 and r[1]==own[1]]
            samples.append({'elapsedSeconds':time.monotonic()-start,'processes':procs,
                            'rssKiB':sum(int(r[2]) for r in procs)})
        except (ValueError,subprocess.SubprocessError) as e:
            samples.append({'elapsedSeconds':time.monotonic()-start,'error':str(e)})
        args.output.joinpath('memory.json').write_text(json.dumps(samples,indent=2)+'\n')
        time.sleep(2)
finally:
    summary={'observedSegments':len(rows),'monitorSeconds':time.monotonic()-start,
             'peakSampledRssKiB':max((s.get('rssKiB',0) for s in samples),default=0),
             'note':'Read-only observer. Existing mic records may predate memory observation; no claim of full-session peak.'}
    for field in ['requestMs','rtf','firstTextMs','queueMs','captureToFirstTextMs','captureEndToFinalMs']:
        values=[r[field] for r in rows if isinstance(r.get(field),(int,float))]
        if values:summary[field]={'median':statistics.median(values),'max':max(values)}
    args.output.joinpath('summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps(summary),flush=True)
