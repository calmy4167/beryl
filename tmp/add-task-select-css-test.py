from pathlib import Path
p=Path('src/__tests__/vue-tasks-parity.test.ts')
s=p.read_text(encoding='utf-8')
s=s.replace("import { h, nextTick } from 'vue'", "import { readFileSync } from 'node:fs'\nimport { h, nextTick } from 'vue'")
s=s.replace("describe('Vue TasksPage parity', () => {", "describe('Vue TasksPage parity', () => {\n  it('matches the React native select treatment for the task matter field', () => {\n    const css = readFileSync(new URL('../styles/controls.css', import.meta.url), 'utf8')\n    const match = css.match(/html\\.tactile-ui #app \\.page-container \\.tasks-page select\\s*\\{([^}]+)\\}/)\n    expect(match?.[1]).toContain('padding: 9px 11px;')\n    expect(match?.[1]).toContain('background-image: none;')\n    expect(match?.[1]).toContain('appearance: auto;')\n  })")
p.write_text(s, encoding='utf-8')
