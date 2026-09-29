from pathlib import Path
import re
p=Path('src/styles/controls.css')
s=p.read_text(encoding='utf-8')
pattern=re.compile(r'(html\.tactile-ui #app \.page-container \.[\w-]+(?: \.\w[\w-]*)? select\s*\{)(.*?)(\})',re.S)
def patch(m):
 body=m.group(2)
 if 'opacity:' not in body: body=body.rstrip()+"\n  opacity: 1;\n"
 return m.group(1)+body+m.group(3)
s=pattern.sub(patch,s)
# The Goals relation rule has an additional descendant selector.
s=s.replace('  appearance: auto;\n}\n\n@media (max-width: 760px)', '  appearance: auto;\n  opacity: 1;\n}\n\n@media (max-width: 760px)',1)
p.write_text(s, encoding='utf-8')
