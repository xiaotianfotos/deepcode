"""Check physical screenshot contrast, including independently clear inner pixels."""
from PIL import Image
import numpy as np
import json,pathlib,sys
p=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'docs/validation/2026-09-10-fold-gradient/dual/inner-upright')
result={}
for screen in ['inner','outer']:
 def contrast(name):
  im=Image.open(p/(name+'.png')).convert('L')
  if screen=='inner' and im.width<im.height:im=im.transpose(Image.Transpose.ROTATE_270)
  a=np.asarray(im,dtype=float);h,w=a.shape
  return np.array([float(a[int(h*.3):int(h*.6),int(w*(x-.04)):int(w*(x+.04))].std()) for x in [.1,.3,.5,.7,.9]])
 base=contrast(screen+'-clear')
 assert min(base)>40,(screen,'pattern did not reach the physical display',base)
 result[screen]={str(angle):np.round(contrast(screen+'-'+str(angle))/base,3).tolist() for angle in [20,45,70,120,160]}
inner=np.array(list(result['inner'].values()))
assert inner[0,2]<.15,'Occluded fixed inner panel became clear too early'
assert inner[2,3]>.95,'Visible right inner region is not clear'
assert inner[-1,0]>.95,'Opening did not reveal the inner left region'
assert np.all(np.diff(inner,axis=0)>-.05),'Inner became blurrier on opening'
outer=np.array(list(result['outer'].values()))
assert np.all(np.diff(outer,axis=0)<.05),'Cover became clearer as angle increased'
assert outer[2,0]>.95 and outer[2,-1]<.08 and outer[2,2]<.08,'Cover blur region is wrong'
(p/'contrasts.json').write_text(json.dumps(result,indent=2))
print(json.dumps({'onlyRevealedInnerRegionIsClear':True,'outerBlurExpandsRightToLeft':True,'normalizedContrast':result},indent=2))

# Asymmetric top/bottom markers also detect vertical inversion, independently
# of the horizontal blur contrast checks above.
im=Image.open(p/'inner-160.png').convert('RGB')
if im.width<im.height:im=im.transpose(Image.Transpose.ROTATE_270)
a=np.asarray(im,dtype=float);h,w=a.shape[:2]
upper=a[10:35,int(w*.6):int(w*.85)].mean(axis=(0,1))
lower=a[-35:-10,int(w*.6):int(w*.85)].mean(axis=(0,1))
assert upper[0]>upper[2]*2 and lower[2]>lower[0]*2,'Inner top/bottom are reversed'
(p/'orientation.json').write_text(json.dumps({'passed':True,'topRed':upper.tolist(),'bottomBlue':lower.tolist(),'physicalPortraitToAcceptedLandscape':270},indent=2))
print('Inner top/bottom orientation markers: PASS')
