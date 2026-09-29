from pathlib import Path
p=Path('src/styles/controls.css')
s=p.read_text(encoding='utf-8')
needle='/* The task form\'s native matter selector follows the same tactile treatment as React. */'
block='''/* Feishu selectors use the same tactile native control surface as React. */
html.tactile-ui #app .page-container .feishu-page select {
  min-height: 40px;
  padding: 9px 11px;
  border: 1px solid #dce3ed;
  border-radius: var(--t-radius-sm);
  color: var(--t-text);
  background: #f8fafc;
  background-image: none;
  box-shadow: inset 0 1px 2px rgba(31, 44, 71, .025);
  appearance: auto;
}

'''
if block not in s: s=s.replace(needle,block+needle)
p.write_text(s, encoding='utf-8')
p=Path('src/__tests__/vue-feishu-parity.test.ts')
s=p.read_text(encoding='utf-8')
s="import { readFileSync } from 'node:fs'\nimport { resolve } from 'node:path'\n"+s
s=s.replace("describe('Vue Feishu parity', () => {", "describe('Vue Feishu parity', () => {\n  it('uses the React native select treatment for project and status fields', () => {\n    const css = readFileSync(resolve(process.cwd(), 'src/styles/controls.css'), 'utf8')\n    const match = css.match(/html\\.tactile-ui #app \\.page-container \\.feishu-page select\\s*\\{([^}]+)\\}/)\n    expect(match?.[1]).toContain('padding: 9px 11px;')\n    expect(match?.[1]).toContain('background-image: none;')\n    expect(match?.[1]).toContain('appearance: auto;')\n  })")
p.write_text(s, encoding='utf-8')
