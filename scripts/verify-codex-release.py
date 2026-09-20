#!/usr/bin/env python3
"""Verify installed Codex APK/runtime and safe account status; no credentials."""
import hashlib
import json
import pathlib
import sys
import zipfile
from lib.dsh_device import Device

root = pathlib.Path(__file__).resolve().parents[1]
receipt = json.loads((root / 'artifacts/build-arm64-codex.json').read_text())
device = Device(sys.argv[1])
try:
    assert not device.exists('files/.snapshot-stage') and not device.exists('files/.snapshot-transaction')
    device.authenticate(timeout=20)
    status = json.load(device.opener.open(device.base + '/api/android/codex/account', timeout=10))
    assert status.get('account') and status.get('enabled') and not status.get('login')
    fingerprint = device.read('files/.snapshot-fingerprint').decode().strip()
    assert fingerprint == receipt['snapshot_sha256']
    apk = pathlib.Path(receipt['apk'])
    assert hashlib.file_digest(apk.open('rb'), 'sha256').hexdigest() == receipt['apk_sha256']
    installed_apk = device.shell('pm', 'path', 'com.dsharnessmobile.shell').removeprefix('package:')
    installed_hash = device.shell('run-as', 'com.dsharnessmobile.shell', '/system/bin/sha256sum', installed_apk).split()[0]
    assert installed_hash == receipt['apk_sha256']
    native = json.loads(device.read('files/network-dns.json'))['nativeLibraryDir']
    hashes = {}
    with zipfile.ZipFile(apk) as archive:
        attachment_patch = archive.read('assets/patched/attachment-local-index.js')
        assert b'canonicalHome' in attachment_patch
        assert device.read('files/usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-attachment-local/lib/index.js') == attachment_patch
        for name in receipt['codex_runtime']['files']:
            digest = hashlib.sha256(archive.read('lib/arm64-v8a/' + name)).hexdigest()
            actual = device.shell('run-as', 'com.dsharnessmobile.shell', '/system/bin/sha256sum', native + '/' + name).split()[0]
            assert digest == actual, name
            hashes[name] = actual
    files = {name: device.read('files/home/projects/codex-validation/' + name).decode().strip()
             for name in ['codex-native-check.txt', 'codex-session-b.txt']}
    assert files == {'codex-native-check.txt': 'CODEX_NATIVE_TOOL_OK', 'codex-session-b.txt': 'SESSION_B_ONLY'}
    assert not device.exists('files/home/projects/codex-validation/should-not-exist.txt')
    assert b'agent/context-delegation' in device.read('files/usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js')
    result = {'passed': True, 'serial': device.serial, 'model': device.shell('getprop', 'ro.product.model'),
              'contextDelegationInstalled': True, 'attachmentPatchMatchesApk': True,
              'loggedIn': True, 'enabled': True, 'pendingLogin': False, 'credentialsCopied': False,
              'apkSha256': installed_hash, 'snapshotSha256': fingerprint, 'nativeFiles': hashes,
              'workspaceFiles': files, 'unsupportedPermissionDenied': True}
    (root / 'docs/validation/2026-09-10-codex/release.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
finally:
    device.close()
