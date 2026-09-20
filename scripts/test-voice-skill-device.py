#!/usr/bin/env python3
"""Run the deployed skill in one real Codex session, preserving global defaults."""
import argparse,json,pathlib,sys,time,uuid
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent/'lib'))
from dsh_device import Device
p=argparse.ArgumentParser();p.add_argument('serial');p.add_argument('device',choices=['yingtian','lhasa']);a=p.parse_args()
d=Device(a.serial);out=pathlib.Path('docs/validation/2026-09-12-voice-production')/a.device;out.mkdir(parents=True,exist_ok=True)
work='/storage/emulated/0/work/voice-production-20260912'
skill='/data/user/0/com.dsharnessmobile.shell/files/home/.dsh/codex-android/home/skills/android-transcribe'
try:
 assert d.shell('getprop','ro.product.device')==a.device
 assert not any(x.get('running') for x in d.rpc('session/list',{'_request':{}})['items'])
 assert not (out/'session.json').exists(),'Reuse the recorded session instead of duplicating it'
 sid=d.rpc('session/create',{'request':{'cwd':work,'agentPreset':'standard'}})['sessionId']
 (out/'session.json').write_text(json.dumps({'sessionId':sid,'work':work},indent=2)+'\n')
 d.rpc('session/rename',{'request':{'sessionId':sid,'title':'KleidiAI 正式语音与字幕验收'}})
 d.rpc('commands/execute',{'agentId':sid,'line':'/permission danger-full-access','images':[]})
 default=next(n for n in d.rpc('settings/describe',{})['namespaces'] if n['ns']=='agent-default-model')
 try:d.rpc('session/selectModel',{'request':{'sessionId':sid,'provider':'relay-codex','model':'gpt-6-astra','reasoningEffort':'medium'}})
 finally:
  now=next(n for n in d.rpc('settings/describe',{})['namespaces'] if n['ns']=='agent-default-model')
  d.rpc('settings/replace',{'ns':'agent-default-model','section':default.get('user',{}),'expectedRevision':now['revision']})
 prompt=f'''验证手机本地新版语音skill。请读取 {skill}/SKILL.md，然后在Android宿主shell（不进入Debian）执行：
python3 {skill}/scripts/transcribe.py --doctor
python3 {skill}/scripts/transcribe.py {work}/oss-first60.mp4 --output {work}/kleidiai-minute --duration 60 --aligner vulkan
python3 {skill}/scripts/transcribe.py {work}/asr_zh.wav --output {work}/compatibility-short --asr-engine compatibility --aligner vulkan
等待每条命令完成，读取两个report.json，报告实际asrEngine、RTF、Vulkan矩阵节点和字幕条数。它们是公开测试样本；不需要安装软件或更改配置，不读凭据，不使用ADB，不创建其他工程。如遇失败请原样报告，不擅自修改引擎或脚本。'''
 d.rpc('session/prompt',{'request':{'sessionId':sid,'requestId':uuid.uuid4().hex,'mode':'queue','content':[{'type':'text','text':prompt}]}})
 print('Started real Codex skill validation',a.device,sid,flush=True)
 deadline=time.monotonic()+600
 while time.monotonic()<deadline:
  time.sleep(2)
  row=next(x for x in d.rpc('session/list',{'_request':{}})['items'] if x['sessionId']==sid)
  if row['running']:continue
  records=d.session_records(sid)
  if any(r.get('event',{}).get('type')=='turn/end' for r in records):break
 else:raise RuntimeError('Validation session still running; inspect recorded session')
 for folder,engine in [('kleidiai-minute','kleidiai'),('compatibility-short','compatibility')]:
  report=json.loads(d.command('exec-out','cat',work+'/'+folder+'/report.json').stdout)
  assert report['asrEngine']==engine
  assert all(s['alignerAttempts'][-1]['requested']=='vulkan' and sum(n['gpu'] for n in s['alignerAttempts'][-1]['matmulNodes'])>0 for s in report['samples'])
  for file in ['report.json','transcript.txt','transcript.srt','transcript.timestamps.json']:
   target=out/folder/file;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(d.command('exec-out','cat',work+'/'+folder+'/'+file).stdout)
  print(a.device,folder,'passed',report['wallMs'],'ms','RTF',round(report['rtf'],3),flush=True)
 (out/'acceptance.json').write_text(json.dumps({'passed':True,'domain':'real Codex tool / application UID','sessionId':sid,'outputs':[work+'/kleidiai-minute',work+'/compatibility-short']},indent=2)+'\n')
finally:d.close()
