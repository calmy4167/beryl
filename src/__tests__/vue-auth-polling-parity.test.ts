import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authFixture = vi.hoisted(() => ({
  serverSession: null as null | { token: string; apiOrigin: string; expiresAt: number; user: { id: string; username: string; displayName: string; role: 'admin' | 'user' }; mustChangePassword: boolean; validatedAt: number },
}))
const syncFixture = vi.hoisted(() => ({
  syncVaultEntityData: vi.fn(),
}))

vi.mock('@/core/auth', () => ({
  readServerSession: () => authFixture.serverSession,
}))
vi.mock('@/core/entity-sync', () => syncFixture)

import App from '@/App.vue'

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [
    { path: '/login', component: { template: '<h1>登录</h1>' } },
    { path: '/app/today', component: { template: '<h1>今天</h1>' } },
  ] })
}

beforeEach(() => {
  authFixture.serverSession = null
  localStorage.setItem('calmy:api-base-url', 'https://api.example.test')
  syncFixture.syncVaultEntityData.mockReset().mockResolvedValue(undefined)
})
afterEach(() => vi.restoreAllMocks())

describe('Vue protected route sync parity', () => {
  it('starts account sync when a server session becomes active and stops it after logout', async () => {
    const router = makeRouter()
    await router.push('/login')
    await router.isReady()
    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()
    expect(syncFixture.syncVaultEntityData).not.toHaveBeenCalled()

    authFixture.serverSession = { token: 'server-token', apiOrigin: 'https://api.example.test', expiresAt: Date.now() + 60_000, user: { id: 'user-1', username: 'fixture-user', displayName: 'Fixture', role: 'user' }, mustChangePassword: false, validatedAt: Date.now() }
    await router.push('/app/today')
    await flushPromises()
    expect(syncFixture.syncVaultEntityData).toHaveBeenCalledOnce()

    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(syncFixture.syncVaultEntityData).toHaveBeenCalledTimes(2)

    authFixture.serverSession = null
    await router.push('/login')
    await flushPromises()
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(syncFixture.syncVaultEntityData).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('does not restore or poll with a stale or default credential', async () => {
    const router = makeRouter()
    await router.push('/login')
    await router.isReady()
    const wrapper = mount(App, { global: { plugins: [router] } })
    authFixture.serverSession = null
    await router.push('/app/today')
    await flushPromises()
    expect(syncFixture.syncVaultEntityData).not.toHaveBeenCalled()

    await router.push('/login')
    authFixture.serverSession = null
    await router.push('/app/today')
    await flushPromises()
    expect(syncFixture.syncVaultEntityData).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
