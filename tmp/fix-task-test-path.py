from pathlib import Path
p=Path('src/__tests__/vue-tasks-parity.test.ts')
s=p.read_text(encoding='utf-8').replace("import { readFileSync } from 'node:fs'", "import { readFileSync } from 'node:fs'\nimport { resolve } from 'node:path'").replace("readFileSync(new URL('../styles/controls.css', import.meta.url), 'utf8')", "readFileSync(resolve(process.cwd(), 'src/styles/controls.css'), 'utf8')")
p.write_text(s, encoding='utf-8')
