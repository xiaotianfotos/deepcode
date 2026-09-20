#!/usr/bin/env python3
"""Small adb/UIAutomator helper. Actions use freshly observed accessible labels."""
import pathlib
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
adb = ['adb', '-s', 'emulator-5580']
subprocess.run(adb + ['shell', 'uiautomator', 'dump', '/sdcard/dsh-ui.xml'], check=True, capture_output=True)
xml = subprocess.check_output(adb + ['exec-out', 'cat', '/sdcard/dsh-ui.xml'])
(ROOT / 'artifacts/current-ui.xml').write_bytes(xml)
nodes = list(ET.fromstring(xml).iter('node'))
if len(sys.argv) > 1:
    label = sys.argv[1]
    matches = [n for n in nodes if label in (n.get('text'), n.get('content-desc'))
               and n.get('bounds') != '[0,0][0,0]']
    if not matches:
        raise SystemExit('Visible label not found: ' + label)
    matches.sort(key=lambda n: n.get('clickable') != 'true')
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', matches[0].get('bounds')))
    subprocess.run(adb + ['shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2)], check=True)
    print('Tapped', label)
else:
    for n in nodes:
        label = n.get('text') or n.get('content-desc')
        if label and n.get('bounds') != '[0,0][0,0]':
            print(label[:240], n.get('bounds'), n.get('class'))
