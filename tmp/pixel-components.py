from PIL import Image, ImageChops
from pathlib import Path
root=Path(r'captures/2026-09-28/official-335-residual-reruns/112--app-graph-1024x768')
a=Image.open(root/'recaptured-react.png').convert('RGB'); b=Image.open(root/'recaptured-vue.png').convert('RGB')
p=a.load(); q=b.load(); pts=[]
for y in range(a.height):
 for x in range(a.width):
  if p[x,y]!=q[x,y]: pts.append((x,y,p[x,y],q[x,y]))
print('changed',len(pts))
# bounding boxes per connected component, 8-neighbor
left=set((x,y) for x,y,*_ in pts); comps=[]
while left:
 seed=left.pop(); stack=[seed]; c=[seed]
 while stack:
  x,y=stack.pop()
  for yy in range(y-1,y+2):
   for xx in range(x-1,x+2):
    if (xx,yy) in left: left.remove((xx,yy)); stack.append((xx,yy)); c.append((xx,yy))
 comps.append(c)
for c in sorted(comps,key=len,reverse=True):
 xs=[p[0] for p in c]; ys=[p[1] for p in c]
 print(len(c),(min(xs),min(ys),max(xs),max(ys)))
