import { describe, expect, it } from 'vitest'
import type { Matter } from '@/domain/matter/model'
import { hashOpenText, exportOpenWorkspace, OPEN_MANIFEST_PATH } from '@/core/content/open-format'
import { applyVaultSyncPlan, buildVaultSyncPlan } from '@/core/content/vault-sync'
import type { VaultAdapter } from '@/core/content/obsidian-adapter'

class MemoryVault implements VaultAdapter {
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

const matter: Matter = {
  calmyId: 'vault-sync-matter', title: 'Vault 原标题', why: '验证同步', primaryContradiction: '',
  status: 'active', currentStage: 'wood', trajectory: 'stable', evidenceIds: [], createdAt: 1723900000000,
  updatedAt: 1723900001000, revision: 1
}

function putWorkspace(vault: MemoryVault, workspace: ReturnType<typeof exportOpenWorkspace>, path?: string) {
  const originalPath = Object.keys(workspace.files).find(item => item.endsWith('.md')) as string
  const targetPath = path || originalPath
  const manifest = { ...workspace.manifest, entities: workspace.manifest.entities.map(entry => ({ ...entry, path: targetPath, hash: hashOpenText(workspace.files[originalPath]) })) }
  vault.files.set(targetPath, workspace.files[originalPath])
  vault.files.set(OPEN_MANIFEST_PATH, JSON.stringify({ ...manifest, generated_at: new Date().toISOString() }, null, 2) + '\n')
}

describe('Obsidian Vault sync plan', () => {
  it('detects field-level conflicts and preserves the Vault path when local wins', async () => {
    const vault = new MemoryVault()
    putWorkspace(vault, exportOpenWorkspace({ matters: [matter] }), 'Projects/custom-matter.md')
    const local = { ...matter, title: '本地新标题', revision: 2 }
    const plan = await buildVaultSyncPlan(vault, exportOpenWorkspace({ matters: [local] }))

    expect(plan.conflicts).toHaveLength(1)
    expect(plan.conflicts[0].path).toBe('Projects/custom-matter.md')
    expect(plan.conflicts[0].fields.map(field => field.key)).toContain('title')

    const result = await applyVaultSyncPlan(vault, plan, { [matter.calmyId]: 'use-local' })
    expect(result.errors).toEqual([])
    expect(vault.files.has('Projects/custom-matter.md')).toBe(true)
    expect(String(vault.files.get('Projects/custom-matter.md'))).toContain('本地新标题')
  })

  it('requires an explicit decision before a Vault-only entity can be deleted', async () => {
    const vault = new MemoryVault()
    putWorkspace(vault, exportOpenWorkspace({ matters: [matter] }), 'Projects/delete-me.md')
    const plan = await buildVaultSyncPlan(vault, exportOpenWorkspace({}))

    const blocked = await applyVaultSyncPlan(vault, plan, {})
    expect(blocked.missingDecisions).toEqual([matter.calmyId])
    expect(vault.files.has('Projects/delete-me.md')).toBe(true)

    const result = await applyVaultSyncPlan(vault, plan, { [matter.calmyId]: 'delete-vault' })
    expect(result.errors).toEqual([])
    expect(vault.files.has('Projects/delete-me.md')).toBe(false)
    const manifest = JSON.parse(String(vault.files.get(OPEN_MANIFEST_PATH))) as { tombstones?: Array<{ calmy_id: string; path: string }> }
    expect(manifest.tombstones).toEqual([expect.objectContaining({ calmy_id: matter.calmyId, path: 'Projects/delete-me.md' })])
  })

  it('reports a Vault tombstone when the local workspace still has the deleted entity', async () => {
    const vault = new MemoryVault()
    putWorkspace(vault, exportOpenWorkspace({ matters: [matter] }))
    const deletionPlan = await buildVaultSyncPlan(vault, exportOpenWorkspace({}))
    await applyVaultSyncPlan(vault, deletionPlan, { [matter.calmyId]: 'delete-vault' })
    const restorePlan = await buildVaultSyncPlan(vault, exportOpenWorkspace({ matters: [matter] }))

    expect(restorePlan.vaultDeletedEntities).toHaveLength(1)
    expect(restorePlan.vaultDeletedEntities[0].tombstone.calmy_id).toBe(matter.calmyId)
  })
})
