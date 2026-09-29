import json,difflib
from pathlib import Path
root=Path('captures/2026-09-28/graph112-topbar-subtree')
a=json.loads((root/'graph-diagnostics-react.json').read_text(encoding='utf-8'))
b=json.loads((root/'graph-diagnostics-vue.json').read_text(encoding='utf-8'))
for selector in ['.desktop-topbar','.topbar-actions','.topbar-search']:
 x=next(i for i in a['items'] if i['selector']==selector)['html']
 y=next(i for i in b['items'] if i['selector']==selector)['html']
 print('\n===',selector,'===')
 print('\n'.join(difflib.unified_diff(x.replace('><','>\n<').splitlines(),y.replace('><','>\n<').splitlines(),fromfile='react',tofile='vue',lineterm=''))[:6000])

