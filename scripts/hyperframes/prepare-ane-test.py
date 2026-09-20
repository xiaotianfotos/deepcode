#!/usr/bin/env python3
"""Copy only the ANE mystery MG and its authored dependencies; never traverse masters."""
import argparse, hashlib, json, shutil
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('--source',type=Path,required=True)
p.add_argument('--output',type=Path,required=True)
a=p.parse_args()
a.output.mkdir(parents=True,exist_ok=False)
files=['compositions/mystery.html','assets/gsap.min.js','assets/chinese-bold.ttc','assets/chinese-regular.ttc']
manifest={'source':str(a.source),'purpose':'Android Debian capability preview; MG only, no master media','files':[]}
for rel in files:
 src=a.source/rel
 if src.is_symlink(): raise RuntimeError(f'Unexpected symlink: {src}')
 dst=a.output/rel; dst.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(src,dst)
 manifest['files'].append({'path':rel,'bytes':dst.stat().st_size,'sha256':hashlib.sha256(dst.read_bytes()).hexdigest()})
(a.output/'index.html').write_text('''<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>ANE MG — Android capability test</title>
<script src="assets/gsap.min.js"></script>
<style>html,body{margin:0;background:#f2ede4}#main{position:relative;width:3840px;height:2160px;overflow:hidden}.clip{position:absolute;inset:0;width:3840px;height:2160px}</style>
</head><body>
<div id="main" data-composition-id="main" data-width="3840" data-height="2160" data-duration="3.0166666666666666">
<div id="mystery" class="clip" data-composition-id="mystery" data-composition-src="compositions/mystery.html" data-start="0" data-duration="3.0166666666666666" data-width="3840" data-height="2160" data-track-index="1"></div>
</div><script>window.__timelines=window.__timelines||{};window.__timelines.main=gsap.timeline({paused:true});</script></body></html>
''')
(a.output/'package.json').write_text(json.dumps({'name':'ane-mg-pad9-test','private':True,'type':'module','scripts':{'check':'npx --yes hyperframes@0.8.33 check --no-browser-gpu'}},indent=2)+'\n')
(a.output/'source-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'output':str(a.output),'files':len(files),'bytes':sum(x['bytes'] for x in manifest['files'])}))
