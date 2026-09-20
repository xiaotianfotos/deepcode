#!/usr/bin/env python3
"""Independently inspect real APK-produced output from all three storage classes."""
import hashlib,json,subprocess
from lib.dsh_device import Device,ROOT,PKG

d=Device('emulator-5580')
report={'scenario':'independent-output-verification','checks':[]}
for name,root in [('shared','/storage/emulated/0/Documents/DSH-storage-test'),('removable','/storage/86FB-1E11/DSH-storage-test'),('private','files/home/projects/debian-milestone')]:
 def read(filename):
  return d.read(root+'/'+filename) if name=='private' else d.command('exec-out','cat',root+'/'+filename).stdout
 movie=read('debian-media-test.mp4')
 probe=subprocess.run(['ffprobe','-v','error','-show_entries','stream=codec_name,width,height,nb_frames','-show_entries','format=duration','-of','json','-i','pipe:0'],input=movie,capture_output=True,check=True)
 media=json.loads(probe.stdout);stream=media['streams'][0]
 assert stream['codec_name']=='h264' and stream['width']==320 and stream['height']==240 and stream['nb_frames']=='10'
 assert float(media['format']['duration'])==1
 node=json.loads(read('debian-node.json'));native=json.loads(read('debian-native.json'))
 assert node['platform']=='linux' and node['arch']=='x64' and node['result']==42 and native['native_extension']==42
 report['checks'].append({'storage':name,'path':root,'movie_bytes':len(movie),'movie_sha256':hashlib.sha256(movie).hexdigest(),'media':media,'node':node,'native':native})
 if name=='private':(ROOT/'artifacts/debian-package-versions.txt').write_bytes(read('debian-package-versions.txt'))
report['passed']=True
(ROOT/'artifacts/debian-output-verification.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
