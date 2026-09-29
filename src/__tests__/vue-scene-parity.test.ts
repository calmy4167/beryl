import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ScenePage from '@/vue/pages/ScenePage.vue'
import { SCENES } from '@/core/scenes'
import { resetStoreCache, store } from '@/core/storage'

function mountScene() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/scene', component: ScenePage },
    { path: '/app/today', component: { template: '<h1>今天</h1>' } },
  ] })
  return router.push('/scene').then(async () => {
    await router.isReady()
    return { wrapper: mount(ScenePage, { global: { plugins: [router] } }), router }
  })
}

beforeEach(() => {
  localStorage.clear()
  resetStoreCache()
})

describe('Vue scene page parity', () => {
  it('renders all scene choices and reflects the persisted current selection', async () => {
    store.set('scene', 'couple')
    const { wrapper } = await mountScene()
    expect(wrapper.get('[data-page-archetype="experiment"] h1').text()).toBe('选择使用场景')
    expect(wrapper.get('[role="group"]').attributes('aria-label')).toBe('使用场景')
    expect(wrapper.findAll('button[aria-pressed="true"]')).toHaveLength(1)
    expect(wrapper.get('button[aria-label="选择情侣场景"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.findAll('.scene-card')).toHaveLength(Object.keys(SCENES).length)
  })

  it('persists a chosen scene and applies it before entering Today', async () => {
    const { wrapper, router } = await mountScene()
    await wrapper.get('button[aria-label="选择情侣场景"]').trigger('click')
    expect(localStorage.getItem('b_scene')).toBe('"couple"')
    expect(wrapper.get('button[aria-label="选择情侣场景"]').attributes('aria-pressed')).toBe('true')

    await wrapper.get('.scene-start').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/app/today')
    expect(document.documentElement.style.getPropertyValue('--scene')).toBe(SCENES.couple.color)
  })

  it('shows a save error and keeps the previous selection when persistence fails', async () => {
    store.set('scene', 'personal')
    vi.spyOn(store, 'set').mockReturnValue(false)
    const { wrapper } = await mountScene()
    await wrapper.get('button[aria-label="选择情侣场景"]').trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toBe('场景未能保存，请检查本地存储状态后重试')
    expect(wrapper.get('button[aria-label="选择个人场景"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('button[aria-label="选择情侣场景"]').attributes('aria-pressed')).toBe('false')
  })
})
