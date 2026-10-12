import { createAsyncCollectionRepository, createCollectionRepository } from '@/core/repository'
import { readServerSession } from '@/core/auth'
import type { Ownership } from '@/domain/unified/model'

/** Compatibility projection over the existing Finance collection. */
export interface FinanceEntry {
  id: string
  type: 'income' | 'expense' | string
  amount?: number
  amountCents?: number
  category: string
  categoryOptionId?: string
  note: string
  date: string
  createdAt?: number
  createdByUserId?: string
  revision?: number
  updatedAt?: number
  updatedByUserId?: string
  source?: string
  ownership?: Ownership
  [key: string]: unknown
}

export const financeRepository = createCollectionRepository<FinanceEntry>('finance', item => item.id)
const financeAsyncCollection = createAsyncCollectionRepository<FinanceEntry>('finance', item => item.id)
const financeMutationRepository = createAsyncCollectionRepository<FinanceMutation>('financeMutations', item => item.id)
const createFinanceEntry = financeAsyncCollection.create.bind(financeAsyncCollection)

export interface FinanceMutation {
  id: string
  entityId: string
  operation: 'created' | 'updated' | 'ownership-updated'
  commandId: string
  actorId: string
  occurredAt: number
  fromRevision: number
  toRevision: number
  ownership?: Ownership
  previousOwnership?: Ownership
  snapshot?: FinanceEntry
  previousSnapshot?: FinanceEntry
}

export const financeAsyncRepository = Object.assign(financeAsyncCollection, {
  async create(entry: FinanceEntry): Promise<FinanceEntry> {
    const session = readServerSession()
    const actorId = session?.user.id || 'local-user'
    const occurredAt = Date.now()
    const ownership = entry.ownership
      ? { ...entry.ownership, createdByUserId: entry.ownership.createdByUserId || session?.user.id, privacy: entry.ownership.privacy || 'private' }
      : session ? { createdByUserId: actorId, ownerRef: { type: 'user' as const, id: actorId }, stewardRefs: [], privacy: 'private' as const } : undefined
    const snapshot: FinanceEntry = {
      ...entry, createdAt: entry.createdAt ?? occurredAt,
      createdByUserId: entry.createdByUserId ?? session?.user.id,
      revision: entry.revision ?? 1, updatedAt: entry.updatedAt ?? occurredAt,
      updatedByUserId: entry.updatedByUserId ?? actorId, source: entry.source ?? 'finance-page',
      ...(ownership ? { ownership } : {})
    }
    const created = await createFinanceEntry(snapshot)
    const commandId = `finance:create:${snapshot.id}:${snapshot.revision}`
    try {
      await financeMutationRepository.create({
        id: commandId, entityId: snapshot.id, operation: 'created', commandId, actorId, occurredAt,
        fromRevision: 0, toRevision: snapshot.revision || 1, snapshot
      })
    } catch (error) {
      await financeAsyncCollection.remove(snapshot.id)
      throw error
    }
    return created
  },
  async setOwnership(id: string, ownership: Ownership | undefined, expectedRevision?: number, actorId = 'local-user') {
    const current = await financeAsyncCollection.find(id)
    if (!current) throw new Error(`finance ${id} not found`)
    const fromRevision = Number.isInteger(current.revision) && (current.revision as number) >= 0 ? current.revision as number : 0
    if (expectedRevision !== undefined && fromRevision !== expectedRevision) throw new Error(`finance ${id} revision conflict`)
    const toRevision = fromRevision + 1
    const occurredAt = Date.now()
    const next: FinanceEntry = { ...current, ownership, revision: toRevision, updatedAt: occurredAt, updatedByUserId: actorId }
    let revisionChanged = false
    const updated = await financeAsyncCollection.update(id, item => {
      const revision = Number.isInteger(item.revision) && (item.revision as number) >= 0 ? item.revision as number : 0
      if (revision !== fromRevision) { revisionChanged = true; return item }
      return next
    })
    if (!updated) throw new Error(`finance ${id} not found`)
    if (revisionChanged) throw new Error(`finance ${id} revision conflict`)
    const commandId = `finance:ownership:${id}:${toRevision}`
    try {
      await financeMutationRepository.create({
        id: commandId, entityId: id, operation: 'ownership-updated', commandId, actorId, occurredAt,
        fromRevision, toRevision, ownership, previousOwnership: current.ownership, snapshot: next, previousSnapshot: current
      })
    } catch (error) {
      await financeAsyncCollection.update(id, item => item.revision === toRevision ? current : item)
      throw error
    }
    return next
  },
  async revise(id: string, changes: Partial<Pick<FinanceEntry, 'type' | 'amount' | 'amountCents' | 'category' | 'categoryOptionId' | 'note' | 'date'>>, expectedRevision: number, actorId = 'local-user') {
    const current = await financeAsyncCollection.find(id)
    if (!current) throw new Error(`finance ${id} not found`)
    const fromRevision = Number.isInteger(current.revision) && (current.revision as number) >= 0 ? current.revision as number : 0
    if (fromRevision !== expectedRevision) throw new Error(`finance ${id} revision conflict`)
    const toRevision = fromRevision + 1
    const occurredAt = Date.now()
    const next: FinanceEntry = { ...current, ...changes, id, revision: toRevision, updatedAt: occurredAt, updatedByUserId: actorId }
    let revisionChanged = false
    const updated = await financeAsyncCollection.update(id, item => {
      const revision = Number.isInteger(item.revision) && (item.revision as number) >= 0 ? item.revision as number : 0
      if (revision !== fromRevision) { revisionChanged = true; return item }
      return next
    })
    if (!updated) throw new Error(`finance ${id} not found`)
    if (revisionChanged) throw new Error(`finance ${id} revision conflict`)
    const commandId = `finance:update:${id}:${toRevision}`
    try {
      await financeMutationRepository.create({
        id: commandId, entityId: id, operation: 'updated', commandId, actorId, occurredAt,
        fromRevision, toRevision, snapshot: next, previousSnapshot: current
      })
    } catch (error) {
      await financeAsyncCollection.update(id, item => item.revision === toRevision ? current : item)
      throw error
    }
    return next
  },
  async history(id: string): Promise<FinanceMutation[]> {
    return (await financeMutationRepository.list()).filter(item => item.entityId === id)
      .sort((a, b) => a.occurredAt - b.occurredAt || a.fromRevision - b.fromRevision || a.id.localeCompare(b.id))
  },
  async importMutation(mutation: FinanceMutation): Promise<'created' | 'unchanged'> {
    const current = await financeMutationRepository.find(mutation.id)
    if (current) {
      if (JSON.stringify(current) === JSON.stringify(mutation)) return 'unchanged'
      throw new Error(`finance mutation ${mutation.id} has conflicting history`)
    }
    await financeMutationRepository.create(mutation)
    return 'created'
  },
  async importEntity(entry: FinanceEntry): Promise<'created' | 'unchanged'> {
    const current = await financeAsyncCollection.find(entry.id)
    if (current) {
      if (JSON.stringify(current) === JSON.stringify(entry)) return 'unchanged'
      throw new Error(`finance ${entry.id} has local changes`)
    }
    await createFinanceEntry(entry)
    return 'created'
  },
  async replaceImported(entry: FinanceEntry): Promise<'replaced' | 'unchanged' | 'created'> {
    const current = await financeAsyncCollection.find(entry.id)
    if (!current) return this.importEntity(entry)
    if (JSON.stringify(current) === JSON.stringify(entry)) return 'unchanged'
    const replaced = await financeAsyncCollection.update(entry.id, () => entry)
    if (!replaced) return this.importEntity(entry)
    return 'replaced'
  }
})
