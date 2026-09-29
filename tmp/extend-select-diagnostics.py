from pathlib import Path
p=Path('tmp/recapture-one.mjs')
s=p.read_text(encoding='utf-8')
old='background:s.backgroundColor,backgroundImage:s.backgroundImage,appearance:s.appearance,padding:s.padding,border:s.border,borderRadius:s.borderRadius,boxShadow:s.boxShadow'
new='text:e.selectedOptions[0]?.textContent,value:e.value,disabled:e.disabled,color:s.color,opacity:s.opacity,font:s.font,fontFamily:s.fontFamily,fontSize:s.fontSize,lineHeight:s.lineHeight,background:s.backgroundColor,backgroundImage:s.backgroundImage,appearance:s.appearance,padding:s.padding,border:s.border,borderRadius:s.borderRadius,boxShadow:s.boxShadow'
if old not in s: raise SystemExit('select diagnostic signature not found')
s=s.replace(old,new,1)
p.write_text(s, encoding='utf-8')
