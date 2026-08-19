import { describe, expect, it } from 'vitest'
import type { Matter } from '@/domain/matter/model'
import { exportOpenWorkspace, OPEN_MANIFEST_PATH } from '@/core/content/open-format'
import { unifiedFactories } from '@/domain/unified'
import {
  createWorkspaceExportRequest,
  createWorkspaceImportApply
} from '@/core/content/companion-bridge'
import {
  buildWorkspaceImportPreview,
  CompanionBridgeSession,
  decodeBridgeWorkspace,
  encodeBridgeWorkspace
} from '@/core/content/companion-bridge-runtime'
import { readVaultSnapshot, type VaultAdapter } from '@/core/content/obsidian-adapter'

class RuntimeMemoryVault implements VaultAdapter {
  files = new Map<string, string | Uint8Array>()

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
  async writeText(path: string, content: string): Promise<void> { this.files.set(path, content) }
  async writeBinary(path: string, content: Uint8Array): Promise<void> { this.files.set(path, content) }
  async deletePath(path: string): Promise<void> { this.files.delete(path) }
}

function matter(title: string, revision: number): Matter {
  return {
    calmyId: 'bridge-matter-1', title, why: '验证运行时桥接', primaryContradiction: '',
    status: 'active', currentStage: 'wood', trajectory: 'stable', evidenceIds: [], createdAt: 1723900000000,
    updatedAt: 1723900000000 + revision, revision
  }
}

function putWorkspace(vault: RuntimeMemoryVault, workspace: ReturnType<typeof exportOpenWorkspace>): void {
  Object.entries(workspace.files).forEach(([path, content]) => vault.files.set(path, content))
  workspace.assets.forEach(asset => vault.files.set(asset.path, asset.data))
}

describe('Companion bridge runtime', () => {
  it('round-trips Markdown and binary assets through a JSON-safe payload', () => {
    const workspace = exportOpenWorkspace({ matters: [matter('本地事项', 1)], assets: [{ path: 'assets/a.bin', data: new Uint8Array([0, 1, 255]), mimeType: 'application/octet-stream' }] })
    const payload = encodeBridgeWorkspace(workspace)
    const decoded = decodeBridgeWorkspace(payload)

    expect(decoded.files).toEqual(workspace.files)
    expect([...decoded.assets[0].data]).toEqual([0, 1, 255])
    expect(payload.assets[0].data_base64).toBe('AAH/')
  })

  it('builds a preview with entity and asset conflict boundaries', () => {
    const local = exportOpenWorkspace({ matters: [matter('本地事项', 1)], assets: [{ path: 'assets/a.bin', data: new Uint8Array([1]), mimeType: 'application/octet-stream' }] })
    const incoming = exportOpenWorkspace({ matters: [matter('Vault 事项', 2)], assets: [{ path: 'assets/a.bin', data: new Uint8Array([2]), mimeType: 'application/octet-stream' }] })
    const preview = buildWorkspaceImportPreview('preview-1', local, encodeBridgeWorkspace(incoming))

    expect(preview.conflict_ids).toEqual(['bridge-matter-1'])
    expect(preview.conflict_previews).toEqual([expect.objectContaining({
      calmy_id: 'bridge-matter-1',
      fields: expect.arrayContaining([expect.objectContaining({ key: 'title', local_value: '本地事项', incoming_value: 'Vault 事项' })])
    })])
    expect(preview.asset_conflict_paths).toEqual(['assets/a.bin'])
    expect(preview.issues).toEqual([])
  })

  it('exports idempotently and requires an explicit conflict decision before writeback', async () => {
    const vault = new RuntimeMemoryVault()
    const local = exportOpenWorkspace({ matters: [matter('本地事项', 1)] })
    putWorkspace(vault, local)
    const incoming = exportOpenWorkspace({ matters: [matter('Vault 事项', 2)] })
    const session = new CompanionBridgeSession(vault)

    const request = createWorkspaceExportRequest('export-1')
    const exported = await session.handle(request)
    expect(exported.kind).toBe('workspace_export')
    expect(await session.handle(request)).toBe(exported)

    const blocked = await session.handle(createWorkspaceImportApply(encodeBridgeWorkspace(incoming), {}, 'apply-blocked'))
    expect(blocked.kind).toBe('error')
    if (blocked.kind === 'error') expect(blocked.code).toBe('conflict-decision-required')

    const applied = await session.handle(createWorkspaceImportApply(encodeBridgeWorkspace(incoming), { 'bridge-matter-1': 'use-incoming' }, 'apply-1'))
    expect(applied.kind).toBe('ack')
    const snapshot = await readVaultSnapshot(vault)
    expect(snapshot.issues).toEqual([])
    expect(snapshot.entities[0]).toMatchObject({ title: 'Vault 事项', revision: 2 })
  })

  it('writes a newly imported unified entity to its own stable folder', async () => {
    const vault = new RuntimeMemoryVault()
    putWorkspace(vault, exportOpenWorkspace({ unified: [] }))
    const person = unifiedFactories.person({ displayName: 'Bridge 人物', roles: [], tags: [] })
    const session = new CompanionBridgeSession(vault)

    const applied = await session.handle(createWorkspaceImportApply(encodeBridgeWorkspace(exportOpenWorkspace({ unified: [person] })), {}, 'apply-unified'))

    expect(applied.kind).toBe('ack')
    expect([...vault.files.keys()].some(path => path.startsWith('10 People/'))).toBe(true)
    expect((await readVaultSnapshot(vault)).entities).toEqual([person])
  })

  it('requires an explicit tombstone decision and then deletes the Vault file while preserving deletion history', async () => {
    const vault = new RuntimeMemoryVault()
    const local = exportOpenWorkspace({ matters: [matter('待删除事项', 1)] })
    putWorkspace(vault, local)
    const markdownPath = Object.keys(local.files).find(path => path.endsWith('.md')) as string
    const incomingManifest = {
      ...local.manifest,
      generated_at: new Date().toISOString(),
      entities: [],
      tombstones: [{ calmy_id: 'bridge-matter-1', calmy_type: 'matter' as const, path: markdownPath, revision: 1, deleted_at: new Date().toISOString() }]
    }
    const incomingPayload = encodeBridgeWorkspace({
      files: { [OPEN_MANIFEST_PATH]: JSON.stringify(incomingManifest, null, 2) + '\n' },
      assets: [],
      manifest: incomingManifest
    })
    const preview = buildWorkspaceImportPreview('tombstone-preview', local, incomingPayload)
    expect(preview.tombstone_ids).toEqual(['bridge-matter-1'])
    const session = new CompanionBridgeSession(vault)

    const blocked = await session.handle(createWorkspaceImportApply(incomingPayload, {}, 'tombstone-blocked'))
    expect(blocked.kind).toBe('error')
    if (blocked.kind === 'error') expect(blocked.code).toBe('conflict-decision-required')

    const applied = await session.handle(createWorkspaceImportApply(incomingPayload, { 'bridge-matter-1': 'use-incoming' }, 'tombstone-apply'))
    expect(applied.kind).toBe('ack')
    expect(vault.files.has(markdownPath)).toBe(false)
    if (applied.kind === 'ack') expect(JSON.parse(applied.message).deleted_paths).toEqual([markdownPath])
    const snapshot = await readVaultSnapshot(vault)
    expect(snapshot.entities).toEqual([])
    expect(snapshot.tombstones).toEqual([expect.objectContaining({ calmy_id: 'bridge-matter-1', path: markdownPath })])
  })
})
