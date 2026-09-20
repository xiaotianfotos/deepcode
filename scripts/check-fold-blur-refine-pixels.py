"""Measure spatial sharpness and exact no-effect endpoint pixels on the Fold."""
from PIL import Image
import numpy as np
import json,pathlib,sys
p=pathlib.Path(sys.argv[1])
def read(panel,angle):
 a=np.array(Image.open(p/f'{panel}-{angle}.png').convert('RGB'))
 assert (a.max(axis=2)>40).mean()>.75,'Blank physical screen'
 return a
angles=[30,45,60,75,90,120]
inner={a:read('inner',a) for a in set([180,179,175,170,160]+angles)}
outer={a:read('outer',a) for a in (0,2,3,30,45,60,90)}
def region(a):return a[100:-100,10:-10]
for a in (175,179):
 assert np.array_equal(region(inner[a]),region(inner[180])),f'Residual inner filtering at {a}'
for a in (2,3):
 assert np.array_equal(region(outer[a]),region(outer[0])),f'Residual cover filtering at {a}'
def contrast(a,x):
 h,w=a.shape[:2];column=int(x*w)
 return float(a[int(h*.3):int(h*.7),column-24:column+24,:].mean(axis=(0,2)).std())
ratios={}
for x in (.75,.9):
 base=contrast(inner[180],x);assert base>30
 r=[contrast(inner[a],x)/base for a in angles]
 assert all(b>=a-.04 for a,b in zip(r,r[1:])),('Focus did not progressively resolve',x,r)
 assert r[0]<.4 and r[-1]>.98,(x,r)
 assert any(.05<v<.95 for v in r[1:-1]),('No intermediate focus state',x,r)
 ratios[str(x)]=r
result={'inner175And179ExactlyClear':True,'cover2And3ExactlyClear':True,
        'angles':angles,'rightRegionContrastRatios':ratios,
        'physicalScreensNonblank':True,'physicalFold':False}
(p/'pixel-checks.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
