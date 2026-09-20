#!/usr/bin/env python3
"""Run upstream snapshot gates in parallel; preserve each exit code and log."""
import concurrent.futures
import hashlib
import json
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
(ROOT / 'artifacts').mkdir(exist_ok=True)
(ROOT / 'logs').mkdir(exist_ok=True)
REPO = ROOT / 'android-shell'
abi = sys.argv[1] if len(sys.argv) > 1 else 'x86_64'
if abi not in ('arm64', 'x86_64'):
    raise SystemExit('Expected arm64 or x86_64')
codex = '--codex' in sys.argv[2:]
if codex and abi != 'arm64':
    raise SystemExit('Codex Android runtime currently requires arm64')
voice_debug = '--voice-debug' in sys.argv[2:] or codex
deck_ui = '--deck-ui' in sys.argv[2:]
client_plugins = voice_debug or deck_ui
if voice_debug and abi != 'arm64':
    raise SystemExit('Voice preview currently requires arm64')
debian = '--debian' in sys.argv[2:] or client_plugins
storage = '--storage' in sys.argv[2:] or debian
adapter = '--fs-adapter' in sys.argv[2:] or storage
snapshot = ROOT / ('.tools/codex-adapter' if codex else '.tools/voice-debug-adapter' if voice_debug else '.tools/deck-ui-adapter' if deck_ui else '.tools/debian-adapter' if debian else '.tools/storage-adapter' if storage else '.tools/fs-adapter' if adapter else 'downloads') / f'snapshot-{abi}.tar.xz'
variant = '-codex' if codex else '-voice-debug' if voice_debug else '-deck-ui' if deck_ui else '-debian' if debian else '-storage' if storage else '-fs-adapter' if adapter else ''
commands = {
    'retired-plugins': [sys.executable, 'scripts/retired_plugins.py', str(snapshot)],
    'engine-overlay': ['node', 'scripts/check-engine-overlay.mjs', str(snapshot)],
    'file-modes': ['node', 'scripts/check-snapshot-file-modes.mjs', str(snapshot)],
    'third-party': ['node', 'scripts/check-third-party.mjs', 'x', '--tar', str(snapshot)],
    'snapshot-secrets': ['node', 'scripts/check-snapshot-secrets.mjs', str(snapshot)],
    'elf': ['node', 'scripts/elf-check.mjs', str(snapshot), abi],
    'patch-mounts': ['node', 'scripts/check-patch-mounts.mjs',
                     'scripts/profile-web.cordis.patch.yml',
                     'dsh-shell-termux', 'dsh-client-ui-responsive', 'dsh-host-web-compat',
                     'plugins/dsh-android-bridge', 'plugins/dsh-android-manage',
                     'plugins/dsh-android-linux-env', 'plugins/dsh-android-file-open',
                     'vendor/dsh-undo-savepoint', 'vendor/dshmarketplace-plugin'],
}


if adapter:
    commands['patch-mounts'].append('plugins/dsh-android-fs')
if debian:
    commands['patch-mounts'][2] = str(snapshot.parent / f'profile-web-{abi}.cordis.patch.yml')
    commands['patch-mounts'].append('plugins/dsh-android-debian')

if client_plugins:
    commands['patch-mounts'].extend(['plugins/dsh-android-voice-input', 'plugins/dsh-speech-services', 'plugins/dsh-android-performance', 'plugins/dsh-client-input-gamepad', 'plugins/dsh-client-ui-voice-deck', 'plugins/dsh-client-fold-transition'])
if codex:
    # Relay's discoverable row has androidClientOnly; its host is adapter-owned.
    commands['patch-mounts'].extend(['plugins/dsh-android-codex', 'vendor/relay-dsh-plugin-codex', 'vendor/relay-dsh-plugin-session-import'])


def check(item):
    name, command = item
    log = ROOT / 'logs' / f'gate-{abi}{variant}-{name}.log'
    env = {**os.environ, 'XZ_DEFAULTS': '-T0'}
    with log.open('w') as output:
        result = subprocess.run(command, cwd=REPO, env=env, stdout=output,
                                stderr=subprocess.STDOUT, timeout=300)
    return {'gate': name, 'exit_code': result.returncode, 'log': str(log), 'command': command}


with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(check, commands.items()))
with snapshot.open('rb') as stream:
    digest = hashlib.file_digest(stream, 'sha256').hexdigest()
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip()
(ROOT / 'artifacts' / f'gates-{abi}{variant}.json').write_text(json.dumps({
    'snapshot_sha256': digest, 'source_commit': commit, 'results': results,
}, indent=2))
for result in results:
    print(result['gate'], 'PASS' if result['exit_code'] == 0 else 'FAIL', flush=True)
sys.exit(any(r['exit_code'] != 0 for r in results))
