import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { defineComponent, h } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/core/auth', () => ({
  readSession: () => ({ u: 'fixture-user' }),
  ensureAuth: async () => ({ u: 'fixture-user', _d: false }),
}))
vi.mock('@/core/scenes', () => ({ currentSceneId: () => 'personal', applySceneTheme: vi.fn() }))
vi.mock('@/core/storage', () => ({ lsGet: () => 'personal' }))
vi.mock('@/core/sync', () => ({ restoreSync: vi.fn(), startPolling: vi.fn(), stopPolling: vi.fn(), pollCheck: vi.fn() }))

import App from '@/App.vue'

let wrapper: ReturnType<typeof mount> | undefined

describe('Vue protected-session route restoration', () => {
  afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.clearAllMocks() })

  it('preserves the requested deep route when a valid session is restored', async () => {
    const Capture = defineComponent({ template: '<h1>记录页面</h1>' })
    const Today = defineComponent({ template: '<h1>今天页面</h1>' })
    const router = createRouter({ history: createMemoryHistory(), routes: [{
      path: '/app', component: App, children: [
        { path: 'capture', component: Capture },
        { path: 'today', component: Today },
        { path: 'home', redirect: '/app/today' },
      ],
    }] })
    await router.push('/app/capture')
    await router.isReady()
    wrapper = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } })
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/app/capture')
    expect(wrapper.text()).toContain('记录页面')
  })
})
