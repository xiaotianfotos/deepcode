"""Stage built speech plugin resources; does not download models or build an APK."""
from pathlib import Path
import hashlib
ROOT=Path(__file__).resolve().parents[1]
def stage(assets):
    assets=Path(assets);plugin=ROOT/'android-shell/plugins/dsh-speech-services';result={}
    for name in ['package.json','LICENSE','THIRD-PARTY-NOTICES.txt','lib/index.js','lib/client.js']:
        target=assets/'plugins/dsh-speech-services'/name;target.parent.mkdir(parents=True,exist_ok=True)
        data=(plugin/name).read_bytes();target.write_bytes(data);result['assets/'+str(target.relative_to(assets))]=hashlib.sha256(data).hexdigest()
    target=assets/'patched/speech-services-composition.yml';target.parent.mkdir(parents=True,exist_ok=True)
    data=b"\n# bundled-speech-services-plugin\n- insert:\n    - id: speech-services\n      name: '@dsh-android/dsh-speech-services'\n"
    target.write_bytes(data);result['assets/patched/speech-services-composition.yml']=hashlib.sha256(data).hexdigest()
    return result
if __name__=='__main__':stage(ROOT/'android-shell/app/src/main/assets')
