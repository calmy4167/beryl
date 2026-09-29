import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import router from '../router'
import CompatibilityPlaceholderPage from '@/vue/pages/CompatibilityPlaceholderPage.vue'

describe('Vue compatibility route parity', () => {
  it.each([
    ['/app/module/custom/legacy-entry', { title: '模块入口', description: '旧模块入口已经统一收敛到 Vue 工作台。' }],
    ['/app/unknown-current-page', undefined],
  ])('resolves %s inside the app shell to the 迁移前界面基线-compatible placeholder', async (path, expectedProps) => {
    const route = router.resolve(path)
    expect(route.matched.some(record => record.path === '/app')).toBe(true)
    expect(route.meta.title).toBe('模块入口')
    const leaf = route.matched.at(-1)
    const loader = leaf?.components?.default
    expect(loader).toBeTypeOf('function')
    const page = await (loader as () => Promise<{ default: { __file?: string } }>)()
    expect(page.default.__file).toContain('CompatibilityPlaceholderPage.vue')
    if (expectedProps) expect(leaf?.props).toEqual({ default: expectedProps })
  })

  it('redirects a single-segment legacy module id to the inbox page', () => {
    const route = router.resolve('/app/module/custom-legacy-entry')
    expect(route.matched.at(-1)?.redirect).toBe('/app/module/inbox')
  })

  it('matches the React fallback copy for an unknown current route', () => {
    const page = mount(CompatibilityPlaceholderPage)
    expect(page.get('h1').text()).toBe('这个模块正在迁移')
    expect(page.findAll('p').at(-1)?.text()).toBe('今天、记录、处境、回顾和设置已由 React 接管，其余入口保留在迁移队列中。')
  })

  it('keeps standalone and module fallbacks on the reference card styles', () => {
    const page = mount(CompatibilityPlaceholderPage)
    expect(page.get('section').classes()).toContain('compatibility-placeholder-card')

    const modulePage = mount(CompatibilityPlaceholderPage, { props: { title: '模块入口' } })
    expect(modulePage.get('section').classes()).toContain('compatibility-placeholder-card')
  })
})
