#!/usr/bin/env python3
"""Verify installed overlay bytes; run the same tests against APK-provided code.

Only the test file is copied into the dedicated debug app, never replacement lib.
"""
import hashlib
import io
import json
import pathlib
import subprocess
import sys
import tarfile
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
serial = sys.argv[1] if len(sys.argv) > 1 else 'emulator-5580'
adb = ['adb', '-s', serial]
pkg = 'com.dsharnessmobile.shell'
abi = subprocess.check_output(adb + ['shell', 'getprop', 'ro.product.cpu.abi'], text=True).strip()
abi = {'x86_64': 'x86_64', 'arm64-v8a': 'arm64'}[abi]
debian = '--debian' in sys.argv[2:]
storage = '--storage' in sys.argv[2:] or debian
receipt = json.loads((ROOT / ('.tools/debian-adapter' if debian else '.tools/storage-adapter' if storage else '.tools/fs-adapter') / f'overlay-{abi}.json').read_text())
for path, expected in receipt['overlay_files'].items():
    actual = subprocess.check_output(adb + ['exec-out', 'run-as', pkg, 'cat', 'files/' + path])
    assert hashlib.sha256(actual).hexdigest() == expected, 'Installed file mismatch: ' + path
installed_core = subprocess.check_output(adb + ['exec-out', 'run-as', pkg, 'cat',
    'files/usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-fs-local/lib/index.js'])
reference = ROOT / 'android-shell/plugins/dsh-android-fs/node_modules/@deepseek-ai/dsh-fs-local/lib/index.js'
assert installed_core == reference.read_bytes(), 'Official fs-local differs from pinned npm package'
plugin_root = 'files/home/.dsh/profiles/web/node_modules/@dsh-android/dsh-android-fs'
buffer = io.BytesIO()
with tarfile.open(fileobj=buffer, mode='w') as archive:
    archive.add(ROOT / 'android-shell/plugins/dsh-android-fs/tests/adapter.test.mjs', arcname='tests/adapter.test.mjs')
    if storage: archive.add(ROOT / 'android-shell/plugins/dsh-android-fs/tests/shared.test.mjs', arcname='tests/shared.test.mjs')
subprocess.run(adb + ['shell', '-T', 'run-as', pkg, 'tar', '-xf', '-', '-C', plugin_root], input=buffer.getvalue(), check=True)
script = "await import('file:///data/data/" + pkg + '/' + plugin_root + "/tests/adapter.test.mjs');\n"
if storage: script += "await import('file:///data/data/" + pkg + '/' + plugin_root + "/tests/shared.test.mjs');\n"
with tempfile.NamedTemporaryFile(mode='w', suffix='.mjs') as probe:
    probe.write(script)
    probe.flush()
    result = subprocess.run([sys.executable, str(ROOT / 'scripts/device-node.py'), serial, probe.name], capture_output=True, text=True)
(ROOT / 'logs').mkdir(exist_ok=True)
safe_serial = ''.join(c if c.isalnum() or c in '._-' else '_' for c in serial)
log = ROOT / 'logs' / f'fs-adapter-tests-{safe_serial}.log'
log.write_text(result.stdout + result.stderr)
print(result.stdout + result.stderr)
count = 14 if storage else 10
assert result.returncode == 0 and f'pass {count}' in result.stdout and 'fail 0' in result.stdout
(ROOT / 'artifacts').mkdir(exist_ok=True)
(ROOT / 'artifacts' / f'fs-adapter-tests-{safe_serial}.json').write_text(json.dumps({
    'serial': serial, 'abi': abi, 'overlay_files_verified': len(receipt['overlay_files']),
    'official_fs_local_unmodified': True, 'tests': count, 'passed': count, 'failed': 0,
    'log': str(log), 'snapshot_sha256': receipt['snapshot_sha256']}, indent=2))
