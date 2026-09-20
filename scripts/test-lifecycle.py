#!/usr/bin/env python3
"""Controlled lifecycle checks; emulator-only, refuses an active agent/snapshot."""
import argparse
import json
import time
from lib.dsh_device import Device, ROOT, PKG

parser=argparse.ArgumentParser()
parser.add_argument('serial')
parser.add_argument('--case',choices=['cold-start','engine-crash'],required=True)
args=parser.parse_args()
device=Device(args.serial)
report={'case':args.case,'serial':args.serial,'physical_device_tested':False}
try:
    device.emulator_only()
    device.authenticate()
    sessions=device.rpc('session/list',{'_request':{}})['items']
    if any(s.get('running') for s in sessions):
        raise RuntimeError('Active agent detected; refusing fault injection')
    before_sessions=sorted(s['sessionId'] for s in sessions)
    tracked=['files/home/.dsh/settings.yaml',
             'files/home/.dsh/workspaces/incoming/android-e2e/adapter-created.json']
    before_files={p:device.file_digest(p) for p in tracked if device.exists(p)}
    if len(before_files)!=len(tracked):
        raise RuntimeError('Expected baseline persistence files missing')
    before_app=device.app_pid()
    before_engine=device.engine_pids()
    if len(before_engine)!=1:
        raise RuntimeError('Expected exactly one owned engine')
    report.update(before_app_pid=before_app,before_engine_pids=before_engine)
    start=time.monotonic()
    if args.case=='cold-start':
        device.shell('am','force-stop',PKG)
        device.shell('am','start','-n',PKG+'/.MainActivity')
    else:
        # Revalidate exact ownership immediately before signaling the selected child.
        if device.engine_pids()!=before_engine:
            raise RuntimeError('Engine identity changed before fault injection')
        device.shell('run-as',PKG,'kill','-9',str(before_engine[0]))
        # Wait for a replacement, not a lingering response from the previous process.
        deadline=time.monotonic()+120
        while time.monotonic()<deadline:
            pids=device.engine_pids()
            if len(pids)==1 and pids!=before_engine and device.status()==401:
                break
            time.sleep(1)
        else:
            raise RuntimeError('Watchdog did not recover the engine within 120 seconds')
    device.authenticate(timeout=120)
    elapsed=round(time.monotonic()-start,2)
    after_sessions=sorted(s['sessionId'] for s in device.rpc('session/list',{'_request':{}})['items'])
    after_files={p:device.file_digest(p) for p in tracked}
    after_engine=device.engine_pids()
    after_app=device.app_pid()
    assert before_sessions==after_sessions,'Session identities changed'
    assert before_files==after_files,'Persistent settings/file bytes changed'
    assert len(after_engine)==1 and after_engine!=before_engine,'Engine was not replaced exactly once'
    assert (after_app==before_app) == (args.case=='engine-crash'),'Unexpected app process identity'
    report.update(passed=True,recovery_seconds=elapsed,after_app_pid=after_app,
                  after_engine_pids=after_engine,sessions_preserved=len(after_sessions),
                  persistent_files_sha256=after_files,unauthenticated_http=401)
except Exception as error:
    report.update(passed=False,error=str(error))
finally:
    device.close()
    dest=ROOT/'artifacts'/f'lifecycle-{args.case}.json'
    dest.parent.mkdir(exist_ok=True)
    dest.write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2))
if not report.get('passed'):
    raise SystemExit(1)
