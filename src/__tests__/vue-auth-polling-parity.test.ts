import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authFixture = vi.hoisted(() => ({
  session: null as { u: string; ts: number } | null,
  record: { u: 'fixture-user', _d: false },
  ensureAuth: vi.fn(),
}))
const syncFixture = vi.hoisted(() => ({
  restoreSync: vi.fn(), startPolling: vi.fn(), stopPolling: vi.fn(), pollCheck: vi.fn(),
}))

vi.mock('@/core/auth', () => ({
  readSession: () => authFixture.session,
  ensureAuth: authFixture.ensureAuth,
}))
vi.mock('@/core/sync', () => syncFixture)

import App from '@/App.vue'

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [
    { path: '/login', component: { template: '<h1>登录</h1>' } },
    { path: '/app/today', component: { template: '<h1>今天</h1>' } },
  ] })
}

beforeEach(() => {
  authFixture.session = null
  authFixture.record = { u: 'fixture-user', _d: false }
  authFixture.ensureAuth.mockReset().mockImplementation(async () => authFixture.record)
  syncFixture.restoreSync.mockReset().mockResolvedValue(undefined)
  syncFixture.startPolling.mockReset()
  syncFixture.stopPolling.mockReset()
  syncFixture.pollCheck.mockReset().mockResolvedValue(undefined)
})
afterEach(() => vi.restoreAllMocks())

describe('Vue protected route polling parity', () => {
  it('starts session restore and polling when login finishes after App first mounted', async () => {
    const router = makeRouter()
    await router.push('/login')
    await router.isReady()
    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(syncFixture.restoreSync).not.toHaveBeenCalled()
    expect(syncFixture.startPolling).not.toHaveBeenCalled()

    authFixture.session = { u: 'fixture-user', ts: Date.now() }
    await router.push('/app/today')
    await flushPromises()
    expect(authFixture.ensureAuth).toHaveBeenCalledOnce()
    expect(syncFixture.restoreSync).toHaveBeenCalledOnce()
    expect(syncFixture.startPolling).toHaveBeenCalledOnce()

    window.dispatchEvent(new Event('focus'))
    expect(syncFixture.startPolling).toHaveBeenCalledTimes(2)
    expect(syncFixture.pollCheck).toHaveBeenCalledOnce()
    const hidden = vi.spyOn(document, 'hidden', 'get')
    hidden.mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(syncFixture.stopPolling).toHaveBeenCalledOnce()
    hidden.mockReturnValue(false)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(syncFixture.startPolling).toHaveBeenCalledTimes(3)
    expect(syncFixture.pollCheck).toHaveBeenCalledTimes(2)

    authFixture.session = null
    await router.push('/login')
    await flushPromises()
    expect(syncFixture.stopPolling).toHaveBeenCalledTimes(2)
    window.dispatchEvent(new Event('focus'))
    expect(syncFixture.startPolling).toHaveBeenCalledTimes(3)
    wrapper.unmount()
  })

  it('does not restore or poll with a stale or default credential', async () => {
    const router = makeRouter()
    await router.push('/login')
    await router.isReady()
    const wrapper = mount(App, { global: { plugins: [router] } })
    authFixture.session = { u: 'fixture-user', ts: Date.now() }
    authFixture.record = { u: 'other-user', _d: false }
    await router.push('/app/today')
    await flushPromises()
    expect(syncFixture.restoreSync).not.toHaveBeenCalled()
    expect(syncFixture.startPolling).not.toHaveBeenCalled()

    await router.push('/login')
    authFixture.record = { u: 'fixture-user', _d: true }
    await router.push('/app/today')
    await flushPromises()
    expect(syncFixture.restoreSync).not.toHaveBeenCalled()
    expect(syncFixture.startPolling).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
