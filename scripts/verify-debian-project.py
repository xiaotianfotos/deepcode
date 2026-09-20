#!/usr/bin/env python3
"""Read real project outputs over ADB and validate media with host ffprobe."""
import argparse,hashlib,json,subprocess
from lib.dsh_device import Device,ROOT
p=argparse.ArgumentParser();p.add_argument('serial');p.add_argument('--root',required=True);a=p.parse_args();d=Device(a.serial)
arch={'arm64-v8a':'arm64','x86_64':'x64'}[d.shell('getprop','ro.product.cpu.abi')]
def read(name):
 path=a.root+'/'+name
 return d.read(path) if a.root.startswith('/data/') else d.command('exec-out','cat',path).stdout
movie=read('debian-media-test.mp4')
probe=subprocess.run(['ffprobe','-v','error','-show_entries','stream=codec_name,width,height,nb_frames','-show_entries','format=duration','-of','json','-i','pipe:0'],input=movie,capture_output=True,check=True)
media=json.loads(probe.stdout);stream=media['streams'][0]
assert stream['codec_name']=='h264' and stream['width']==320 and stream['height']==240 and stream['nb_frames']=='10'
assert float(media['format']['duration'])==1
node=json.loads(read('debian-node.json'));native=json.loads(read('debian-native.json'))
assert node['platform']=='linux' and node['arch']==arch and node['result']==42 and native['native_extension']==42
report={'serial':a.serial,'root':a.root,'movie_bytes':len(movie),'movie_sha256':hashlib.sha256(movie).hexdigest(),'media':media,'node':node,'native':native,'package_versions':read('debian-package-versions.txt').decode(),'passed':True}
(ROOT/'artifacts'/('debian-project-'+a.serial.replace(':','_')+'.json')).write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
