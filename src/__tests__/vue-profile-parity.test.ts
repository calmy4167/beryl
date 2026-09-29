import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
  documents: [] as Array<Record<string, unknown>>,
  error: undefined as Error | undefined,
  list: vi.fn(),
}))

vi.mock('@/domain/reality', () => ({ listRealityDocumentsAsync: harness.list }))
vi.mock('@/core/auth', () => ({ readSession: () => ({ u: 'calmy', ts: Date.UTC(2026, 8, 24, 10, 30) }) }))
vi.mock('@/core/scenes', () => ({
  SCENES: { personal: { id: 'personal', name: '个人', icon: '🧑', color: '#2F9E68', desc: '专注自我提升', tagline: '写下你的想法', mods: ['inbox', 'tasks'], stats: [] } },
  currentSceneId: () => 'personal',
}))

import ProfilePage from '@/vue/pages/ProfilePage.vue'

describe('Vue ProfilePage parity', () => {
  const router = () => createRouter({ history: createMemoryHistory(), routes: [{ path: '/app/profile', component: ProfilePage }] })
  beforeEach(() => {
    harness.documents = [
      { id: 'matter', entityType: 'matter', updatedAt: Date.UTC(2026, 8, 23, 8), title: '一个处境' },
      { id: 'pomo', entityType: 'pomo', updatedAt: Date.UTC(2026, 8, 23, 9), minutes: 90 },
      { id: 'habit', entityType: 'habit', updatedAt: Date.UTC(2026, 8, 24, 8), dates: ['2026-09-23', '2026-09-24'] },
    ]
    harness.error = undefined
    harness.list.mockReset().mockImplementation(async () => {
      if (harness.error) throw harness.error
      return structuredClone(harness.documents)
    })
  })

  it('renders session, scene and reality statistics', async () => {
    const appRouter = router(); await appRouter.push('/app/profile'); await appRouter.isReady()
    const wrapper = mount(ProfilePage, { global: { plugins: [appRouter] } })
    await flushPromises()
    expect(wrapper.text()).toContain('calmy')
    expect(wrapper.text()).toContain('个人')
    expect(wrapper.text()).toContain('1.5')
    expect(wrapper.text()).toContain('2')
    expect(wrapper.text()).toContain('3')
  })

  it('shows a retry state when the reality view fails', async () => {
    harness.error = new Error('读取失败')
    const appRouter = router(); await appRouter.push('/app/profile'); await appRouter.isReady()
    const wrapper = mount(ProfilePage, { global: { plugins: [appRouter] } })
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('读取失败')
    expect(wrapper.get('[role="alert"] button').text()).toBe('重试')
  })
})
