import { describe, expect, it } from 'vitest'
import type { Matter } from '@/domain/matter/model'
import { exportOpenWorkspace } from '@/core/content/open-format'
import { readVaultSnapshot, syncWorkspaceToVault, type VaultAdapter, watchVault } from '@/core/content/obsidian-adapter'

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
})
