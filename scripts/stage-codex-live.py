"""Stage the built GPT Live plugin, preserving the donor's Codex runtime and patches."""
from pathlib import Path
import hashlib
ROOT=Path(__file__).resolve().parents[1]
def stage(assets):
    assets=Path(assets);plugin=ROOT/'android-shell/plugins/dsh-codex-live';result={}
    for name in ['package.json','LICENSE','lib/index.js','lib/client.js']:
        target=assets/'plugins/dsh-codex-live'/name
        target.parent.mkdir(parents=True,exist_ok=True)
        data=(plugin/name).read_bytes();target.write_bytes(data)
        result['assets/'+str(target.relative_to(assets))]=hashlib.sha256(data).hexdigest()
    return result
if __name__=='__main__':stage(ROOT/'android-shell/app/src/main/assets')
