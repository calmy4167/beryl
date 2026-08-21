import { hashOpenBytes } from './assets'
import {
  compareOpenEntityFields,
  exportOpenWorkspace,
  hashOpenText,
  importOpenWorkspace,
  mergeOpenEntity,
  openEntityId,
  openEntityType,
  serializeOpenEntity,
  scanOpenAssetReferences,
  OPEN_FORMAT_VERSION,
  OPEN_MANIFEST_PATH,
  type OpenAsset,
  type OpenEntity,
  type OpenEntityType,
  type OpenFieldDecision,
  type OpenTombstone,
  type OpenWorkspace,
  type OpenManifestEntry
} from './open-format'
import { readVaultSnapshot, syncWorkspaceToVault, type VaultAdapter, type VaultImportSnapshot, type VaultSyncResult } from './obsidian-adapter'

export type VaultFieldDecision = 'keep-vault' | 'use-local'
export type VaultEntityDecision = 'keep-vault' | 'use-local' | 'delete-vault' | { mode: 'merge'; fields: Record<string, VaultFieldDecision> }
export type VaultAssetDecision = 'keep-vault' | 'use-local' | 'delete-vault'

export interface VaultEntityConflict {
  calmyId: string
  calmyType: OpenEntityType
  path?: string
  vault: OpenEntity
  local: OpenEntity
  fields: ReturnType<typeof compareOpenEntityFields>
}

export interface VaultOnlyEntity {
  calmyId: string
  calmyType: OpenEntityType
  path: string
  entity: OpenEntity
}

export interface VaultDeletedEntity {
  calmyId: string
  calmyType: OpenEntityType
  path: string
  tombstone: OpenTombstone
  local: OpenEntity
}

export interface VaultAssetConflict {
  path: string
  vaultHash: string
  localHash: string
}

export interface VaultSyncPlan {
  snapshot: VaultImportSnapshot
  localWorkspace: OpenWorkspace
  localEntities: OpenEntity[]
  localAssets: OpenAsset[]
  addedEntities: OpenEntity[]
  unchangedEntities: OpenEntity[]
  conflicts: VaultEntityConflict[]
  vaultOnlyEntities: VaultOnlyEntity[]
  vaultDeletedEntities: VaultDeletedEntity[]
  addedAssets: OpenAsset[]
  unchangedAssets: OpenAsset[]
  assetConflicts: VaultAssetConflict[]
  vaultOnlyAssets: OpenAsset[]
  issues: string[]
}

export interface VaultSyncApplyResult {
  sync?: VaultSyncResult
  missingDecisions: string[]
  appliedEntityIds: string[]
  deletedEntityIds: string[]
  deletedAssetPaths: string[]
  errors: string[]
}

function pathById(snapshot: VaultImportSnapshot): Map<string, string> {
  return new Map((snapshot.manifest?.entities || []).map(entry => [entry.calmy_id, entry.path]))
}

function tombstoneById(snapshot: VaultImportSnapshot): Map<string, OpenTombstone> {
  return new Map((snapshot.tombstones || []).map(tombstone => [tombstone.calmy_id, tombstone]))
}

function assetHash(asset: OpenAsset): string { return hashOpenBytes(asset.data) }

export async function buildVaultSyncPlan(adapter: VaultAdapter, localWorkspace: OpenWorkspace): Promise<VaultSyncPlan> {
  const snapshot = await readVaultSnapshot(adapter)
  const localImport = importOpenWorkspace(localWorkspace.files, localWorkspace.assets)
  const issues = [...snapshot.issues.map(issue => `${issue.path}: ${issue.message}`), ...localImport.issues.map(issue => `${issue.path}: ${issue.message}`)]
  if (snapshot.paths.length && !snapshot.manifest) issues.push('Vault 缺少 _calmy/manifest.json，无法安全保留现有实体路径')
  const localEntities = localImport.entities
  const localAssets = localImport.assets
  const vaultById = new Map(snapshot.entities.map(entity => [openEntityId(entity), entity]))
  const localById = new Map(localEntities.map(entity => [openEntityId(entity), entity]))
  const tombstones = tombstoneById(snapshot)
  const conflicts: VaultEntityConflict[] = []
  const addedEntities: OpenEntity[] = []
  const unchangedEntities: OpenEntity[] = []
  const vaultDeletedEntities: VaultDeletedEntity[] = []
  for (const local of localEntities) {
    const id = openEntityId(local)
    const vault = vaultById.get(id)
    if (vault) {
      if (JSON.stringify(vault) === JSON.stringify(local)) unchangedEntities.push(local)
      else conflicts.push({ calmyId: id, calmyType: openEntityType(local), path: pathById(snapshot).get(id), vault, local, fields: compareOpenEntityFields(vault, local) })
      continue
    }
    const tombstone = tombstones.get(id)
    if (tombstone) vaultDeletedEntities.push({ calmyId: id, calmyType: openEntityType(local), path: tombstone.path, tombstone, local })
    else addedEntities.push(local)
  }
  const vaultOnlyEntities = snapshot.entities
    .filter(entity => !localById.has(openEntityId(entity)))
    .map(entity => ({ calmyId: openEntityId(entity), calmyType: openEntityType(entity), path: pathById(snapshot).get(openEntityId(entity)) || '', entity }))
  const vaultByAssetPath = new Map(snapshot.assets.map(asset => [asset.path, asset]))
  const localByAssetPath = new Map(localAssets.map(asset => [asset.path, asset]))
  const assetConflicts: VaultAssetConflict[] = []
  const addedAssets: OpenAsset[] = []
  const unchangedAssets: OpenAsset[] = []
  for (const local of localAssets) {
    const vault = vaultByAssetPath.get(local.path)
    if (!vault) addedAssets.push(local)
    else if (assetHash(vault) === assetHash(local) && vault.mimeType === local.mimeType) unchangedAssets.push(local)
    else assetConflicts.push({ path: local.path, vaultHash: assetHash(vault), localHash: assetHash(local) })
  }
  const vaultOnlyAssets = snapshot.assets.filter(asset => !localByAssetPath.has(asset.path))
  return {
    snapshot, localWorkspace, localEntities, localAssets, addedEntities, unchangedEntities, conflicts,
    vaultOnlyEntities, vaultDeletedEntities, addedAssets, unchangedAssets, assetConflicts, vaultOnlyAssets, issues
  }
}

function generatedPathForEntity(entity: OpenEntity): string {
  const workspace = 'entityType' in entity
    ? exportOpenWorkspace({ unified: [entity] })
    : 'currentStage' in entity
      ? exportOpenWorkspace({ matters: [entity] })
      : 'occurredAt' in entity
        ? exportOpenWorkspace({ records: [entity] })
        : 'title' in entity
          ? exportOpenWorkspace({ actions: [entity] })
          : exportOpenWorkspace({ dailies: [entity] })
  return Object.keys(workspace.files).find(path => path.toLowerCase().endsWith('.md')) as string
}

function entityTombstone(entity: OpenEntity, path: string, revision: number): OpenTombstone {
  return { calmy_id: openEntityId(entity), calmy_type: openEntityType(entity), path, revision, deleted_at: new Date().toISOString() }
}

function mergeVaultEntity(vault: OpenEntity, local: OpenEntity, fields: Record<string, VaultFieldDecision>): OpenEntity {
  const decisions: Record<string, OpenFieldDecision> = Object.fromEntries(Object.entries(fields).map(([key, decision]) => [key, decision === 'use-local' ? 'use-incoming' : 'keep-local']))
  return mergeOpenEntity(vault, local, decisions)
}

function stableWorkspace(entities: OpenEntity[], assets: OpenAsset[], pathsById: Map<string, string>, tombstones: OpenTombstone[]): OpenWorkspace {
  const files: Record<string, string> = {}
  const manifestEntries: OpenManifestEntry[] = []
  for (const entity of entities) {
    const content = serializeOpenEntity(entity)
    const path = pathsById.get(openEntityId(entity)) || generatedPathForEntity(entity)
    if (files[path]) throw new Error('duplicate-vault-path:' + path)
    files[path] = content
    manifestEntries.push({ calmy_id: openEntityId(entity), calmy_type: openEntityType(entity), path, revision: entity.revision, hash: hashOpenText(content) })
  }
  manifestEntries.sort((a, b) => a.path.localeCompare(b.path))
  const manifest = {
    format: 'calmy-open' as const,
    format_version: OPEN_FORMAT_VERSION,
    generated_at: new Date().toISOString(),
    entities: manifestEntries,
    assets: assets.map(asset => ({ path: asset.path, hash: assetHash(asset), size: asset.data.byteLength, mime_type: asset.mimeType })).sort((a, b) => a.path.localeCompare(b.path)),
    asset_references: scanOpenAssetReferences(files),
    ...(tombstones.length ? { tombstones: [...new Map(tombstones.map(tombstone => [tombstone.calmy_id, tombstone])).values()].sort((a, b) => a.path.localeCompare(b.path)) } : {})
  }
  files[OPEN_MANIFEST_PATH] = JSON.stringify(manifest, null, 2) + '\n'
  return { files, assets, manifest }
}

export async function applyVaultSyncPlan(adapter: VaultAdapter, plan: VaultSyncPlan, decisions: Record<string, VaultEntityDecision | VaultAssetDecision>): Promise<VaultSyncApplyResult> {
  if (plan.issues.length) return { missingDecisions: [], appliedEntityIds: [], deletedEntityIds: [], deletedAssetPaths: [], errors: plan.issues }
  const required = [
    ...plan.conflicts.map(conflict => conflict.calmyId),
    ...plan.vaultOnlyEntities.map(entity => entity.calmyId),
    ...plan.vaultDeletedEntities.map(entity => entity.calmyId),
    ...plan.assetConflicts.map(conflict => `asset:${conflict.path}`),
    ...plan.vaultOnlyAssets.map(asset => `asset:${asset.path}`)
  ]
  const missingDecisions = required.filter(key => decisions[key] === undefined)
  if (missingDecisions.length) return { missingDecisions, appliedEntityIds: [], deletedEntityIds: [], deletedAssetPaths: [], errors: [] }
  const vaultById = new Map(plan.snapshot.entities.map(entity => [openEntityId(entity), entity]))
  const pathsById = pathById(plan.snapshot)
  const tombstones = [...(plan.snapshot.tombstones || [])]
  const entities: OpenEntity[] = []
  const deletedEntityIds: string[] = []
  for (const local of plan.localEntities) {
    const id = openEntityId(local)
    const vault = vaultById.get(id)
    const decision = decisions[id] as VaultEntityDecision | undefined
    if (!vault) {
      if (plan.vaultDeletedEntities.some(entity => entity.calmyId === id) && decision === 'keep-vault') continue
      entities.push(local)
      continue
    }
    if (!decision) { entities.push(local); continue }
    if (decision === 'keep-vault') entities.push(vault)
    else if (decision === 'use-local') entities.push(local)
    else if (decision === 'delete-vault') {
      deletedEntityIds.push(id)
      tombstones.push(entityTombstone(local, pathsById.get(id) || generatedPathForEntity(local), Math.max(vault.revision, local.revision) + 1))
    } else entities.push(mergeVaultEntity(vault, local, decision.fields))
  }
  for (const vaultOnly of plan.vaultOnlyEntities) {
    const decision = decisions[vaultOnly.calmyId] as VaultEntityDecision
    if (decision === 'keep-vault') entities.push(vaultOnly.entity)
    else {
      deletedEntityIds.push(vaultOnly.calmyId)
      tombstones.push(entityTombstone(vaultOnly.entity, vaultOnly.path, vaultOnly.entity.revision + 1))
    }
  }
  const assetsByPath = new Map<string, OpenAsset>()
  const vaultAssets = new Map(plan.snapshot.assets.map(asset => [asset.path, asset]))
  const localAssets = new Map(plan.localAssets.map(asset => [asset.path, asset]))
  const deletedAssetPaths: string[] = []
  for (const [path, local] of localAssets) {
    const vault = vaultAssets.get(path)
    const decision = decisions[`asset:${path}`] as VaultAssetDecision | undefined
    if (!vault || !decision || decision === 'use-local') assetsByPath.set(path, local)
    else if (decision === 'keep-vault') assetsByPath.set(path, vault)
    else deletedAssetPaths.push(path)
  }
  for (const [path, vault] of vaultAssets) {
    if (localAssets.has(path)) continue
    const decision = decisions[`asset:${path}`] as VaultAssetDecision
    if (decision === 'keep-vault') assetsByPath.set(path, vault)
    else deletedAssetPaths.push(path)
  }
  const retainedTombstones = tombstones.filter(tombstone => !entities.some(entity => openEntityId(entity) === tombstone.calmy_id))
  const workspace = stableWorkspace(entities, [...assetsByPath.values()], pathsById, retainedTombstones)
  const deletedPaths = [...retainedTombstones.map(tombstone => tombstone.path), ...deletedAssetPaths].filter(path => plan.snapshot.paths.includes(path))
  const sync = await syncWorkspaceToVault(adapter, workspace, deletedPaths)
  return { sync, missingDecisions: [], appliedEntityIds: entities.map(openEntityId), deletedEntityIds, deletedAssetPaths, errors: sync.errors }
}
