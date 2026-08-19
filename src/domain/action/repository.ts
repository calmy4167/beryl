import { createCollectionRepository, createEntityId } from '@/core/repository'
import { ActionDomainError, canTransitionAction, type ActionCreateInput, type ActionItem, type ActionStatus } from './model'

const actions = createCollectionRepository<ActionItem>('mvpActions', item => item.calmyId)

function titleOf(title: string): string {
  const value = title.trim()
  if (!value) throw new ActionDomainError('VALIDATION_FAILED', 'Action title is required')
  return value
}

export const actionRepository = {
  list(): ActionItem[] { return actions.list().slice().sort((a, b) => b.updatedAt - a.updatedAt) },
  listForDate(date: string): ActionItem[] { return this.list().filter(item => item.date === date) },
  find(calmyId: string): ActionItem | undefined { return actions.find(calmyId) },
  importEntity(item: ActionItem): 'created' | 'unchanged' {
    const current = actions.find(item.calmyId)
    if (current) {
      if (JSON.stringify(current) === JSON.stringify(item)) return 'unchanged'
      throw new ActionDomainError('REVISION_CONFLICT', 'Action ' + item.calmyId + ' has local changes')
    }
    actions.create(item)
    return 'created'
  },
  replaceImported(item: ActionItem): 'replaced' | 'unchanged' {
    const current = actions.find(item.calmyId)
    if (!current) return this.importEntity(item) === 'created' ? 'replaced' : 'unchanged'
    if (JSON.stringify(current) === JSON.stringify(item)) return 'unchanged'
    if (!actions.update(item.calmyId, () => item)) throw new ActionDomainError('NOT_FOUND', 'Action import target disappeared')
    return 'replaced'
  },
  create(input: ActionCreateInput): ActionItem {
    if (!input.date.trim()) throw new ActionDomainError('VALIDATION_FAILED', 'Action date is required')
    const now = Date.now()
    const action: ActionItem = { calmyId: createEntityId(), title: titleOf(input.title), date: input.date, status: 'planned', matterId: input.matterId, cycleId: input.cycleId, createdAt: now, updatedAt: now, revision: 1 }
    return actions.create(action)
  },
  transition(calmyId: string, status: ActionStatus, expectedRevision?: number, resultNote?: string): ActionItem {
    const current = actions.find(calmyId)
    if (!current) throw new ActionDomainError('NOT_FOUND', `Action ${calmyId} not found`)
    if (expectedRevision !== undefined && expectedRevision !== current.revision) throw new ActionDomainError('REVISION_CONFLICT', `Action ${calmyId} is at revision ${current.revision}`)
    if (!canTransitionAction(current.status, status)) throw new ActionDomainError('INVALID_TRANSITION', `${current.status} → ${status} is not allowed`)
    const next: ActionItem = { ...current, status, resultNote: resultNote?.trim() || current.resultNote, updatedAt: Date.now(), revision: current.revision + 1 }
    actions.update(calmyId, () => next)
    return next
  },
  start(calmyId: string, expectedRevision?: number): ActionItem { return this.transition(calmyId, 'in_progress', expectedRevision) },
  complete(calmyId: string, resultNote?: string, expectedRevision?: number): ActionItem { return this.transition(calmyId, 'done', expectedRevision, resultNote) },
  skip(calmyId: string, resultNote?: string, expectedRevision?: number): ActionItem { return this.transition(calmyId, 'skipped', expectedRevision, resultNote) },
  cancel(calmyId: string, expectedRevision?: number): ActionItem { return this.transition(calmyId, 'cancelled', expectedRevision) },
  reopen(calmyId: string, expectedRevision?: number): ActionItem { return this.transition(calmyId, 'planned', expectedRevision) }
}
