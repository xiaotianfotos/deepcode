#!/usr/bin/env python3
"""Probe loaded tablet engine: context compatibility and paced independent chunks.

This replays a file over ADB, not microphone capture or native streaming ASR.
"""
import argparse, base64, concurrent.futures, io, json, subprocess, time, urllib.request, wave
from pathlib import Path

p=argparse.ArgumentParser()
p.add_argument('serial')
p.add_argument('--output', type=Path, required=True)
p.add_argument('--repeats', type=int, default=3, help='Chinese sample repetitions; 24 gives about 120 seconds')
p.add_argument('--skip-context', action='store_true')
p.add_argument('--stop-on-microphone', action='store_true', help='Stop adding requests when tablet app microphone app-op is running')
args=p.parse_args()
if args.repeats < 1 or args.repeats > 60:p.error('--repeats must be 1..60')
root=Path(__file__).resolve().parents[1]
def adb(*a):
    return subprocess.check_output(['adb','-s',args.serial,*a],text=True).strip()
connection=json.loads(adb('shell','run-as','com.dsharnessmobile.asrlab','cat','files/connection.json'))
port=adb('forward','tcp:0','tcp:8876')
results=[]
def request(wav,label,context='',due=None,capture_start=None):
    begin=time.monotonic()
    body={'messages':[{'role':'system','content':context},{'role':'user','content':[
        {'type':'input_audio','input_audio':{'data':base64.b64encode(wav).decode(),'format':'wav'}}]}],
        'temperature':0,'max_tokens':256,'stream':True,'cache_prompt':False}
    req=urllib.request.Request('http://127.0.0.1:'+port+'/v1/chat/completions',
        data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+connection['key'],'Content-Type':'application/json'})
    raw='';first=None;finish=None
    with urllib.request.urlopen(req,timeout=120) as response:
        for line in response:
            if not line.startswith(b'data: '):continue
            if line.strip()==b'data: [DONE]':break
            item=json.loads(line[6:])
            if 'error' in item:raise RuntimeError(item['error'])
            for choice in item.get('choices',[]):
                raw+=choice.get('delta',{}).get('content') or ''
                if '<asr_text>' in raw and raw.split('<asr_text>',1)[1].strip() and first is None:first=time.monotonic()
                finish=choice.get('finish_reason') or finish
    end=time.monotonic()
    with wave.open(io.BytesIO(wav)) as audio:duration=audio.getnframes()/audio.getframerate()
    result={'label':label,'context':context,'audioSeconds':duration,'requestSeconds':end-begin,
            'rtf':(end-begin)/duration,'firstTextSeconds':None if first is None else first-begin,
            'queueSeconds':None if due is None else begin-due,
            'captureToFirstTextSeconds':None if capture_start is None or first is None else first-capture_start,
            'text':raw.split('<asr_text>')[-1].strip(),'raw':raw,'finishReason':finish}
    results.append(result)
    print(json.dumps(result,ensure_ascii=False),flush=True)
    return result
try:
    sample=(root/'asr-lab/app/src/main/assets/samples/asr_zh.wav').read_bytes()
    if not args.skip_context:
        request(sample,'baseline')
        request(sample,'relevant-context','交易、停滞')
        request(sample,'unrelated-context','玄戒、澎湃 OS、HyperFrames')
    with wave.open(io.BytesIO(sample)) as audio:
        pcm=audio.readframes(audio.getnframes());sr=audio.getframerate();width=audio.getsampwidth()
    # Repeat the same public Chinese sample three times, with 0.8 s silence between.
    pcm=(pcm+b'\0'*(int(sr*0.8)*width))*args.repeats
    origin=time.monotonic();offset=0;futures=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        for i in range(0,len(pcm),2*sr*width):
            chunk=pcm[i:i+2*sr*width];duration=len(chunk)/(sr*width)
            segment_start=origin+offset;offset+=duration;due=origin+offset
            time.sleep(max(0,due-time.monotonic()))
            if args.stop_on_microphone:
                ops=adb('shell','cmd','appops','get','com.dsharnessmobile.asrlab','RECORD_AUDIO')
                if 'running' in ops.lower() or 'duration=-1' in ops:
                    print('Microphone active; stopping automatic input.',flush=True)
                    break
            wav=io.BytesIO()
            with wave.open(wav,'wb') as audio:
                audio.setnchannels(1);audio.setsampwidth(width);audio.setframerate(sr);audio.writeframes(chunk)
            futures.append(pool.submit(request,wav.getvalue(),'paced-2s-'+str(len(futures)+1),'',due,segment_start))
        for f in futures:f.result()
finally:
    adb('forward','--remove','tcp:'+port)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps({'model':connection['model'],'backendRequested':connection['backend'],
        'mode':'file replay paced at audio rate, independent chunks, ADB overhead included; not microphone',
        'results':results},ensure_ascii=False,indent=2)+'\n')
