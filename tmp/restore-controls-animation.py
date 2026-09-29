from pathlib import Path
p=Path('src/styles/controls.css')
s=p.read_text(encoding='utf-8')
s=s.replace('to { opacity: .7; transform: translateY(0) scale(1); }','to { opacity: 1; transform: translateY(0) scale(1); }')
s=s.replace('''  html.tactile-ui #app .page-container .goal-context-fields select {
    width: 100%;
  opacity: .7;
}
}''','''  html.tactile-ui #app .page-container .goal-context-fields select {
    width: 100%;
  }
}''')
p.write_text(s, encoding='utf-8')
