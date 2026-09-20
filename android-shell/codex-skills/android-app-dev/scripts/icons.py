#!/usr/bin/env python3
"""Package a project-local generated icon into Android resources on-device."""
import argparse
from pathlib import Path
import re
import shutil
from device_runtime import FILES, debian

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--project',type=Path,required=True)
p.add_argument('--source',required=True,help='Path relative to project, e.g. assets/icon.png')
p.add_argument('--background',default='#101824')
a=p.parse_args()
project=a.project.resolve(strict=True)
source=(project/a.source).resolve(strict=True)
relative=source.relative_to(project)
if not re.fullmatch(r'#[0-9a-fA-F]{6}',a.background): p.error('background must be #RRGGBB')
dest=FILES/'home/.dsh/debian/current/root/android-app-lab/package_icons.py'
dest.parent.mkdir(parents=True,exist_ok=True)
shutil.copyfile(Path(__file__).with_name('package_icons.py'),dest)
debian(project,['python3','/root/android-app-lab/package_icons.py','/workspace/'+str(relative),a.background],timeout=90)
