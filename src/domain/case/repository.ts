import { createAsyncCollectionRepository, createCollectionRepository, createEntityId } from '@/core/repository'
import type { CaseDecision, CaseItem, CasePhase, CaseRelation, CaseReview, CaseStatus } from './model'

const cases = createCollectionRepository<CaseItem>('cases')
const asyncCases = createAsyncCollectionRepository<CaseItem>('cases')
const relations = createCollectionRepository<CaseRelation>('caseRelations')
const asyncRelations = createAsyncCollectionRepository<CaseRelation>('caseRelations')

type CaseCreateInput = Pick<CaseItem, 'title'> & Partial<Pick<CaseItem, 'id' | 'problem' | 'desiredOutcome' | 'currentPhase' | 'priority' | 'status'>>

function createCaseItem(input: CaseCreateInput): CaseItem {
  const now = Date.now()
  return {
    id: input.id || createEntityId(), title: input.title.trim(), problem: input.problem || '', desiredOutcome: input.desiredOutcome || '',
    status: input.status || 'active', currentPhase: input.currentPhase || 'wood', priority: input.priority || 2,
    createdAt: now, updatedAt: now, phaseNotes: {}, wood: { constraints: '', paths: '' }, decisions: [], reviews: []
  }
}

function sameCase(left: CaseItem, right: CaseItem): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export const caseRepository = {
  list: cases.list,
  find: cases.find,
  create(input: CaseCreateInput): CaseItem { return cases.create(createCaseItem(input)) },
  update(id: string, patch: Partial<Omit<CaseItem, 'id' | 'createdAt'>>): boolean {
    return cases.update(id, item => ({ ...item, ...patch, updatedAt: Date.now() }))
  },
  setPhaseNote(id: string, phase: CasePhase, value: string): boolean {
    return cases.update(id, item => ({ ...item, phaseNotes: { ...item.phaseNotes, [phase]: value }, updatedAt: Date.now() }))
  },
  updateWood(id: string, patch: Partial<CaseItem['wood']>): boolean {
    return cases.update(id, item => ({ ...item, wood: { ...(item.wood || { constraints: '', paths: '' }), ...patch }, updatedAt: Date.now() }))
  },
  addDecision(id: string, input: Omit<CaseDecision, 'id' | 'createdAt'>): boolean {
    return cases.update(id, item => ({ ...item, decisions: [{ id: createEntityId(), createdAt: Date.now(), ...input }, ...(item.decisions || [])], updatedAt: Date.now() }))
  },
  addReview(id: string, content: string): boolean {
    const review: CaseReview = { id: createEntityId(), content, createdAt: Date.now() }
    return cases.update(id, item => ({ ...item, reviews: [review, ...(item.reviews || [])], updatedAt: Date.now() }))
  },
  setStatus(id: string, status: CaseStatus): boolean { return this.update(id, { status }) },
  remove(id: string): boolean {
    const removed = cases.remove(id)
    if (removed) relations.list().filter(item => item.caseId === id).forEach(item => relations.remove(item.id))
    return removed
  }
}

export const caseAsyncRepository = {
  list: asyncCases.list,
  async get(id: string): Promise<CaseItem | undefined> { return asyncCases.find(id) },
  async create(input: CaseCreateInput): Promise<CaseItem> { return asyncCases.create(createCaseItem(input)) },
  update(id: string, patch: Partial<Omit<CaseItem, 'id' | 'createdAt'>>): Promise<boolean> {
    return asyncCases.update(id, item => ({ ...item, ...patch, updatedAt: Date.now() }))
  },
  async importEntity(item: CaseItem): Promise<'created' | 'unchanged'> {
    const current = await asyncCases.find(item.id)
    if (current) {
      if (sameCase(current, item)) return 'unchanged'
      throw new Error('Case ' + item.id + ' has local changes')
    }
    await asyncCases.create(item)
    return 'created'
  },
  async replaceImported(item: CaseItem): Promise<'replaced' | 'unchanged'> {
    const current = await asyncCases.find(item.id)
    if (!current) return (await this.importEntity(item)) === 'created' ? 'replaced' : 'unchanged'
    if (sameCase(current, item)) return 'unchanged'
    if (!await asyncCases.update(item.id, () => item)) throw new Error('Case import target disappeared')
    return 'replaced'
  },
  ready: asyncCases.ready
}

export const caseRelationRepository = {
  listFor(caseId: string): CaseRelation[] { return relations.list().filter(item => item.caseId === caseId) },
  listForTarget(targetType: CaseRelation['targetType'], targetId: string): CaseRelation[] {
    return relations.list().filter(item => item.targetType === targetType && item.targetId === targetId)
  },
  link(caseId: string, targetType: CaseRelation['targetType'], targetId: string, phase?: CasePhase): CaseRelation {
    const exists = this.listFor(caseId).find(item => item.targetType === targetType && item.targetId === targetId)
    if (exists) return exists
    return relations.create({ id: createEntityId(), caseId, targetType, targetId, phase, createdAt: Date.now() })
  },
  unlink(id: string): boolean { return relations.remove(id) },
  unlinkForTarget(targetType: CaseRelation['targetType'], targetId: string): boolean {
    const matches = this.listForTarget(targetType, targetId)
    let changed = false
    for (const relation of matches) changed = relations.remove(relation.id) || changed
    return changed
  }
}

export const caseAsyncRelationRepository = {
  async listFor(caseId: string): Promise<CaseRelation[]> {
    return (await asyncRelations.list()).filter(item => item.caseId === caseId)
  },
  async listForTarget(targetType: CaseRelation['targetType'], targetId: string): Promise<CaseRelation[]> {
    return (await asyncRelations.list()).filter(item => item.targetType === targetType && item.targetId === targetId)
  },
  async link(caseId: string, targetType: CaseRelation['targetType'], targetId: string, phase?: CasePhase): Promise<CaseRelation> {
    const exists = (await asyncRelations.list()).find(item => item.caseId === caseId && item.targetType === targetType && item.targetId === targetId)
    if (exists) return exists
    return asyncRelations.create({ id: createEntityId(), caseId, targetType, targetId, phase, createdAt: Date.now() })
  },
  async unlink(id: string): Promise<boolean> { return asyncRelations.remove(id) },
  async unlinkForTarget(targetType: CaseRelation['targetType'], targetId: string): Promise<boolean> {
    const matches = await this.listForTarget(targetType, targetId)
    let changed = false
    for (const relation of matches) changed = await asyncRelations.remove(relation.id) || changed
    return changed
  },
  ready: asyncRelations.ready
}
