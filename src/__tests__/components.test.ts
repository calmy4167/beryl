import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ElementPlus from 'element-plus'

// 组件级冒烟：登录页渲染 + 场景选择交互。
// 原先测的是 src/views/{LoginView,SceneView}.vue（僵尸目录，已随双壳一起删除），
// 现在对准路由实际使用的 src/vue/pages/{LoginPage,ScenePage}.vue。
vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...(actual as Record<string, unknown>),
    ElMessage: { success: () => {}, warning: () => {}, error: () => {} }
  }
})

import LoginPage from '../vue/pages/LoginPage.vue'
import ScenePage from '../vue/pages/ScenePage.vue'
import { store } from '../core/storage'
import { setActiveAccount } from '../core/account-context'

async function makeRouter() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/login', component: LoginPage }, { path: '/scene', component: ScenePage }] })
  await router.push('/login')
  await router.isReady()
  return router
}

describe('组件冒烟', () => {
  beforeEach(() => { setActiveAccount('component-smoke-test-user'); localStorage.clear() })
  afterEach(() => setActiveAccount(null))

  it('LoginPage 渲染品牌与表单', async () => {
    const router = await makeRouter()
    const wrapper = mount(LoginPage, { global: { plugins: [router, ElementPlus] } })
    expect(wrapper.text()).toContain('Calmy')
    expect(wrapper.find('input').exists()).toBe(true)
    expect(wrapper.find('button[type="submit"]').text()).toContain('登 录')
  })

  it('ScenePage 选择场景写入 store 并高亮', async () => {
    const router = await makeRouter()
    const wrapper = mount(ScenePage, { global: { plugins: [router, ElementPlus] } })
    const cards = wrapper.findAll('.scene-card')
    expect(cards).toHaveLength(4)
    await cards[1].trigger('click')
    expect(store.get('scene', '')).toBe('couple')
    expect(wrapper.text()).toContain('✓ 当前选择')
  })
})
