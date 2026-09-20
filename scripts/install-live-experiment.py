#!/usr/bin/env python3
"""Install a verified Live experiment only when every device preflight succeeds."""
import argparse
import hashlib
import json
import pathlib
import subprocess
from lib.dsh_device import Device, PKG, ROOT


def require_idle(device):
    if device.shell('getprop', 'ro.product.device') != 'yingtian':
        raise RuntimeError('Expected the authorized tablet')
    if any(device.exists('files/' + name) for name in ('.snapshot-transaction', '.snapshot-stage')):
        raise RuntimeError('Snapshot transaction is active')
    items = device.rpc('session/list', {'_request': {}})['items']
    if any(item.get('running') for item in items):
        raise RuntimeError('A DSH agent is still running; installation stopped')
    with device.opener.open(device.base + '/api/android/codex/live', timeout=10) as response:
        live = json.load(response)
    if 'active' not in live or live['active'] is not None:
        raise RuntimeError('GPT Live is still active or status is unknown; installation stopped')


def install(device, receipt, native_status):
    require_idle(device)
    native = native_status()
    if native['live'].get('phase') not in ('idle', 'closed', 'error'):
        raise RuntimeError('Native microphone is active; installation stopped')
    dual = native['fold']['dual']
    if dual['leasedState'] != 0 or dual['working']:
        raise RuntimeError('Release the app display lease before installing')
    apk = pathlib.Path(receipt['apk'])
    if device.read('files/.snapshot-fingerprint').decode().strip() != receipt['snapshotSha256']:
        raise RuntimeError('Snapshot mismatch; this is not a shell-only update')
    with apk.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != receipt['sha256']:
            raise RuntimeError('APK does not match its receipt')
    # Recheck immediately before the single mutating command. No shell chaining:
    # an exception above cannot fall through to installation.
    require_idle(device)
    result = device.command('install', '-r', '-t', str(apk), timeout=120)
    print(result.stdout.decode())
    device.shell('am', 'start', '-n', PKG + '/.MainActivity')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('serial')
    parser.add_argument('--receipt', type=pathlib.Path, required=True)
    args = parser.parse_args()
    device = Device(args.serial)
    def status():
        code = """import {connect} from './scripts/lib/android-cdp.mjs';
const c=await connect(process.argv[1]);try{console.log(JSON.stringify(await c.evaluate('({live:JSON.parse(androidBridge.liveVoiceStatus()),fold:JSON.parse(androidBridge.foldStatus())})')))}finally{c.close()}"""
        result = subprocess.run(['node', '--input-type=module', '-e', code, args.serial],
                                cwd=ROOT, check=True, capture_output=True, text=True)
        return json.loads(result.stdout)
    try:
        device.authenticate()
        install(device, json.loads(args.receipt.read_text()), status)
    finally:
        device.close()


if __name__ == '__main__':
    main()
