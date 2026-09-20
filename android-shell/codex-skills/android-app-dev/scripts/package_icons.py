#!/usr/bin/env python3
"""Deterministic resource conversion; run in Debian with python3-pil."""
from pathlib import Path
import sys
from PIL import Image, ImageOps

source=Image.open(sys.argv[1]).convert('RGBA')
background=sys.argv[2]
res=Path('/workspace/res')
for density,size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
    folder=res/('mipmap-'+density);folder.mkdir(parents=True,exist_ok=True)
    canvas=Image.new('RGBA',(size,size),background)
    layer=ImageOps.contain(source,(size,size),Image.Resampling.LANCZOS)
    canvas.alpha_composite(layer,((size-layer.width)//2,(size-layer.height)//2))
    canvas.save(folder/'ic_launcher.png')
# 108dp foreground with the artwork inside the central 66dp safe region.
folder=res/'drawable-nodpi';folder.mkdir(parents=True,exist_ok=True)
canvas=Image.new('RGBA',(432,432))
layer=ImageOps.contain(source,(264,264),Image.Resampling.LANCZOS)
canvas.alpha_composite(layer,((432-layer.width)//2,(432-layer.height)//2))
canvas.save(folder/'ic_launcher_foreground.png')
folder=res/'mipmap-anydpi-v26';folder.mkdir(parents=True,exist_ok=True)
(folder/'ic_launcher.xml').write_text('''<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/ic_launcher_background" />
  <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>\n''')
folder=res/'values';folder.mkdir(parents=True,exist_ok=True)
(folder/'ic_launcher_colors.xml').write_text('<resources><color name="ic_launcher_background">'+background+'</color></resources>\n')
print('ANDROID_ICONS_PACKAGED: mipmap/ic_launcher (legacy + adaptive)')
