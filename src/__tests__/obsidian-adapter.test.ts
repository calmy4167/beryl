import { describe, expect, it } from 'vitest'
import type { Matter } from '@/domain/matter/model'
import { exportOpenWorkspace } from '@/core/content/open-format'
import { createFileSystemVaultAdapter, readVaultSnapshot, syncWorkspaceToVault, type FileSystemDirectoryHandleLike, type FileSystemFileHandleLike, type VaultAdapter, watchVault } from '@/core/content/obsidian-adapter'

class MemoryVault implements VaultAdapter {
  files = new Map<string, string | Uint8Array>()
  writes: string[] = []
  listeners = new Set<(path: string) => void>()

  async listPaths(): Promise<string[]> { return [...this.files.keys()] }
  async readText(path: string): Promise<string> {
    const value = this.files.get(path)
    if (typeof value !== 'string') throw new Error('not-text')
    return value
  }
  async readBinary(path: string): Promise<Uint8Array> {
    const value = this.files.get(path)
    if (!(value instanceof Uint8Array)) throw new Error('not-binary')
    return value
  }
  async writeText(path: string, content: string): Promise<void> {
    this.files.set(path, content)
    this.writes.push(path)
  }
  async writeBinary(path: string, content: Uint8Array): Promise<void> {
    this.files.set(path, content)
    this.writes.push(path)
  }
  onChange(listener: (path: string) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  emit(path: string): void { this.listeners.forEach(listener => listener(path)) }
}

class FakeFileHandle implements FileSystemFileHandleLike {
  kind = 'file' as const
  constructor(public name: string, private value = new Uint8Array()) {}
  async getFile(): Promise<File> {
    const bytes = this.value
    return { text: async () => new TextDecoder().decode(bytes), arrayBuffer: async () => bytes.buffer } as unknown as File
  }
  async createWritable() {
    return {
      write: async (value: string | Uint8Array) => { this.value = typeof value === 'string' ? new TextEncoder().encode(value) : value },
      close: async () => undefined
    }
  }
}

class FakeDirectoryHandle implements FileSystemDirectoryHandleLike {
  kind = 'directory' as const
  entries = new Map<string, FakeDirectoryHandle | FakeFileHandle>()
  constructor(public name: string) {}
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandleLike> {
    const current = this.entries.get(name)
    if (current?.kind === 'directory') return current
    if (!options?.create) throw new Error('directory-missing')
    const directory = new FakeDirectoryHandle(name)
    this.entries.set(name, directory)
    return directory
  }
  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandleLike> {
    const current = this.entries.get(name)
    if (current?.kind === 'file') return current
    if (!options?.create) throw new Error('file-missing')
    const file = new FakeFileHandle(name)
    this.entries.set(name, file)
    return file
  }
  async removeEntry(name: string): Promise<void> {
    if (!this.entries.delete(name)) throw new Error('entry-missing')
  }
  async *values(): AsyncIterable<FakeDirectoryHandle | FakeFileHandle> {
    yield* this.entries.values()
  }
}

const matter: Matter = {
  calmyId: 'obsidian-matter-1', title: 'Obsidian 适配测试', why: '验证 Vault 边界', primaryContradiction: '',
  status: 'active', currentStage: 'wood', trajectory: 'stable', evidenceIds: [], createdAt: 1723900000000,
  updatedAt: 1723900001000, revision: 1
}

describe('Obsidian Vault Adapter', () => {
  it('reads Markdown, manifest and binary assets through the adapter boundary', async () => {
    const vault = new MemoryVault()
    const workspace = exportOpenWorkspace({ matters: [matter], assets: [{ path: 'assets/evidence.bin', data: new Uint8Array([1, 2]), mimeType: 'application/octet-stream' }] })
    Object.entries(workspace.files).forEach(([path, content]) => vault.files.set(path, content))
    workspace.assets.forEach(asset => vault.files.set(asset.path, asset.data))

    const snapshot = await readVaultSnapshot(vault)

    expect(snapshot.issues).toEqual([])
    expect(snapshot.entities).toHaveLength(1)
    expect(snapshot.assets).toHaveLength(1)
    expect(snapshot.paths).toContain('_calmy/manifest.json')
  })

  it('writes entities and assets before manifest, then becomes idempotent', async () => {
    const vault = new MemoryVault()
    const workspace = exportOpenWorkspace({ matters: [matter], assets: [{ path: 'assets/evidence.bin', data: new Uint8Array([1, 2]), mimeType: 'application/octet-stream' }] })

    const first = await syncWorkspaceToVault(vault, workspace)
    const firstWrites = [...vault.writes]
    const second = await syncWorkspaceToVault(vault, workspace)

    expect(first.errors).toEqual([])
    expect(firstWrites[firstWrites.length - 1]).toBe('_calmy/manifest.json')
    expect(second.writtenPaths).toEqual([])
    expect(second.unchangedPaths).toHaveLength(firstWrites.length)
  })

  it('debounces Vault change events and returns an unsubscribe function', async () => {
    const vault = new MemoryVault()
    const changes: string[] = []
    const stop = watchVault(vault, path => changes.push(path), 5)
    vault.emit('folder\\note.md')
    vault.emit('folder\\note.md')
    await new Promise(resolve => setTimeout(resolve, 15))
    stop()

    expect(changes).toEqual(['folder/note.md'])
  })

  it('identifies a missing manifest entity as a tombstone instead of silently failing the Vault read', async () => {
    const vault = new MemoryVault()
    const workspace = exportOpenWorkspace({ matters: [matter] })
    const markdownPath = Object.keys(workspace.files).find(path => path.endsWith('.md')) as string
    Object.entries(workspace.files).forEach(([path, content]) => { if (path !== markdownPath) vault.files.set(path, content) })

    const snapshot = await readVaultSnapshot(vault)

    expect(snapshot.issues).toEqual([])
    expect(snapshot.entities).toEqual([])
    expect(snapshot.tombstones).toEqual([expect.objectContaining({ calmy_id: matter.calmyId, path: markdownPath, revision: matter.revision })])
  })

  it('recursively reads and writes a browser directory handle, including nested paths', async () => {
    const root = new FakeDirectoryHandle('vault')
    const adapter = createFileSystemVaultAdapter(root)
    await adapter.writeText('Notes/example.md', '# example')
    await adapter.writeBinary('assets/example.bin', new Uint8Array([3, 4]))

    expect((await adapter.listPaths()).sort()).toEqual(['Notes/example.md', 'assets/example.bin'])
    expect(await adapter.readText('Notes/example.md')).toBe('# example')
    expect([...await adapter.readBinary('assets/example.bin')]).toEqual([3, 4])
    await adapter.deletePath?.('Notes/example.md')
    expect(await adapter.listPaths()).toEqual(['assets/example.bin'])
  })
})
