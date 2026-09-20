#!/usr/bin/env python3
"""Build on this Android host and debug via DeepCode's own paired loopback ADB."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import xml.etree.ElementTree as ET
from device_runtime import FILES, PREFIX, debian

SCRIPTS = Path(__file__).resolve().parent
HOST_PACKAGE = 'com.dsharnessmobile.shell'

def environment():
    env = os.environ.copy()
    env.update(HOME=str(FILES/'home'), PATH=str(PREFIX/'bin')+':/system/bin',
               LD_LIBRARY_PATH=str(PREFIX/'lib'), OPENSSL_CONF=str(PREFIX/'etc/tls/openssl.cnf'))
    return env

def run(argv, timeout=40):
    result = subprocess.run([str(x) for x in argv], env=environment(), capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError((result.stderr+result.stdout).decode(errors='replace')[-3000:])
    return result.stdout

def connected_adb():
    prefs = FILES.parent/'shared_prefs/dsh-adb.xml'
    if not prefs.exists():
        raise RuntimeError('请在 DeepCode 设置 → 开发者选项 → 安卓调试授权完成本应用的无线调试配对。电脑配对不能代替。')
    values = {n.get('name'):n.get('value',n.text) for n in ET.parse(prefs).getroot()}
    if any(values.get(k)!='true' for k in ('allowSwitch','paired','fullAccess')):
        raise RuntimeError('DeepCode 的允许访问、配对、完全访问尚未全部启用；请检查应用内安卓调试授权。')
    port = int(values.get('connectPort','0'))
    if not 1 <= port <= 65535:
        raise RuntimeError('缺少有效连接端口；在 DeepCode 安卓调试授权中重新发现连接。')
    binary = PREFIX/'bin/adb'
    target = '127.0.0.1:'+str(port)
    run([binary,'connect',target])
    base = [binary,'-s',target]
    local = run(['/system/bin/getprop','ro.product.device']).strip()
    remote = run(base+['shell','getprop','ro.product.device']).strip()
    if not local or remote != local:
        raise RuntimeError('ADB 目标与本机设备身份不符')
    return base, local.decode()

def shell(base, *args, timeout=40):
    # adb shell joins argv; quote every remote argument, including text inputs.
    return run(base+['shell',shlex.join([str(a) for a in args])], timeout)

def project_package(project):
    package = ET.parse(project/'AndroidManifest.xml').getroot().get('package','')
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+',package):
        raise ValueError('项目 Manifest 包名无效')
    if package == HOST_PACKAGE:
        raise ValueError('开发辅助工具不覆盖 DeepCode 自身')
    return package

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('operation', choices=['doctor','build','install','launch','capture','logs','ui','tap','key','text','return'])
    p.add_argument('--project',type=Path)
    p.add_argument('--output',type=Path)
    p.add_argument('--activity',default='.MainActivity')
    p.add_argument('--self-test',action='store_true')
    p.add_argument('--revision',type=int)
    p.add_argument('--tag',default='AndroidAppDev')
    p.add_argument('--x',type=int); p.add_argument('--y',type=int)
    p.add_argument('--keycode',type=int); p.add_argument('--text')
    args = p.parse_args()
    project = args.project.resolve(strict=True) if args.project else None
    if args.operation in ('build','install','launch','logs') and not project:
        p.error('--project is required')
    if args.operation == 'build':
        project_package(project)
        # Copy the helper into the existing Debian root, outside the user project.
        script = FILES/'home/.dsh/debian/current/root/android-app-lab/skill-build.sh'
        script.parent.mkdir(parents=True,exist_ok=True)
        script.write_bytes((SCRIPTS/'build.sh').read_bytes())
        debian(project,['bash','/root/android-app-lab/skill-build.sh'],timeout=600)
        return
    if args.operation == 'doctor':
        tools = FILES/'home/.dsh/debian/current/root/android-app-lab/toolchain'
        info={'device':run(['/system/bin/getprop','ro.product.device']).decode().strip(),
              'adbBinary':(PREFIX/'bin/adb').exists(), 'androidJar':(tools/'android.jar').exists(),
              'd8Jar':(tools/'d8.jar').exists()}
        try:
            base,_ = connected_adb()
            info.update(adbConnected=True,shellIdentity=shell(base,'id').decode().strip())
        except (RuntimeError,OSError,ValueError,ET.ParseError) as e:
            info.update(adbConnected=False,adbError=str(e))
        print(json.dumps(info,ensure_ascii=False,indent=2))
        return
    base,_ = connected_adb()
    if args.operation == 'install':
        package = project_package(project)
        apk = project/'app.apk'
        receipt = json.loads((project/'build-receipt.json').read_text())
        if receipt['package'] != package or receipt['sha256'] != hashlib.sha256(apk.read_bytes()).hexdigest():
            raise ValueError('APK 和构建收据不一致，请重新构建')
        print(run(base+['install','-r','-t',apk],timeout=120).decode())
        print(shell(base,'pm','path',package).decode())
    elif args.operation == 'launch':
        package=project_package(project)
        if not re.fullmatch(r'\.?[A-Za-z_][A-Za-z0-9_.$]*',args.activity):
            raise ValueError('Activity name invalid')
        argv=['am','start','-W','-n',package+'/'+args.activity]
        if args.self_test: argv+=['--ez','self_test','true']
        if args.revision is not None: argv+=['--ei','expected_revision',str(args.revision)]
        print(shell(base,*argv).decode())
    elif args.operation in ('capture','ui'):
        if not args.output: p.error('--output is required')
        if args.output.exists(): raise ValueError('Output exists; choose a new filename')
        if args.operation == 'capture':
            data=run(base+['exec-out','screencap','-p'])
            offset=data.find(b'\x89PNG\r\n\x1a\n')
            if offset<0: raise RuntimeError('Screenshot has no PNG header')
            data=data[offset:]
        else:
            data=shell(base,'uiautomator','dump','/dev/tty',timeout=60)
        args.output.parent.mkdir(parents=True,exist_ok=True)
        with args.output.open('xb') as f: f.write(data)
        print(str(args.output))
    elif args.operation == 'logs':
        package=project_package(project)
        pid=shell(base,'pidof',package).decode().split()[0]
        if not re.fullmatch(r'[A-Za-z0-9_.-]+',args.tag): raise ValueError('Invalid log tag')
        print(run(base+['logcat','-d','--pid='+pid,'-s',args.tag+':I','*:S']).decode(errors='replace')[-16000:])
    elif args.operation == 'tap':
        if args.x is None or args.y is None: p.error('--x and --y are required')
        print(shell(base,'input','tap',args.x,args.y).decode())
    elif args.operation == 'key':
        if args.keycode is None: p.error('--keycode is required')
        print(shell(base,'input','keyevent',args.keycode).decode())
    elif args.operation == 'text':
        if args.text is None: p.error('--text is required (system input is limited for Unicode)')
        print(shell(base,'input','text',args.text).decode())
    elif args.operation == 'return':
        print(shell(base,'am','start','-n',HOST_PACKAGE+'/.MainActivity').decode())

if __name__=='__main__':
    try: main()
    except Exception as e:
        print('ANDROID_APP_ERROR: '+str(e),file=sys.stderr)
        sys.exit(1)
