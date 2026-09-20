"""Bounded offline segmentation: WebRTC VAD pauses, then a low-energy fallback.
All samples remain covered exactly once; offsets stay in source-audio seconds.
"""
import array,ctypes,json,math,pathlib,sys,time,wave

def segment(source,output,library):
 start=time.monotonic();output=pathlib.Path(output);output.mkdir(parents=True,exist_ok=True)
 with wave.open(str(source),'rb') as w:
  if (w.getframerate(),w.getnchannels(),w.getsampwidth())!=(16000,1,2):raise ValueError('Expected mono PCM16 / 16 kHz')
  pcm=w.readframes(w.getnframes())
 f=ctypes.CDLL(library);f.fvad_new.restype=ctypes.c_void_p
 f.fvad_free.argtypes=[ctypes.c_void_p];f.fvad_set_mode.argtypes=[ctypes.c_void_p,ctypes.c_int]
 f.fvad_set_sample_rate.argtypes=[ctypes.c_void_p,ctypes.c_int]
 f.fvad_process.argtypes=[ctypes.c_void_p,ctypes.POINTER(ctypes.c_int16),ctypes.c_size_t]
 vad=f.fvad_new();assert vad
 energy=[];gaps=[];quiet=None
 try:
  assert f.fvad_set_mode(vad,2)==0 and f.fvad_set_sample_rate(vad,16000)==0
  for i in range(0,len(pcm),640):
   frame=pcm[i:i+640].ljust(640,b'\0');buf=(ctypes.c_int16*320).from_buffer_copy(frame)
   voice=f.fvad_process(vad,buf,320);assert voice>=0
   energy.append(sum(x*x for x in array.array('h',frame))/320)
   t=i/32000
   if not voice and quiet is None:quiet=t
   if voice and quiet is not None:
    if t-quiet>=.20:gaps.append((quiet,t))
    quiet=None
 finally:f.fvad_free(vad)
 duration=len(pcm)/32000
 if quiet is not None and duration-quiet>=.20:gaps.append((quiet,duration))
 chunks=[];begin=0
 while begin<duration:
  if duration-begin<=28:end=duration;reason='end'
  else:
   choices=[(a+b)/2 for a,b in gaps if begin+8<=(a+b)/2<=begin+28 and (a+b)/2<duration-4]
   if choices:end=min(choices,key=lambda x:abs(x-begin-20));reason='vad-pause'
   else:
    # No long pause (e.g. music/continuous speech): minimize 200 ms RMS near the target.
    lo=math.ceil((begin+18)/.02);hi=min(len(energy)-5,int((begin+28)/.02))
    best=min(range(lo,hi),key=lambda i:sum(energy[max(0,i-5):i+5]))
    end=best*.02;reason='energy-fallback'
  a=round(begin*16000);b=min(len(pcm)//2,round(end*16000));end=b/16000
  target=output/f'chunk-{len(chunks):03d}.wav'
  with wave.open(str(target),'wb') as w:w.setparams((1,2,16000,0,'NONE','not compressed'));w.writeframes(pcm[a*2:b*2])
  chunks.append({'index':len(chunks),'start':a/16000,'end':end,'seconds':(b-a)/16000,'cut':reason,'path':str(target)})
  begin=end
 report={'durationSeconds':duration,'segmentMs':round((time.monotonic()-start)*1000),'vad':'WebRTC mode 2 / 20 ms','targetSeconds':20,'maxSeconds':28,'pauseMinSeconds':.20,'gaps':gaps,'chunks':chunks}
 (output/'segments.json').write_text(json.dumps(report,indent=2)+'\n');return report
if __name__=='__main__':print(json.dumps(segment(*sys.argv[1:])))
