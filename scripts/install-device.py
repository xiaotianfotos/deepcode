#!/usr/bin/env python3
"""Install a verified local build on an explicitly selected device; retain app data."""
import hashlib
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
if len(sys.argv) not in (2, 3) or (len(sys.argv) == 3 and sys.argv[2] not in ('--fs-adapter', '--storage', '--debian')):
    raise SystemExit('Usage: python scripts/install-device.py ADB_SERIAL [--fs-adapter|--storage|--debian]')
serial = sys.argv[1]
adb = ['adb', '-s', serial]
if len(sys.argv) == 3:
    manifest_path = ROOT / ('releases/debian-preview-20260909/manifest.json' if '--debian' in sys.argv[2:] else 'releases/storage-preview-20260908/manifest.json' if '--storage' in sys.argv[2:] else 'releases/fs-adapter-preview-20260908/manifest.json')
    subprocess.run([sys.executable, str(ROOT / 'scripts/device-preflight.py'), serial, '--manifest', str(manifest_path)], check=True)
    safe = ''.join(c if c.isalnum() or c in '._-' else '_' for c in serial)
    preflight = json.loads((ROOT / 'artifacts' / f'preflight-{safe}.json').read_text())
    manifest = json.loads(manifest_path.read_text())
    item = next(x for x in manifest['files'] if x['filename'] == preflight['selected_apk'])
    apk = ROOT / 'artifacts' / item['filename']
    expected = item['sha256']
else:
    abi = subprocess.check_output(adb + ['shell', 'getprop', 'ro.product.cpu.abilist'], text=True).strip()
    if abi.split(',')[0] != 'arm64-v8a':
        raise SystemExit('Historical baseline installer expects a native ARM64 device, got ' + abi)
    apk = ROOT / 'artifacts/dsh-v0.13.3-local-baseline-arm64.apk'
    expected = '5c7e4781f44d7fd2831df6927bb441bc3c5ff58ca544580dcf88ca8057b2f672'
with apk.open('rb') as stream:
    if hashlib.file_digest(stream, 'sha256').hexdigest() != expected:
        raise SystemExit('APK checksum mismatch')
subprocess.run(adb + ['install', '-r', '-t', str(apk)], check=True)
subprocess.run(adb + ['shell', 'am', 'start', '-n', 'com.dsharnessmobile.shell/.MainActivity'], check=True)
