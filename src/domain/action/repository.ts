import { createAsyncCollectionRepository, createCollectionRepository, createEntityId } from '@/core/repository'
import { readServerSession } from '@/core/auth'
import { ActionDomainError, canTransitionAction, type ActionCommandMeta, type ActionCreateInput, type ActionItem, type ActionMutation, type ActionStatus } from './model'
import { unifiedAsyncRepository, unifiedRepository } from '@/domain/unified/repository'
import { ownershipForSignedInUser } from '@/domain/unified/ownership'
import type { Person } from '@/domain/unified/model'

const actions = createCollectionRepository<ActionItem>('mvpActions', item => item.calmyId)
const asyncActions = createAsyncCollectionRepository<ActionItem>('mvpActions', item => item.calmyId)
const mutations = createCollectionRepository<ActionMutation>('actionMutations')
const commands = createCollectionRepository<{ id: string; result: ActionItem }>('actionCommands')
const asyncMutations = createAsyncCollectionRepository<ActionMutation>('actionMutations')
const asyncCommands = createAsyncCollectionRepository<{ id: string; result: ActionItem }>('actionCommands')

interface ActionCreateIntent {
  id: string
  result: ActionItem
  actor: ActionMutation['actor']
  actorId: string
  sourceIds: string[]
}
interface ActionCompensation {
  id: string
  creationCommandId: string
  captureId: string
  action: ActionItem
  phase: 'started' | 'removed' | 'completed' | 'aborted'
}
const createIntents = createAsyncCollectionRepository<ActionCreateIntent>('actionCreateIntents')
const compensationSnapshots = createCollectionRepository<ActionCompensation>('actionCompensations')
const asyncCompensations = createAsyncCollectionRepository<ActionCompensation>('actionCompensations')
let actionCreateChain: Promise<void> = Promise.resolve()

function assertActionWritable(calmyId: string, compensationId?: string): void {
  if (compensationSnapshots.list().some(item => item.action.calmyId === calmyId && item.id !== compensationId && (item.phase === 'started' || item.phase === 'removed'))) {
    throw new ActionDomainError('REVISION_CONFLICT', 'Action undo is pending; retry it before making changes')
  }
}

function actionMutationGuard(calmyId: string, compensationId?: string): () => void {
  const fingerprint = () => JSON.stringify(compensationSnapshots.list().filter(item => item.action.calmyId === calmyId && item.id !== compensationId).map(item => [item.id, item.phase]))
  assertActionWritable(calmyId, compensationId)
  const admitted = fingerprint()
  return () => {
    assertActionWritable(calmyId, compensationId)
    if (fingerprint() !== admitted) throw new ActionDomainError('REVISION_CONFLICT', 'Action undo changed while this write was queued; refresh before retrying')
  }
}

function titleOf(title: string): string {
  const value = title.trim()
  if (!value) throw new ActionDomainError('VALIDATION_FAILED', 'Action title is required')
  return value
}

function validatePersonReference(personId: string | undefined): void {
  if (personId && !unifiedRepository.find<Person>('person', personId)) {
    throw new ActionDomainError('VALIDATION_FAILED', `Person ${personId} not found`)
  }
}

async function validatePersonReferenceAsync(personId: string | undefined): Promise<void> {
  if (personId && !await unifiedAsyncRepository.find<Person>('person', personId)) {
    throw new ActionDomainError('VALIDATION_FAILED', `Person ${personId} not found`)
  }
}

function metaOf(meta: ActionCommandMeta = {}): { commandId: string; actor: NonNullable<ActionCommandMeta['actor']>; actorId: string; sourceIds: string[] } {
  return { commandId: meta.commandId || createEntityId(), actor: meta.actor || 'user', actorId: meta.actorId || 'local-user', sourceIds: meta.sourceIds || [] }
}

function snapshotAction(action: ActionItem): Record<string, unknown> { return JSON.parse(JSON.stringify(action)) as Record<string, unknown> }

function appendMutation(action: ActionItem, operation: ActionMutation['operation'], commandId: string, actor: ActionMutation['actor'], actorId: string, sourceIds: string[], fromRevision: number, patch?: unknown, previous?: ActionItem): void {
  mutations.create({ id: createEntityId(), entity: 'action', entityId: action.calmyId, operation, commandId, actor, actorId, sourceIds, fromRevision, toRevision: action.revision, occurredAt: Date.now(), patch,
    ...(previous ? { previousSnapshot: snapshotAction(previous) } : {}), snapshot: snapshotAction(action) })
}

function saveCommand(commandId: string, result: ActionItem): ActionItem { commands.create({ id: commandId, result }); return result }

async function appendMutationAsync(action: ActionItem, operation: ActionMutation['operation'], commandId: string, actor: ActionMutation['actor'], actorId: string, sourceIds: string[], fromRevision: number, patch?: unknown, previous?: ActionItem, mutationId?: string): Promise<void> {
  if (mutationId && await asyncMutations.find(mutationId)) return
  await asyncMutations.create({
    id: mutationId || createEntityId(), entity: 'action', entityId: action.calmyId, operation, commandId, actor, actorId, sourceIds,
    fromRevision, toRevision: action.revision, occurredAt: Date.now(), patch,
    ...(previous ? { previousSnapshot: snapshotAction(previous) } : {}), snapshot: snapshotAction(action)
  })
}

async function duplicateAsyncResult(commandId: string): Promise<ActionItem | undefined> {
  return (await asyncCommands.find(commandId))?.result
}

async function saveCommandAsync(commandId: string, result: ActionItem): Promise<ActionItem> {
  await asyncCommands.create({ id: commandId, result })
  return result
}

export const actionRepository = {
  list(): ActionItem[] { return actions.list().slice().sort((a, b) => b.updatedAt - a.updatedAt) },
  listForDate(date: string): ActionItem[] { return this.list().filter(item => item.date === date) },
  listForMatter(matterId: string): ActionItem[] { return this.list().filter(item => item.matterId === matterId) },
  listForCycle(cycleId: string): ActionItem[] { return this.list().filter(item => item.cycleId === cycleId) },
  find(calmyId: string): ActionItem | undefined { return actions.find(calmyId) },
  importEntity(item: ActionItem): 'created' | 'unchanged' {
    assertActionWritable(item.calmyId)
    const current = actions.find(item.calmyId)
    if (current) {
      if (JSON.stringify(current) === JSON.stringify(item)) return 'unchanged'
      throw new ActionDomainError('REVISION_CONFLICT', 'Action ' + item.calmyId + ' has local changes')
    }
    actions.create(item)
    appendMutation(item, 'create', `import:${item.calmyId}:${item.revision}`, 'import', 'import', [], 0, item)
    return 'created'
  },
  replaceImported(item: ActionItem): 'replaced' | 'unchanged' {
    assertActionWritable(item.calmyId)
    const current = actions.find(item.calmyId)
    if (!current) return this.importEntity(item) === 'created' ? 'replaced' : 'unchanged'
    if (JSON.stringify(current) === JSON.stringify(item)) return 'unchanged'
    if (!actions.update(item.calmyId, () => item)) throw new ActionDomainError('NOT_FOUND', 'Action import target disappeared')
    appendMutation(item, 'update', `import-replace:${item.calmyId}:${item.revision}`, 'import', 'import', [], current.revision, item, current)
    return 'replaced'
  },
  create(input: ActionCreateInput, meta: ActionCommandMeta = {}): ActionItem {
    const session = readServerSession()
    const actor = meta.actor || 'user'
    const command = metaOf({ ...meta, actorId: meta.actorId || (actor === 'user' ? session?.user.id : undefined) })
    const duplicate = commands.find(command.commandId)?.result
    if (duplicate) return duplicate
    if (!input.date.trim()) throw new ActionDomainError('VALIDATION_FAILED', 'Action date is required')
    validatePersonReference(input.personId)
    const now = Date.now()
    const ownership = session && command.actor === 'user' && command.actorId === session.user.id
      ? ownershipForSignedInUser(input.ownership, session.user.id) : input.ownership
    const action: ActionItem = { calmyId: createEntityId(), title: titleOf(input.title), date: input.date, status: 'planned', matterId: input.matterId, ...(input.personId ? { personId: input.personId } : {}), cycleId: input.cycleId, createdAt: now, updatedAt: now, revision: 1, ownership }
    actions.create(action)
    appendMutation(action, 'create', command.commandId, command.actor, command.actorId, command.sourceIds, 0, action)
    return saveCommand(command.commandId, action)
  },
  update(calmyId: string, patch: Partial<ActionItem>, meta: ActionCommandMeta = {}): ActionItem {
    assertActionWritable(calmyId)
    const command = metaOf(meta)
    const duplicate = commands.find(command.commandId)?.result
    if (duplicate) return duplicate
    const current = actions.find(calmyId)
    if (!current) throw new ActionDomainError('NOT_FOUND', `Action ${calmyId} not found`)
    if (patch.personId !== undefined) validatePersonReference(patch.personId)
    if (meta.expectedRevision !== undefined && meta.expectedRevision !== current.revision) throw new ActionDomainError('REVISION_CONFLICT', `Action ${calmyId} is at revision ${current.revision}`)
    const next = { ...current, ...patch, updatedAt: Date.now(), revision: current.revision + 1 }
    actions.update(calmyId, () => next)
    appendMutation(next, 'update', command.commandId, command.actor, command.actorId, command.sourceIds, current.revision, patch, current)
    return saveCommand(command.commandId, next)
  },
  transition(calmyId: string, status: ActionStatus, expectedRevision?: number, resultNote?: string, meta: ActionCommandMeta = {}): ActionItem {
    assertActionWritable(calmyId)
    const current = actions.find(calmyId)
    if (!current) throw new ActionDomainError('NOT_FOUND', `Action ${calmyId} not found`)
    if (expectedRevision !== undefined && expectedRevision !== current.revision) throw new ActionDomainError('REVISION_CONFLICT', `Action ${calmyId} is at revision ${current.revision}`)
    if (!canTransitionAction(current.status, status)) throw new ActionDomainError('INVALID_TRANSITION', `${current.status} → ${status} is not allowed`)
    const command = metaOf({ ...meta, expectedRevision })
    const duplicate = commands.find(command.commandId)?.result
    if (duplicate) return duplicate
    const next: ActionItem = { ...current, status, resultNote: resultNote?.trim() || current.resultNote, updatedAt: Date.now(), revision: current.revision + 1 }
    actions.update(calmyId, () => next)
    appendMutation(next, 'transition', command.commandId, command.actor, command.actorId, command.sourceIds, current.revision, { status, ...(resultNote ? { resultNote } : {}) }, current)
    return saveCommand(command.commandId, next)
  },
  start(calmyId: string, expectedRevision?: number): ActionItem { return this.transition(calmyId, 'in_progress', expectedRevision) },
  complete(calmyId: string, resultNote?: string, expectedRevision?: number): ActionItem { return this.transition(calmyId, 'done', expectedRevision, resultNote) },
  skip(calmyId: string, resultNote?: string, expectedRevision?: number): ActionItem { return this.transition(calmyId, 'skipped', expectedRevision, resultNote) },
  cancel(calmyId: string, expectedRevision?: number): ActionItem { return this.transition(calmyId, 'cancelled', expectedRevision) },
  reopen(calmyId: string, expectedRevision?: number): ActionItem { return this.transition(calmyId, 'planned', expectedRevision) }
  ,mutations(calmyId?: string): ActionMutation[] { return mutations.list().filter(item => !calmyId || item.entityId === calmyId).sort((a, b) => a.occurredAt - b.occurredAt) }
}

export const actionAsyncRepository = {
  async list(): Promise<ActionItem[]> {
    return (await asyncActions.list()).slice().sort((a, b) => b.updatedAt - a.updatedAt)
  },
  async get(calmyId: string): Promise<ActionItem | undefined> {
    return asyncActions.find(calmyId)
  },
  async find(calmyId: string): Promise<ActionItem | undefined> {
    return asyncActions.find(calmyId)
  },
  listForDate(date: string): Promise<ActionItem[]> {
    return this.list().then(items => items.filter(item => item.date === date))
  },
  listForMatter(matterId: string): Promise<ActionItem[]> {
    return this.list().then(items => items.filter(item => item.matterId === matterId))
  },
  listForCycle(cycleId: string): Promise<ActionItem[]> {
    return this.list().then(items => items.filter(item => item.cycleId === cycleId))
  },
  async importEntity(item: ActionItem, beforeWrite = actionMutationGuard(item.calmyId)): Promise<'created' | 'unchanged'> {
    const commandId = `import:${item.calmyId}:${item.revision}`
    const current = await asyncActions.find(item.calmyId)
    if (current) {
      if (JSON.stringify(current) === JSON.stringify(item)) return 'unchanged'
      throw new ActionDomainError('REVISION_CONFLICT', 'Action ' + item.calmyId + ' has local changes')
    }
    if (await duplicateAsyncResult(commandId)) return 'unchanged'
    await asyncActions.create(item, { beforeWrite })
    await appendMutationAsync(item, 'create', commandId, 'import', 'import', [], 0, item)
    await saveCommandAsync(commandId, item)
    return 'created'
  },
  async replaceImported(item: ActionItem): Promise<'replaced' | 'unchanged'> {
    const beforeWrite = actionMutationGuard(item.calmyId)
    const commandId = `import-replace:${item.calmyId}:${item.revision}`
    if (await duplicateAsyncResult(commandId)) return 'unchanged'
    const current = await asyncActions.find(item.calmyId)
    if (!current) return (await this.importEntity(item, beforeWrite)) === 'created' ? 'replaced' : 'unchanged'
    if (JSON.stringify(current) === JSON.stringify(item)) return 'unchanged'
    if (!await asyncActions.update(item.calmyId, () => {
      beforeWrite()
      return item
    })) throw new ActionDomainError('NOT_FOUND', 'Action import target disappeared')
    await appendMutationAsync(item, 'update', commandId, 'import', 'import', [], current.revision, item, current)
    await saveCommandAsync(commandId, item)
    return 'replaced'
  },
  async create(input: ActionCreateInput, meta: ActionCommandMeta = {}): Promise<ActionItem> {
    const work = async () => {
      const session = readServerSession()
      const actor = meta.actor || 'user'
      const command = metaOf({ ...meta, actorId: meta.actorId || (actor === 'user' ? session?.user.id : undefined) })
      const duplicate = await duplicateAsyncResult(command.commandId)
      if (duplicate) return duplicate
      if (!input.date.trim()) throw new ActionDomainError('VALIDATION_FAILED', 'Action date is required')
      await validatePersonReferenceAsync(input.personId)
      let intent = await createIntents.find(command.commandId)
      if (!intent) {
        const now = Date.now()
        const ownership = session && command.actor === 'user' && command.actorId === session.user.id
          ? ownershipForSignedInUser(input.ownership, session.user.id) : input.ownership
        const action: ActionItem = { calmyId: createEntityId(), title: titleOf(input.title), date: input.date, status: 'planned', matterId: input.matterId, ...(input.personId ? { personId: input.personId } : {}), cycleId: input.cycleId, createdAt: now, updatedAt: now, revision: 1, ownership }
        // Reserve the ID before any entity write, including retries after a reload.
        intent = await createIntents.create({ id: command.commandId, result: action, actor: command.actor, actorId: command.actorId, sourceIds: command.sourceIds })
      } else if (intent.result.title !== titleOf(input.title) || JSON.stringify(intent.sourceIds) !== JSON.stringify(command.sourceIds)) {
        throw new Error('action-create-command-conflict')
      }
      assertActionWritable(intent.result.calmyId)
      const current = await asyncActions.find(intent.result.calmyId)
      if (!current) await asyncActions.create(intent.result, { beforeWrite: actionMutationGuard(intent.result.calmyId) })
      await appendMutationAsync(intent.result, 'create', command.commandId, intent.actor, intent.actorId, intent.sourceIds, 0, intent.result, undefined, `action-create:${command.commandId}`)
      return saveCommandAsync(command.commandId, intent.result)
    }
    const next = actionCreateChain.then(work, work)
    actionCreateChain = next.then(() => undefined, () => undefined)
    return next
  },
  async update(calmyId: string, patch: Partial<ActionItem>, meta: ActionCommandMeta = {}): Promise<ActionItem> {
    const beforeWrite = actionMutationGuard(calmyId)
    const command = metaOf(meta)
    const duplicate = await duplicateAsyncResult(command.commandId)
    if (duplicate) return duplicate
    const current = await asyncActions.find(calmyId)
    if (!current) throw new ActionDomainError('NOT_FOUND', `Action ${calmyId} not found`)
    if (patch.personId !== undefined) await validatePersonReferenceAsync(patch.personId)
    if (meta.expectedRevision !== undefined && meta.expectedRevision !== current.revision) throw new ActionDomainError('REVISION_CONFLICT', `Action ${calmyId} is at revision ${current.revision}`)
    const next = { ...current, ...patch, updatedAt: Date.now(), revision: current.revision + 1 }
    if (!await asyncActions.update(calmyId, item => {
      beforeWrite()
      if (item.revision !== current.revision) throw new ActionDomainError('REVISION_CONFLICT', `Action ${calmyId} has changed`)
      return next
    })) throw new ActionDomainError('NOT_FOUND', `Action ${calmyId} disappeared`)
    await appendMutationAsync(next, 'update', command.commandId, command.actor, command.actorId, command.sourceIds, current.revision, patch, current)
    return saveCommandAsync(command.commandId, next)
  },
  async remove(calmyId: string): Promise<boolean> {
    return asyncActions.remove(calmyId, actionMutationGuard(calmyId))
  },
  async validateDesktopUndo(calmyId: string, creationCommandId: string, captureId: string): Promise<ActionItem> {
    const creation = await createIntents.find(creationCommandId)
    const mutation = (await this.mutations(creationCommandId)).find(item => item.operation === 'create' && item.entityId === calmyId && item.sourceIds.includes(captureId))
    const current = await asyncActions.find(calmyId)
    if (!creation || creation.result.calmyId !== calmyId || !creation.sourceIds.includes(captureId) || !mutation) throw new Error('action-undo-source-conflict')
    if (!current || current.revision !== 1 || current.status !== 'planned' || JSON.stringify(current) !== JSON.stringify(creation.result)) throw new ActionDomainError('REVISION_CONFLICT', 'Action has changed; refresh before undoing')
    return current
  },
  async removeDesktopCreated(calmyId: string, creationCommandId: string, captureId: string, commandId: string): Promise<void> {
    let compensation = await asyncCompensations.find(commandId)
    if (compensation && compensation.phase !== 'aborted') {
      if (compensation.action.calmyId !== calmyId || compensation.creationCommandId !== creationCommandId || compensation.captureId !== captureId) throw new Error('action-compensation-command-conflict')
      if (compensation.phase === 'completed' || compensation.phase === 'removed') return
    } else {
      assertActionWritable(calmyId)
      const action = await this.validateDesktopUndo(calmyId, creationCommandId, captureId)
      const next: ActionCompensation = { id: commandId, creationCommandId, captureId, action, phase: 'started' }
      if (compensation) await asyncCompensations.update(commandId, () => next)
      else await asyncCompensations.create(next)
      compensation = next
    }
    const current = await asyncActions.find(calmyId)
    if (!current && !await asyncMutations.find(`action-remove:${commandId}`)) throw new ActionDomainError('REVISION_CONFLICT', 'Action disappeared before undo removal')
    if (current && JSON.stringify(current) !== JSON.stringify(compensation.action)) throw new ActionDomainError('REVISION_CONFLICT', 'Action has changed; refresh before undoing')
    // Audit precedes deletion; the stable mutation ID makes interrupted retries safe.
    await appendMutationAsync(compensation.action, 'remove', commandId, 'user', readServerSession()?.user.id || 'local-user', [captureId], compensation.action.revision, { compensationFor: creationCommandId }, compensation.action, `action-remove:${commandId}`)
    if (current && !await asyncActions.remove(calmyId, actionMutationGuard(calmyId, commandId))) throw new Error('action-undo-remove-failed')
    if (!await asyncCompensations.update(commandId, item => ({ ...item, phase: 'removed' }))) throw new Error('action-compensation-command-missing')
  },
  /** Abort is safe only while the original Action still exists; deletion retains recovery. */
  async abortDesktopUndo(commandId: string): Promise<boolean> {
    const compensation = await asyncCompensations.find(commandId)
    if (!compensation || compensation.phase === 'aborted') return true
    if (compensation.phase !== 'started') return false
    if (!await asyncActions.find(compensation.action.calmyId) && await asyncMutations.find(`action-remove:${commandId}`)) return false
    if (!await asyncCompensations.update(commandId, item => ({ ...item, phase: 'aborted' }))) throw new Error('action-compensation-command-missing')
    return true
  },
  async finishDesktopUndo(commandId: string): Promise<void> {
    if (!await asyncCompensations.update(commandId, item => {
      if (item.phase === 'started') throw new Error('action-compensation-not-finished')
      return { ...item, phase: 'completed' }
    })) throw new Error('action-compensation-command-missing')
  },
  async transition(calmyId: string, status: ActionStatus, expectedRevision?: number, resultNote?: string, meta: ActionCommandMeta = {}): Promise<ActionItem> {
    const beforeWrite = actionMutationGuard(calmyId)
    const current = await asyncActions.find(calmyId)
    if (!current) throw new ActionDomainError('NOT_FOUND', `Action ${calmyId} not found`)
    if (expectedRevision !== undefined && expectedRevision !== current.revision) throw new ActionDomainError('REVISION_CONFLICT', `Action ${calmyId} is at revision ${current.revision}`)
    if (!canTransitionAction(current.status, status)) throw new ActionDomainError('INVALID_TRANSITION', `${current.status} → ${status} is not allowed`)
    const command = metaOf({ ...meta, expectedRevision })
    const duplicate = await duplicateAsyncResult(command.commandId)
    if (duplicate) return duplicate
    const next: ActionItem = { ...current, status, resultNote: resultNote?.trim() || current.resultNote, updatedAt: Date.now(), revision: current.revision + 1 }
    if (!await asyncActions.update(calmyId, item => {
      beforeWrite()
      if (item.revision !== current.revision) throw new ActionDomainError('REVISION_CONFLICT', `Action ${calmyId} has changed`)
      return next
    })) throw new ActionDomainError('NOT_FOUND', `Action ${calmyId} disappeared`)
    await appendMutationAsync(next, 'transition', command.commandId, command.actor, command.actorId, command.sourceIds, current.revision, { status, ...(resultNote ? { resultNote } : {}) }, current)
    return saveCommandAsync(command.commandId, next)
  },
  start(calmyId: string, expectedRevision?: number): Promise<ActionItem> { return this.transition(calmyId, 'in_progress', expectedRevision) },
  complete(calmyId: string, resultNote?: string, expectedRevision?: number, meta: ActionCommandMeta = {}): Promise<ActionItem> { return this.transition(calmyId, 'done', expectedRevision, resultNote, meta) },
  skip(calmyId: string, resultNote?: string, expectedRevision?: number): Promise<ActionItem> { return this.transition(calmyId, 'skipped', expectedRevision, resultNote) },
  cancel(calmyId: string, expectedRevision?: number): Promise<ActionItem> { return this.transition(calmyId, 'cancelled', expectedRevision) },
  reopen(calmyId: string, expectedRevision?: number): Promise<ActionItem> { return this.transition(calmyId, 'planned', expectedRevision) },
  async mutations(commandId?: string): Promise<ActionMutation[]> {
    return (await asyncMutations.list()).filter(item => !commandId || item.commandId === commandId).sort((a, b) => a.occurredAt - b.occurredAt)
  },
  ready: asyncActions.ready
}
