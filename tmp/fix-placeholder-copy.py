from pathlib import Path
p=Path('src/vue/pages/CompatibilityPlaceholderPage.vue')
s=p.read_text(encoding='utf-8').replace("description: '这个旧入口暂时没有对应页面，你可以返回今天继续使用。',", "description: '今天、记录、处境、回顾和设置已由 React 接管，其余入口保留在迁移队列中。',")
p.write_text(s, encoding='utf-8')
p=Path('src/__tests__/vue-compatibility-route-parity.test.ts')
s=p.read_text(encoding='utf-8')
s=s.replace("  it('gives the in-shell placeholder the React reference card width', () => {", "  it('matches the React fallback copy for an unknown current route', () => {\n    const page = mount(CompatibilityPlaceholderPage)\n    expect(page.get('h1').text()).toBe('这个模块正在迁移')\n    expect(page.findAll('p').at(-1)?.text()).toBe('今天、记录、处境、回顾和设置已由 React 接管，其余入口保留在迁移队列中。')\n  })\n\n  it('gives the in-shell placeholder the React reference card width', () => {")
p.write_text(s, encoding='utf-8')
