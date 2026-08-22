import { createAsyncCollectionRepository, createCollectionRepository, createEntityId } from '@/core/repository'
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
const asyncMatters = createAsyncCollectionRepository<Matter>('matters', item => item.calmyId)
const mutations = createCollectionRepository<MatterMutation>('matterMutations')
const commands = createCollectionRepository<{ id: string; result: Matter }>('matterCommands')
const asyncMutations = createAsyncCollectionRepository<MatterMutation>('matterMutations')
const asyncCommands = createAsyncCollectionRepository<{ id: string; result: Matter }>('matterCommands')

function metaOf(meta: MatterCommandMeta = {}): Required<Pick<MatterCommandMeta, 'commandId' | 'actor' | 'sourceIds'>> & { actorId: string } {
  return {
    commandId: meta.commandId || createEntityId(),
    actor: meta.actor || 'user',
    actorId: meta.actorId || 'local-user',
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

function appendMutation(matter: Matter, operation: MatterMutation['operation'], commandId: string, actor: MatterMutation['actor'], actorId: string, sourceIds: string[], fromRevision: number, patch?: unknown): void {
  mutations.create({
    id: createEntityId(), entity: 'matter', entityId: matter.calmyId, operation, commandId, actor, sourceIds,
    actorId, fromRevision, toRevision: matter.revision, occurredAt: Date.now(), patch
  })
}

function saveCommand(commandId: string, result: Matter): Matter {
  commands.create({ id: commandId, result })
  return result
}

async function duplicateResultAsync(commandId: string): Promise<Matter | undefined> {
  return (await asyncCommands.find(commandId))?.result
}

async function appendMutationAsync(matter: Matter, operation: MatterMutation['operation'], commandId: string, actor: MatterMutation['actor'], actorId: string, sourceIds: string[], fromRevision: number, patch?: unknown): Promise<void> {
  await asyncMutations.create({
    id: createEntityId(), entity: 'matter', entityId: matter.calmyId, operation, commandId, actor, sourceIds,
    actorId, fromRevision, toRevision: matter.revision, occurredAt: Date.now(), patch
  })
}

async function saveCommandAsync(commandId: string, result: Matter): Promise<Matter> {
  await asyncCommands.create({ id: commandId, result })
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
    appendMutation(item, 'create', 'import:' + item.calmyId + ':' + item.revision, 'import', 'import', [], 0, item)
    return 'created'
  },
  replaceImported(item: Matter): 'replaced' | 'unchanged' {
    const current = matters.find(item.calmyId)
    if (!current) return this.importEntity(item) === 'created' ? 'replaced' : 'unchanged'
    if (JSON.stringify(current) === JSON.stringify(item)) return 'unchanged'
    if (!matters.update(item.calmyId, () => item)) throw new MatterDomainError('NOT_FOUND', 'Matter import target disappeared')
    appendMutation(item, 'update', 'import-replace:' + item.calmyId + ':' + item.revision, 'import', 'import', [], current.revision, item)
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
    appendMutation(matter, 'create', command.commandId, command.actor, command.actorId, command.sourceIds, 0, matter)
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
    appendMutation(next, 'update', command.commandId, command.actor, command.actorId, command.sourceIds, current.revision, patch)
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
    appendMutation(next, 'transition', command.commandId, command.actor, command.actorId, command.sourceIds, current.revision, { status })
    return saveCommand(command.commandId, next)
  },
  pause(calmyId: string, meta?: MatterCommandMeta): Matter { return this.transition(calmyId, 'paused', meta) },
  resume(calmyId: string, meta?: MatterCommandMeta): Matter { return this.transition(calmyId, 'active', meta) },
  archive(calmyId: string, meta?: MatterCommandMeta): Matter { return this.transition(calmyId, 'archived', meta) },
  restore(calmyId: string, meta?: MatterCommandMeta): Matter { return this.transition(calmyId, 'paused', meta) }
}

function sameMatter(left: Matter, right: Matter): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

async function asyncUpdateMatter(calmyId: string, patch: MatterUpdatePatch, meta: MatterCommandMeta = {}): Promise<Matter> {
  const command = metaOf(meta)
  const duplicate = await duplicateResultAsync(command.commandId)
  if (duplicate) return duplicate
  const current = await asyncMatters.find(calmyId)
  if (!current) throw new MatterDomainError('NOT_FOUND', `Matter ${calmyId} not found`)
  assertRevision(current, meta.expectedRevision)
  if (patch.title !== undefined) patch = { ...patch, title: assertTitle(patch.title) }
  const next: Matter = { ...current, ...patch, updatedAt: Date.now(), revision: current.revision + 1 }
  if (!await asyncMatters.update(calmyId, () => next)) throw new MatterDomainError('NOT_FOUND', `Matter ${calmyId} not found`)
  await appendMutationAsync(next, 'update', command.commandId, command.actor, command.actorId, command.sourceIds, current.revision, patch)
  return saveCommandAsync(command.commandId, next)
}

async function asyncTransitionMatter(calmyId: string, status: MatterStatus, meta: MatterCommandMeta = {}): Promise<Matter> {
  const command = metaOf(meta)
  const duplicate = await duplicateResultAsync(command.commandId)
  if (duplicate) return duplicate
  const current = await asyncMatters.find(calmyId)
  if (!current) throw new MatterDomainError('NOT_FOUND', `Matter ${calmyId} not found`)
  assertRevision(current, meta.expectedRevision)
  if (!canTransitionMatter(current.status, status)) {
    throw new MatterDomainError('INVALID_TRANSITION', `${current.status} → ${status} is not allowed`)
  }
  const next: Matter = { ...current, status, updatedAt: Date.now(), revision: current.revision + 1 }
  if (!await asyncMatters.update(calmyId, () => next)) throw new MatterDomainError('NOT_FOUND', `Matter ${calmyId} not found`)
  await appendMutationAsync(next, 'transition', command.commandId, command.actor, command.actorId, command.sourceIds, current.revision, { status })
  return saveCommandAsync(command.commandId, next)
}

export const matterAsyncRepository = {
  async list(): Promise<Matter[]> {
    return (await asyncMatters.list()).slice().sort((a, b) => b.updatedAt - a.updatedAt)
  },
  async find(calmyId: string): Promise<Matter | undefined> {
    return asyncMatters.find(calmyId)
  },
  async remove(calmyId: string): Promise<boolean> {
    return asyncMatters.remove(calmyId)
  },
  async create(input: MatterCreateInput, meta: MatterCommandMeta = {}): Promise<Matter> {
    const command = metaOf(meta)
    const duplicate = await duplicateResultAsync(command.commandId)
    if (duplicate) return duplicate
    const now = Date.now()
    const matter: Matter = {
      calmyId: createEntityId(), title: assertTitle(input.title), why: input.why?.trim() || '',
      primaryContradiction: input.primaryContradiction?.trim() || '', status: 'active',
      currentStage: input.currentStage || 'wood', trajectory: input.trajectory || 'stable', evidenceIds: [],
      createdAt: now, updatedAt: now, revision: 1
    }
    await asyncMatters.create(matter)
    await appendMutationAsync(matter, 'create', command.commandId, command.actor, command.actorId, command.sourceIds, 0, matter)
    return saveCommandAsync(command.commandId, matter)
  },
  update(calmyId: string, patch: MatterUpdatePatch, meta: MatterCommandMeta = {}): Promise<Matter> {
    return asyncUpdateMatter(calmyId, patch, meta)
  },
  async importEntity(item: Matter): Promise<'created' | 'unchanged'> {
    const current = await asyncMatters.find(item.calmyId)
    if (current) {
      if (sameMatter(current, item)) return 'unchanged'
      throw new MatterDomainError('REVISION_CONFLICT', 'Matter ' + item.calmyId + ' has local changes')
    }
    await asyncMatters.create(item)
    await appendMutationAsync(item, 'create', 'import:' + item.calmyId + ':' + item.revision, 'import', 'import', [], 0, item)
    return 'created'
  },
  async replaceImported(item: Matter): Promise<'replaced' | 'unchanged'> {
    const current = await asyncMatters.find(item.calmyId)
    if (!current) return (await this.importEntity(item)) === 'created' ? 'replaced' : 'unchanged'
    if (sameMatter(current, item)) return 'unchanged'
    if (!await asyncMatters.update(item.calmyId, () => item)) throw new MatterDomainError('NOT_FOUND', 'Matter import target disappeared')
    await appendMutationAsync(item, 'update', 'import-replace:' + item.calmyId + ':' + item.revision, 'import', 'import', [], current.revision, item)
    return 'replaced'
  },
  bindCycle(calmyId: string, cycleId: string, meta: MatterCommandMeta = {}): Promise<Matter> {
    return asyncUpdateMatter(calmyId, { currentCycleId: cycleId }, meta)
  },
  transition(calmyId: string, status: MatterStatus, meta: MatterCommandMeta = {}): Promise<Matter> {
    return asyncTransitionMatter(calmyId, status, meta)
  },
  pause(calmyId: string, meta?: MatterCommandMeta): Promise<Matter> { return asyncTransitionMatter(calmyId, 'paused', meta) },
  resume(calmyId: string, meta?: MatterCommandMeta): Promise<Matter> { return asyncTransitionMatter(calmyId, 'active', meta) },
  archive(calmyId: string, meta?: MatterCommandMeta): Promise<Matter> { return asyncTransitionMatter(calmyId, 'archived', meta) },
  restore(calmyId: string, meta?: MatterCommandMeta): Promise<Matter> { return asyncTransitionMatter(calmyId, 'paused', meta) },
  async mutations(calmyId?: string): Promise<MatterMutation[]> {
    return (await asyncMutations.list()).filter(item => !calmyId || item.entityId === calmyId).sort((a, b) => a.occurredAt - b.occurredAt)
  },
  async ready() {
    const statuses = await Promise.all([asyncMatters.ready(), asyncMutations.ready(), asyncCommands.ready()])
    const firstError = statuses.find(status => status.lastError)?.lastError || null
    return {
      durable: statuses.every(status => status.durable),
      state: statuses.some(status => status.state === 'degraded') ? 'degraded' as const : 'ready' as const,
      available: statuses.every(status => status.available),
      pendingWrites: Math.max(...statuses.map(status => status.pendingWrites)),
      lastError: firstError
    }
  }
}
