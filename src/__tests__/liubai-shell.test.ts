import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import LiubaiShell from '@/vue/shell/LiubaiShell.vue'
import { pageOwnsHead, useOwnSlideHead } from '@/vue/liubai/slide-head'
import { vuePageRegistry } from '@/vue/page-registry'
import { SAVE_STATE_EVENT } from '@/core/save-state'

/**
 * 「留白」统一外壳（LiubaiShell）取代了原来的双壳（ReferenceAppShell / LegacyAppShell）。
 * 这里守的是外壳对**全部路由**的公共契约：
 *   - 六个模块导航 + 计数 + 显式唤出
 *   - 设置面板（主题 / 导航位置 / 显示模式）与持久化
 *   - HUD 分层与简洁模式
 *   - 全站反馈通道（beryl-toast / beryl-save-state）
 *   - 页面自带头部时让位（避免双标题）
 *   - 命令面板
 */
const MODULES = vuePageRegistry
  .filter(page => page.shell === 'app' && page.navigation)
  .map(page => [page.path, page.navigation!.label] as const)

const ProbePage = defineComponent({ template: '<div class="probe-page">页面</div>' })
const HeadOwnerPage = defineComponent({
  setup() {
    useOwnSlideHead()
    return () => h('div', { class: 'probe-page' }, '自带头部的页面')
  },
})

let wrapper: ReturnType<typeof mount> | undefined

async function mountShell(path = '/app/today', component: unknown = ProbePage) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: MODULES.map(([routePath, label]) => ({ path: routePath, component: component as never, meta: { title: label } })),
  })
  await router.push(path)
  await router.isReady()
  wrapper = mount({ render: () => h(LiubaiShell) }, { global: { plugins: [router] } })
  await flushPromises()
  return router
}

function press(key: string, init: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  pageOwnsHead.value = false
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  pageOwnsHead.value = false
  document.body.className = ''
  document.body.removeAttribute('data-theme')
  document.body.removeAttribute('data-nav')
  document.documentElement.classList.remove('liubai-active')
  document.querySelectorAll('[data-hud-rank]').forEach(node => node.remove())
  document.body.innerHTML = ''
})

describe('「留白」统一外壳', () => {
  it('renders registered modules and switches module from the navigation rail', async () => {
    const router = await mountShell('/app/module/tasks')
    const dots = wrapper!.findAll('nav.dots .dot')

    expect(dots.map(dot => dot.text())).toContain('全部模块')
    await wrapper!.find('[aria-label="管理模块"]').trigger('click')
    expect(wrapper!.find('.module-manager-list').text()).toContain('任务')
    expect(wrapper!.find('.counter').text()).toMatch(/^\d{2} \/ \d{2}$/)

    await wrapper!.find('[aria-label="打开任务"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/app/module/tasks')
    await wrapper!.find('[data-quick-entry="/app/review"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/app/review')
    expect(wrapper!.find('.dot.active').text()).toBe('回顾')
  })

  it('lets users choose and persist sidebar quick entries independently of module visibility', async () => {
    const router = await mountShell('/app/today')
    const taskPath = MODULES.find(([, label]) => label === '任务')![0]
    const quickEntryPaths = () => wrapper!.findAll('nav.dots [data-quick-entry]').map(item => item.attributes('data-quick-entry'))

    expect(quickEntryPaths()).toEqual(['/app/today', '/app/capture', '/app/matters', '/app/review'])

    await wrapper!.find('[aria-label="管理模块"]').trigger('click')
    const addTaskShortcut = wrapper!.find(`[data-quick-entry-toggle="${taskPath}"]`)
    expect(addTaskShortcut.attributes('aria-pressed')).toBe('false')
    await addTaskShortcut.trigger('click')
    await nextTick()

    expect(JSON.parse(localStorage.getItem('liubai-quick-entry-paths') || '[]')).toContain(taskPath)
    expect(quickEntryPaths()).toContain(taskPath)

    const taskRow = wrapper!.findAll('.module-manager-row').find(row => row.find('[data-quick-entry-toggle]').attributes('data-quick-entry-toggle') === taskPath)!
    await taskRow.find('input[type="checkbox"]').setValue(false)
    await nextTick()
    expect(quickEntryPaths()).toContain(taskPath)

    await wrapper!.find('.module-manager-close').trigger('click')
    await wrapper!.find(`[data-quick-entry="${taskPath}"]`).trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe(taskPath)

    wrapper!.unmount()
    wrapper = undefined
    await mountShell(taskPath)
    expect(quickEntryPaths()).toContain(taskPath)

    await wrapper!.find('[aria-label="管理模块"]').trigger('click')
    const removeTaskShortcut = wrapper!.find(`[data-quick-entry-toggle="${taskPath}"]`)
    expect(removeTaskShortcut.attributes('aria-pressed')).toBe('true')
    await removeTaskShortcut.trigger('click')
    await nextTick()
    expect(quickEntryPaths()).not.toContain(taskPath)
    expect(JSON.parse(localStorage.getItem('liubai-quick-entry-paths') || '[]')).not.toContain(taskPath)
  })

  it('does not open navigation on pointer hover or focus, and keeps it open across module changes', async () => {
    const router = await mountShell()
    expect(document.body.classList.contains('nav-show')).toBe(false)

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 12, clientY: 300 }))
    await nextTick()
    expect(document.body.classList.contains('nav-show')).toBe(false)

    document.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 12, clientY: 300 }))
    await nextTick()
    expect(document.body.classList.contains('nav-show')).toBe(false)

    window.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await nextTick()
    expect(document.body.classList.contains('nav-show')).toBe(false)

    await wrapper!.find('.module-nav-handle').trigger('click')
    expect(document.body.classList.contains('nav-show')).toBe(true)
    await wrapper!.find('nav.dots').trigger('mouseenter')
    await wrapper!.find('nav.dots').trigger('focusin')
    await router.push('/app/module/tasks')
    await flushPromises()
    expect(document.body.classList.contains('nav-show')).toBe(true)

    await wrapper!.find('.desk-nav-close').trigger('click')
    expect(document.body.classList.contains('nav-show')).toBe(false)
  })

  it('toggles the module navigation with Ctrl/Meta+K and opens the command palette from its own action', async () => {
    await mountShell()

    press('k', { metaKey: true })
    await nextTick()
    expect(document.body.classList.contains('nav-show')).toBe(true)
    expect(wrapper!.find('.palette').classes()).not.toContain('open')

    await wrapper!.find('nav.dots .desk-nav-actions button').trigger('click')
    await nextTick()
    expect(wrapper!.find('.palette').classes()).toContain('open')

    press('k', { ctrlKey: true })
    await nextTick()
    expect(wrapper!.find('.palette').classes()).not.toContain('open')
    expect(document.body.classList.contains('nav-show')).toBe(true)
  })

  it('persists theme, navigation position and display mode from the settings panel', async () => {
    await mountShell()

    await wrapper!.find('button.gear').trigger('click')
    expect(wrapper!.find('.settings').classes()).toContain('open')

    await wrapper!.findAll('.swatch')[4].trigger('click')
    expect(document.body.dataset.theme).toBe('paper')
    expect(localStorage.getItem('liubai-theme')).toBe('paper')

    await wrapper!.findAll('.seg')[0].findAll('button')[1].trigger('click')
    expect(document.body.dataset.nav).toBe('right')
    expect(localStorage.getItem('liubai-nav')).toBe('right')

    await wrapper!.findAll('.seg')[1].findAll('button')[1].trigger('click')
    expect(document.body.classList.contains('mode-simple')).toBe(true)
    expect(localStorage.getItem('liubai-mode')).toBe('simple')
  })

  it('collapses auxiliary blocks by hud rank and never hides rank 1', async () => {
    const keep = document.createElement('div')
    keep.dataset.hudRank = '1'
    const aux = document.createElement('div')
    aux.dataset.hudRank = '2'
    const stats = document.createElement('div')
    stats.dataset.hudRank = '3'
    document.body.append(keep, aux, stats)

    await mountShell()
    expect(stats.classList.contains('hud-hidden')).toBe(false)

    press('h')
    await nextTick()
    expect(stats.classList.contains('hud-hidden')).toBe(true)
    expect(aux.classList.contains('hud-hidden')).toBe(false)
    expect(keep.classList.contains('hud-hidden')).toBe(false)

    press('h')
    await nextTick()
    expect(aux.classList.contains('hud-hidden')).toBe(true)
    expect(keep.classList.contains('hud-hidden')).toBe(false)
  })

  it('surfaces the global toast and save-failure channels but stays quiet on success', async () => {
    await mountShell()

    window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message: '提示通道自检', kind: 'success' } }))
    await nextTick()
    expect(wrapper!.find('.toast').text()).toBe('提示通道自检')

    window.dispatchEvent(new CustomEvent(SAVE_STATE_EVENT, { detail: { state: 'saved', durable: true, pending: false } }))
    await nextTick()
    expect(wrapper!.find('.toast').text()).toBe('提示通道自检')

    window.dispatchEvent(new CustomEvent(SAVE_STATE_EVENT, { detail: { state: 'failed', durable: false, pending: false } }))
    await nextTick()
    expect(wrapper!.find('.toast').text()).toContain('保存失败')
  })

  it('renders its own title bar only for pages that do not bring a head', async () => {
    await mountShell()
    expect(wrapper!.find('.inner > header.slide-head').exists()).toBe(true)

    wrapper!.unmount()
    wrapper = undefined
    await mountShell('/app/today', HeadOwnerPage)
    expect(wrapper!.find('.inner > header.slide-head').exists()).toBe(false)
  })

  it('filters and runs a command from the explicit command palette action', async () => {
    const router = await mountShell()

    press('k', { metaKey: true })
    await nextTick()
    await wrapper!.find('nav.dots .desk-nav-actions button').trigger('click')
    await nextTick()
    expect(wrapper!.find('.palette').classes()).toContain('open')

    await wrapper!.find('.palette-input').setValue('回顾')
    await nextTick()
    const items = wrapper!.findAll('.palette-item')
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].text()).toContain('回顾')

    await items[0].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/app/review')
    expect(wrapper!.find('.palette').classes()).not.toContain('open')
  })
})
