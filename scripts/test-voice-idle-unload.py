#!/usr/bin/env python3
"""Observe existing warm ASR process exit; does not start microphone or alter settings."""
import json,subprocess,sys,time
from pathlib import Path
serial,folder=sys.argv[1:];out=Path(folder);out.mkdir(parents=True,exist_ok=True)
def pids():
 rows=subprocess.check_output(['adb','-s',serial,'shell','ps','-A','-o','PID,UID,NAME'],text=True)
 fields=[line.split() for line in rows.splitlines() if len(line.split())==3]
 uid=next(row[1] for row in fields if row[2]=='com.dsharnessmobile.shell')
 return [int(row[0]) for row in fields if row[1]==uid and row[2]=='libdsh_voice_server.so']
samples=[];begin=time.monotonic();initial=pids()
if not initial:raise SystemExit('No warm process to observe; run a microphone test first')
for _ in range(31):
 current=pids();samples.append({'elapsedSeconds':round(time.monotonic()-begin,3),'pids':current})
 if not current:break
 time.sleep(5)
report={'initialPids':initial,'passed':not samples[-1]['pids'],'samples':samples,'clockOrigin':'monitor start after warm engine became idle; not stop-button timestamp'}
(out/'idle-unload.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
if not report['passed']:raise SystemExit('ASR idle unload did not occur within observation window')
