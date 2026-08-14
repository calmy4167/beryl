import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ElementPlus from 'element-plus'

// 组件级冒烟：登录页渲染 + 场景选择交互
vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...(actual as Record<string, unknown>),
    ElMessage: { success: () => {}, warning: () => {}, error: () => {} }
  }
})

import LoginView from '../views/LoginView.vue'
import SceneView from '../views/SceneView.vue'
import { store } from '../core/storage'

async function makeRouter() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/login', component: LoginView }, { path: '/scene', component: SceneView }] })
  await router.push('/login')
  await router.isReady()
  return router
}

describe('组件冒烟', () => {
  beforeEach(() => { localStorage.clear() })

  it('LoginView 渲染品牌与表单', async () => {
    const router = await makeRouter()
    const wrapper = mount(LoginView, { global: { plugins: [router, ElementPlus] } })
    expect(wrapper.text()).toContain('Beryl')
    expect(wrapper.find('input').exists()).toBe(true)
    expect(wrapper.find('button').text()).toContain('登 录')
  })

  it('SceneView 选择场景写入 store 并高亮', async () => {
    const router = await makeRouter()
    const wrapper = mount(SceneView, { global: { plugins: [router, ElementPlus] } })
    const cards = wrapper.findAll('.card')
    expect(cards).toHaveLength(4)
    const couple = wrapper.findAll('.card')[1]
    await couple.trigger('click')
    expect(store.get('scene', '')).toBe('couple')
    expect(wrapper.text()).toContain('✓ 当前选择')
  })
})
