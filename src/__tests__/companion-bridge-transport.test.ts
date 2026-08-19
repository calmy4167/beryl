import { describe, expect, it } from 'vitest'
import type { Matter } from '@/domain/matter/model'
import { exportOpenWorkspace } from '@/core/content/open-format'
import { CalmyWebBridgeClient } from '@/core/content/companion-bridge-client'
import { CompanionBridgeSession, encodeBridgeWorkspace } from '@/core/content/companion-bridge-runtime'
import { attachCompanionBridgeSession, createMessagePortTransport, type BridgeMessagePort } from '@/core/content/companion-bridge-transport'
import type { CompanionMessage } from '@/core/content/companion-bridge'
import { readVaultSnapshot, type VaultAdapter } from '@/core/content/obsidian-adapter'

class FakePort implements BridgeMessagePort {
  peer?: FakePort
  closed = false
  private readonly listeners = new Set<(event: { data: unknown }) => void>()

  postMessage(message: unknown): void {
    if (this.closed) throw new Error('fake-port-closed')
    const peer = this.peer
    if (!peer || peer.closed) return
    queueMicrotask(() => peer.listeners.forEach(listener => listener({ data: message })))
  }
  addEventListener(_type: 'message', listener: (event: { data: unknown }) => void): void { this.listeners.add(listener) }
  removeEventListener(_type: 'message', listener: (event: { data: unknown }) => void): void { this.listeners.delete(listener) }
  start(): void {}
  close(): void { this.closed = true }
}

function portPair(): [FakePort, FakePort] {
  const left = new FakePort()
  const right = new FakePort()
  left.peer = right
  right.peer = left
  return [left, right]
}

class PortMemoryVault implements VaultAdapter {
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

function matter(title: string, revision: number): Matter {
  return {
    calmyId: 'port-matter-1', title, why: '验证 MessagePort', primaryContradiction: '',
    status: 'active', currentStage: 'wood', trajectory: 'stable', evidenceIds: [], createdAt: 1723900000000,
    updatedAt: 1723900000000 + revision, revision
  }
}

function putWorkspace(vault: PortMemoryVault, workspace: ReturnType<typeof exportOpenWorkspace>): void {
  Object.entries(workspace.files).forEach(([path, content]) => vault.files.set(path, content))
  workspace.assets.forEach(asset => vault.files.set(asset.path, asset.data))
}

describe('MessagePort Companion Bridge Transport', () => {
  it('connects Web Client and Obsidian Session through an explicit port pair', async () => {
    const [webPort, pluginPort] = portPair()
    const vault = new PortMemoryVault()
    const vaultWorkspace = exportOpenWorkspace({ matters: [matter('Vault 版本', 1)] })
    putWorkspace(vault, vaultWorkspace)
    const webWorkspace = exportOpenWorkspace({ matters: [matter('Web 版本', 2)] })
    const pluginSession = new CompanionBridgeSession(vault)
    const detachPlugin = attachCompanionBridgeSession(pluginPort, pluginSession)
    const webTransport = createMessagePortTransport(webPort)
    const client = new CalmyWebBridgeClient(webTransport, () => webWorkspace, 1000)

    const preview = await client.requestVaultWorkspace('port-export')
    expect(preview.preview.conflict_ids).toEqual(['port-matter-1'])
    await client.applyWorkspaceToVault(encodeBridgeWorkspace(webWorkspace), { 'port-matter-1': 'use-incoming' }, 'port-apply')

    const updated = await readVaultSnapshot(vault)
    expect(updated.issues).toEqual([])
    expect(updated.entities[0]).toMatchObject({ title: 'Web 版本', revision: 2 })
    client.dispose()
    webTransport.close()
    detachPlugin()
  })

  it('drops invalid inbound data and releases the port on close', async () => {
    const [left, right] = portPair()
    const invalid: string[] = []
    const transport = createMessagePortTransport(left, { onInvalidMessage: error => invalid.push(error.code) })
    const messages: CompanionMessage[] = []
    transport.subscribe(message => messages.push(message))
    right.postMessage({ bridge_version: 999, message_id: 'bad', kind: 'hello', client: 'calmy-web', capabilities: [] })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(messages).toEqual([])
    expect(invalid).toEqual(['bridge-version-unsupported'])
    transport.close()
    expect(() => transport.send({ bridge_version: 1, message_id: 'closed', kind: 'hello', client: 'calmy-web', capabilities: [] })).toThrow('bridge-transport-closed')
  })
})
