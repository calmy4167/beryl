from pathlib import Path
p=Path('src/__tests__/vue-feishu-parity.test.ts')
s=p.read_text(encoding='utf-8')
s=s.replace("expect(page.get('[aria-label=\"飞书任务关联项目\"]').attributes('role')).toBe('combobox')", "expect(page.get('[aria-label=\"飞书任务关联项目\"]').element.tagName).toBe('SELECT')")
s=s.replace("expect(page.get('[aria-label=\"写迁移计划状态\"]').attributes('role')).toBe('combobox')", "expect(page.get('[aria-label=\"写迁移计划状态\"]').element.tagName).toBe('SELECT')")
p.write_text(s, encoding='utf-8')
