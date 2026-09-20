#!/usr/bin/env python3
"""Check a first-build receipt against an explicit device; install only with --install."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import tempfile
import time
import zipfile

from lib.dsh_device import Device, PKG, ROOT


class Blocked(RuntimeError):
    """A safe, credential-free explanation suitable for terminal output."""


def require(condition, message):
    if not condition:
        raise Blocked(message)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def sha(value):
    require(isinstance(value, str) and re.fullmatch(r'[0-9a-f]{64}', value),
            'Receipt contains an invalid SHA-256 value; rebuild the APK.')
    return value


def local_command(args):
    try:
        return subprocess.run(list(map(str, args)), check=True, capture_output=True,
                              text=True, timeout=60).stdout
    except (OSError, subprocess.SubprocessError):
        raise Blocked('Local Android verification tool failed; check the SDK and APK.') from None


def certificates(apk, sdk):
    result = local_command([sdk/'build-tools/35.0.0/apksigner', 'verify', '--verbose',
                            '--print-certs', apk])
    certs = frozenset(re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]{64})$',
                                result, re.MULTILINE))
    require(bool(certs), 'APK signature certificate could not be verified.')
    return frozenset(value.lower() for value in certs)


def candidate(receipt_path, sdk):
    try:
        data = json.loads(receipt_path.read_text())
        relative = Path(data['apk'])
        apk = (ROOT/relative).resolve()
        require(not relative.is_absolute() and apk.is_relative_to(ROOT.resolve()),
                'Receipt APK must be a repository-relative path inside this checkout.')
        require(digest(apk) == sha(data['apk_sha256']), 'APK differs from first-build receipt.')
        sha(data['snapshot_sha256'])
        natives = data['native_sha256']
        require(isinstance(natives, dict) and bool(natives), 'Receipt has no native payload hashes.')
        with zipfile.ZipFile(apk) as archive:
            require(len(archive.namelist()) == len(set(archive.namelist())), 'APK has duplicate ZIP members.')
            with archive.open('assets/snapshot.tar.xz') as stream:
                require(hashlib.file_digest(stream, 'sha256').hexdigest() == data['snapshot_sha256'],
                        'Packaged snapshot differs from first-build receipt.')
            for name, expected in natives.items():
                require(re.fullmatch(r'lib[A-Za-z0-9_+.-]+\.so', name), 'Invalid native library receipt name.')
                require(hashlib.sha256(archive.read('lib/arm64-v8a/'+name)).hexdigest() == sha(expected),
                        'Packaged native library differs from first-build receipt.')
        certs = certificates(apk, sdk)
        metadata = local_command([sdk/'build-tools/35.0.0/aapt', 'dump', 'badging', apk])
        package = re.search(r"^package: name='([^']+)' versionCode='(\d+)'", metadata, re.MULTILINE)
        minimum = re.search(r"^sdkVersion:'(\d+)'", metadata, re.MULTILINE)
        abis = re.search(r'^native-code: (.+)$', metadata, re.MULTILINE)
        require(package and package[1] == PKG and minimum and abis,
                'APK package, minimum API or native ABI metadata is invalid.')
        require(re.findall(r"'([^']+)'", abis[1]) == ['arm64-v8a'], 'Expected an ARM64-only APK.')
        require('application-debuggable' in metadata, 'Readiness checks require a debuggable source APK.')
        return {'apk': apk, 'receipt': data, 'certificates': certs,
                'version': int(package[2]), 'minimum_api': max(26, int(minimum[1]))}
    except Blocked:
        raise
    except (OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile):
        raise Blocked('First-build receipt or APK is missing or invalid; run the source build first.') from None


def installed_paths(device):
    # An empty pm path is accepted only after package enumeration confirms absence.
    result = device.command('shell', 'pm', 'list', 'packages', PKG)
    packages = result.stdout.decode().splitlines()
    if 'package:'+PKG not in packages:
        require(not result.stderr.strip() and all(line.startswith('package:') for line in packages),
                'Cannot determine whether DeepCode is installed.')
        return []
    result = device.command('shell', 'pm', 'path', PKG)
    lines = result.stdout.decode().splitlines()
    require(bool(lines) and not result.stderr.strip() and
            all(re.fullmatch(r'package:/[^\r\n]*\.apk', line) for line in lines),
            'Installed APK path is unavailable; safe signature comparison is blocked.')
    return [line.removeprefix('package:') for line in lines]


def snapshot_busy(device):
    # A successful run-as alone cannot distinguish absent markers from unreadable files/.
    script = ('test -d files && test -r files && test -x files || exit 3; '
              'if test -e files/.snapshot-transaction || test -L files/.snapshot-transaction || '
              'test -e files/.snapshot-stage || test -L files/.snapshot-stage; '
              'then echo BUSY; else echo IDLE; fi')
    result = device.command('shell', 'run-as', PKG, 'sh', '-c', shlex.quote(script), check=False)
    state = result.stdout.decode().strip()
    require(result.returncode == 0 and state in ('IDLE', 'BUSY') and not result.stderr.strip(),
            'run-as cannot read application state. Use a matching debuggable build; do not clear data.')
    return state == 'BUSY'


def fingerprint(device):
    try:
        return sha(device.read('files/.snapshot-fingerprint').decode().strip())
    except (OSError, ValueError, subprocess.SubprocessError):
        raise Blocked('Installed snapshot fingerprint is unavailable; wait for initialization to finish.') from None


def native_status(serial):
    # Project status fields only. Never transfer voice text, account data or auth URLs.
    script = """import {connect} from './scripts/lib/android-cdp.mjs';
const c=await connect(process.argv[1]);
try{console.log(JSON.stringify(await c.evaluate(`(()=>{
const b=androidBridge, f=JSON.parse(b.foldStatus()).dual;
return {dual:f?{leasedState:f.leasedState,working:f.working}:null,
live:JSON.parse(b.liveVoiceStatus()).phase,
voice:JSON.parse(b.voiceStatus()).phase,
desktop:JSON.parse(b.desktopVoiceStatus()).phase};})()`)))}finally{c.close()}
"""
    try:
        result = subprocess.run(['node', '--input-type=module', '-e', script, serial],
                                cwd=ROOT, check=True, capture_output=True, text=True, timeout=25)
        return json.loads(result.stdout)
    except (OSError, ValueError, subprocess.SubprocessError):
        raise Blocked('Native status is unavailable. Open DeepCode, exit its dual-screen mode, '
                      'wait for audio tasks to finish, then rerun --check.') from None


def require_idle(device):
    require(not snapshot_busy(device), 'Snapshot transaction is active; wait without stopping DeepCode.')
    try:
        device.authenticate(timeout=15)
        sessions = device.rpc('session/list', {'_request': {}}, timeout=10)
        items = sessions['items']
        require(isinstance(items, list) and all(isinstance(item, dict) and
                type(item.get('running')) is bool for item in items),
                'Agent running state is unknown; installation is blocked.')
        require(not any(item['running'] for item in items),
                'An Agent is running. Wait for its work to finish; do not force-stop it.')
        with device.opener.open(device.base+'/api/android/codex/live', timeout=10) as response:
            live = json.load(response)
        require(isinstance(live, dict) and 'active' in live and live['active'] is None,
                'GPT Live is active or unknown; finish the Live session before updating.')
    except Blocked:
        raise
    except Exception:
        raise Blocked('Authenticated engine status is unavailable. Open DeepCode and wait until ready.') from None
    native = native_status(device.serial)
    require(isinstance(native, dict) and isinstance(native.get('dual'), dict),
            'Dual-screen lease state is unknown; exit DeepCode dual-screen mode and rerun --check.')
    dual = native['dual']
    require(type(dual.get('leasedState')) is int and dual['leasedState'] == 0 and
            dual.get('working') is False,
            'DeepCode holds or is changing a display lease; exit its dual-screen mode and rerun --check.')
    require(native.get('live') in ('idle', 'closed', 'error'), 'Native Live audio is active or unknown.')
    quiet = ('idle', 'done', 'canceled', 'error', 'sent', 'send-error')
    require(native.get('voice') in quiet and native.get('desktop') in quiet,
            'Voice capture or transcription is active or unknown; finish it before updating.')


def preflight(device, build, sdk):
    require(device.shell('am', 'get-current-user') == '0', 'Only Android owner user 0 is supported.')
    abi = device.shell('getprop', 'ro.product.cpu.abi')
    api = device.shell('getprop', 'ro.build.version.sdk')
    require(abi == 'arm64-v8a' and api.isdigit() and int(api) >= build['minimum_api'],
            'Device must be ARM64 and satisfy the APK minimum API (at least 26).')
    identity = {'model': device.shell('getprop', 'ro.product.model'),
                'device': device.shell('getprop', 'ro.product.device'), 'abi': abi, 'api': int(api)}
    paths = installed_paths(device)
    old_fingerprint = None
    if paths:
        with tempfile.TemporaryDirectory(prefix='deepcode-signature-') as temporary:
            for index, path in enumerate(paths):
                apk = Path(temporary)/f'installed-{index}.apk'
                device.command('pull', path, str(apk), timeout=120)
                require(certificates(apk, sdk) == build['certificates'],
                        'Signing certificate mismatch. Obtain a build signed with the installed key; '
                        'uninstalling, downgrading and clearing data are prohibited.')
        package = device.shell('dumpsys', 'package', PKG)
        versions = set(re.findall(r'\bversionCode=(\d+)\b', package))
        require(len(versions) == 1 and build['version'] >= int(next(iter(versions))),
                'Installed version is newer or unknown; downgrading is prohibited.')
        require_idle(device)
        old_fingerprint = fingerprint(device)
    return {'device': identity, 'installed': bool(paths),
            'snapshot_update': bool(paths) and old_fingerprint != build['receipt']['snapshot_sha256']}


def wait_ready(device, build, timeout):
    deadline = time.monotonic()+timeout
    while time.monotonic() < deadline:
        try:
            if not snapshot_busy(device) and fingerprint(device) == build['receipt']['snapshot_sha256']:
                device.authenticate(timeout=min(5, max(1, deadline-time.monotonic())))
                sessions = device.rpc('session/list', {'_request': {}}, timeout=5)
                if isinstance(sessions, dict) and isinstance(sessions.get('items'), list):
                    paths = installed_paths(device)
                    require(len(paths) == 1, 'Installed APK shape differs from the single source APK.')
                    installed_hash = device.shell('sha256sum', paths[0]).split()[0]
                    require(installed_hash == build['receipt']['apk_sha256'], 'Installed APK hash differs.')
                    return
        except Exception:
            # Do not print underlying authentication/RPC errors, which may contain private data.
            pass
        time.sleep(min(2, max(0, deadline-time.monotonic())))
    raise Blocked('Installation completed, but readiness/fingerprint verification timed out. '
                  'DeepCode was left running; wait for initialization and inspect it without force-stop.')


def deploy(device, build, sdk, install=False, timeout=1200):
    result = preflight(device, build, sdk)
    if not install:
        return {'status': 'CHECKED', **result}
    # Repeat every state check immediately before the sole installation command.
    preflight(device, build, sdk)
    require(digest(build['apk']) == build['receipt']['apk_sha256'], 'APK changed after preflight.')
    response = device.command('install', '-r', '-t', str(build['apk']), timeout=180)
    require('Success' in response.stdout.decode().splitlines(),
            'Android did not confirm installation. Check the device installation prompt; do not bypass it.')
    device.shell('am', 'start', '-n', PKG+'/.MainActivity')
    wait_ready(device, build, timeout)
    return {'status': 'INSTALLED_AND_READY', **result}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', required=True, help='Explicit authorized ADB device serial')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true', help='Check only (the default)')
    mode.add_argument('--install', action='store_true', help='Install after all safety checks pass')
    parser.add_argument('--receipt', type=Path, default=ROOT/'artifacts/first-build.json')
    parser.add_argument('--timeout', type=int, default=1200, help='Post-install readiness timeout in seconds')
    args = parser.parse_args()
    device = None
    try:
        require(args.timeout > 0, 'Timeout must be positive.')
        sdk = Path(os.environ.get('ANDROID_HOME', ROOT/'.tools/android-sdk'))
        build = candidate(args.receipt, sdk)
        device = Device(args.serial)
        print(json.dumps(deploy(device, build, sdk, args.install, args.timeout), ensure_ascii=False))
        return 0
    except Blocked as error:
        print('BLOCKED: '+str(error))
        return 2
    except Exception:
        print('BLOCKED: Device access or verification failed. Check ADB authorization, app readiness '
              'and the device installation prompt; no destructive recovery was attempted.')
        return 2
    finally:
        if device is not None:
            try:
                device.close()
            except Exception:
                pass


if __name__ == '__main__':
    raise SystemExit(main())
