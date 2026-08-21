import { describe, expect, it } from 'vitest'
import type { Matter } from '@/domain/matter/model'
import { exportOpenWorkspace, OPEN_MANIFEST_PATH } from '@/core/content/open-format'
import { CalmyWebBridgeClient } from '@/core/content/companion-bridge-client'
import { createWorkspaceImportApply } from '@/core/content/companion-bridge'
import { CompanionBridgeSession, encodeBridgeWorkspace } from '@/core/content/companion-bridge-runtime'
import { attachCompanionBridgeSession, createMessagePortTransport, type BridgeMessagePort } from '@/core/content/companion-bridge-transport'
import { readVaultSnapshot, type VaultAdapter } from '@/core/content/obsidian-adapter'

class CrossDevicePort implements BridgeMessagePort {
  peer?: CrossDevicePort
  closed = false
  private readonly listeners = new Set<(event: { data: unknown }) => void>()
  postMessage(message: unknown): void {
    if (this.closed) throw new Error('port-closed')
    if (!this.peer || this.peer.closed) return
    queueMicrotask(() => this.peer?.listeners.forEach(listener => listener({ data: message })))
  }
  addEventListener(_type: 'message', listener: (event: { data: unknown }) => void): void { this.listeners.add(listener) }
  removeEventListener(_type: 'message', listener: (event: { data: unknown }) => void): void { this.listeners.delete(listener) }
  start(): void {}
  close(): void { this.closed = true }
}

class CrossDeviceVault implements VaultAdapter {
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

function portPair(): [CrossDevicePort, CrossDevicePort] {
  const left = new CrossDevicePort(); const right = new CrossDevicePort()
  left.peer = right; right.peer = left
  return [left, right]
}

function matter(title: string, revision: number): Matter {
  return {
    calmyId: 'cross-device-matter', title, why: '跨设备回归', primaryContradiction: '', status: 'active',
    currentStage: 'wood', trajectory: 'stable', evidenceIds: [], createdAt: 1723900000000,
    updatedAt: 1723900000000 + revision, revision
  }
}

function putWorkspace(vault: CrossDeviceVault, workspace: ReturnType<typeof exportOpenWorkspace>): void {
  Object.entries(workspace.files).forEach(([path, content]) => vault.files.set(path, content))
  workspace.assets.forEach(asset => vault.files.set(asset.path, asset.data))
}

describe('Companion Bridge cross-device regression', () => {
  it('supports device A update, device B reconnect/conflict, tombstone propagation and concurrent duplicate idempotency', async () => {
    const vault = new CrossDeviceVault()
    putWorkspace(vault, exportOpenWorkspace({ matters: [matter('Vault v1', 1)] }))
    const session = new CompanionBridgeSession(vault)

    const [webAPort, pluginAPort] = portPair()
    const detachA = attachCompanionBridgeSession(pluginAPort, session)
    const transportA = createMessagePortTransport(webAPort)
    const deviceA = new CalmyWebBridgeClient(transportA, () => exportOpenWorkspace({ matters: [matter('设备 A v2', 2)] }), 1000)
    const previewA = await deviceA.requestVaultWorkspace('device-a-export')
    expect(previewA.preview.conflict_ids).toEqual(['cross-device-matter'])
    const updateA = await deviceA.applyWorkspaceToVault(encodeBridgeWorkspace(exportOpenWorkspace({ matters: [matter('设备 A v2', 2)] })), { 'cross-device-matter': 'use-incoming' }, 'device-a-apply')
    expect(updateA.kind).toBe('ack')
    deviceA.dispose(); transportA.close(); detachA()

    const [webBPort, pluginBPort] = portPair()
    const detachB = attachCompanionBridgeSession(pluginBPort, session)
    const transportB = createMessagePortTransport(webBPort)
    const deviceBWorkspace = exportOpenWorkspace({ matters: [matter('设备 B v3', 3)] })
    const deviceB = new CalmyWebBridgeClient(transportB, () => deviceBWorkspace, 1000)
    const previewB = await deviceB.requestVaultWorkspace('device-b-export')
    expect(previewB.preview.conflict_previews?.[0].fields).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'title' })]))
    const updateB = await deviceB.applyWorkspaceToVault(encodeBridgeWorkspace(deviceBWorkspace), { 'cross-device-matter': 'use-incoming' }, 'device-b-apply')
    expect(updateB.kind).toBe('ack')

    const tombstoneWorkspace = exportOpenWorkspace({})
    const currentVault = await readVaultSnapshot(vault)
    const path = currentVault.manifest?.entities.find(entry => entry.calmy_id === 'cross-device-matter')?.path
    expect(path).toBeTruthy()
    const tombstoneManifest = {
      ...tombstoneWorkspace.manifest,
      tombstones: [{ calmy_id: 'cross-device-matter', calmy_type: 'matter' as const, path: path as string, revision: 4, deleted_at: new Date().toISOString() }]
    }
    const tombstonePayload = encodeBridgeWorkspace({
      ...tombstoneWorkspace,
      files: { [OPEN_MANIFEST_PATH]: JSON.stringify(tombstoneManifest, null, 2) + '\n' },
      manifest: tombstoneManifest
    })
    const tombstoneMessage = createWorkspaceImportApply(tombstonePayload, { 'cross-device-matter': 'use-incoming' }, 'device-b-tombstone')
    const [first, second] = await Promise.all([session.handle(tombstoneMessage), session.handle(tombstoneMessage)])
    expect(first).toBe(second)
    expect(first.kind).toBe('ack')
    expect(vault.files.has(path as string)).toBe(false)

    const [webCPort, pluginCPort] = portPair()
    const detachC = attachCompanionBridgeSession(pluginCPort, session)
    const transportC = createMessagePortTransport(webCPort)
    const deviceC = new CalmyWebBridgeClient(transportC, () => exportOpenWorkspace({ matters: [matter('设备 C 旧副本', 3)] }), 1000)
    const previewC = await deviceC.requestVaultWorkspace('device-c-export')
    expect(previewC.preview.tombstone_ids).toEqual(['cross-device-matter'])

    deviceB.dispose(); transportB.close(); detachB()
    deviceC.dispose(); transportC.close(); detachC()
  })
})
