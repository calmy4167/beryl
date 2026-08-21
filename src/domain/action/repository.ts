import { createCollectionRepository, createEntityId } from '@/core/repository'
import { ActionDomainError, canTransitionAction, type ActionCommandMeta, type ActionCreateInput, type ActionItem, type ActionMutation, type ActionStatus } from './model'

const actions = createCollectionRepository<ActionItem>('mvpActions', item => item.calmyId)
const mutations = createCollectionRepository<ActionMutation>('actionMutations')
const commands = createCollectionRepository<{ id: string; result: ActionItem }>('actionCommands')

function titleOf(title: string): string {
  const value = title.trim()
  if (!value) throw new ActionDomainError('VALIDATION_FAILED', 'Action title is required')
  return value
}

function metaOf(meta: ActionCommandMeta = {}): { commandId: string; actor: NonNullable<ActionCommandMeta['actor']>; actorId: string; sourceIds: string[] } {
  return { commandId: meta.commandId || createEntityId(), actor: meta.actor || 'user', actorId: meta.actorId || 'local-user', sourceIds: meta.sourceIds || [] }
}

function appendMutation(action: ActionItem, operation: ActionMutation['operation'], commandId: string, actor: ActionMutation['actor'], actorId: string, sourceIds: string[], fromRevision: number, patch?: unknown): void {
  mutations.create({ id: createEntityId(), entity: 'action', entityId: action.calmyId, operation, commandId, actor, actorId, sourceIds, fromRevision, toRevision: action.revision, occurredAt: Date.now(), patch })
}

function saveCommand(commandId: string, result: ActionItem): ActionItem { commands.create({ id: commandId, result }); return result }

export const actionRepository = {
  list(): ActionItem[] { return actions.list().slice().sort((a, b) => b.updatedAt - a.updatedAt) },
  listForDate(date: string): ActionItem[] { return this.list().filter(item => item.date === date) },
  listForMatter(matterId: string): ActionItem[] { return this.list().filter(item => item.matterId === matterId) },
  listForCycle(cycleId: string): ActionItem[] { return this.list().filter(item => item.cycleId === cycleId) },
  find(calmyId: string): ActionItem | undefined { return actions.find(calmyId) },
  importEntity(item: ActionItem): 'created' | 'unchanged' {
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
    const current = actions.find(item.calmyId)
    if (!current) return this.importEntity(item) === 'created' ? 'replaced' : 'unchanged'
    if (JSON.stringify(current) === JSON.stringify(item)) return 'unchanged'
    if (!actions.update(item.calmyId, () => item)) throw new ActionDomainError('NOT_FOUND', 'Action import target disappeared')
    appendMutation(item, 'update', `import-replace:${item.calmyId}:${item.revision}`, 'import', 'import', [], current.revision, item)
    return 'replaced'
  },
  create(input: ActionCreateInput, meta: ActionCommandMeta = {}): ActionItem {
    const command = metaOf(meta)
    const duplicate = commands.find(command.commandId)?.result
    if (duplicate) return duplicate
    if (!input.date.trim()) throw new ActionDomainError('VALIDATION_FAILED', 'Action date is required')
    const now = Date.now()
    const action: ActionItem = { calmyId: createEntityId(), title: titleOf(input.title), date: input.date, status: 'planned', matterId: input.matterId, cycleId: input.cycleId, createdAt: now, updatedAt: now, revision: 1 }
    actions.create(action)
    appendMutation(action, 'create', command.commandId, command.actor, command.actorId, command.sourceIds, 0, action)
    return saveCommand(command.commandId, action)
  },
  update(calmyId: string, patch: Partial<ActionItem>, meta: ActionCommandMeta = {}): ActionItem {
    const command = metaOf(meta)
    const duplicate = commands.find(command.commandId)?.result
    if (duplicate) return duplicate
    const current = actions.find(calmyId)
    if (!current) throw new ActionDomainError('NOT_FOUND', `Action ${calmyId} not found`)
    if (meta.expectedRevision !== undefined && meta.expectedRevision !== current.revision) throw new ActionDomainError('REVISION_CONFLICT', `Action ${calmyId} is at revision ${current.revision}`)
    const next = { ...current, ...patch, updatedAt: Date.now(), revision: current.revision + 1 }
    actions.update(calmyId, () => next)
    appendMutation(next, 'update', command.commandId, command.actor, command.actorId, command.sourceIds, current.revision, patch)
    return saveCommand(command.commandId, next)
  },
  transition(calmyId: string, status: ActionStatus, expectedRevision?: number, resultNote?: string, meta: ActionCommandMeta = {}): ActionItem {
    const current = actions.find(calmyId)
    if (!current) throw new ActionDomainError('NOT_FOUND', `Action ${calmyId} not found`)
    if (expectedRevision !== undefined && expectedRevision !== current.revision) throw new ActionDomainError('REVISION_CONFLICT', `Action ${calmyId} is at revision ${current.revision}`)
    if (!canTransitionAction(current.status, status)) throw new ActionDomainError('INVALID_TRANSITION', `${current.status} → ${status} is not allowed`)
    const command = metaOf({ ...meta, expectedRevision })
    const duplicate = commands.find(command.commandId)?.result
    if (duplicate) return duplicate
    const next: ActionItem = { ...current, status, resultNote: resultNote?.trim() || current.resultNote, updatedAt: Date.now(), revision: current.revision + 1 }
    actions.update(calmyId, () => next)
    appendMutation(next, 'transition', command.commandId, command.actor, command.actorId, command.sourceIds, current.revision, { status, ...(resultNote ? { resultNote } : {}) })
    return saveCommand(command.commandId, next)
  },
  start(calmyId: string, expectedRevision?: number): ActionItem { return this.transition(calmyId, 'in_progress', expectedRevision) },
  complete(calmyId: string, resultNote?: string, expectedRevision?: number): ActionItem { return this.transition(calmyId, 'done', expectedRevision, resultNote) },
  skip(calmyId: string, resultNote?: string, expectedRevision?: number): ActionItem { return this.transition(calmyId, 'skipped', expectedRevision, resultNote) },
  cancel(calmyId: string, expectedRevision?: number): ActionItem { return this.transition(calmyId, 'cancelled', expectedRevision) },
  reopen(calmyId: string, expectedRevision?: number): ActionItem { return this.transition(calmyId, 'planned', expectedRevision) }
  ,mutations(calmyId?: string): ActionMutation[] { return mutations.list().filter(item => !calmyId || item.entityId === calmyId).sort((a, b) => a.occurredAt - b.occurredAt) }
}
