import { createCollectionRepository, createEntityId } from '@/core/repository'
import {
  canTransitionMatter,
  MatterDomainError,
  type Matter,
  type MatterCommandMeta,
  type MatterCreateInput,
  type MatterMutation,
  type MatterStatus,
  type MatterUpdatePatch
} from './model'

const matters = createCollectionRepository<Matter>('matters', item => item.calmyId)
const mutations = createCollectionRepository<MatterMutation>('matterMutations')
const commands = createCollectionRepository<{ id: string; result: Matter }>('matterCommands')

function metaOf(meta: MatterCommandMeta = {}): Required<Pick<MatterCommandMeta, 'commandId' | 'actor' | 'sourceIds'>> {
  return {
    commandId: meta.commandId || createEntityId(),
    actor: meta.actor || 'user',
    sourceIds: meta.sourceIds || []
  }
}

function duplicateResult(commandId: string): Matter | undefined {
  return commands.find(commandId)?.result
}

function assertRevision(matter: Matter, expectedRevision?: number): void {
  if (expectedRevision !== undefined && expectedRevision !== matter.revision) {
    throw new MatterDomainError('REVISION_CONFLICT', `Matter ${matter.calmyId} is at revision ${matter.revision}`)
  }
}

function appendMutation(matter: Matter, operation: MatterMutation['operation'], commandId: string, actor: MatterMutation['actor'], sourceIds: string[], fromRevision: number, patch?: unknown): void {
  mutations.create({
    id: createEntityId(), entity: 'matter', entityId: matter.calmyId, operation, commandId, actor, sourceIds,
    fromRevision, toRevision: matter.revision, occurredAt: Date.now(), patch
  })
}

function saveCommand(commandId: string, result: Matter): Matter {
  commands.create({ id: commandId, result })
  return result
}

function assertTitle(title: string): string {
  const value = title.trim()
  if (!value) throw new MatterDomainError('VALIDATION_FAILED', 'Matter title is required')
  return value
}

export const matterRepository = {
  list(): Matter[] {
    return matters.list().slice().sort((a, b) => b.updatedAt - a.updatedAt)
  },
  find(calmyId: string): Matter | undefined { return matters.find(calmyId) },
  importEntity(item: Matter): 'created' | 'unchanged' {
    const current = matters.find(item.calmyId)
    if (current) {
      if (JSON.stringify(current) === JSON.stringify(item)) return 'unchanged'
      throw new MatterDomainError('REVISION_CONFLICT', 'Matter ' + item.calmyId + ' has local changes')
    }
    matters.create(item)
    appendMutation(item, 'create', 'import:' + item.calmyId + ':' + item.revision, 'import', [], 0, item)
    return 'created'
  },
  replaceImported(item: Matter): 'replaced' | 'unchanged' {
    const current = matters.find(item.calmyId)
    if (!current) return this.importEntity(item) === 'created' ? 'replaced' : 'unchanged'
    if (JSON.stringify(current) === JSON.stringify(item)) return 'unchanged'
    if (!matters.update(item.calmyId, () => item)) throw new MatterDomainError('NOT_FOUND', 'Matter import target disappeared')
    appendMutation(item, 'update', 'import-replace:' + item.calmyId + ':' + item.revision, 'import', [], current.revision, item)
    return 'replaced'
  },
  mutations(calmyId?: string): MatterMutation[] {
    return mutations.list().filter(item => !calmyId || item.entityId === calmyId).sort((a, b) => a.occurredAt - b.occurredAt)
  },
  create(input: MatterCreateInput, meta: MatterCommandMeta = {}): Matter {
    const command = metaOf(meta)
    const duplicate = duplicateResult(command.commandId)
    if (duplicate) return duplicate
    const now = Date.now()
    const matter: Matter = {
      calmyId: createEntityId(), title: assertTitle(input.title), why: input.why?.trim() || '',
      primaryContradiction: input.primaryContradiction?.trim() || '', status: 'active',
      currentStage: input.currentStage || 'wood', trajectory: input.trajectory || 'stable', evidenceIds: [],
      createdAt: now, updatedAt: now, revision: 1
    }
    matters.create(matter)
    appendMutation(matter, 'create', command.commandId, command.actor, command.sourceIds, 0, matter)
    return saveCommand(command.commandId, matter)
  },
  update(calmyId: string, patch: MatterUpdatePatch, meta: MatterCommandMeta = {}): Matter {
    const command = metaOf(meta)
    const duplicate = duplicateResult(command.commandId)
    if (duplicate) return duplicate
    const current = matters.find(calmyId)
    if (!current) throw new MatterDomainError('NOT_FOUND', `Matter ${calmyId} not found`)
    assertRevision(current, meta.expectedRevision)
    if (patch.title !== undefined) patch = { ...patch, title: assertTitle(patch.title) }
    const next: Matter = { ...current, ...patch, updatedAt: Date.now(), revision: current.revision + 1 }
    if (!matters.update(calmyId, () => next)) throw new MatterDomainError('NOT_FOUND', `Matter ${calmyId} not found`)
    appendMutation(next, 'update', command.commandId, command.actor, command.sourceIds, current.revision, patch)
    return saveCommand(command.commandId, next)
  },
  bindCycle(calmyId: string, cycleId: string, meta: MatterCommandMeta = {}): Matter {
    return this.update(calmyId, { currentCycleId: cycleId }, meta)
  },
  transition(calmyId: string, status: MatterStatus, meta: MatterCommandMeta = {}): Matter {
    const command = metaOf(meta)
    const duplicate = duplicateResult(command.commandId)
    if (duplicate) return duplicate
    const current = matters.find(calmyId)
    if (!current) throw new MatterDomainError('NOT_FOUND', `Matter ${calmyId} not found`)
    assertRevision(current, meta.expectedRevision)
    if (!canTransitionMatter(current.status, status)) {
      throw new MatterDomainError('INVALID_TRANSITION', `${current.status} → ${status} is not allowed`)
    }
    const next: Matter = { ...current, status, updatedAt: Date.now(), revision: current.revision + 1 }
    if (!matters.update(calmyId, () => next)) throw new MatterDomainError('NOT_FOUND', `Matter ${calmyId} not found`)
    appendMutation(next, 'transition', command.commandId, command.actor, command.sourceIds, current.revision, { status })
    return saveCommand(command.commandId, next)
  },
  pause(calmyId: string, meta?: MatterCommandMeta): Matter { return this.transition(calmyId, 'paused', meta) },
  resume(calmyId: string, meta?: MatterCommandMeta): Matter { return this.transition(calmyId, 'active', meta) },
  archive(calmyId: string, meta?: MatterCommandMeta): Matter { return this.transition(calmyId, 'archived', meta) },
  restore(calmyId: string, meta?: MatterCommandMeta): Matter { return this.transition(calmyId, 'paused', meta) }
}
