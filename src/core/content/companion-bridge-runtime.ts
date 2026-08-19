import type { Matter } from '@/domain/matter/model'
import type { ActionItem } from '@/domain/action/model'
import type { RealityRecord } from '@/domain/record/model'
import type { TodayPlan } from '@/domain/today/model'
import type { OpenAsset, OpenEntity, OpenImportResult, OpenTombstone, OpenWorkspace } from './open-format'
import {
  compareOpenAssets,
  compareOpenEntities,
  compareOpenEntityFields,
  exportOpenWorkspace,
  hashOpenText,
  importOpenWorkspace,
  isUnifiedOpenEntity,
  mergeOpenEntity,
  openEntityId,
  openEntityType,
  scanOpenAssetReferences,
  serializeOpenEntity,
  OPEN_FORMAT_VERSION,
  OPEN_MANIFEST_PATH
} from './open-format'
import {
  type BridgeClient,
  type BridgeConflictPreview,
  type BridgeDecision,
  type BridgeErrorMessage,
  type BridgeWorkspaceExportMessage,
  type BridgeWorkspaceImportApplyMessage,
  type BridgeWorkspaceImportPreviewMessage,
  type BridgeWorkspacePayload,
  type CompanionMessage,
  CompanionBridgeMessageError,
  createBridgeHello,
  createBridgeMessageId,
  parseCompanionMessage
} from './companion-bridge'
import { readVaultSnapshot, syncWorkspaceToVault, type VaultAdapter } from './obsidian-adapter'
import { hashOpenBytes } from './assets'

export interface BridgeApplySummary {
  written_paths: string[]
  unchanged_paths: string[]
  deleted_paths: string[]
  orphan_asset_paths: string[]
}

function encodeBase64(data: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    binary += String.fromCharCode(...data.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const data = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) data[index] = binary.charCodeAt(index)
  return data
}

export function encodeBridgeWorkspace(workspace: OpenWorkspace): BridgeWorkspacePayload {
  return {
    files: { ...workspace.files },
    assets: workspace.assets.map(asset => ({
      path: asset.path,
      mime_type: asset.mimeType,
      data_base64: encodeBase64(asset.data)
    }))
  }
}

function importBridgeWorkspace(payload: BridgeWorkspacePayload): OpenImportResult {
  const assets: OpenAsset[] = payload.assets.map(asset => ({
    path: asset.path,
    mimeType: asset.mime_type,
    data: decodeBase64(asset.data_base64)
  }))
  return importOpenWorkspace(payload.files, assets)
}

export function decodeBridgeWorkspace(payload: BridgeWorkspacePayload): OpenWorkspace {
  const imported = importBridgeWorkspace(payload)
  if (imported.issues.length || imported.conflicts.length || !imported.manifest) {
    const reasons: string[] = [...imported.issues.map(issue => issue.code), ...imported.conflicts.map(conflict => conflict.reason)]
    if (!imported.manifest) reasons.push('manifest-missing')
    throw new Error('bridge-workspace-invalid:' + reasons.join(','))
  }
  return { files: { ...payload.files }, assets: imported.assets, manifest: imported.manifest }
}

function exportMessage(requestId: string, workspace: OpenWorkspace): BridgeWorkspaceExportMessage {
  return {
    bridge_version: 1,
    message_id: createBridgeMessageId(),
    kind: 'workspace_export',
    request_id: requestId,
    manifest_hash: hashOpenText(workspace.files[OPEN_MANIFEST_PATH] || ''),
    workspace: encodeBridgeWorkspace(workspace)
  }
}

export function buildWorkspaceImportPreview(
  requestId: string,
  localWorkspace: OpenWorkspace,
  incomingPayload: BridgeWorkspacePayload
): BridgeWorkspaceImportPreviewMessage {
  const imported = importBridgeWorkspace(incomingPayload)
  const entityComparison = compareOpenEntities(
    importBridgeWorkspace(encodeBridgeWorkspace(localWorkspace)).entities,
    imported.entities
  )
  const assetComparison = compareOpenAssets(localWorkspace.assets, imported.assets)
  const conflictPreviews: BridgeConflictPreview[] = entityComparison.conflicts.map(conflict => ({
    calmy_id: conflict.calmyId,
    calmy_type: conflict.calmyType,
    local_revision: conflict.localRevision,
    incoming_revision: conflict.incomingRevision,
    fields: compareOpenEntityFields(conflict.local, conflict.incoming).map(field => ({ key: field.key, local_value: field.localValue, incoming_value: field.incomingValue }))
  }))
  return {
    bridge_version: 1,
    message_id: createBridgeMessageId(),
    kind: 'workspace_import_preview',
    request_id: requestId,
    added_ids: entityComparison.added.map(openEntityId),
    unchanged_ids: entityComparison.unchanged.map(openEntityId),
    conflict_ids: entityComparison.conflicts.map(conflict => conflict.calmyId),
    asset_conflict_paths: assetComparison.conflicts.map(conflict => conflict.path),
    missing_asset_paths: imported.missingAssetReferences.map(reference => reference.asset_path),
    orphan_asset_paths: imported.orphanAssets.map(asset => asset.path),
    issues: imported.issues.map(issue => ({ path: issue.path, code: issue.code, message: issue.message })),
    conflict_previews: conflictPreviews,
    tombstone_ids: imported.tombstones.map(tombstone => tombstone.calmy_id)
  }
}

function errorMessage(code: string, message: string, requestId?: string): BridgeErrorMessage {
  return {
    bridge_version: 1,
    message_id: createBridgeMessageId(),
    kind: 'error',
    ...(requestId ? { request_id: requestId } : {}),
    code,
    message
  }
}

function generatedPathForEntity(entity: OpenEntity): string {
  const type = openEntityType(entity)
  if (isUnifiedOpenEntity(entity)) {
    const generated = exportOpenWorkspace({ unified: [entity] })
    return Object.keys(generated.files).find(path => path.toLowerCase().endsWith('.md')) as string
  }
  const generated = type === 'matter'
    ? exportOpenWorkspace({ matters: [entity as Matter] })
    : type === 'action'
      ? exportOpenWorkspace({ actions: [entity as ActionItem] })
      : type === 'record'
        ? exportOpenWorkspace({ records: [entity as RealityRecord] })
        : exportOpenWorkspace({ dailies: [entity as TodayPlan] })
  return Object.keys(generated.files).find(path => path.toLowerCase().endsWith('.md')) as string
}

function entitiesToStableWorkspace(
  entities: OpenEntity[],
  assets: OpenAsset[],
  pathsById: Map<string, string>,
  tombstones: OpenTombstone[] = []
): OpenWorkspace {
  const files: Record<string, string> = {}
  const manifestEntries = [] as Array<{ calmy_id: string; calmy_type: ReturnType<typeof openEntityType>; path: string; revision: number; hash: string }>
  for (const entity of entities) {
    const content = serializeOpenEntity(entity)
    const path = pathsById.get(openEntityId(entity)) || generatedPathForEntity(entity)
    files[path] = content
    manifestEntries.push({ calmy_id: openEntityId(entity), calmy_type: openEntityType(entity), path, revision: entity.revision, hash: hashOpenText(content) })
  }
  const manifestAssets = assets.map(asset => ({ path: asset.path, hash: hashOpenBytes(asset.data), size: asset.data.byteLength, mime_type: asset.mimeType }))
  manifestEntries.sort((a, b) => a.path.localeCompare(b.path))
  manifestAssets.sort((a, b) => a.path.localeCompare(b.path))
  const manifest: OpenWorkspace['manifest'] = {
    format: 'calmy-open' as const,
    format_version: OPEN_FORMAT_VERSION,
    generated_at: new Date().toISOString(),
    entities: manifestEntries,
    assets: manifestAssets,
    asset_references: scanOpenAssetReferences(files)
  }
  if (tombstones.length) {
    manifest.tombstones = [...new Map(tombstones.map(tombstone => [tombstone.calmy_id, tombstone])).values()]
      .sort((a, b) => a.path.localeCompare(b.path))
  }
  files[OPEN_MANIFEST_PATH] = JSON.stringify(manifest, null, 2) + '\n'
  return { files, assets, manifest }
}

function resolveIncomingEntities(
  localEntities: OpenEntity[],
  incomingEntities: OpenEntity[],
  decisions: Record<string, BridgeDecision>,
  incomingTombstones: OpenTombstone[] = []
): { entities?: OpenEntity[]; missingDecisions: string[]; appliedTombstones: OpenTombstone[] } {
  const localById = new Map(localEntities.map(entity => [openEntityId(entity), entity]))
  const incomingById = new Map(incomingEntities.map(entity => [openEntityId(entity), entity]))
  const comparison = compareOpenEntities(localEntities, incomingEntities)
  const requiredTombstoneDecisions = incomingTombstones
    .filter(tombstone => localById.has(tombstone.calmy_id))
    .map(tombstone => tombstone.calmy_id)
  const missingDecisions = [...new Set([
    ...comparison.conflicts.map(conflict => conflict.calmyId),
    ...requiredTombstoneDecisions
  ])].filter(id => decisions[id] === undefined)
  if (missingDecisions.length) return { missingDecisions, appliedTombstones: [] }

  const appliedTombstones = incomingTombstones.filter(tombstone => !localById.has(tombstone.calmy_id) || decisions[tombstone.calmy_id] === 'use-incoming')
  const entities = localEntities.flatMap(local => {
    const id = openEntityId(local)
    const tombstone = incomingTombstones.find(item => item.calmy_id === id)
    if (tombstone && decisions[id] === 'use-incoming') return []
    const incoming = incomingById.get(id)
    if (!incoming) return [local]
    if (JSON.stringify(local) === JSON.stringify(incoming)) return [local]
    const decision = decisions[id]
    if (decision === 'keep-local') return [local]
    if (decision === 'use-incoming') return [incoming]
    if (typeof decision === 'object' && decision.mode === 'merge') return [mergeOpenEntity(local, incoming, decision.fields)]
    return [local]
  })
  for (const incoming of incomingEntities) {
    if (!localById.has(openEntityId(incoming))) entities.push(incoming)
  }
  return { entities, missingDecisions: [], appliedTombstones }
}

export async function applyWorkspaceImportToVault(
  adapter: VaultAdapter,
  message: BridgeWorkspaceImportApplyMessage
): Promise<CompanionMessage> {
  const local = await readVaultSnapshot(adapter)
  if (local.issues.length || !local.manifest) {
    return errorMessage('local-vault-invalid', '当前 Vault 无法作为写回基线：' + (local.issues[0]?.message || 'manifest-missing'), message.request_id)
  }
  let incoming: OpenWorkspace
  try {
    incoming = decodeBridgeWorkspace(message.workspace)
  } catch (error) {
    return errorMessage('incoming-workspace-invalid', error instanceof Error ? error.message : 'incoming-workspace-invalid', message.request_id)
  }
  const imported = importBridgeWorkspace(message.workspace)
  const assetComparison = compareOpenAssets(local.assets, imported.assets)
  if (assetComparison.conflicts.length || imported.issues.length || imported.missingAssetReferences.length) {
    const issue = imported.issues[0]?.message || imported.missingAssetReferences[0]?.asset_path || assetComparison.conflicts[0]?.path || 'asset-conflict'
    return errorMessage('workspace-import-blocked', '导入被阻断：' + issue, message.request_id)
  }
  const resolved = resolveIncomingEntities(local.entities, imported.entities, message.decisions, imported.tombstones)
  if (!resolved.entities) {
    return errorMessage('conflict-decision-required', '以下冲突尚未决策：' + resolved.missingDecisions.join(', '), message.request_id)
  }
  const assetsByPath = new Map(local.assets.map(asset => [asset.path, asset]))
  for (const asset of incoming.assets) assetsByPath.set(asset.path, asset)
  const pathsById = new Map(local.manifest.entities.map(entry => [entry.calmy_id, entry.path]))
  for (const entry of incoming.manifest.entities) if (!pathsById.has(entry.calmy_id)) pathsById.set(entry.calmy_id, entry.path)
  const workspace = entitiesToStableWorkspace(resolved.entities, [...assetsByPath.values()], pathsById, resolved.appliedTombstones)
  const localPaths = new Set(local.paths)
  const deletePaths = resolved.appliedTombstones.map(tombstone => tombstone.path).filter(path => localPaths.has(path))
  const sync = await syncWorkspaceToVault(adapter, workspace, deletePaths)
  if (sync.errors.length) return errorMessage('vault-write-failed', sync.errors.join('; '), message.request_id)
  return {
    bridge_version: 1,
    message_id: createBridgeMessageId(),
    kind: 'ack',
    request_id: message.request_id,
    message: JSON.stringify({
      written_paths: sync.writtenPaths,
      unchanged_paths: sync.unchangedPaths,
      deleted_paths: sync.deletedPaths,
      orphan_asset_paths: imported.orphanAssets.map(asset => asset.path)
    } satisfies BridgeApplySummary)
  }
}

export class CompanionBridgeSession {
  private readonly responses = new Map<string, CompanionMessage>()

  constructor(private readonly adapter: VaultAdapter, private readonly client: BridgeClient = 'obsidian-plugin') {}

  async handle(input: unknown): Promise<CompanionMessage> {
    let message: CompanionMessage
    try {
      message = parseCompanionMessage(input)
    } catch (error) {
      const requestId = typeof input === 'object' && input !== null && 'request_id' in input && typeof input.request_id === 'string' ? input.request_id : undefined
      return errorMessage(error instanceof CompanionBridgeMessageError ? error.code : 'bridge-message-invalid', error instanceof Error ? error.message : 'bridge-message-invalid', requestId)
    }
    const previous = this.responses.get(message.message_id)
    if (previous) return previous
    let response: CompanionMessage
    if (message.kind === 'hello') {
      response = createBridgeHello(this.client, ['workspace-export', 'workspace-import-preview', 'workspace-import-apply'])
    } else if (message.kind === 'workspace_export_request') {
      try {
        const snapshot = await readVaultSnapshot(this.adapter)
        if (snapshot.issues.length || !snapshot.manifest) throw new Error(snapshot.issues[0]?.message || 'vault-manifest-missing')
        response = exportMessage(message.request_id, { files: snapshot.files, assets: snapshot.assets, manifest: snapshot.manifest })
      } catch (error) {
        response = errorMessage('vault-export-failed', error instanceof Error ? error.message : 'vault-export-failed', message.request_id)
      }
    } else if (message.kind === 'workspace_import_apply') {
      response = await applyWorkspaceImportToVault(this.adapter, message)
    } else {
      response = errorMessage('bridge-message-not-handled', '当前端点不处理：' + message.kind, 'request_id' in message ? message.request_id : undefined)
    }
    this.responses.set(message.message_id, response)
    if (this.responses.size > 100) this.responses.delete(this.responses.keys().next().value as string)
    return response
  }
}
