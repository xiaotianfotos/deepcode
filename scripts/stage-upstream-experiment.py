#!/usr/bin/env python3
"""Overlay a fresh, verified 0.14.0 snapshot for isolated integration.

Input is an already extracted release in a disposable directory. Never point at
an installed runtime. Does not download models, change devices, or build an APK.
"""
import argparse, hashlib, importlib.util, json, pathlib, shutil, sys
from lib.codex_context_patch import patch_agent_loop, patch_attachment_store
from lib.legacy_codex_migration import patch_legacy_codex_migration, patch_legacy_live_migration
from lib.session_selection_patch import patch_session_selection
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'android-shell/scripts'))
from retired_plugins import retire_tree
BASE_SHA = {'x86_64':'8409612269a56e7529da6527e153744c161a235be6679b2d3d5219d17f63be79', 'arm64':'ed24dfcc004725dee4c41e6b9d139fa10e97455af270187794f838327caec28f'}
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--abi', choices=sorted(BASE_SHA), default='x86_64')
p.add_argument('--archive', type=pathlib.Path, required=True)
p.add_argument('--runtime', type=pathlib.Path, required=True)
p.add_argument('--assets', type=pathlib.Path, required=True)
a = p.parse_args()
assert hashlib.file_digest(a.archive.open('rb'),'sha256').hexdigest() == BASE_SHA[a.abi]
profile = a.runtime/'home/.dsh/profiles/web'
engine = a.runtime/'usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai'
assert json.loads((engine/'dsh-agent-loop/package.json').read_text())['version'] == '0.1.5-rc.1'
assert not (a.runtime/'.deepcode-overlay').exists(), 'Use a fresh extraction, not a previously patched runtime'
retire_tree(a.runtime)
composition = (ROOT/'android-shell/scripts/profile-web.cordis.patch.yml').read_text()
folders = ['dsh-android-fs','dsh-android-debian','dsh-android-codex','dsh-codex-live',
           'dsh-speech-services','dsh-startup-appearance','dsh-xiaomi-remote',
           'dsh-client-input-gamepad','dsh-client-ui-voice-deck','dsh-client-fold-transition','dsh-android-voice-input']
for folder in [ROOT/'android-shell/dsh-client-ui-responsive',
               *[ROOT/'android-shell/plugins'/n for n in folders],
               ROOT/'android-shell/vendor/relay-dsh-plugin-codex',ROOT/'android-shell/vendor/relay-dsh-plugin-session-import']:
    package = json.loads((folder/'package.json').read_text()); name=package['name']
    target=profile/'node_modules'/name; target.mkdir(parents=True,exist_ok=True)
    assert (folder/'lib').is_dir(), f'Build {folder} first'
    for source in folder.iterdir():
        if source.name in ('package.json','LICENSE','SOURCE.json','THIRD-PARTY-NOTICES.txt') or source.suffix == '.mjs' and source.name in ('dsh-compat.mjs','dsh-client-compat.mjs','codex-activity-wire.mjs'):
            shutil.copy2(source,target/source.name)
        elif source.name in ('lib','presets'):
            shutil.copytree(source,target/source.name,dirs_exist_ok=True)
    if name in composition: continue
    ident = {
        'dsh-android-fs':'fs-android', 'dsh-android-debian':'android-debian',
        'dsh-android-codex':'android-codex', 'dsh-codex-live':'codex-live',
        'dsh-android-voice-input':'android-voice-input', 'dsh-speech-services':'speech-services',
        'dsh-startup-appearance':'startup-appearance', 'dsh-xiaomi-remote':'xiaomi-remote',
        'relay-dsh-plugin-codex':'android-codex-client',
        'relay-dsh-plugin-session-import':'android-codex-import',
    }.get(folder.name, folder.name)
    config = ''
    if name=='relay-dsh-plugin-codex': config='      config:\n        androidClientOnly: true\n'
    # Android Codex binaries are currently ARM64-only. Keep their packages in
    # this emulator image, but don't pretend the x86_64 image can execute them.
    disabled = '      disabled: true\n' if a.abi == 'x86_64' and ident in ('android-codex','codex-live') else ''
    composition += f"\n- insert:\n    - id: {ident}\n      name: '{name}'\n" + config + disabled
composition += '\n- id: fs-sandbox\n  disabled: true\n'
(profile/'cordis.patch.yml').write_text(composition)
spec=importlib.util.spec_from_file_location('deck',ROOT/'scripts/patch-voice-deck.py')
deck=importlib.util.module_from_spec(spec);spec.loader.exec_module(deck)
for name in ['dsh-api-session-controller','dsh-client-ui-renderer','dsh-client-ui-conversation','dsh-client-ui-workspace']:
    f=engine/name/'lib/client.js';f.write_text(deck.patch(name,f.read_text(),'0.1.5-rc.1'))
f=engine/'dsh-agent-loop/lib/index.js'; f.write_text(patch_agent_loop(f.read_text()))
f=engine/'dsh-attachment-local/lib/index.js'; f.write_text(patch_attachment_store(f.read_text()))
for package, patcher in [('dsh-session-format-v1-to-v2', patch_legacy_codex_migration),
                         ('dsh-session-format-v2-to-v3', patch_legacy_live_migration)]:
    migration = engine/package/'lib/index.js'
    migration.write_text(patcher(migration.read_text()))
    shutil.copy2(migration, a.assets/'patched'/f'{package}-index.js')
spec = importlib.util.spec_from_file_location('catalog', ROOT/'scripts/patch-model-catalog.py')
catalog = importlib.util.module_from_spec(spec); spec.loader.exec_module(catalog)
model_host = engine/'dsh-api-session-controller/lib/index.js'
model_host.write_text(catalog.patch(model_host.read_bytes()))
shutil.copy2(model_host, a.assets/'patched/model-catalog-host-015.js')
selection_client = engine/'dsh-api-session-controller/lib/client.js'
selection_client.write_bytes(patch_session_selection(selection_client.read_bytes()))
shutil.copy2(selection_client, a.assets/'patched/session-selection-client-015.js')
responsive=ROOT/'android-shell/dsh-client-ui-responsive'
(a.assets/'patched/responsive-client-033.js').write_text((responsive/'lib/client.js').read_text().replace(str(responsive)+'/', ''))
# EngineManager also applies these assets at startup: they must be the new
# engine's payload, never stale 0.1.2 bundles with a matching filename.
shutil.copy2(f,a.assets/'patched/attachment-local-index.js')
for asset,source in {
    'voice-deck-client.js':'plugins/dsh-client-ui-voice-deck/lib/client.js',
    'voice-input-client.js':'plugins/dsh-android-voice-input/lib/client.js',
    'codex-image-input.js':'vendor/relay-dsh-plugin-codex/lib/host-plugin.js',
}.items(): shutil.copy2(ROOT/'android-shell'/source,a.assets/'patched'/asset)
for script in ['stage-speech-services.py','stage-startup-appearance.py','stage-task-notifications.py','stage-xiaomi-remote.py']:
    spec=importlib.util.spec_from_file_location('stage',ROOT/'scripts'/script)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);m.stage(a.assets)
(a.runtime/'.deepcode-overlay').write_text(json.dumps({'upstream':'c7746e89d38462bd695ca3d72c8874dc5278958d','engine':'0.1.5-rc.1','abi':a.abi,'sourceSha256':BASE_SHA[a.abi]})+'\n')
print('Staged DeepCode plugins over verified upstream', a.abi, 'runtime')
