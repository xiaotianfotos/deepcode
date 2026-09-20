#!/usr/bin/env python3
"""Development probe: DeepCode's own paired ADB, limited to our counter demo."""
import argparse,hashlib,json,os,pathlib,subprocess,xml.etree.ElementTree as ET
FILES=pathlib.Path('/data/user/0/com.dsharnessmobile.shell/files')
PREFIX=FILES/'usr';PROJECT=pathlib.Path('/storage/emulated/0/work/phone-app-lab')
PACKAGE='com.deepcode.selfhost.counter'
p=argparse.ArgumentParser();p.add_argument('operation',choices=['status','install','launch','capture','logs','return']);p.add_argument('--revision',type=int,choices=[1,2],default=1);p.add_argument('--self-test',action='store_true');args=p.parse_args()
preferences=ET.parse(FILES.parent/'shared_prefs/dsh-adb.xml').getroot()
values={n.attrib['name']:n.attrib.get('value',n.text) for n in preferences}
for name in ['allowSwitch','paired','fullAccess']:
 if values.get(name)!='true':raise RuntimeError('DeepCode ADB authorization is not enabled: '+name)
port=int(values.get('connectPort','0'));assert 1<=port<=65535
# Reuse the app's own pairing identity; no computer credentials are imported.
env=os.environ.copy();env['HOME']=str(FILES/'home');env['PATH']=str(PREFIX/'bin')+':/system/bin';env['LD_LIBRARY_PATH']=str(PREFIX/'lib');env['OPENSSL_CONF']=str(PREFIX/'etc/tls/openssl.cnf')
base=[str(PREFIX/'bin/adb')]
def adb(argv,timeout=35,check=True):
 r=subprocess.run(base+argv,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
 if check and r.returncode:raise RuntimeError(r.stderr.decode(errors='replace')[-2000:])
 return r.stdout
adb(['connect',f'127.0.0.1:{port}'])
base+=['-s',f'127.0.0.1:{port}']
def shell(*argv,**kwargs):return adb(['shell',*argv],**kwargs).decode(errors='replace').strip()
identity=shell('getprop','ro.product.device')
if identity!='lhasa':raise RuntimeError('Refusing unexpected ADB device: '+identity)
if args.operation=='status':
 print(json.dumps({'device':identity,'target':'local phone','shellIdentity':shell('id'),'hostArchitecture':os.uname().machine}))
elif args.operation=='install':
 apk=PROJECT/'app.apk';assert apk.is_file()
 # The builder's aapt receipt ties this fixed test package to the exact APK.
 receipt=json.loads((PROJECT/'build-receipt.json').read_text())
 assert receipt['package']==PACKAGE
 assert hashlib.file_digest(apk.open('rb'),'sha256').hexdigest()==receipt['sha256']
 print(adb(['install','-r','-t',str(apk)],timeout=120).decode())
 print(shell('pm','path',PACKAGE))
elif args.operation=='launch':
 print(shell('am','start','-W','-n',PACKAGE+'/.MainActivity','--ei','expected_revision',str(args.revision),'--ez','self_test',str(args.self_test).lower()))
elif args.operation=='capture':
 png=adb(['exec-out','screencap','-p']);start=png.find(b'\x89PNG\r\n\x1a\n');assert start>=0
 out=PROJECT/f'phone-revision-{args.revision}.png';out.write_bytes(png[start:]);print(out)
elif args.operation=='logs':
 pid=shell('pidof',PACKAGE)
 if not pid:raise RuntimeError('Demo is not running')
 print(adb(['logcat','-d','--pid='+pid.split()[0],'-s','PhoneAppLab:I','*:S']).decode(errors='replace')[-8000:])
elif args.operation=='return':
 print(shell('am','start','-n','com.dsharnessmobile.shell/.MainActivity'))
