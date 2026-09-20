"""Stage the optional Xiaomi remote plugin without changing the runtime snapshot."""
from pathlib import Path
import hashlib
import subprocess
ROOT=Path(__file__).resolve().parents[1]
def stage(assets):
    assets=Path(assets);plugin=ROOT/'android-shell/plugins/dsh-xiaomi-remote';result={}
    subprocess.run(['npm','run','build'],cwd=plugin,check=True)
    for name in ['package.json','LICENSE','lib/index.js','lib/client.js']:
        target=assets/'plugins/dsh-xiaomi-remote'/name;target.parent.mkdir(parents=True,exist_ok=True)
        data=(plugin/name).read_bytes();target.write_bytes(data);result['assets/'+str(target.relative_to(assets))]=hashlib.sha256(data).hexdigest()
    target=assets/'patched/xiaomi-remote-composition.yml';target.parent.mkdir(parents=True,exist_ok=True)
    data=b"\n# bundled-xiaomi-remote-plugin\n- insert:\n    - id: xiaomi-remote\n      name: '@dsh-android/dsh-xiaomi-remote'\n"
    target.write_bytes(data);result['assets/patched/xiaomi-remote-composition.yml']=hashlib.sha256(data).hexdigest()
    return result
if __name__=='__main__':stage(ROOT/'android-shell/app/src/main/assets')
