#!/usr/bin/env python3
"""Accept an already installed preview; fault injection is explicit and emulator-only."""
import argparse
import datetime
import json
import subprocess
import sys
import time
from lib.dsh_device import Device, ROOT, PKG

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('serial')
parser.add_argument('--storage', action='store_true', help='Validate the shared/removable storage preview')
parser.add_argument('--debian', action='store_true', help='Validate the Debian APK baseline (includes storage adapter)')
parser.add_argument('--lifecycle', action='store_true', help='Dedicated emulator: cold start and idle engine crash')
parser.add_argument('--extended', action='store_true', help='Dedicated emulator: >5 min Agent background task and isolated HTTP failure/retry')
args = parser.parse_args()
safe = ''.join(c if c.isalnum() or c in '._-' else '_' for c in args.serial)
report = {'serial': args.serial, 'started_at': datetime.datetime.now().astimezone().isoformat(),
          'steps': [], 'passed': False}
d = Device(args.serial)
(ROOT / 'logs').mkdir(exist_ok=True)
(ROOT / 'artifacts').mkdir(exist_ok=True)

def run(name, arguments, timeout=180):
    start = time.monotonic()
    command = [sys.executable, str(ROOT / 'scripts' / name), args.serial, *arguments]
    log = ROOT / 'logs' / f'accept-{safe}-{name}.log'
    with log.open('w') as output:
        result = subprocess.run(command, stdout=output, stderr=subprocess.STDOUT, timeout=timeout, cwd=ROOT)
    report['steps'].append({'script': name, 'args': arguments, 'passed': result.returncode == 0,
                            'seconds': round(time.monotonic() - start, 2), 'log': str(log.relative_to(ROOT))})
    print(f'{name}: {"PASS" if result.returncode == 0 else "FAIL"}', flush=True)
    if result.returncode:
        raise RuntimeError(f'{name} failed; see {log.relative_to(ROOT)}')

try:
    # Validate all requested disruptive modes before running any probes.
    if args.lifecycle or args.extended:
        d.emulator_only()
    manifest_path = ROOT / ('releases/debian-preview-20260909/manifest.json' if args.debian else 'releases/storage-preview-20260908/manifest.json' if args.storage else 'releases/fs-adapter-preview-20260908/manifest.json')
    run('device-preflight.py', ['--manifest', str(manifest_path)])
    preflight = json.loads((ROOT / 'artifacts' / f'preflight-{safe}.json').read_text())
    manifest = json.loads(manifest_path.read_text())
    selected = next(x for x in manifest['files'] if x['filename'] == preflight['selected_apk'])
    package = d.shell('dumpsys', 'package', PKG)
    if not any(line.strip() == 'versionName=' + manifest['version_name'] for line in package.splitlines()):
        raise RuntimeError('Installed app version does not match preview manifest')
    if preflight['snapshot_fingerprint'] != selected['snapshot_sha256']:
        raise RuntimeError('Installed runtime fingerprint does not match this ABI preview; finish first startup')
    report.update(manifest_id=manifest['id'], apk_sha256=selected['sha256'],
                  snapshot_sha256=selected['snapshot_sha256'], physical_device=preflight['physical_device'])
    run('collect-device.py', [])
    run('http-smoke.py', [])
    run('runtime-smoke.py', [])
    run('test-fs-adapter-device.py', ['--debian'] if args.debian else ['--storage'] if args.storage else [], timeout=240)
    if args.lifecycle:
        for case in ['cold-start', 'engine-crash']:
            run('test-lifecycle.py', ['--case', case], timeout=300)
    if args.extended:
        run('test-agent-background.py', [], timeout=900)
        run('test-model-retry.py', [], timeout=600)
    report['passed'] = True
except Exception as error:
    report['error'] = str(error)
finally:
    d.close()
    dest = ROOT / 'artifacts' / f'acceptance-{safe}.json'
    dest.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))
if not report['passed']:
    raise SystemExit(1)
