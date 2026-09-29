import json
from pathlib import Path
root=Path.cwd()
# Candidate 335: all manifests in migration capture tree, the exact existing exclusions, one pair per manifest/viewport, path-pair dedupe.
excluded={'flow-echo-resource-feedback-paired-check','tasks-read-error-paired-check','tasks-read-retry-paired-check','review-dirty-field-repeat','review-range-30-repeat','tasks-read-error-repeat','tasks-read-error-scrollbar-diagnostic','task-board-svg-debug-current','task-board-pointer-away-current','search-open-mobile-after'}
formal={}
for p in sorted((root/'docs/superpowers/migrations/captures/2026-09-26').rglob('manifest-*.json')):
 if p.parent.name in excluded: continue
 m=json.loads(p.read_text(encoding='utf-8'))
 by={}
 for v in m.get('viewports',[]):
  if v.get('framework') in {'react','vue'}: by.setdefault((v['width'],v['height']),{})[v['framework']]=v
 for size,s in by.items():
  if set(s)=={'react','vue'}:
   pair=tuple(str(Path(s[f]['image']).resolve()) for f in ('react','vue'))
   formal.setdefault(pair,(p.parent.name,size))
# Current alternate selector from scratch script logic
states={}
for base in (root/'captures',root/'docs/superpowers/migrations/captures/2026-09-26'):
 for p in base.rglob('manifest-*.json'):
  m=json.loads(p.read_text(encoding='utf-8'))
  steps=json.dumps(m.get('interaction',{}).get('steps',[]),sort_keys=True,ensure_ascii=False)
  visible=json.dumps([x.get('text') for v in m.get('viewports',[]) for x in v.get('visibleText',[])],ensure_ascii=False)
  states.setdefault((m.get('route'),steps,visible),[]).append((m,p))
latest={}
for records in states.values():
 by={}
 for m,p in records:
  for v in m.get('viewports',[]):
   if v.get('framework') not in {'react','vue'}:continue
   k=(v['width'],v['height'],v['framework'])
   if k not in by or m.get('capturedAt','')>by[k][0]:by[k]=(m.get('capturedAt',''),v,p)
 sides={}
 for (w,h,f),(_,v,p) in by.items(): sides.setdefault((w,h),{})[f]=v
 for size,s in sides.items():
  if set(s)=={'react','vue'}:
   pair=tuple(str(Path(s[f]['image']).resolve()) for f in ('react','vue'))
   latest.setdefault(pair,(records[0][1].parent.name,size))
print('formal',len(formal),'latest',len(latest),'overlap',len(set(formal)&set(latest)))
print('formal-only',len(set(formal)-set(latest)))
for k,v in list((k,v) for k,v in formal.items() if k not in latest)[:30]:print(' F',v,k)
print('latest-only',len(set(latest)-set(formal)))
for k,v in list((k,v) for k,v in latest.items() if k not in formal)[:30]:print(' L',v,k)
