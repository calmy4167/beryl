from pathlib import Path
p=Path('src/__tests__/vue-feishu-parity.test.ts')
s=p.read_text(encoding='utf-8').replace("    expect(match?.[1]).toContain('appearance: auto;')", "    expect(match?.[1]).toContain('appearance: auto;')\n    expect(match?.[1]).toContain('opacity: 1;')")
p.write_text(s, encoding='utf-8')
