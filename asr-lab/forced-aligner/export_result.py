"""Export diagnostic per-chunk results as global character/word times and SRT.
Punctuation attaches to a preceding speech unit; it gets no invented duration.
"""
import json,pathlib,sys

def export(source,directory):
 report=json.loads(pathlib.Path(source).read_text());out=pathlib.Path(directory);out.mkdir(parents=True,exist_ok=True)
 units=[]
 for segment in report['samples']:
  offset=segment['offsetSeconds']
  for w in segment['words']:
   if not any(ch.isalnum() for ch in w['word']):
    if units:units[-1]['text']+=w['word']
    continue
   units.append({'text':w['word'],'start':round(offset+w['start'],3),'end':round(offset+w['end'],3),'segmentIndex':segment['index']})
 assert all(0<=w['start']<=w['end']<=report['durationSeconds']+.001 for w in units)
 assert all(a['end']<=b['start']+.001 for a,b in zip(units,units[1:]))
 data={'schemaVersion':1,'language':'zh','unit':'Chinese characters / English words','timestampUnit':'seconds','timestampResolutionSeconds':.08,'sourceOffsetSeconds':0,'durationSeconds':report['durationSeconds'],'text':'\n'.join(s['text'] for s in report['samples']),'units':units,'note':'Model estimates, not manual ground truth. Raw punctuation times are retained only in benchmark report.'}
 (out/'transcript.timestamps.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
 (out/'transcript.txt').write_text(data['text']+'\n')
 cues=[];group=[]
 def flush():
  if group:
   if group[-1]['end']>group[0]['start']:cues.append((group[0]['start'],group[-1]['end'],''.join(u['text'] for u in group)))
   group.clear()
 for u in units:
  if group and (u['start']-group[-1]['end']>.5 or u['end']-group[0]['start']>5 or sum(len(g['text']) for g in group)+len(u['text'])>24):flush()
  group.append(u)
  if u['text'].endswith(('。','？','！','，','；')):flush()
 flush()
 def stamp(seconds):
  value=round(seconds*1000);h,value=divmod(value,3600000);m,value=divmod(value,60000);s,ms=divmod(value,1000);return f'{h:02}:{m:02}:{s:02},{ms:03}'
 (out/'transcript.srt').write_text('\n\n'.join(f'{i+1}\n{stamp(a)} --> {stamp(b)}\n{text}' for i,(a,b,text) in enumerate(cues))+'\n')
 print(json.dumps({'units':len(units),'subtitleCues':len(cues),'directory':str(out)}))
if __name__=='__main__':export(*sys.argv[1:])
