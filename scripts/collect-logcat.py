#!/usr/bin/env python3
"""Capture this debug app's logcat, redacting common credential formats.

Logs may still contain user content: keep local and review before sharing.
"""
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
if len(sys.argv) != 2:
    raise SystemExit('Usage: python scripts/collect-logcat.py ADB_SERIAL')
serial = sys.argv[1]
adb = ['adb', '-s', serial]
pid = subprocess.check_output(adb + ['shell', 'pidof', 'com.dsharnessmobile.shell'], text=True).strip()
assert pid.isdigit(), 'App must be running'
log = subprocess.check_output(adb + ['logcat', '-d', '--pid=' + pid, '-t', '2000'], text=True)
log = re.sub(r'(?i)([?&]token=)[^\s&#]+', r'\1[REDACTED]', log)
log = re.sub(r'(?i)(bearer\s+)[A-Za-z0-9._~+/-]+', r'\1[REDACTED]', log)
log = re.sub(r'(?i)(["\x27]?(?:api[_-]?key|access[_-]?token|secret)["\x27]?\s*[:=]\s*)[^\s,}]+', r'\1[REDACTED]', log)
safe = re.sub(r'[^A-Za-z0-9_.-]', '_', serial)
dest = ROOT / 'logs' / ('device-' + safe + '-logcat.txt')
dest.parent.mkdir(exist_ok=True)
dest.write_text(log)
print(dest)
