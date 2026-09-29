import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type RouteComponent } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ElementPlus from 'element-plus'
import router from '@/router'
import { createAuthRecord, readSession, resetFails, writeSession } from '@/core/auth'
import { resetStoreCache } from '@/core/storage'
import { getThemeMode, readBackgroundPreferences } from '@/ui/theme-preferences'
import { sync } from '@/core/sync'
import { matterRepository } from '@/domain/matter/repository'
import { exportOpenWorkspace } from '@/core/content/open-format'
import { createFileSystemVaultAdapter, type FileSystemDirectoryHandleLike, type FileSystemFileHandleLike } from '@/core/content/obsidian-adapter'

const vaultFixture = vi.hoisted(() => ({ saved: null as null | { handle: unknown; name: string } }))

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

class SettingsFixtureFile implements FileSystemFileHandleLike {
  kind = 'file' as const
  constructor(public name: string, private bytes = new Uint8Array()) {}
  async getFile(): Promise<File> {
    const bytes = this.bytes
    return {
      text: async () => new TextDecoder().decode(bytes),
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    } as File
  }
  async createWritable() {
    return {
      write: async (value: string | Uint8Array) => { this.bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value },
      close: async () => undefined,
    }
  }
}

class SettingsFixtureDirectory implements FileSystemDirectoryHandleLike {
  kind = 'directory' as const
  entries = new Map<string, SettingsFixtureDirectory | SettingsFixtureFile>()
  constructor(public name: string) {}
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandleLike> {
    const current = this.entries.get(name)
    if (current?.kind === 'directory') return current
    if (!options?.create) throw new Error('directory-missing')
    const directory = new SettingsFixtureDirectory(name)
    this.entries.set(name, directory)
    return directory
  }
  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandleLike> {
    const current = this.entries.get(name)
    if (current?.kind === 'file') return current
    if (!options?.create) throw new Error('file-missing')
    const file = new SettingsFixtureFile(name)
    this.entries.set(name, file)
    return file
  }
  async removeEntry(name: string): Promise<void> { this.entries.delete(name) }
  async *values(): AsyncIterable<SettingsFixtureDirectory | SettingsFixtureFile> { yield* this.entries.values() }
}

async function seedFixtureDirectory(root: SettingsFixtureDirectory, files: Record<string, string>) {
  for (const [path, contents] of Object.entries(files)) {
    const segments = path.split('/')
    const filename = segments.pop() as string
    let directory: FileSystemDirectoryHandleLike = root
    for (const segment of segments) directory = await directory.getDirectoryHandle(segment, { create: true })
    const writable = await (await directory.getFileHandle(filename, { create: true })).createWritable()
    await writable.write(contents)
    await writable.close()
  }
}

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
  resetStoreCache()
  localStorage.clear()
  sessionStorage.clear()
  resetFails()
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
})

describe('Vue authentication parity with the current 迁移前界面基线 entry', () => {
  it('redirects an unauthenticated advanced route but leaves the current pass placeholder public', async () => {
    await router.push('/app/admin/advanced')
    expect(router.currentRoute.value.path).toBe('/login')
    await router.push('/pass?mode=first')
    expect(router.currentRoute.value.path).toBe('/pass')
  })

  it('leaves the login screen reachable when a session already exists', async () => {
    const record = await createAuthRecord('test-user', 'secret123', false)
    localStorage.setItem('b_auth', JSON.stringify(record))
    writeSession('test-user')
    await router.push('/app/admin')
    await router.push('/login')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it.each(['/app/admin', '/app/admin/advanced'])('returns the 迁移前界面基线 settings host password action from %s to Today', async origin => {
    const record = await createAuthRecord('test-user', 'secret123', false)
    localStorage.setItem('b_auth', JSON.stringify(record))
    writeSession('test-user')
    await router.push(origin)
    await router.push('/pass?mode=change')
    expect(router.currentRoute.value.path).toBe('/app/today')
  })

  it('renders the same login form and inline validation on empty submit', async () => {
    const { wrapper } = await mountCurrentPage('/login')
    expect(wrapper.get('.login-brand h1').text()).toBe('Calmy')
    expect(wrapper.get('.login-card input[aria-label="用户名"]').attributes('autocomplete')).toBe('username')
    expect(wrapper.get('.login-card input[aria-label="密码"]').attributes('autocomplete')).toBe('current-password')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toBe('请输入用户名和密码')
  })

  it('shows the current wrong-password error without writing a session', async () => {
    const record = await createAuthRecord('test-user', 'secret123', false)
    localStorage.setItem('b_auth', JSON.stringify(record))
    const { wrapper } = await mountCurrentPage('/login')
    await wrapper.get('input[aria-label="用户名"]').setValue('test-user')
    await wrapper.get('input[aria-label="密码"]').setValue('bad-password')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.get('[role="alert"]').text()).toBe('用户名或密码错误'))
    expect(readSession()).toBeNull()
  })

  it('writes a 30-day session and enters Today after a valid login', async () => {
    const record = await createAuthRecord('test-user', 'secret123', false)
    localStorage.setItem('b_auth', JSON.stringify(record))
    const { wrapper, memoryRouter } = await mountCurrentPage('/login')
    await wrapper.get('input[aria-label="用户名"]').setValue(' test-user ')
    await wrapper.get('input[aria-label="密码"]').setValue('secret123')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(memoryRouter.currentRoute.value.path).toBe('/app/today'))
    expect(readSession()?.u).toBe('test-user')
  })

  it('keeps the current pass placeholder and its Today action', async () => {
    const { wrapper, memoryRouter } = await mountCurrentPage('/pass')
    expect(wrapper.get('.simple-page h1').text()).toBe('设置访问密码')
    expect(wrapper.text()).toContain('首次登录流程已迁移到 React 页面。请返回今天继续使用。')
    await wrapper.get('.simple-page button').trigger('click')
    await vi.waitFor(() => expect(memoryRouter.currentRoute.value.path).toBe('/app/today'))
  })

  it('blocks login after five failures and shows the 30-second lock state', async () => {
    const record = await createAuthRecord('test-user', 'secret123', false)
    localStorage.setItem('b_auth', JSON.stringify(record))
    const { wrapper } = await mountCurrentPage('/login')
    await wrapper.get('input[aria-label="用户名"]').setValue('test-user')
    await wrapper.get('input[aria-label="密码"]').setValue('bad-password')
    for (let index = 0; index < 5; index++) {
      await wrapper.get('form').trigger('submit')
      await vi.waitFor(() => expect(wrapper.get('[role="alert"]').text()).toBe(index === 4 ? '登录失败 5 次，已锁定 30 秒' : '用户名或密码错误'))
      if (index < 4) await vi.waitFor(() => expect(wrapper.get('.login-card button').attributes('disabled')).toBeUndefined())
    }
    await vi.waitFor(() => expect(wrapper.get('[role="alert"]').text()).toBe('登录失败 5 次，已锁定 30 秒'))
    await vi.waitFor(() => expect(wrapper.get('.login-card button').text()).toMatch(/^锁定 \d+s$/))
    expect(wrapper.get('.login-card button').attributes('disabled')).toBeDefined()
  })
})

describe('Vue settings parity with the current 迁移前界面基线 LegacyAdminHost', () => {
  it('renders the existing settings sections, sync dialog, and Vault actions in the host', async () => {
    const { wrapper } = await mountCurrentPage('/app/admin')
    expect(wrapper.get('.legacy-admin-host[aria-label="完整设置与同步界面"]').classes()).toContain('legacy-admin-host')
    for (const heading of ['外观', '场景切换', '数据管理', '系统信息', '数据同步', 'Obsidian Vault', '实体同步迁移（P0）']) {
      expect(wrapper.text()).toContain(heading)
    }
    expect(wrapper.findAll('button').some(button => button.text().includes('导出'))).toBe(true)
    expect(wrapper.findAll('button').some(button => button.text().includes('导入'))).toBe(true)
    expect(wrapper.findAll('button').some(button => button.text().includes('选择 Vault'))).toBe(true)
    await wrapper.findAll('button').find(button => button.text().includes('Cloudflare'))?.trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('连接 Cloudflare 云端')
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
    expect(localStorage.getItem('b_scene')).toBe('"couple"')
    first.wrapper.unmount()
    mounted.splice(mounted.indexOf(first.wrapper), 1)

    const second = await mountCurrentPage('/app/admin')
    expect(second.wrapper.get('button[aria-label="切换至情侣场景"]').attributes('aria-pressed')).toBe('true')
  })

  it('exports the current allowed settings without auth or session secrets', async () => {
    localStorage.setItem('b_scene', '"couple"')
    localStorage.setItem('b_auth', '{"secret":"do-not-export"}')
    localStorage.setItem('b_session', '{"u":"test-user","ts":1}')
    let exported: Blob | undefined
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = vi.fn((blob: Blob) => { exported = blob; return 'blob:settings-test' })
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    try {
      const { wrapper } = await mountCurrentPage('/app/admin')
      await wrapper.findAll('button').find(button => button.text() === '导出')?.trigger('click')
      await vi.waitFor(() => expect(exported).toBeDefined())
      const contents = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsText(exported as Blob)
      })
      const backup = JSON.parse(contents) as Record<string, string>
      expect(backup.b_scene).toBe('"couple"')
      expect(backup.b_auth).toBeUndefined()
      expect(backup.b_session).toBeUndefined()
    } finally {
      URL.createObjectURL = originalCreateObjectURL
      URL.revokeObjectURL = originalRevokeObjectURL
    }
  })

  it('imports an allowed setting from a JSON file through the existing control', async () => {
    localStorage.setItem('b_scene', '"personal"')
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
    await vi.waitFor(() => expect(localStorage.getItem('b_scene')).toBe('"couple"'))
  })

  it('prefills the saved sync connection without initiating a network operation', async () => {
    sync.saved.cloud = { url: 'https://example.invalid/worker', key: 'fixture-key' }
    const { wrapper } = await mountCurrentPage('/app/admin')
    expect(wrapper.text()).toContain('已保存 Cloudflare 配置（未连接）')
    await wrapper.findAll('button').find(button => button.text() === 'Cloudflare')?.trigger('click')
    await flushPromises()
    expect((document.body.querySelector('input[aria-label="Cloudflare Worker 地址"]') as HTMLInputElement).value).toBe('https://example.invalid/worker')
    expect((document.body.querySelector('input[aria-label="云端同步密码"]') as HTMLInputElement).value).toBe('fixture-key')
  })

  it('submits Cloudflare settings from the dialog and reflects the connected state', async () => {
    const syncModule = await import('@/core/sync')
    const connect = vi.spyOn(syncModule, 'cloudConnect').mockImplementation(async (url, key) => {
      sync.mode = 'cloud'
      sync.cloud = { url, key, updatedAt: 1 }
      sync.saved.cloud = { url, key }
      return true
    })
    const { wrapper } = await mountCurrentPage('/app/admin')
    await wrapper.findAll('button').find(button => button.text() === 'Cloudflare')?.trigger('click')
    await flushPromises()
    const url = document.body.querySelector('input[aria-label="Cloudflare Worker 地址"]') as HTMLInputElement
    const key = document.body.querySelector('input[aria-label="云端同步密码"]') as HTMLInputElement
    url.value = 'https://worker.example.test'
    url.dispatchEvent(new Event('input', { bubbles: true }))
    key.value = 'fixture-key'
    key.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    const connectButton = [...document.body.querySelectorAll('button')].find(button => button.textContent?.trim() === '连接')
    connectButton?.click()
    await vi.waitFor(() => expect(connect).toHaveBeenCalledWith('https://worker.example.test', 'fixture-key'))
    expect(sync.saved.cloud).toEqual({ url: 'https://worker.example.test', key: 'fixture-key' })
    expect(sync.mode).toBe('cloud')
    expect(wrapper.text()).toContain('已连接云端（增量同步 + AES-GCM 加密）')
  })

  it('applies the chosen local value from a Vault conflict through the settings UI', async () => {
    const matter = {
      calmyId: 'settings-vault-conflict', title: '本地标题', why: '验证设置操作', primaryContradiction: '',
      status: 'active' as const, currentStage: 'wood' as const, trajectory: 'stable' as const, evidenceIds: [],
      createdAt: 1723900000000, updatedAt: 1723900001000, revision: 2,
    }
    matterRepository.importEntity(matter)
    const vaultMatter = { ...matter, title: 'Vault 标题', revision: 1 }
    const workspace = exportOpenWorkspace({ matters: [vaultMatter] })
    const root = new SettingsFixtureDirectory('fixture-vault')
    await seedFixtureDirectory(root, workspace.files)
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: async () => root })

    const { wrapper } = await mountCurrentPage('/app/admin')
    await wrapper.findAll('button').find(button => button.text() === '选择 Vault')?.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('当前 Vault：fixture-vault'))
    await wrapper.findAll('button').find(button => button.text() === '扫描差异')?.trigger('click')
    const selector = '[aria-label="冲突 settings-vault-conflict 的处理方式"]'
    await vi.waitFor(() => expect(wrapper.find(selector).exists()).toBe(true))
    await wrapper.get(selector).trigger('click')
    await flushPromises()
    const localOption = [...document.body.querySelectorAll('.el-select-dropdown__item')].find(option => option.textContent?.trim() === '使用本地')
    expect(localOption).toBeDefined()
    localOption?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '应用同步')?.trigger('click')
    const adapter = createFileSystemVaultAdapter(root)
    await vi.waitFor(async () => {
      const updated = await adapter.readText(Object.keys(workspace.files).find(path => path.endsWith('.md')) as string)
      expect(updated).toContain('title: "本地标题"')
    })
    expect(wrapper.text()).toContain('实体冲突 0')
  })

  it('requires a second reset click and then clears the isolated local settings', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    localStorage.setItem('b_scene', '"couple"')
    localStorage.setItem('b_tasks', '[]')
    const { wrapper } = await mountCurrentPage('/app/admin')
    const reset = wrapper.findAll('button').find(button => button.text() === '重置')
    expect(reset).toBeDefined()
    await reset?.trigger('click')
    expect(localStorage.getItem('b_scene')).toBe('"couple"')
    expect(localStorage.getItem('b_tasks')).toBe('[]')
    expect(document.body.textContent).toContain('再次点击确认清空所有数据')

    await reset?.trigger('click')
    await vi.waitFor(() => expect(localStorage.getItem('b_scene')).toBeNull())
    expect(localStorage.getItem('b_tasks')).toBeNull()
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
