from PIL import Image
from pathlib import Path
a=Image.open(Path('captures/2026-09-28/graph112-topbar-class-fix-fulldom/recaptured-react.png')).convert('RGB')
b=Image.open(Path('captures/2026-09-28/graph112-topbar-class-fix-fulldom/recaptured-vue.png')).convert('RGB')
for y in range(a.height):
 for x in range(a.width):
  p,q=a.getpixel((x,y)),b.getpixel((x,y))
  if p!=q: print(x,y,p,q)
