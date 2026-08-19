import { actionRepository } from '@/domain/action/repository'
import { matterRepository } from '@/domain/matter/repository'
import { recordRepository } from '@/domain/record/repository'
import { todayRepository } from '@/domain/today/repository'
import type { OpenEntity, OpenWorkspace, OpenWorkspaceInput } from './open-format'
import { exportOpenWorkspace } from './open-format'

export interface OpenApplyResult {
  created: number
  unchanged: number
  conflicts: string[]
  errors: string[]
}

export function exportCurrentOpenWorkspace(): OpenWorkspace {
  const input: OpenWorkspaceInput = {
    matters: matterRepository.list(),
    actions: actionRepository.list(),
    records: recordRepository.list(),
    dailies: todayRepository.list()
  }
  return exportOpenWorkspace(input)
}

export function applyOpenEntities(entities: OpenEntity[]): OpenApplyResult {
  const result: OpenApplyResult = { created: 0, unchanged: 0, conflicts: [], errors: [] }
  for (const entity of entities) {
    try {
      const outcome = 'currentStage' in entity
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
