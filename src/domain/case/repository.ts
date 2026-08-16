import { createCollectionRepository, createEntityId } from '@/core/repository'
import type { CaseDecision, CaseItem, CasePhase, CaseRelation, CaseReview, CaseStatus } from './model'

const cases = createCollectionRepository<CaseItem>('cases')
const relations = createCollectionRepository<CaseRelation>('caseRelations')

export const caseRepository = {
  list: cases.list,
  find: cases.find,
  create(input: Pick<CaseItem, 'title'> & Partial<Pick<CaseItem, 'problem' | 'desiredOutcome' | 'currentPhase' | 'priority' | 'status'>>): CaseItem {
    const now = Date.now()
    return cases.create({
      id: createEntityId(), title: input.title.trim(), problem: input.problem || '', desiredOutcome: input.desiredOutcome || '',
      status: input.status || 'active', currentPhase: input.currentPhase || 'wood', priority: input.priority || 2,
      createdAt: now, updatedAt: now, phaseNotes: {}, wood: { constraints: '', paths: '' }, decisions: [], reviews: []
    })
  },
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
