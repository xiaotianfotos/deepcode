"""Add Live assets to a verified donor runtime without reverting its other patches."""
import hashlib
import pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
def replace(s,old,new):
    assert s.count(old)==1, f'Unsupported installed build: {old[:65]}'
    return s.replace(old,new)
def prepare(runtime,host_path,host_sha):
    data=host_path.read_bytes();assert hashlib.sha256(data).hexdigest()==host_sha,'Codex host baseline hash mismatch'
    host=data.decode()
    host=replace(host,'  const client = new AndroidCodexClient(', '  args = ["-c","features.realtime_conversation=true",...args];\n  const client = new AndroidCodexClient(')
    host=replace(host,'  const account = new CodexAccount(', "  const runtime={client,enabled:()=>enabled,binding:null,voice:null};\n  ctx.provide('androidCodexRuntime',runtime);\n  const account = new CodexAccount(")
    host=replace(host,'hasActiveTurns: () => client.hasActiveWork','hasActiveTurns: () => client.hasActiveWork || !!runtime.voice?.busy')
    host=replace(host,'codex: { client }','codex: { client, onLiveRuntime:binding=>{runtime.binding=binding} }')
    base=runtime/'assets/patched'
    relay=(base/'codex-image-input.js').read_text()
    relay=replace(relay, '"features.realtime_conversation": false', '"features.realtime_conversation": true')
    relay=replace(relay, '...this.bypassHookTrust ? { config: { bypass_hook_trust: true } } : {},', 'config: { "features.realtime_conversation": true, ...this.bypassHookTrust ? { bypass_hook_trust: true } : {} },')
    source=(ROOT/'android-shell/vendor/relay-dsh-plugin-codex/lib/host-plugin.js').read_text()
    hook=source[source.index('            // deepcode-live-binding-start'):source.index('            // deepcode-live-binding-end')]+ '            // deepcode-live-binding-end\n'
    relay=replace(relay,'\t\t\tdefer(ctx.llm.registerAdapter([CODEX_PROVIDER], adapter));',hook+'\t\t\tdefer(ctx.llm.registerAdapter([CODEX_PROVIDER], adapter));')
    assets={'android-manage-host.js':(ROOT/'android-shell/plugins/dsh-android-manage/lib/index.js').read_bytes(),
            'codex-live-host.js':host.encode(),
            'codex-image-input.js':relay.encode(),'voice-input-client.js':(ROOT/'android-shell/plugins/dsh-android-voice-input/lib/client.js').read_bytes()}
    for name,content in assets.items():(base/name).write_bytes(content)
    plugin=ROOT/'android-shell/plugins/dsh-codex-live'
    managed=runtime/'assets/plugins/dsh-codex-live'
    for name in ['package.json','LICENSE','lib/index.js','lib/client.js']:
        target=managed/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes((plugin/name).read_bytes())
    composition=b"\n# bundled-codex-live-plugin\n- insert:\n    - id: codex-live\n      name: '@dsh-android/dsh-codex-live'\n"
    (base/'codex-live-composition.yml').write_bytes(composition)
    result = {'assets/patched/'+name:hashlib.sha256(content).hexdigest() for name,content in assets.items()}
    result['assets/patched/codex-live-composition.yml']=hashlib.sha256(composition).hexdigest()
    for path in managed.rglob('*'):
        if path.is_file():result[path.relative_to(runtime).as_posix()]=hashlib.sha256(path.read_bytes()).hexdigest()
    for name in ['webrtc-sdk-LICENSE.txt','webrtc-NOTICES.md']:
        content=(ROOT/'android-shell/app/src/main/assets/licenses'/name).read_bytes()
        (runtime/'assets/licenses'/name).write_bytes(content)
        result['assets/licenses/'+name]=hashlib.sha256(content).hexdigest()
    return result
