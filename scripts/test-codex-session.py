#!/usr/bin/env python3
"""Real device Codex turn probe, restricted to the two disposable test sessions.

Does not read Codex credentials. Evidence contains only test-session events.
"""
import argparse
import json
import pathlib
import subprocess
import time
import uuid
from lib.dsh_device import Device

ROOT = pathlib.Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'docs/validation/2026-09-10-codex'
SESSION_ROOT = 'files/home/.dsh/sessions/--data-data-com.dsharnessmobile.shell-files-home-projects-codex-validation--/'

def events(device, session):
    data = device.read(SESSION_ROOT + session + '/session.jsonl.zstd')
    raw = subprocess.run(['zstd', '-dc'], input=data, capture_output=True, check=True).stdout
    return [json.loads(line) for line in raw.splitlines()]

def retained(rows):
    return [row for row in rows if row.get('type') in {
        'request/context', 'assistant/message', 'turn/start', 'turn/end',
        'text-chunks', 'assistant/chunk', 'relay-codex/activity',
        'approval/request', 'approval/response', 'error',
    } or 'codex' in row.get('type', '')]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('serial')
    parser.add_argument('session', type=int, choices=[0, 1])
    parser.add_argument('name')
    parser.add_argument('prompt')
    parser.add_argument('--timeout', type=int, default=150)
    parser.add_argument('--cancel-after', type=int, help='Cancel once the turn has run this many seconds')
    args = parser.parse_args()
    if not args.name.replace('-', '').replace('_', '').isalnum():
        parser.error('Evidence name must be a simple identifier')
    device = Device(args.serial)
    try:
        device.authenticate(timeout=10)
        sid = json.loads((EVIDENCE / 'sessions.json').read_text())[args.session]
        before = events(device, sid)
        last_seq = max(row.get('seq', -1) for row in before)
        device.rpc('session/prompt', {'request': {
            'sessionId': sid, 'requestId': uuid.uuid4().hex, 'mode': 'queue',
            'content': [{'type': 'text', 'text': args.prompt}],
        }})
        start = time.monotonic()
        cancelled = False
        while time.monotonic() - start < args.timeout:
            time.sleep(2)
            rows = [row for row in events(device, sid) if row.get('seq', row.get('seq0', -1)) > last_seq]
            if any(row.get('type') == 'turn/end' for row in rows):
                break
            if args.cancel_after is not None and not cancelled and time.monotonic() - start >= args.cancel_after:
                device.rpc('session/cancel', {'request': {'sessionId': sid}})
                cancelled = True
        else:
            raise RuntimeError('Test turn did not complete; inspect/cancel before restarting the app')
        result = {'sessionId': sid, 'elapsedSeconds': round(time.monotonic() - start, 2), 'events': retained(rows)}
        (EVIDENCE / (args.name + '.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2))
        print(json.dumps({'elapsedSeconds': result['elapsedSeconds'], 'events': len(rows),
                          'messages': [r['data']['message']['content'] for r in rows if r.get('type') == 'assistant/message'],
                          'end': [r['data'] for r in rows if r.get('type') == 'turn/end']}, ensure_ascii=False), flush=True)
    finally:
        device.close()

if __name__ == '__main__':
    main()
