"""Check native compositor screenshots, not CDP captures (which omit RenderEffect)."""
from pathlib import Path
import sys,json
import numpy as np
from PIL import Image
folder=Path(sys.argv[1])
meta=json.loads((folder/'gpu-preview.json').read_text())
clear=np.asarray(Image.open(folder/'clear.png').convert('RGB'),dtype=float)
end=np.asarray(Image.open(folder/'cleared.png').convert('RGB'),dtype=float)
h=round(meta['initial']['height']*meta['initial']['dpr']);w=round(meta['initial']['width']*meta['initial']['dpr'])
assert abs(clear.shape[1]-w)<=3 and clear.shape[0]>=h,(clear.shape,w,h)
w=clear.shape[1] # CSS innerWidth rounds to integer CSS pixels
results=[]
for amount in [.5,1]:
 image=np.asarray(Image.open(folder/f'gradient-{amount}.png').convert('RGB'),dtype=float)
 # Sine gratings have the same source contrast everywhere; use small windows
 # so a varying sigma does not average a blurred and a clear region together.
 bands={}
 for band,(ya,yb) in {'horizontal_sampling':(.28,.37),'vertical_sampling':(.58,.67)}.items():
  y0,y1=int(h*ya),int(h*yb);contrasts=[];errors=[]
  for x in [.04,.25,.5,.75,.97]:
   x0,x1=int(w*(x-.015)),int(w*(x+.015))
   original=clear[y0:y1,x0:x1,0];rendered=image[y0:y1,x0:x1,0]
   contrasts.append(float(rendered.std()/original.std()))
   errors.append(float(np.abs(rendered-original).mean()))
  assert contrasts[0]<.55,(amount,band,'Left is not blurred',contrasts)
  assert contrasts[-1]>.98,(amount,band,'Right is not clear',contrasts)
  assert errors[-1]<1,(amount,band,'Right pixels shifted or tinted',errors)
  assert all(b>=a-.13 for a,b in zip(contrasts,contrasts[1:])),(amount,band,'Nonmonotonic clarity',contrasts)
  bands[band]={'contrastRatioLeftToRight':contrasts,'meanPixelErrorLeftToRight':errors}
 results.append({'amount':amount,'bands':bands})
# Static test content must return exactly to its starting pixels.
restore=float(np.abs(clear[:h]-end[:h]).mean());assert restore<.1,restore
out={'passed':True,'nativeCompositorPixels':True,'xSamples':[.04,.25,.5,.75,.97],'results':results,'restoreMeanPixelError':restore}
(folder/'pixel-check.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
