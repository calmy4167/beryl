from pathlib import Path
for path in [Path('node_modules/element-plus/dist/index.css'),Path('src/styles/main.css'),Path('src/styles/shared/app.css'),Path('src/styles/shared/tactile-ui.css')]:
 text=path.read_text(encoding='utf-8')
 needle='min-width:0'
 start=0
 while True:
  i=text.find(needle,start)
  if i<0: break
  print('\n',path,'offset',i,'\n',text[max(0,i-140):i+len(needle)+90])
  start=i+len(needle)
