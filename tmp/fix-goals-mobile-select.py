from pathlib import Path
p=Path('src/styles/controls.css')
s=p.read_text(encoding='utf-8')
needle='''html.tactile-ui #app .page-container .calmy-select__trigger {'''
block='''@media (max-width: 760px) {
  html.tactile-ui #app .page-container .goal-context-fields select {
    width: 100%;
  }
}

'''
if block not in s: s=s.replace(needle,block+needle)
p.write_text(s, encoding='utf-8')
