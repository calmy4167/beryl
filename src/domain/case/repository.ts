import { createCollectionRepository, createEntityId } from '@/core/repository'
import type { CaseItem, CasePhase, CaseRelation, CaseStatus } from './model'

const cases = createCollectionRepository<CaseItem>('cases')
const relations = createCollectionRepository<CaseRelation>('caseRelations')

export const caseRepository = {
  list: cases.list,
  find: cases.find,
  create(input: Pick<CaseItem, 'title'> & Partial<Pick<CaseItem, 'problem' | 'desiredOutcome' | 'currentPhase' | 'priority'>>): CaseItem {
    const now = Date.now()
    return cases.create({
      id: createEntityId(), title: input.title.trim(), problem: input.problem || '', desiredOutcome: input.desiredOutcome || '',
      status: 'active', currentPhase: input.currentPhase || 'wood', priority: input.priority || 2,
      createdAt: now, updatedAt: now, phaseNotes: {}
    })
  },
  update(id: string, patch: Partial<Omit<CaseItem, 'id' | 'createdAt'>>): boolean {
    return cases.update(id, item => ({ ...item, ...patch, updatedAt: Date.now() }))
  },
  setPhaseNote(id: string, phase: CasePhase, value: string): boolean {
    return cases.update(id, item => ({ ...item, phaseNotes: { ...item.phaseNotes, [phase]: value }, updatedAt: Date.now() }))
  },
  setStatus(id: string, status: CaseStatus): boolean { return this.update(id, { status }) },
  remove: cases.remove
}

export const caseRelationRepository = {
  listFor(caseId: string): CaseRelation[] { return relations.list().filter(item => item.caseId === caseId) },
  link(caseId: string, targetType: CaseRelation['targetType'], targetId: string, phase?: CasePhase): CaseRelation {
    const exists = this.listFor(caseId).find(item => item.targetType === targetType && item.targetId === targetId)
    if (exists) return exists
    return relations.create({ id: createEntityId(), caseId, targetType, targetId, phase, createdAt: Date.now() })
  },
  unlink(id: string): boolean { return relations.remove(id) }
}
