from pathlib import Path
p=Path('src/styles/controls.css')
s=p.read_text(encoding='utf-8').replace('  opacity: .7;\n','')
needle='html.tactile-ui #app .page-container .calmy-select__trigger {'
block='''/* Chrome's native select disabled state is 0.7 opacity in the React reference. */
html.tactile-ui #app .page-container :is(.goal-context-fields, .feishu-page, .tasks-page, .task-board-page, .graph-page, .finance-page, .inbox-page, .library-page, .matters-page) select:disabled {
  opacity: .7;
}

'''
if block not in s: s=s.replace(needle,block+needle)
p.write_text(s, encoding='utf-8')
p=Path('src/__tests__/vue-feishu-parity.test.ts')
s=p.read_text(encoding='utf-8').replace("    expect(match?.[1]).toContain('opacity: .7;')", "    expect(css).toMatch(/html\\.tactile-ui #app \\.page-container :is\\([^)]*\\.feishu-page[^)]*\\) select:disabled\\s*\\{[^}]*opacity: \\.7;/s)")
p.write_text(s, encoding='utf-8')
