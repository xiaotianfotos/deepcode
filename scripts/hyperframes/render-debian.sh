#!/bin/bash
# Capability preview only; not the custom Electron final-delivery pipeline.
set -euo pipefail
export PATH=/root/hyperframes-env/node-v22.23.2-linux-arm64/bin:$PATH
export HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_RUN_ID=pad9-ane-mg-20260909
export HYPERFRAMES_BROWSER_PATH=/usr/bin/chromium
export PRODUCER_FORCE_SCREENSHOT=true PRODUCER_EXPERIMENTAL_FAST_CAPTURE=false
export PRODUCER_ENABLE_STREAMING_ENCODE=true
run=preview-$(date -u +%Y%m%dT%H%M%SZ)
export TMPDIR=/root/hyperframes-env/scratch/$run
mkdir -p "$TMPDIR" /workspace/test-output
trap 'rm -rf -- "$TMPDIR"' EXIT
cd /workspace/project
HF=/root/hyperframes-env/node_modules/.bin/hyperframes
"$HF" snapshot --at 0.1,1.5,2.9 --no-browser-gpu --json > /workspace/snapshot.json 2>&1
start=$(date +%s)
"$HF" render --fps 60 --quality draft --workers 1 --no-browser-gpu --low-memory-mode --frames-cache-dir off --output "/workspace/test-output/$run.staging.mp4" > /workspace/render.log 2>&1
finish=$(date +%s)
ffprobe -v error -count_frames -show_streams -show_format -of json "/workspace/test-output/$run.staging.mp4" > /workspace/render-ffprobe.json
python3 - "$run" "$start" "$finish" <<'PY'
import json,sys,hashlib,os
from pathlib import Path
run,start,end=sys.argv[1],int(sys.argv[2]),int(sys.argv[3])
p=Path('/workspace/test-output')/(run+'.staging.mp4')
data=json.loads(Path('/workspace/render-ffprobe.json').read_text())
v=next(s for s in data['streams'] if s['codec_type']=='video')
assert (v['width'],v['height'])==(3840,2160),v
assert v['r_frame_rate']=='60/1',v
assert int(v['nb_read_frames'])==181,v
report={'run':run,'renderer':'HyperFrames 0.8.33 CLI faithful screenshot preview','device':'Xiaomi Pad 9 Pro Max','platform':'Debian Linux ARM64 in DeepCode','wallSeconds':end-start,'frames':181,'fps':60,'width':3840,'height':2160,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
final=p.with_name(run+'.mp4'); os.replace(p,final)
report['file']=str(final)
Path('/workspace/render-result.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
PY
