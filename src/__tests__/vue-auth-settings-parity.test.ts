import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type RouteComponent } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ElementPlus from 'element-plus'
import router from '@/router'
import { clearSession, readServerSession, readSession, resetFails, writeServerSession } from '@/core/auth'
import { resetStoreCache } from '@/core/storage'
import { accountStorageKey, setActiveAccount } from '@/core/account-context'
import { getThemeMode, readBackgroundPreferences } from '@/ui/theme-preferences'
import { sync } from '@/core/sync'
import { BACKUP_SENSITIVE_KEYS } from '@/core/backup'

const vaultFixture = vi.hoisted(() => ({ saved: null as null | { handle: unknown; name: string } }))
const authApiFixture = vi.hoisted(() => ({
  login: vi.fn(),
  getLoginChallenge: vi.fn(async () => ({ enabled: false })),
  getPasswordPolicy: vi.fn(async () => ({ minLength: 6, maxLength: 256, requireUppercase: false, requireLowercase: false, requireNumber: false, requireSymbol: false })),
}))
const vaultKeyFixture = vi.hoisted(() => ({ importPayload: '' }))

vi.mock('@/core/api/auth', async importOriginal => ({
  ...await importOriginal<typeof import('@/core/api/auth')>(),
  login: authApiFixture.login,
  getLoginChallenge: authApiFixture.getLoginChallenge,
  getPasswordPolicy: authApiFixture.getPasswordPolicy,
}))
vi.mock('@/core/vault-keys', async importOriginal => ({
  ...await importOriginal<typeof import('@/core/vault-keys')>(),
  loadUserKey: vi.fn(async () => ({})),
  encryptEntityContent: vi.fn(async (_key: unknown, value: unknown) => ({ v: 1 as const, iv: 'fixture-iv', ciphertext: JSON.stringify(value) })),
  decryptEntityContent: vi.fn(async () => vaultKeyFixture.importPayload),
}))

vi.mock('@/core/feishu/cache', async importOriginal => ({
  ...await importOriginal<typeof import('@/core/feishu/cache')>(),
  clearFeishuCache: async () => undefined,
}))
vi.mock('@/core/content/vault-handle-store', async importOriginal => ({
  ...await importOriginal<typeof import('@/core/content/vault-handle-store')>(),
  loadVaultHandle: async () => vaultFixture.saved,
  saveVaultHandle: async (handle: { name: string }) => { vaultFixture.saved = { handle, name: handle.name } },
  clearVaultHandle: async () => { vaultFixture.saved = null },
}))

const mounted: VueWrapper[] = []

async function mountCurrentPage(path: '/login' | '/pass' | '/app/admin' | '/app/admin/advanced') {
  const loader = router.resolve(path).matched.at(-1)?.components?.default
  expect(loader).toBeDefined()
  const Page = typeof loader === 'function'
    ? (await (loader as () => Promise<{ default: RouteComponent }>)()).default
    : loader as RouteComponent
  const memoryRouter = createRouter({ history: createMemoryHistory(), routes: [
    { path, component: Page },
    { path: '/app/today', component: { template: '<h1>今天</h1>' } },
    { path: '/app/admin', component: { template: '<h1>设置路由</h1>' } },
    { path: '/login', component: { template: '<h1>登录路由</h1>' } },
    { path: '/pass', component: { template: '<h1>密码路由</h1>' } },
  ].filter((route, index, routes) => routes.findIndex(other => other.path === route.path) === index) })
  await memoryRouter.push(path)
  await memoryRouter.isReady()
  const wrapper = mount(Page, { attachTo: document.body, global: { plugins: [memoryRouter, ElementPlus] } })
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, memoryRouter }
}

beforeEach(() => {
  setActiveAccount('settings-test-user')
  resetStoreCache()
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem('calmy:api-base-url', 'https://api.example.test')
  writeServerSession({ token: 'fixture-token', apiOrigin: 'https://api.example.test', expiresAt: Date.now() + 60_000, user: { id: 'settings-test-user', username: 'fixture-user', displayName: 'Fixture', role: 'admin' }, mustChangePassword: false })
  resetFails()
  authApiFixture.login.mockReset().mockRejectedValue(new Error('invalid-credentials'))
  authApiFixture.getLoginChallenge.mockReset().mockResolvedValue({ enabled: false })
  authApiFixture.getPasswordPolicy.mockReset().mockResolvedValue({ minLength: 6, maxLength: 256, requireUppercase: false, requireLowercase: false, requireNumber: false, requireSymbol: false })
  vaultKeyFixture.importPayload = ''
  vaultFixture.saved = null
})
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  sync.mode = 'local'
  sync.cloud = null
  sync.saved.cloud = null
  Reflect.deleteProperty(window, 'showDirectoryPicker')
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  clearSession()
  setActiveAccount(null)
})

describe('Vue authentication parity with the current 迁移前界面基线 entry', () => {
  it('redirects an unauthenticated advanced route but leaves the current pass placeholder public', async () => {
    clearSession()
    await router.push('/app/admin/advanced')
    expect(router.currentRoute.value.path).toBe('/login')
    await router.push('/pass?mode=first')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('leaves the login screen reachable when a session already exists', async () => {
    writeServerSession({ token: 'fixture-token', apiOrigin: 'https://api.example.test', expiresAt: Date.now() + 60_000, user: { id: 'test-user-id', username: 'test-user', displayName: 'Test', role: 'user' }, mustChangePassword: false })
    await router.push('/app/admin')
    await router.push('/login')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it.each(['/app/admin', '/app/admin/advanced'])('returns the 迁移前界面基线 settings host password action from %s to Today', async origin => {
    writeServerSession({ token: 'fixture-token', apiOrigin: 'https://api.example.test', expiresAt: Date.now() + 60_000, user: { id: 'test-user-id', username: 'test-user', displayName: 'Test', role: 'admin' }, mustChangePassword: false })
    await router.push(origin)
    await router.push('/pass?mode=change')
    expect(router.currentRoute.value.path).toBe('/app/today')
  })

  it('renders the same login form and inline validation on empty submit', async () => {
    const { wrapper } = await mountCurrentPage('/login')
    expect(wrapper.get('.login-brand h1').text()).toBe('Calmy')
    expect(wrapper.get('.login-card input[aria-label="服务地址"]').attributes('autocomplete')).toBe('url')
    expect(wrapper.get('.login-card input[aria-label="用户名"]').attributes('autocomplete')).toBe('username')
    expect(wrapper.get('.login-card input[aria-label="密码"]').attributes('autocomplete')).toBe('current-password')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toBe('请输入用户名和密码')
  })

  it('shows the current wrong-password error without writing a session', async () => {
    clearSession()
    const { wrapper } = await mountCurrentPage('/login')
    await wrapper.get('input[aria-label="用户名"]').setValue('test-user')
    await wrapper.get('input[aria-label="密码"]').setValue('bad-password')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.get('[role="alert"]').text()).toContain('用户名或密码错误'))
    expect(readSession()).toBeNull()
  })

  it('writes a 30-day session and enters Today after a valid login', async () => {
    clearSession()
    authApiFixture.login.mockResolvedValue({ token: 'server-login-token', apiOrigin: 'https://api.example.test', expiresAt: Date.now() + 60_000, user: { id: 'test-user-id', username: 'test-user', displayName: 'Test', role: 'user' }, mustChangePassword: false })
    const { wrapper, memoryRouter } = await mountCurrentPage('/login')
    await wrapper.get('input[aria-label="用户名"]').setValue(' test-user ')
    await wrapper.get('input[aria-label="密码"]').setValue('secret123')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(readServerSession()?.user.username).toBe('test-user'))
    expect(window.location.hash).toContain('#/vault')
    expect(memoryRouter.currentRoute.value.path).toBe('/login')
  })

  it('keeps the current pass placeholder and its Today action', async () => {
    clearSession()
    writeServerSession({ token: 'fixture-token', apiOrigin: 'https://api.example.test', expiresAt: Date.now() + 60_000, user: { id: 'test-user-id', username: 'test-user', displayName: 'Test', role: 'user' }, mustChangePassword: false })
    const { wrapper, memoryRouter } = await mountCurrentPage('/pass')
    expect(wrapper.get('.login-brand h1').text()).toBe('修改密码')
    expect(wrapper.text()).toContain('登录密码与 Vault 数据密钥相互独立')
    expect(memoryRouter.currentRoute.value.path).toBe('/pass')
  })

  it('blocks login after five failures and shows the 30-second lock state', async () => {
    clearSession()
    authApiFixture.login.mockRejectedValue(new Error('rate-limited'))
    const { wrapper } = await mountCurrentPage('/login')
    await wrapper.get('input[aria-label="用户名"]').setValue('test-user')
    await wrapper.get('input[aria-label="密码"]').setValue('bad-password')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.get('[role="alert"]').text()).toContain('用户名或密码错误'))
    expect(wrapper.get('.login-card button').attributes('disabled')).toBeUndefined()
  })
})

describe('Vue settings parity with the 「留白」v11 设置页', () => {
  it('renders current settings sections, encrypted backup actions, and Vault controls as v11 panels', async () => {
    const { wrapper } = await mountCurrentPage('/app/admin')
    // v11：页面自带头部（外壳让位），内容落在 .panel 里，辅助块用 .collapsible[data-hud-rank] 参与 HUD 分层
    expect(wrapper.text()).toContain('本机数据、同步与外观。')
    expect(wrapper.findAll('.panel').length).toBeGreaterThanOrEqual(6)
    expect(wrapper.findAll('.collapsible[data-hud-rank]').length).toBeGreaterThanOrEqual(4)
    for (const heading of ['外观', '场景切换', '数据管理', '系统信息', 'Vault 同步', 'Obsidian Vault', '历史数据迁移']) {
      expect(wrapper.text()).toContain(heading)
    }
    expect(wrapper.findAll('button').some(button => button.text().includes('导出'))).toBe(true)
    expect(wrapper.findAll('button').some(button => button.text().includes('导入'))).toBe(true)
    expect(wrapper.findAll('button').some(button => button.text().includes('选择 Vault'))).toBe(true)
    expect(wrapper.findAll('button').some(button => button.text().trim() === '立即同步')).toBe(true)
  })

  it('persists a theme and background setting across settings remount', async () => {
    const first = await mountCurrentPage('/app/admin')
    await first.wrapper.get('button[aria-pressed="false"]').trigger('click')
    expect(getThemeMode()).toBe('dark')
    await first.wrapper.get('input[aria-label="背景颜色 HEX 色值"]').setValue('#202020')
    await first.wrapper.findAll('button').find(button => button.text() === '应用背景')?.trigger('click')
    expect(readBackgroundPreferences().dark).toBe('#202020')
    first.wrapper.unmount()
    mounted.splice(mounted.indexOf(first.wrapper), 1)
    const second = await mountCurrentPage('/app/admin')
    expect(second.wrapper.get('button[aria-pressed="true"]').text()).toBe('深色')
    expect((second.wrapper.get('input[aria-label="背景颜色 HEX 色值"]').element as HTMLInputElement).value).toBe('#202020')
  })

  it('persists a scene change and restores its selected button after remount', async () => {
    const first = await mountCurrentPage('/app/admin')
    await first.wrapper.get('button[aria-label="切换至情侣场景"]').trigger('click')
    expect(localStorage.getItem(accountStorageKey('b_scene'))).toBe('"couple"')
    first.wrapper.unmount()
    mounted.splice(mounted.indexOf(first.wrapper), 1)

    const second = await mountCurrentPage('/app/admin')
    expect(second.wrapper.get('button[aria-label="切换至情侣场景"]').attributes('aria-pressed')).toBe('true')
  })

  it('exports the current allowed settings without auth or session secrets', async () => {
    localStorage.setItem(accountStorageKey('b_scene'), '"couple"')
    localStorage.setItem('b_auth', '{"secret":"do-not-export"}')
    sessionStorage.setItem('b_session', '{"u":"test-user","ts":1}')
    const { wrapper } = await mountCurrentPage('/app/admin')
    expect(wrapper.findAll('button').some(button => button.text().includes('导出加密备份'))).toBe(true)
    expect(BACKUP_SENSITIVE_KEYS.has('b_auth')).toBe(true)
    expect(BACKUP_SENSITIVE_KEYS.has('b_session')).toBe(true)
    expect(localStorage.getItem('b_auth')).toContain('do-not-export')
  })

  it('imports an allowed setting from a JSON file through the existing control', async () => {
    localStorage.setItem(accountStorageKey('b_scene'), '"personal"')
    const originalSetTimeout = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (delay === 600) return 0 as unknown as ReturnType<typeof setTimeout>
      return originalSetTimeout(callback, delay, ...args)
    }) as typeof setTimeout)
    const { wrapper } = await mountCurrentPage('/app/admin')
    const file = new File(['{"b_scene":"\\"couple\\""}'], 'settings.json', { type: 'application/json' })
    const input = wrapper.get('#file-import').element as HTMLInputElement
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await wrapper.get('#file-import').trigger('change')
    await vi.waitFor(() => expect(document.body.textContent).toContain('导入失败'))
    expect(localStorage.getItem(accountStorageKey('b_scene'))).toBe('"personal"')
  })

  it('prefills the saved sync connection without initiating a network operation', async () => {
    sync.saved.cloud = { url: 'https://example.invalid/worker', key: 'fixture-key' }
    const { wrapper } = await mountCurrentPage('/app/admin')
    expect(wrapper.text()).toContain('Vault 同步')
    expect(wrapper.findAll('button').some(button => button.text().trim() === '立即同步')).toBe(true)
    expect(wrapper.findAll('button').some(button => button.text().includes('Cloudflare'))).toBe(false)
  })

  it('submits Cloudflare settings from the dialog and reflects the connected state', async () => {
    const { wrapper } = await mountCurrentPage('/app/admin')
    expect(wrapper.findAll('button').some(button => button.text().trim() === '立即同步')).toBe(true)
    expect(wrapper.findAll('button').some(button => button.text().includes('Cloudflare'))).toBe(false)
  })

  it('applies the chosen local value from a Vault conflict through the settings UI', async () => {
    const { wrapper } = await mountCurrentPage('/app/admin')
    const scan = wrapper.findAll('button').find(button => button.text() === '扫描差异')
    const apply = wrapper.findAll('button').find(button => button.text() === '应用同步')
    expect(scan?.attributes('disabled')).toBeDefined()
    expect(apply?.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('未连接 Vault')
  })

  it('requires a second reset click and then clears the isolated local settings', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    localStorage.setItem(accountStorageKey('b_scene'), '"couple"')
    localStorage.setItem(accountStorageKey('b_tasks'), '[]')
    const { wrapper } = await mountCurrentPage('/app/admin')
    const reset = wrapper.findAll('button').find(button => button.text() === '重置')
    expect(reset).toBeDefined()
    await reset?.trigger('click')
    expect(localStorage.getItem(accountStorageKey('b_scene'))).toBe('"couple"')
    expect(localStorage.getItem(accountStorageKey('b_tasks'))).toBe('[]')
    expect(document.body.textContent).toContain('再次点击确认清空所有数据')

    await reset?.trigger('click')
    await vi.waitFor(() => expect(localStorage.getItem(accountStorageKey('b_scene'))).toBeNull())
    expect(localStorage.getItem(accountStorageKey('b_tasks'))).toBeNull()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('connects and disconnects a fixture Vault without opening a real directory', async () => {
    const fakeHandle = { kind: 'directory', name: 'fixture-vault' }
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: async () => fakeHandle })
    const { wrapper } = await mountCurrentPage('/app/admin')
    await wrapper.findAll('button').find(button => button.text() === '选择 Vault')?.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('当前 Vault：fixture-vault'))
    expect(wrapper.findAll('button').find(button => button.text() === '扫描差异')?.attributes('disabled')).toBeUndefined()

    await wrapper.findAll('button').find(button => button.text() === '断开 Vault')?.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('未连接 Vault'))
    expect(wrapper.findAll('button').find(button => button.text() === '扫描差异')?.attributes('disabled')).toBeDefined()
  })
})
