from pathlib import Path
p=Path('src/__tests__/vue-goals-parity.test.ts')
s=p.read_text(encoding='utf-8')
s="import { readFileSync } from 'node:fs'\nimport { resolve } from 'node:path'\n"+s
s=s.replace("describe('Vue Goals parity', () => {", "describe('Vue Goals parity', () => {\n  it('lets the goal matter select stretch across the narrow mobile grid', () => {\n    const css = readFileSync(resolve(process.cwd(), 'src/styles/controls.css'), 'utf8')\n    expect(css).toMatch(/@media \\(max-width: 760px\\)[\\s\\S]*?\\.goal-context-fields select[\\s\\S]*?width: 100%;/)\n  })")
p.write_text(s, encoding='utf-8')
