from pathlib import Path
for name in ['src/styles/controls.css','src/__tests__/vue-feishu-parity.test.ts']:
 p=Path(name); s=p.read_text(encoding='utf-8').replace('opacity: 1;', 'opacity: .7;').replace("opacity: 1;')", "opacity: .7;')"); p.write_text(s, encoding='utf-8')
