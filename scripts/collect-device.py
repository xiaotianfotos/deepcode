#!/usr/bin/env python3
"""Collect device metadata only; deliberately excludes prompts and credentials."""
import datetime
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
if len(sys.argv) != 2:
    raise SystemExit('Usage: python scripts/collect-device.py ADB_SERIAL')
serial = sys.argv[1]
adb = ['adb', '-s', serial]
def shell(*args):
    return subprocess.check_output(adb + ['shell', *args], text=True, timeout=20).strip()
properties = ['ro.product.manufacturer', 'ro.product.model', 'ro.product.cpu.abilist',
              'ro.build.version.release', 'ro.build.version.sdk', 'ro.build.version.incremental',
              'ro.mi.os.version.name', 'ro.miui.ui.version.name']
report = {'serial': serial, 'collected_at': datetime.datetime.now().astimezone().isoformat(),
          'properties': {key: shell('getprop', key) for key in properties},
          'page_size': shell('getconf', 'PAGE_SIZE'), 'display': shell('wm', 'size'),
          'webview': shell('dumpsys', 'webviewupdate')}
package = shell('dumpsys', 'package', 'com.dsharnessmobile.shell')
report['app_version'] = [line.strip() for line in package.splitlines()
                         if 'versionName=' in line or 'versionCode=' in line]
safe = re.sub(r'[^A-Za-z0-9_.-]', '_', serial)
dest = ROOT / 'artifacts' / ('device-' + safe + '.json')
dest.parent.mkdir(exist_ok=True)
dest.write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(dest)
