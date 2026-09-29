import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { defineComponent, h } from 'vue'
import PrimaryNav from '@/vue/shell/PrimaryNav.vue'
import WorkspaceTabs from '@/vue/shell/WorkspaceTabs.vue'
import AppShell from '@/vue/shell/AppShell.vue'

const contextRailSource = readFileSync('src/vue/shell/ContextRail.vue', 'utf8')
const sharedAppCssSource = readFileSync('src/styles/shared/app.css', 'utf8')

describe('Vue primary navigation parity', () => {
  it('matches the React settings gear path in the desktop context rail', () => {
    expect(contextRailSource).toMatch(/a1\.7 1\.7 0 0 0-\.3 1\.9 1\.7 1\.7 0 0 0 1\.6 1h/)
  })

  it('renders the collapsed desktop context rail and toggles its expansion state', async () => {
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    localStorage.clear()
    sessionStorage.clear()
    const Page = defineComponent({ setup: () => () => h('h1', '今天') })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app', component: AppShell, children: [{ path: 'today', component: Page, meta: { pageId: 'today', title: '今天' } }] }] })
    await router.push('/app/today'); await router.isReady()
    const wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
    try {
      expect(wrapper.get('.app-shell').attributes('data-context-state')).toBe('collapsed')
      expect(wrapper.get('#app-right-sidebar').attributes('aria-label')).toBe('已收起的右侧快捷栏')
      expect(wrapper.find('#app-right-sidebar [aria-label="展开右侧栏"]').exists()).toBe(true)
      await wrapper.get('#app-right-sidebar [aria-label="展开右侧栏"]').trigger('click')
      expect(wrapper.get('.app-shell').attributes('data-context-state')).toBe('expanded')
      expect(wrapper.get('#app-right-sidebar').attributes('aria-label')).toBe('右侧快捷栏')
      const resize = wrapper.get('.shell-resize-right')
      expect(resize.attributes('aria-valuenow')).toBe('356')
      await resize.trigger('keydown', { key: 'Home' })
      expect(resize.attributes('aria-valuenow')).toBe('280')
      expect(localStorage.getItem('calmy_context_width')).toBe('280')
      await resize.trigger('keydown', { key: 'ArrowLeft' })
      expect(resize.attributes('aria-valuenow')).toBe('288')
      await resize.trigger('keydown', { key: 'End' })
      expect(resize.attributes('aria-valuenow')).toBe('480')
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', shiftKey: true, ctrlKey: true, bubbles: true }))
      await nextTick()
      expect(wrapper.get('.app-shell').attributes('data-context-state')).toBe('collapsed')
      expect(localStorage.getItem('calmy_right_sidebar_collapsed')).toBe('1')
    } finally {
      wrapper.unmount()
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
    }
  })

  it('matches the React button class and base behavior for the desktop search trigger', async () => {
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    localStorage.clear()
    sessionStorage.clear()
    const Page = defineComponent({ setup: () => () => h('h1', '今天') })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app', component: AppShell, children: [{ path: 'today', component: Page, meta: { pageId: 'today', title: '今天' } }] }] })
    await router.push('/app/today'); await router.isReady()
    const wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
    try {
      expect(wrapper.get('.topbar-search').classes()).toContain('react-btn')
      expect(sharedAppCssSource).toMatch(/\.react-btn\{font:inherit;cursor:pointer\}/)
    } finally {
      wrapper.unmount()
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
    }
  })

  it('matches the 迁移前界面基线 mobile shell with four primary actions and the shared brand mark', async () => {
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    const Page = defineComponent({ setup: () => () => h('h1', '今天') })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app', component: AppShell, children: [{ path: 'today', component: Page, meta: { pageId: 'today', title: '今天' } }] }] })
    await router.push('/app/today'); await router.isReady()
    const wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
    await vi.waitFor(() => expect(wrapper.find('.bottom-nav').exists()).toBe(true))
    expect(wrapper.findAll('.bottom-nav > button')).toHaveLength(4)
    expect(wrapper.find('[aria-label="更多导航"]').exists()).toBe(false)
    expect(wrapper.find('.mobile-header .brand-mark svg').exists()).toBe(true)
    wrapper.unmount()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
  })

  it('shows the shared Calmy brand header in the mobile feature directory drawer', async () => {
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    localStorage.clear()
    sessionStorage.clear()
    const Page = defineComponent({ setup: () => () => h('h1', '今天') })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app', component: AppShell, children: [{ path: 'today', component: Page, meta: { pageId: 'today', title: '今天' } }] }] })
    await router.push('/app/today'); await router.isReady()
    const wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
    try {
      await vi.waitFor(() => expect(wrapper.find('.bottom-nav').exists()).toBe(true))
      await wrapper.get('.mobile-header .menu').trigger('click')
      await nextTick()

      const directory = wrapper.get('#more-drawer')
      expect(directory.attributes('role')).toBe('dialog')
      expect(directory.get('.drawer > .brand').text()).toContain('Calmy')
      expect(directory.get('.drawer > .brand').text()).toContain('现实行动系统')
      expect(directory.find('.drawer > .brand .brand-mark svg').exists()).toBe(true)
    } finally {
      wrapper.unmount()
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
    }
  })

  it('moves focus into the mobile feature directory and traps Tab navigation inside it', async () => {
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    localStorage.clear()
    sessionStorage.clear()
    const Page = defineComponent({ setup: () => () => h('h1', '今天') })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app', component: AppShell, children: [{ path: 'today', component: Page, meta: { pageId: 'today', title: '今天' } }] }] })
    await router.push('/app/today'); await router.isReady()
    const wrapper = mount({ render: () => h(RouterView) }, { attachTo: document.body, global: { plugins: [router] } })
    try {
      await vi.waitFor(() => expect(wrapper.find('.bottom-nav').exists()).toBe(true))
      await wrapper.get('.mobile-header .menu').trigger('click')

      const drawer = wrapper.get('#more-drawer')
      const focusable = drawer.findAll('button').map(button => button.element as HTMLElement)
      focusable.forEach(element => Object.defineProperty(element, 'offsetParent', { configurable: true, get: () => document.body }))
      const first = drawer.get('[data-directory-first]').element as HTMLElement
      const firstTabStop = focusable[0]
      const last = focusable.at(-1)!

      await vi.waitFor(() => expect(document.activeElement).toBe(first))

      last.focus()
      last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
      expect(document.activeElement).toBe(firstTabStop)

      firstTabStop.focus()
      firstTabStop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
      expect(document.activeElement).toBe(last)

      last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await vi.waitFor(() => expect(document.activeElement).toBe(wrapper.get('.mobile-header .menu').element))
      expect(wrapper.get('.el-drawer-overlay').attributes('aria-hidden')).toBe('true')
    } finally {
      wrapper.unmount()
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
    }
  })

  it('focuses global search, traps keyboard navigation, and restores focus after closing', async () => {
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    localStorage.clear()
    sessionStorage.clear()
    const Page = defineComponent({ setup: () => () => h('h1', '今天') })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app', component: AppShell, children: [{ path: 'today', component: Page, meta: { pageId: 'today', title: '今天' } }] }] })
    await router.push('/app/today'); await router.isReady()
    const searchSpy = vi.spyOn(await import('@/domain/search'), 'searchAllAsync').mockResolvedValue([])
    const wrapper = mount({ render: () => h(RouterView) }, { attachTo: document.body, global: { plugins: [router] } })
    try {
      expect(searchSpy).not.toHaveBeenCalled()
      const trigger = wrapper.get('.topbar-search').element as HTMLElement
      trigger.focus()
      await wrapper.get('.topbar-search').trigger('click')
      await vi.waitFor(() => expect(searchSpy).toHaveBeenCalledWith('', 8))
      const panel = wrapper.get('.search-panel')
      ;(wrapper.findComponent(AppShell).vm as any).searchResults = [{ id: 'search-parity-fixture', source: 'local', type: 'today', typeLabel: '今天', icon: '◷', title: '今天记录', summary: '搜索布局回归', route: '/app/today', updatedAt: 1, score: 1 }]
      await nextTick()
      const focusable = panel.findAll('input,button').map(item => item.element as HTMLElement)
      focusable.forEach(element => Object.defineProperty(element, 'offsetParent', { configurable: true, get: () => document.body }))
      const input = panel.get('.global-search').element as HTMLElement
      const close = panel.get('[aria-label="关闭搜索"]').element as HTMLElement
      const lastResult = panel.get('.search-results button').element as HTMLElement

      await vi.waitFor(() => expect(document.activeElement).toBe(input))
      expect(panel.findAll('.search-head > span')).toHaveLength(0)
      expect(panel.get('.search-results button').element.querySelectorAll(':scope > span')).toHaveLength(1)
      lastResult.focus()
      lastResult.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
      expect(document.activeElement).toBe(input)

      input.focus()
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
      expect(document.activeElement).toBe(lastResult)

      close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
      expect(wrapper.find('.search-overlay').exists()).toBe(false)
    } finally {
      searchSpy.mockRestore()
      wrapper.unmount()
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
    }
  })

  it('returns focus to the mobile directory trigger when search is opened from the directory', async () => {
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    localStorage.clear()
    sessionStorage.clear()
    const Page = defineComponent({ setup: () => () => h('h1', '今天') })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app', component: AppShell, children: [{ path: 'today', component: Page, meta: { pageId: 'today', title: '今天' } }] }] })
    await router.push('/app/today'); await router.isReady()
    const wrapper = mount({ render: () => h(RouterView) }, { attachTo: document.body, global: { plugins: [router] } })
    try {
      const trigger = wrapper.get('.mobile-header .menu').element as HTMLElement
      trigger.focus()
      await wrapper.get('.mobile-header .menu').trigger('click')
      await vi.waitFor(() => expect(document.activeElement).toBe(wrapper.get('[data-directory-first]').element))
      const taskLink = wrapper.get('#more-drawer .drawer-links section:first-of-type button:nth-of-type(2)')
      expect(Array.from(taskLink.element.childNodes).filter(node => node.nodeType === Node.TEXT_NODE && node.textContent !== '').map(node => node.textContent)).toEqual(['✓', ' ', '任务'])
      await wrapper.get('[data-directory-first]').trigger('click')
      await vi.waitFor(() => expect(document.activeElement).toBe(wrapper.get('.global-search').element))

      wrapper.get('.global-search').element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
    } finally {
      wrapper.unmount()
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
    }
  })

  it('shows the active primary page, opens the route group, then closes the secondary menu after selection', async () => {
    const navigate = vi.fn()
    const wrapper = mount(PrimaryNav, {
      props: { activePath: '/app/today', collapsed: false },
      attrs: { onNavigate: navigate },
    })

    expect(wrapper.get('[aria-label="日常菜单"]').attributes('aria-pressed')).toBe('true')
    await wrapper.get('[aria-label="工作菜单"]').trigger('click')
    expect(wrapper.get('#secondary-navigation').attributes('aria-hidden')).toBeUndefined()
    expect(wrapper.get('#secondary-navigation').text()).toContain('任务')

    await wrapper.get('#secondary-navigation [data-path="/app/module/tasks"]').trigger('click')
    expect(navigate).toHaveBeenCalledWith('/app/module/tasks')
    expect(wrapper.get('#secondary-navigation').attributes('aria-hidden')).toBe('true')
  })

  it('renders vector icons for the work pages in the desktop secondary navigation', async () => {
    const wrapper = mount(PrimaryNav, { props: { activePath: '/app/today', collapsed: false } })
    await wrapper.get('[aria-label="工作菜单"]').trigger('click')

    const workPageIcons = wrapper.findAll('#secondary-navigation .secondary-nav [data-path] > i svg')
    expect(workPageIcons).toHaveLength(6)
    expect(wrapper.get('#secondary-navigation .secondary-nav [data-path="/app/module/tasks"] > i svg path').attributes('d')).toBe('m4 7 2 2 3-3M12 8h8M4 16l2 2 3-3M12 17h8')
    expect(wrapper.find('#secondary-navigation .secondary-nav [data-path="/app/module/tasks"] > i').text()).toBe('')
  })

  it('keeps the compact sidebar toggle visible and reports its expanded state accessibly', async () => {
    const onToggle = vi.fn()
    const wrapper = mount(PrimaryNav, { props: { activePath: '/app/today', collapsed: true, onToggle } })
    const toggle = wrapper.get('[aria-label="展开左侧菜单"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('closes the secondary menu on Escape and restores focus to its group trigger', async () => {
    const wrapper = mount(PrimaryNav, { props: { activePath: '/app/today', collapsed: false }, attachTo: document.body })
    const trigger = wrapper.get('[aria-label="工作菜单"]')
    await trigger.trigger('click')
    expect(wrapper.get('#secondary-navigation').attributes('aria-hidden')).toBeUndefined()
    await nextTick()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(wrapper.get('#secondary-navigation').attributes('aria-hidden')).toBe('true')
    expect(document.activeElement).toBe(trigger.element)
    wrapper.unmount()
  })

  it('keeps the Today tab pinned, closes regular tabs, and supports keyboard activation and reordering', async () => {
    const tabs = [
      { path: '/app/today', title: '今天', pinned: true },
      { path: '/app/capture', title: '记录', pinned: false },
      { path: '/app/review', title: '回顾', pinned: false },
    ]
    const activate = vi.fn()
    const close = vi.fn()
    const reorder = vi.fn()
    const wrapper = mount(WorkspaceTabs, { props: { tabs, activePath: '/app/capture', saveState: 'idle', onActivate: activate, onClose: close, onReorder: reorder } })

    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toContain('记录')
    expect(wrapper.find('[aria-label="关闭今天"]').exists()).toBe(false)
    await wrapper.get('[aria-label="关闭记录"]').trigger('click')
    expect(close).toHaveBeenCalledWith('/app/capture')
    await wrapper.get('[data-path="/app/review"][role="tab"]').trigger('keydown', { key: 'ArrowLeft' })
    expect(activate).toHaveBeenCalledWith('/app/capture')
    await wrapper.get('[data-path="/app/review"][role="tab"]').trigger('keydown', { key: 'ArrowLeft', ctrlKey: true, shiftKey: true })
    expect(reorder).toHaveBeenCalledWith('/app/review', '/app/capture')
  })

  it('mounts the migrated app shell around its current route and exposes workspace tabs', async () => {
    localStorage.clear()
    sessionStorage.clear()
    const Page = defineComponent({ setup: () => () => h('h1', '记录页测试内容') })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/app', component: AppShell, children: [
        { path: 'capture', component: Page, meta: { pageId: 'capture', title: '记录', description: '先留下原话' } },
      ] }],
    })
    await router.push('/app/capture')
    await router.isReady()
    const wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
    await vi.waitFor(() => expect(wrapper.text()).toContain('记录页测试内容'))

    expect(wrapper.find('.workspace-tabs').exists()).toBe(true)
    expect(wrapper.find('[data-page-id="capture"]').exists()).toBe(true)
    expect(wrapper.get('.workspace-tab button[aria-selected="true"]').text()).toContain('记录')
    expect(wrapper.findAll('.workspace-tab')).toHaveLength(2)
    expect(wrapper.get('.workspace-tab [data-path="/app/today"] .workspace-tab-title').text()).toBe('今天')
    expect(sessionStorage.getItem('calmy_workspace_tabs_v1')).toContain('"path":"/app/capture"')
    expect(wrapper.find('#app-sidebar').exists()).toBe(true)
    await wrapper.get('.primary-rail-foot [aria-label="进入沉浸模式"]').trigger('click')
    expect(wrapper.get('[aria-label="退出沉浸模式"] svg path').attributes('d')).toBe('M8 4H5a1 1 0 0 0-1 1v3m12-4h3a1 1 0 0 1 1 1v3M4 16v3a1 1 0 0 0 1 1h3m12-4v3a1 1 0 0 1-1 1h-3')
    wrapper.unmount()
  })

  it('registers the current route tab when the shell crosses from compact to desktop after mounting', async () => {
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    localStorage.clear()
    sessionStorage.clear()
    const Page = defineComponent({ setup: () => () => h('h1', '记录页测试内容') })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app', component: AppShell, children: [
      { path: 'capture', component: Page, meta: { pageId: 'capture', title: '记录', description: '先留下原话' } },
    ] }] })
    await router.push('/app/capture')
    await router.isReady()
    const wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
    await vi.waitFor(() => expect(wrapper.find('.bottom-nav').exists()).toBe(true))

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    window.dispatchEvent(new Event('resize'))
    await vi.waitFor(() => expect(wrapper.findAll('.workspace-tab')).toHaveLength(2))
    expect(wrapper.get('.workspace-tab button[aria-selected="true"] .workspace-tab-title').text()).toBe('记录')
    wrapper.unmount()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
  })
})
