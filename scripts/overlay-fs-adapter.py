#!/usr/bin/env python3
"""Overlay just the Android fs plugin and web composition onto a pinned release.

Streams tar once, preserves unrelated contents/metadata, uses multithreaded xz.
Never extracts the source runtime or rebuilds its Node/Termux binaries.
"""
import hashlib
import io
import json
import pathlib
import subprocess
import sys
import tarfile
from lib.codex_context_patch import patch_agent_loop, patch_attachment_store

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'android-shell/scripts'))
from retired_plugins import copy_member
abi = sys.argv[1] if len(sys.argv) >= 2 else ''
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
if abi not in ('x86_64', 'arm64'):
    raise SystemExit('Usage: python scripts/overlay-fs-adapter.py x86_64|arm64')
source = ROOT / 'downloads' / f'snapshot-{abi}.tar.xz'
sources = json.loads((ROOT / 'docs/download-sources.json').read_text())
expected = next(x['digest'].split(':', 1)[1] for x in sources if x['name'] == source.name)
with source.open('rb') as stream:
    assert hashlib.file_digest(stream, 'sha256').hexdigest() == expected
plugin = ROOT / 'android-shell/plugins/dsh-android-fs'
package = json.loads((plugin / 'package.json').read_text())
assert package['peerDependencies']['@deepseek-ai/dsh-fs-local'] == '0.1.2-rc.1'
prefix = 'home/.dsh/profiles/web/node_modules/@dsh-android/dsh-android-fs/'
patch = 'home/.dsh/profiles/web/cordis.patch.yml'
replacements = {patch: (ROOT / 'android-shell/scripts/profile-web.cordis.patch.yml').read_bytes()}
executable_replacements = set()
speech_folder=ROOT/'android-shell/plugins/dsh-speech-services'
if client_plugins:
    subprocess.run(['npm','run','build'],cwd=speech_folder,check=True)
    for relative in ['package.json','LICENSE','THIRD-PARTY-NOTICES.txt','lib/index.js','lib/client.js']:
        replacements['home/.dsh/profiles/web/node_modules/@dsh-android/dsh-speech-services/'+relative]=(speech_folder/relative).read_bytes()
    replacements[patch] += b"\n- insert:\n    - id: speech-services\n      name: '@dsh-android/dsh-speech-services'\n"
if client_plugins:
    startup_folder=ROOT/'android-shell/plugins/dsh-startup-appearance'
    subprocess.run(['npm','run','build'],cwd=startup_folder,check=True)
    for relative in ['package.json','LICENSE','lib/index.js','lib/client.js']:
        replacements['home/.dsh/profiles/web/node_modules/@dsh-android/dsh-startup-appearance/'+relative]=(startup_folder/relative).read_bytes()
    replacements[patch] += b"\n- insert:\n    - id: startup-appearance\n      name: '@dsh-android/dsh-startup-appearance'\n"
    remote_folder=ROOT/'android-shell/plugins/dsh-xiaomi-remote'
    subprocess.run(['npm','run','build'],cwd=remote_folder,check=True)
    for relative in ['package.json','LICENSE','lib/index.js','lib/client.js']:
        replacements['home/.dsh/profiles/web/node_modules/@dsh-android/dsh-xiaomi-remote/'+relative]=(remote_folder/relative).read_bytes()
    replacements[patch] += b"\n- insert:\n    - id: xiaomi-remote\n      name: '@dsh-android/dsh-xiaomi-remote'\n"
if codex:
    for folder in [ROOT / 'android-shell/plugins/dsh-android-codex', ROOT / 'android-shell/plugins/dsh-codex-live', ROOT / 'android-shell/vendor/relay-dsh-plugin-codex', ROOT / 'android-shell/vendor/relay-dsh-plugin-session-import']:
        pkg = json.loads((folder / 'package.json').read_text())['name']
        for path in sorted(folder.rglob('*')):
            relative = path.relative_to(folder)
            if path.is_file() and (relative.parts[0] in ('lib', 'presets') or relative.as_posix() in ('package.json', 'LICENSE', 'SOURCE.json')):
                replacements['home/.dsh/profiles/web/node_modules/' + pkg + '/' + relative.as_posix()] = path.read_bytes()
    replacements[patch] += b"\n- insert:\n    - id: android-codex-import\n      name: 'relay-dsh-plugin-session-import'\n    - id: android-codex-client\n      name: 'relay-dsh-plugin-codex'\n      config:\n        androidClientOnly: true\n    - id: android-codex\n      name: '@dsh-android/dsh-android-codex'\n    - id: codex-live\n      name: '@dsh-android/dsh-codex-live'\n"
if debian:
    replacements[patch] = replacements[patch].replace(b'maxTimeoutMs: 600000', b'maxTimeoutMs: 3605000')
    debian_plugin = ROOT / 'android-shell/plugins/dsh-android-debian'
    debian_prefix = 'home/.dsh/profiles/web/node_modules/@dsh-android/dsh-android-debian/'
    for path in [debian_plugin / 'package.json', debian_plugin / 'LICENSE', debian_plugin / 'README.md', *sorted((debian_plugin / 'lib').rglob('*'))]:
        if path.is_file() and '__pycache__' not in path.parts:
            replacements[debian_prefix + path.relative_to(debian_plugin).as_posix()] = path.read_bytes()
    assert debian_prefix + 'lib/runner.py' in replacements
    bundle = ROOT / '.tools/debian-bundle' / abi
    for path in sorted(bundle.rglob('*')):
        if path.is_file():
            name = 'usr/share/dsh-debian/' + path.relative_to(bundle).as_posix()
            replacements[name] = path.read_bytes()
            if 'runtime' in path.relative_to(bundle).parts:
                executable_replacements.add(name)
    replacements[patch] += b"\n- insert:\n    - id: android-debian\n      name: '@dsh-android/dsh-android-debian'\n"
if client_plugins:
    subprocess.run([sys.executable, str(ROOT / 'scripts/patch-voice-deck.py')], check=True)
    for name in ['dsh-api-session-controller', 'dsh-client-ui-renderer', 'dsh-client-ui-conversation', 'dsh-client-ui-workspace']:
        replacements['usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/' + name + '/lib/client.js'] = (ROOT / '.tools/deck-patches' / (name + '.js')).read_bytes()
    for short in ['dsh-client-input-gamepad', 'dsh-client-ui-voice-deck', 'dsh-client-fold-transition']:
        folder = ROOT / 'android-shell/plugins' / short
        plugin_name = json.loads((folder / 'package.json').read_text())['name']
        for path in [folder / 'package.json', folder / 'LICENSE', *sorted((folder / 'lib').rglob('*'))]:
            if path.is_file():
                replacements['home/.dsh/profiles/web/node_modules/' + plugin_name + '/' + path.relative_to(folder).as_posix()] = path.read_bytes()
        replacements[patch] += ("\n- insert:\n    - id: " + short + "\n      name: '" + plugin_name + "'\n").encode()
    responsive = ROOT / 'android-shell/dsh-client-ui-responsive'
    for relative in ['package.json', 'lib/index.js', 'lib/invariant.js', 'lib/client.js']:
        replacements['home/.dsh/profiles/web/node_modules/@dsh-android/dsh-client-ui-responsive/' + relative] = (responsive / relative).read_bytes()
    for short in ['voice-input', 'performance']:
        folder = ROOT / 'android-shell/plugins' / ('dsh-android-' + short)
        target = 'home/.dsh/profiles/web/node_modules/@dsh-android/dsh-android-' + short + '/'
        assert (folder / 'lib/client.js').is_file(), 'Build client plugin first'
        for path in [folder / 'package.json', folder / 'LICENSE', *sorted((folder / 'lib').rglob('*'))]:
            if path.is_file():
                replacements[target + path.relative_to(folder).as_posix()] = path.read_bytes()
        replacements[patch] += ("\n- insert:\n    - id: android-" + short + "\n      name: '@dsh-android/dsh-android-" + short + "'\n").encode()
for path in [plugin / 'package.json', plugin / 'LICENSE', plugin / 'README.md', *sorted((plugin / 'lib').rglob('*'))]:
    if path.is_file() and '__pycache__' not in path.parts:
        replacements[prefix + path.relative_to(plugin).as_posix()] = path.read_bytes()
assert prefix + 'lib/index.js' in replacements
assert prefix + 'lib/publish-noreplace.py' in replacements
if storage:
    compat = ROOT / 'android-shell/dsh-host-web-compat'
    for relative in ['package.json', 'lib/index.js', 'lib/workspace-path.js']:
        replacements['home/.dsh/profiles/web/node_modules/@dsh-android/dsh-host-web-compat/' + relative] = (compat / relative).read_bytes()
dest = ROOT / ('.tools/codex-adapter' if codex else '.tools/voice-debug-adapter' if voice_debug else '.tools/deck-ui-adapter' if deck_ui else '.tools/debian-adapter' if debian else '.tools/storage-adapter' if storage else '.tools/fs-adapter')
dest.mkdir(parents=True, exist_ok=True)
if debian:
    (dest / f'profile-web-{abi}.cordis.patch.yml').write_bytes(replacements[patch])
output = dest / source.name
partial = output.with_suffix('.part')
seen = set()
with partial.open('wb') as target:
    decoder = subprocess.Popen(['xz', '-d', '-T4', '-c', str(source)], stdout=subprocess.PIPE)
    encoder = subprocess.Popen(['xz', '-T4', '-6', '-c'], stdin=subprocess.PIPE, stdout=target)
    try:
        with tarfile.open(fileobj=decoder.stdout, mode='r|') as tin, tarfile.open(fileobj=encoder.stdin, mode='w|', format=tarfile.PAX_FORMAT) as tout:
            for member in tin:
                if member.name not in replacements and copy_member(tin, tout, member):
                    continue
                if codex and member.name == 'usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js':
                    replacements[member.name] = patch_agent_loop(tin.extractfile(member).read().decode()).encode()
                    continue
                if codex and member.name == 'usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-attachment-local/lib/index.js':
                    replacements[member.name] = patch_attachment_store(tin.extractfile(member).read().decode()).encode()
                    continue
                if member.name.startswith(prefix):
                    continue
                if member.name in replacements:
                    if member.name == patch: seen.add(patch)
                    continue
                if member.name == 'usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-fs-local/package.json':
                    data = tin.extractfile(member).read()
                    assert json.loads(data)['version'] == '0.1.2-rc.1'
                    seen.add('fs-version')
                    tout.addfile(member, io.BytesIO(data))
                else:
                    tout.addfile(member, tin.extractfile(member) if member.isfile() else None)
            assert seen == {patch, 'fs-version'}, 'Expected composition and pinned filesystem missing'
            for name, data in sorted(replacements.items()):
                member = tarfile.TarInfo(name)
                member.size, member.mode, member.mtime = len(data), 0o700 if name in executable_replacements else 0o600, 1704067200
                tout.addfile(member, io.BytesIO(data))
        encoder.stdin.close()
        decoder.stdout.close()
        assert decoder.wait() == 0
        assert encoder.wait() == 0
    except BaseException:
        decoder.kill()
        encoder.kill()
        decoder.wait()
        encoder.wait()
        raise
partial.replace(output)
with output.open('rb') as stream:
    digest = hashlib.file_digest(stream, 'sha256').hexdigest()
output.with_name(output.name + '.sha256').write_text(digest)
receipt = {'abi': abi, 'origin': 'v0.13.3 verified release plus Android fs plugin/composition' + (' and storage bridge' if storage else ''),
           'base_sha256': expected, 'snapshot_sha256': digest, 'runtime_rebuilt': False,
           'plugin_version': package['version'], 'overlay_files': {
               name: hashlib.sha256(data).hexdigest() for name, data in sorted(replacements.items())}}
if debian:
    receipt['debian'] = json.loads((ROOT / '.tools/debian-bundle' / abi / 'manifest.json').read_text())
(dest / f'overlay-{abi}.json').write_text(json.dumps(receipt, indent=2))
print(json.dumps({'abi': abi, 'bytes': output.stat().st_size, 'sha256': digest, 'overlay_files': len(replacements)}))
