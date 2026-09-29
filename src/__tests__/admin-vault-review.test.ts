import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import type { FileSystemDirectoryHandleLike, FileSystemFileHandleLike } from '@/core/content/obsidian-adapter'
import { exportOpenWorkspace } from '@/core/content/open-format'
import { matterRepository } from '@/domain/matter/repository'
import { assetRepository } from '@/core/content/assets'
import type { Matter } from '@/domain/matter/model'
import AdminView from '@/views/AdminView.vue'

const vaultHandleMocks = vi.hoisted(() => ({
  load: vi.fn(), save: vi.fn(), clear: vi.fn(), queryPermission: vi.fn(), requestPermission: vi.fn()
}))

vi.mock('@/core/content/vault-handle-store', () => ({
  loadVaultHandle: vaultHandleMocks.load,
  saveVaultHandle: vaultHandleMocks.save,
  clearVaultHandle: vaultHandleMocks.clear,
  queryVaultHandlePermission: vaultHandleMocks.queryPermission,
  requestVaultHandlePermission: vaultHandleMocks.requestPermission
}))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return { ...(actual as Record<string, unknown>), ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }
})

class MemoryFile implements FileSystemFileHandleLike {
  readonly kind = 'file' as const
  constructor(readonly name: string, private bytes: Uint8Array) {}
  async getFile(): Promise<File> {
    const bytes = this.bytes.slice()
    return { text: async () => new TextDecoder().decode(bytes), arrayBuffer: async () => bytes.buffer } as unknown as File
  }
  async createWritable() {
    return { write: async (value: string | Uint8Array) => { this.bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value.slice() }, close: async () => undefined }
  }
}

class MemoryDirectory implements FileSystemDirectoryHandleLike {
  readonly kind = 'directory' as const
  readonly entries = new Map<string, MemoryDirectory | MemoryFile>()
  constructor(readonly name: string) {}
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandleLike> {
    const entry = this.entries.get(name)
    if (entry?.kind === 'directory') return entry
    if (!options?.create) throw new Error('directory-missing')
    const directory = new MemoryDirectory(name)
    this.entries.set(name, directory)
    return directory
  }
  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandleLike> {
    const entry = this.entries.get(name)
    if (entry?.kind === 'file') return entry
    if (!options?.create) throw new Error('file-missing')
    const file = new MemoryFile(name, new Uint8Array())
    this.entries.set(name, file)
    return file
  }
  async removeEntry(name: string): Promise<void> { this.entries.delete(name) }
  async *values(): AsyncIterable<MemoryDirectory | MemoryFile> { yield* this.entries.values() }
}

async function writeFile(root: MemoryDirectory, path: string, content: string | Uint8Array): Promise<void> {
  const segments = path.split('/')
  const filename = segments.pop() as string
  let directory = root
  for (const segment of segments) directory = await directory.getDirectoryHandle(segment, { create: true }) as MemoryDirectory
  await (await directory.getFileHandle(filename, { create: true }) as MemoryFile).createWritable().then(async writer => {
    await writer.write(content)
    await writer.close()
  })
}

const localMatter: Matter = {
  calmyId: 'admin-vault-matter', title: '本地标题', why: '验证管理员中的冲突审阅', primaryContradiction: '',
  status: 'active', currentStage: 'wood', trajectory: 'stable', evidenceIds: [], createdAt: 1723900000000,
  updatedAt: 1723900001000, revision: 1
}

describe('Admin Vault conflict review', () => {
  beforeEach(() => {
    localStorage.clear()
    vaultHandleMocks.load.mockReset().mockResolvedValue(undefined)
    vaultHandleMocks.save.mockReset().mockResolvedValue(undefined)
    vaultHandleMocks.clear.mockReset().mockResolvedValue(undefined)
    vaultHandleMocks.queryPermission.mockReset().mockResolvedValue('granted')
    vaultHandleMocks.requestPermission.mockReset().mockResolvedValue('granted')
    matterRepository.importEntity(localMatter)
    assetRepository.importAsset({ path: 'assets/evidence.bin', data: new Uint8Array([1, 2]), mimeType: 'application/octet-stream' })
  })

  it('shows manifest drift and exposes a decision control for external binary conflicts', async () => {
    const workspace = exportOpenWorkspace({ matters: [localMatter], assets: [{ path: 'assets/evidence.bin', data: new Uint8Array([1, 2]), mimeType: 'application/octet-stream' }] })
    const root = new MemoryDirectory('test-vault')
    const markdownPath = Object.keys(workspace.files).find(path => path.endsWith('.md')) as string
    for (const [path, content] of Object.entries(workspace.files)) {
      const value = path === markdownPath ? content.replace('title: "本地标题"', 'title: "外部标题"') : content
      await writeFile(root, path, value)
    }
    await writeFile(root, 'assets/evidence.bin', new Uint8Array([3, 4]))
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: async () => root })

    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin', component: AdminView }] })
    await router.push('/admin')
    await router.isReady()
    const wrapper = mount(AdminView, { global: { plugins: [router, ElementPlus] } })
    try {
      await wrapper.findAll('button').find(button => button.text().includes('选择 Vault'))?.trigger('click')
      await wrapper.findAll('button').find(button => button.text().includes('扫描差异'))?.trigger('click')
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(wrapper.text()).toContain('manifest-hash-mismatch')
      expect(wrapper.text()).toContain('附件冲突 1')
      expect(wrapper.find('[aria-label="附件 assets/evidence.bin 的冲突处理方式"]').exists()).toBe(true)
    } finally {
      wrapper.unmount()
      Reflect.deleteProperty(window, 'showDirectoryPicker')
    }
  })

  it('offers an explicit disconnect action after the user chooses a Vault', async () => {
    const root = new MemoryDirectory('test-vault')
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: async () => root })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin', component: AdminView }] })
    await router.push('/admin')
    await router.isReady()
    const wrapper = mount(AdminView, { global: { plugins: [router, ElementPlus] } })
    try {
      await wrapper.findAll('button').find(button => button.text().includes('选择 Vault'))?.trigger('click')
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(wrapper.findAll('button').some(button => button.text().includes('断开 Vault'))).toBe(true)
      expect(vaultHandleMocks.save).toHaveBeenCalledWith(root)
      await wrapper.findAll('button').find(button => button.text().includes('断开 Vault'))?.trigger('click')
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(vaultHandleMocks.clear).toHaveBeenCalledOnce()
    } finally {
      wrapper.unmount()
      Reflect.deleteProperty(window, 'showDirectoryPicker')
    }
  })

  it('does not request permission on startup and requires an explicit restore action', async () => {
    const root = new MemoryDirectory('existing-vault')
    vaultHandleMocks.load.mockResolvedValue({ handle: root, name: root.name })
    vaultHandleMocks.queryPermission.mockResolvedValue('prompt')
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin', component: AdminView }] })
    await router.push('/admin')
    await router.isReady()
    const wrapper = mount(AdminView, { global: { plugins: [router, ElementPlus] } })
    try {
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(vaultHandleMocks.requestPermission).not.toHaveBeenCalled()
      expect(wrapper.findAll('button').some(button => button.text().includes('恢复 Vault 授权'))).toBe(true)

      await wrapper.findAll('button').find(button => button.text().includes('恢复 Vault 授权'))?.trigger('click')
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(vaultHandleMocks.requestPermission).toHaveBeenCalledWith(root)
      expect(wrapper.findAll('button').find(button => button.text().includes('扫描差异'))?.attributes('disabled')).toBeUndefined()
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps Vault inactive when the user denies the explicit permission restore', async () => {
    const root = new MemoryDirectory('restricted-vault')
    vaultHandleMocks.load.mockResolvedValue({ handle: root, name: root.name })
    vaultHandleMocks.queryPermission.mockResolvedValue('prompt')
    vaultHandleMocks.requestPermission.mockResolvedValue('denied')
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin', component: AdminView }] })
    await router.push('/admin')
    await router.isReady()
    const wrapper = mount(AdminView, { global: { plugins: [router, ElementPlus] } })
    try {
      await new Promise(resolve => setTimeout(resolve, 0))
      await wrapper.findAll('button').find(button => button.text().includes('恢复 Vault 授权'))?.trigger('click')
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(vaultHandleMocks.requestPermission).toHaveBeenCalledWith(root)
      expect(wrapper.findAll('button').find(button => button.text().includes('扫描差异'))?.attributes('disabled')).toBeDefined()
      expect(wrapper.text()).toContain('目录权限尚未恢复')
    } finally {
      wrapper.unmount()
    }
  })
})
