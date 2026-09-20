#!/usr/bin/env python3
"""Feasibility probe: existing Android llama.cpp ASR -> independent Qwen aligner.
Runs through ADB shell, NOT proof of ordinary APK-domain execution/tool mounting.
Uses public ASR fixtures or the authorized OSS tutorial first-minute excerpt.
No user chats or microphone recordings read.
"""
import argparse,base64,hashlib,json,os,pathlib,re,secrets,shlex,subprocess,sys,time,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts/lib'))
from dsh_device import Device
p=argparse.ArgumentParser();p.add_argument('serial');p.add_argument('--minute',action='store_true');p.add_argument('--gpu',action='store_true');p.add_argument('--aligner-gpu',action='store_true');args=p.parse_args()
d=Device(args.serial);server=None;port=None;pid=None
remote='/data/local/tmp/dsh-forced-aligner-20260911'
out=ROOT/'docs/validation/2026-09-11-forced-aligner';out.mkdir(exist_ok=True,parents=True)
quote=shlex.quote
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
try:
 assert d.shell('getprop','ro.product.device')=='yingtian'
 assert not any(i.get('running') for i in d.rpc('session/list',{'_request':{}})['items'])
 native=json.loads(d.read('files/network-dns.json'))['nativeLibraryDir']+'/libdsh_voice_server.so'
 key=secrets.token_hex(24);device_port=19387
 flags=[native,'-m','/storage/emulated/0/work/models/qwen3-asr/Qwen3-ASR-0.6B-Q8_0.gguf','--mmproj','/storage/emulated/0/work/models/qwen3-asr/mmproj-Qwen3-ASR-0.6B-Q8_0.gguf','--host','127.0.0.1','--port',str(device_port),'-c','4096','-b','512','-ub','256','-np','1','-t','4','-tb','4','--no-warmup','--jinja','--cache-ram','0','--no-webui','--device','none','-ngl','0','--no-mmproj-offload']
 if args.gpu:
  flags=flags[:-5]+['--device','Vulkan0','-ngl','99','-lv','4']
 command='echo $$ > '+remote+'/asr.pid; LLAMA_API_KEY='+quote(key)+' exec '+shlex.join(flags)
 log=open(ROOT/('artifacts/aligner-lab/asr-server-gpu.log' if args.gpu else 'artifacts/aligner-lab/asr-server.log'),'wb')
 server=subprocess.Popen(d.adb+['shell',command],stdout=log,stderr=subprocess.STDOUT)
 port=int(d.command('forward','tcp:0','tcp:'+str(device_port)).stdout)
 def request(route,body=None):
  data=None if body is None else json.dumps(body).encode()
  req=urllib.request.Request(f'http://127.0.0.1:{port}'+route,data=data,headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
  with opener.open(req,timeout=120) as r:return json.load(r)
 load_start=time.monotonic()
 for _ in range(120):
  if server.poll() is not None:raise RuntimeError('ASR exited; inspect local private log')
  try:
   if request('/health').get('status')=='ok':break
  except OSError:time.sleep(.25)
 else:raise RuntimeError('ASR load timeout')
 pid=d.shell('cat',remote+'/asr.pid');assert pid.isdigit()
 report={'executionDomain':'adb-shell; production app integration not yet verified','device':'yingtian','asr':'existing packaged llama.cpp '+('Vulkan' if args.gpu else 'CPU')+' / Qwen3-ASR-0.6B Q8_0','aligner':'predict-woo Qwen3 ForcedAligner Q8_0 '+('Vulkan' if args.aligner_gpu else 'CPU'),'threads':4,'samples':[]}
 report['asrLoadMs']=round((time.monotonic()-load_start)*1000)
 benchmark_start=time.monotonic()
 segments=json.loads((out/'pad-segments60.json').read_text()) if args.minute else None
 items=segments['chunks'] if segments else [{'index':0,'language':'zh'},{'index':1,'language':'en'}]
 for item in items:
  lang=item.get('language','zh');name=f"chunk-{item['index']:03d}" if args.minute else 'asr_'+lang
  audio=(ROOT/('artifacts/aligner-lab/'+name+'.wav' if args.minute else f'asr-lab/app/src/main/assets/samples/asr_{lang}.wav')).read_bytes()
  if not args.minute:
   converted=ROOT/'artifacts/aligner-lab'/('normalized-'+lang+'.wav')
   subprocess.run(['ffmpeg','-nostdin','-v','error','-i',str(ROOT/f'asr-lab/app/src/main/assets/samples/asr_{lang}.wav'),'-ac','1','-ar','16000','-c:a','pcm_s16le','-y',str(converted)],check=True)
   d.command('push',str(converted),remote+'/'+name+'.wav')

  body={'messages':[{'role':'system','content':''},{'role':'user','content':[{'type':'input_audio','input_audio':{'data':base64.b64encode(audio).decode(),'format':'wav'}}]}],'temperature':0,'max_tokens':512,'stream':False,'cache_prompt':False}
  start=time.monotonic();r=request('/v1/chat/completions',body);asr_ms=round((time.monotonic()-start)*1000)
  choice=r['choices'][0];assert choice['finish_reason']=='stop'
  text=choice['message']['content'].split('<asr_text>')[-1].strip();assert text
  align=[remote+('/libdsh_aligner_igpu.so' if args.aligner_gpu else '/libdsh_aligner.so' if args.minute else '/qwen3-asr-cli'),'-m','/storage/emulated/0/work/models/qwen3-forced-aligner/qwen3-forced-aligner-0.6b-q8_0.gguf','-f',remote+'/'+name+'.wav','--align','--text',text,'--language','Chinese' if lang=='zh' else 'English','-t','4','-o',remote+'/'+name+'-pipeline.json']
  start=time.monotonic();res=d.command('shell',('QWEN_DIAGNOSTICS=1 QWEN_USE_VRAM=1 ' if args.aligner_gpu else '')+'LD_LIBRARY_PATH='+remote+' '+shlex.join(align),timeout=180);align_wall_ms=round((time.monotonic()-start)*1000)
  words=json.loads(d.command('exec-out','cat',remote+'/'+name+'-pipeline.json').stdout)['words'];assert words
  assert all(w['start']>=0 and w['end']>=w['start'] for w in words)
  assert all(a['end']<=b['start'] for a,b in zip(words,words[1:]))
  timing=re.search(rb'Total:\s+(\d+) ms',res.stdout+res.stderr)
  backend_nodes=re.findall(rb'ALIGNER_MATMUL gpu=(\d+) cpu=(\d+) backend=(\S+)',res.stdout+res.stderr)
  if args.aligner_gpu:assert backend_nodes and sum(int(v[0]) for v in backend_nodes)>0,'GPU silently fell back to CPU'
  sample={'alignerBackendNodes':[{'gpu':int(g),'cpu':int(cpu),'backend':name.decode()} for g,cpu,name in backend_nodes],'index':item['index'],'offsetSeconds':item.get('start',0),'audioSeconds':item.get('seconds'),'language':lang,'text':text,'asrMs':asr_ms,'alignWallMsIncludingLoadAndAdb':align_wall_ms,'alignInferenceMs':int(timing[1]) if timing else None,'words':words}
  report['samples'].append(sample);print(json.dumps({k:v for k,v in sample.items() if k not in ['words','text','alignerBackendNodes']},ensure_ascii=False),flush=True)
 report['pipelineWallMs']=round((time.monotonic()-benchmark_start)*1000)
 if segments:
  report['durationSeconds']=segments['durationSeconds'];report['segmentMs']=segments['segmentMs']
  report['processingRtf']=(report['pipelineWallMs']+report['segmentMs'])/(1000*segments['durationSeconds'])
  report['coldRtf']=(report['pipelineWallMs']+report['segmentMs']+report['asrLoadMs'])/(1000*segments['durationSeconds'])
  report['excludes']='Host FFmpeg extraction, model download, device file transfer; includes ADB command and HTTP roundtrips'
 (out/((('pad-minute-all-vulkan.json' if args.gpu else 'pad-minute-cpu-asr-gpu-aligner.json') if args.aligner_gpu else 'pad-minute-gpu-asr.json' if args.gpu else 'pad-minute.json') if args.minute else 'pad-pipeline.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({k:v for k,v in report.items() if k!='samples'},ensure_ascii=False),flush=True)
finally:
 if pid:
  # Only kill the PID this probe wrote, and only while it still hosts our native ASR executable.
  cmdline=d.command('exec-out','cat','/proc/'+pid+'/cmdline',check=False).stdout
  if b'libdsh_voice_server.so' in cmdline:d.command('shell','kill',pid,check=False)
 if server:
  try:server.wait(timeout=5)
  except subprocess.TimeoutExpired:server.terminate()
 if port:d.command('forward','--remove','tcp:'+str(port),check=False)
 d.close()
