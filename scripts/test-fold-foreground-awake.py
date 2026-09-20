"""Read-only idle verification; does not modify device timeout or inject touch."""
import subprocess,time,json,re,pathlib,sys
serial=sys.argv[1]
assert serial and not serial.startswith('-'), 'Explicit ADB serial required'
assert subprocess.check_output(['adb','-s',serial,'shell','getprop','ro.product.device'],text=True).strip()=='lhasa', 'Fold device required'
def shell(*args):return subprocess.check_output(['adb','-s',serial,'shell',*args],text=True)
timeout=int(shell('settings','get','system','screen_off_timeout').strip())
assert 0<timeout<=120000,'Use a bounded observation, not a global timeout change'
def sample():
 p=shell('dumpsys','power')
 return {'at':time.monotonic(),'awake':'mWakefulness=Awake' in p,
  'lastUserActivity':re.findall(r'mLastUserActivityTime(?:\(excludingAttention\))?=(\d+)',p),
  'stayOnWindows':re.findall(r'mHoldScreenWindow=([^\n]+)',shell('dumpsys','window'))}
trace=[sample()];assert trace[0]['lastUserActivity'],'No user-activity timestamp available'
print('READY: idle screen observation',flush=True)
deadline=time.monotonic()+timeout/1000+12
while time.monotonic()<deadline:
 time.sleep(5);trace.append(sample())
result={'systemTimeoutMs':timeout,'observedSeconds':trace[-1]['at']-trace[0]['at'],
 'alwaysAwake':all(s['awake'] for s in trace),'userActivityUnchanged':all(s['lastUserActivity']==trace[0]['lastUserActivity'] for s in trace),
 'timeoutUnchanged':int(shell('settings','get','system','screen_off_timeout').strip())==timeout,'trace':trace}
out=pathlib.Path('docs/validation/2026-09-10-fold-gradient/dual/foreground-awake.json');out.write_text(json.dumps(result,indent=2))
print(json.dumps({k:v for k,v in result.items() if k!='trace'},indent=2))
