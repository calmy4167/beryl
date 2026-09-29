import json
from pathlib import Path
r=Path('captures/2026-09-28/habits125-dom-diagnostic')
a=json.loads((r/'habits-diagnostics-react.json').read_text(encoding='utf-8'))
b=json.loads((r/'habits-diagnostics-vue.json').read_text(encoding='utf-8'))
print('counts',len(a),len(b))
for i in range(max(len(a),len(b))):
 x=a[i] if i<len(a) else None; y=b[i] if i<len(b) else None
 if x is None or y is None or (x['tag'],x['cls'],x['text'],x['rect'])!=(y['tag'],y['cls'],y['text'],y['rect']):
  print('NODE',i, 'R',None if x is None else (x['tag'],x['cls'],x['text'],x['rect']), 'V',None if y is None else (y['tag'],y['cls'],y['text'],y['rect']))
 if x and y:
  keys=set(x['style']['computed'])|set(y['style']['computed']); diff=[(k,x['style']['computed'].get(k),y['style']['computed'].get(k)) for k in sorted(keys) if not k.startswith('--') and x['style']['computed'].get(k)!=y['style']['computed'].get(k)]
  if diff: print('STYLE',i, x['tag'],x['cls'],diff)
