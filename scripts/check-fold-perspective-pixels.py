"""Reject blank physical screenshots; verify the stationary inner half pixel-for-pixel."""
from PIL import Image
import numpy as np
import json,pathlib,sys
p=pathlib.Path(sys.argv[1]);frames={};coverage={}
for panel in ('inner','outer'):
 for angle in (0,60,120,180):
  name=f'{panel}-{angle}'
  a=np.array(Image.open(p/(name+'.png')).convert('RGB'));frames[name]=a
  coverage[name]=float(np.mean(a.max(axis=2)>40))
  assert coverage[name]>.75,(name,'Physical screenshot is blank or severely clipped',coverage[name])
a,b=frames['inner-120'],frames['inner-180'];assert a.shape==b.shape
h,w=a.shape[:2];roi=(slice(int(h*.08),int(h*.9)),slice(int(w*.6),int(w*.95)))
diff=int(np.abs(a[roi].astype(int)-b[roi].astype(int)).max())
assert diff==0,('Stationary right inner region changed',diff)
result={'physicalScreensNonblank':True,'stationaryRightMaxDifference':diff,'litCoverage':coverage,'physicalFoldVerified':False}
(p/'pixel-checks.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
