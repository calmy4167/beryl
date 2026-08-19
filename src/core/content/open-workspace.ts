import { actionRepository } from '@/domain/action/repository'
import { matterRepository } from '@/domain/matter/repository'
import { recordRepository } from '@/domain/record/repository'
import { todayRepository } from '@/domain/today/repository'
import { CORE_ENTITY_TYPES, type CoreEntity, unifiedRepository } from '@/domain/unified'
import { assetRepository } from './assets'
import type { OpenAsset, OpenEntity, OpenWorkspace, OpenWorkspaceInput, OpenFieldDecision } from './open-format'
import { exportOpenWorkspace, isUnifiedOpenEntity, mergeOpenEntity, openEntityId, scanOpenAssetReferences } from './open-format'

export interface OpenApplyResult {
  created: number
  unchanged: number
  replaced: number
  merged: number
  keptLocal: number
  conflicts: string[]
  errors: string[]
}

export interface OpenAssetApplyResult {
  created: number
  unchanged: number
  conflicts: string[]
}

export type OpenConflictDecision = 'keep-local' | 'use-incoming' | { mode: 'merge'; fields: Record<string, OpenFieldDecision> }

export function currentOpenEntities(): OpenEntity[] {
  return [
    ...matterRepository.list(),
    ...actionRepository.list(),
    ...recordRepository.list(),
    ...todayRepository.list(),
    ...CORE_ENTITY_TYPES.flatMap(type => unifiedRepository.list(type as CoreEntity['entityType']))
  ]
}

export function currentOpenAssets(): OpenAsset[] { return assetRepository.list() }

export function currentOpenOrphanAssets(): OpenAsset[] {
  const referenced = new Set(scanOpenAssetReferences(exportCurrentOpenWorkspace().files).map(reference => reference.asset_path))
  return currentOpenAssets().filter(asset => !referenced.has(asset.path))
}

export function removeOpenAssets(paths: string[]): number {
  return paths.filter(path => assetRepository.removeAsset(path)).length
}

function replaceOpenEntity(entity: OpenEntity): 'replaced' | 'unchanged' {
  if (isUnifiedOpenEntity(entity)) {
    const outcome = unifiedRepository.replaceImported(entity)
    return outcome === 'created' ? 'replaced' : outcome
  }
  return 'currentStage' in entity
    ? matterRepository.replaceImported(entity)
    : 'occurredAt' in entity
      ? recordRepository.replaceImported(entity)
      : 'title' in entity
        ? actionRepository.replaceImported(entity)
        : todayRepository.replaceImported(entity)
}

export function exportCurrentOpenWorkspace(): OpenWorkspace {
  const input: OpenWorkspaceInput = {
    matters: matterRepository.list(),
    actions: actionRepository.list(),
    records: recordRepository.list(),
    dailies: todayRepository.list(),
    unified: CORE_ENTITY_TYPES.flatMap(type => unifiedRepository.list(type as CoreEntity['entityType'])),
    assets: currentOpenAssets()
  }
  return exportOpenWorkspace(input)
}

export function applyOpenAssets(assets: OpenAsset[]): OpenAssetApplyResult {
  const result: OpenAssetApplyResult = { created: 0, unchanged: 0, conflicts: [] }
  for (const asset of assets) {
    const outcome = assetRepository.importAsset(asset)
    if (outcome === 'created') result.created++
    else if (outcome === 'unchanged') result.unchanged++
    else result.conflicts.push(asset.path)
  }
  return result
}

export function applyOpenEntities(entities: OpenEntity[], decisions: Record<string, OpenConflictDecision> = {}): OpenApplyResult {
  const result: OpenApplyResult = { created: 0, unchanged: 0, replaced: 0, merged: 0, keptLocal: 0, conflicts: [], errors: [] }
  for (const entity of entities) {
    try {
      const id = openEntityId(entity)
      const decision = decisions[id]
      if (decision === 'keep-local') {
        result.keptLocal++
        continue
      }
      if (decision === 'use-incoming') {
        const outcome = replaceOpenEntity(entity)
        if (outcome === 'replaced') result.replaced++
        else result.unchanged++
        continue
      }
      if (typeof decision === 'object' && decision.mode === 'merge') {
        const local = currentOpenEntities().find(item => openEntityId(item) === id)
        if (!local) {
          result.errors.push('Merge target disappeared: ' + id)
          continue
        }
        const outcome = replaceOpenEntity(mergeOpenEntity(local, entity, decision.fields))
        if (outcome === 'replaced') result.merged++
        else result.unchanged++
        continue
      }
      const outcome = isUnifiedOpenEntity(entity)
        ? unifiedRepository.importEntity(entity)
        : 'currentStage' in entity
        ? matterRepository.importEntity(entity)
        : 'occurredAt' in entity
          ? recordRepository.importEntity(entity)
          : 'title' in entity
            ? actionRepository.importEntity(entity)
            : todayRepository.importEntity(entity)
      if (outcome === 'created') result.created++
      else result.unchanged++
    } catch (error) {
      const message = error instanceof Error ? error.message : 'import-failed'
      if (message.includes('local changes')) result.conflicts.push(message)
      else result.errors.push(message)
    }
  }
  return result
}
