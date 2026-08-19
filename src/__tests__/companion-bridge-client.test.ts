import { describe, expect, it } from 'vitest'
import type { Matter } from '@/domain/matter/model'
import { exportOpenWorkspace } from '@/core/content/open-format'
import { CalmyWebBridgeClient, type CompanionBridgeTransport } from '@/core/content/companion-bridge-client'
import { CompanionBridgeSession, encodeBridgeWorkspace } from '@/core/content/companion-bridge-runtime'
import type { CompanionMessage } from '@/core/content/companion-bridge'
import { readVaultSnapshot, type VaultAdapter } from '@/core/content/obsidian-adapter'

class ClientMemoryVault implements VaultAdapter {
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
}

class LoopbackTransport implements CompanionBridgeTransport {
  private listeners = new Set<(message: CompanionMessage) => void>()
  constructor(private readonly session: CompanionBridgeSession) {}
  async send(message: CompanionMessage): Promise<void> {
    const response = await this.session.handle(message)
    this.listeners.forEach(listener => listener(response))
  }
  subscribe(listener: (message: CompanionMessage) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

function matter(title: string, revision: number): Matter {
  return {
    calmyId: 'client-matter-1', title, why: '验证 Web Client', primaryContradiction: '',
    status: 'active', currentStage: 'wood', trajectory: 'stable', evidenceIds: [], createdAt: 1723900000000,
    updatedAt: 1723900000000 + revision, revision
  }
}

function putWorkspace(vault: ClientMemoryVault, workspace: ReturnType<typeof exportOpenWorkspace>): void {
  Object.entries(workspace.files).forEach(([path, content]) => vault.files.set(path, content))
  workspace.assets.forEach(asset => vault.files.set(asset.path, asset.data))
}

describe('Calmy Web Companion Bridge Client', () => {
  it('requests Vault export, builds a local preview, and writes back after explicit decisions', async () => {
    const vault = new ClientMemoryVault()
    const vaultWorkspace = exportOpenWorkspace({ matters: [matter('Vault 版本', 2)] })
    putWorkspace(vault, vaultWorkspace)
    const webWorkspace = exportOpenWorkspace({ matters: [matter('Web 版本', 3)] })
    const transport = new LoopbackTransport(new CompanionBridgeSession(vault))
    const client = new CalmyWebBridgeClient(transport, () => webWorkspace, 1000)

    const preview = await client.requestVaultWorkspace('export-from-vault')
    expect(preview.preview.conflict_ids).toEqual(['client-matter-1'])
    expect(preview.preview.asset_conflict_paths).toEqual([])

    await expect(client.applyWorkspaceToVault(encodeBridgeWorkspace(webWorkspace), {}, 'blocked-apply')).rejects.toMatchObject({ code: 'conflict-decision-required' })
    const applied = await client.applyWorkspaceToVault(encodeBridgeWorkspace(webWorkspace), { 'client-matter-1': 'use-incoming' }, 'confirmed-apply')
    expect(applied.kind).toBe('ack')

    const updated = await readVaultSnapshot(vault)
    expect(updated.issues).toEqual([])
    expect(updated.entities[0]).toMatchObject({ title: 'Web 版本', revision: 3 })
    client.dispose()
  })

  it('keeps an unchanged workspace idempotent through the client boundary', async () => {
    const vault = new ClientMemoryVault()
    const workspace = exportOpenWorkspace({ matters: [matter('Vault 版本', 1)] })
    putWorkspace(vault, workspace)
    const client = new CalmyWebBridgeClient(new LoopbackTransport(new CompanionBridgeSession(vault)), () => workspace, 1000)

    await expect(client.applyWorkspaceToVault(encodeBridgeWorkspace(workspace), {}, 'same-workspace')).resolves.toMatchObject({ kind: 'ack' })
    client.dispose()
  })
})
