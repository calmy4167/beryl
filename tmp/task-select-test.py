from pathlib import Path
p=Path('src/__tests__/vue-tasks-parity.test.ts')
s=p.read_text(encoding='utf-8')
s=s.replace("    await page.get('[aria-label=\"关联处境\"]').trigger('click')\n    expect(page.text()).toContain('准备面试')\n    expect(page.find('[role=\"option\"][data-value=\"' + archived.calmyId + '\"]').exists()).toBe(false)\n    await page.get('[role=\"option\"][data-value=\"' + active.calmyId + '\"]').trigger('click')", "    const matterSelect = page.get('[aria-label=\"关联处境\"]')\n    expect(matterSelect.element.tagName).toBe('SELECT')\n    expect(page.find(`option[value=\"${archived.calmyId}\"]`).exists()).toBe(false)\n    await matterSelect.setValue(active.calmyId)")
p.write_text(s, encoding='utf-8')
