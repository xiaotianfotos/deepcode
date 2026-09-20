#!/usr/bin/env python3
"""Fill a WebView field via the app's test IME, avoiding Gboard autocorrection.

Only for the dedicated emulator. Label lookup uses fresh UIAutomator state.
"""
import re
import shlex
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

adb = ['adb', '-s', 'emulator-5580']
label, text = sys.argv[1:3]
subprocess.run(adb + ['shell', 'uiautomator', 'dump', '/sdcard/dsh-ui.xml'], check=True, capture_output=True)
nodes = list(ET.fromstring(subprocess.check_output(adb + ['exec-out', 'cat', '/sdcard/dsh-ui.xml'])).iter('node'))
if label == '--composer':
    fields = [n for n in nodes if n.get('class') == 'android.widget.EditText']
    def area(n):
        x1,y1,x2,y2 = map(int,re.findall(r'\d+',n.get('bounds')))
        return (x2-x1)*(y2-y1)
    field = max(fields, key=area)
else:
    index = next(i for i,n in enumerate(nodes) if n.get('text') == label)
    field = next(n for n in nodes[index+1:] if n.get('class') == 'android.widget.EditText')
x1,y1,x2,y2 = map(int,re.findall(r'\d+',field.get('bounds')))
assert x2>x1 and y2>y1, 'Field is outside visible viewport'
subprocess.run(adb+['shell','input','tap',str((x1+x2)//2),str((y1+y2)//2)],check=True)
time.sleep(0.3)
receiver='com.dsharnessmobile.shell/.AdbKeyboardReceiver'
subprocess.run(adb+['shell','am','broadcast','-n',receiver,'-a','ADB_CLEAR_TEXT'],check=True,capture_output=True)
subprocess.run(adb+['shell','am','broadcast','-n',receiver,'-a','ADB_INPUT_TEXT','--es','msg',shlex.quote(text)],check=True,capture_output=True)
print('Filled', label)
