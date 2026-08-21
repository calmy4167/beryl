import { createCollectionRepository, createEntityId } from '@/core/repository'
import { unifiedRepository, type Cycle, type Stage } from '@/domain/unified'
import { RecordDomainError, type RealityRecord, type RecordCommandMeta, type RecordCreateInput, type RecordRevision, type RecordSource } from './model'

const records = createCollectionRepository<RealityRecord>('realityRecords', item => item.calmyId)
const revisions = createCollectionRepository<RecordRevision>('realityRecordRevisions')

function assertBody(body: string): string {
  const value = body.trim()
  if (!value) throw new RecordDomainError('VALIDATION_FAILED', 'Record body is required')
  return value
}

function assertRevision(record: RealityRecord, expectedRevision?: number): void {
  if (expectedRevision !== undefined && expectedRevision !== record.revision) {
    throw new RecordDomainError('REVISION_CONFLICT', `Record ${record.calmyId} is at revision ${record.revision}`)
  }
}

function sourceContext(input: RecordCreateInput): Pick<RealityRecord, 'matterId' | 'cycleId' | 'stageId'> {
  if (input.stageId) {
    const stage = unifiedRepository.find<Stage>('stage', input.stageId)
    if (!stage) throw new RecordDomainError('NOT_FOUND', `Stage ${input.stageId} not found`)
    if (input.cycleId && input.cycleId !== stage.cycleId) {
      throw new RecordDomainError('VALIDATION_FAILED', `Stage ${input.stageId} does not belong to Cycle ${input.cycleId}`)
    }
    const cycle = unifiedRepository.find<Cycle>('cycle', stage.cycleId)
    if (!cycle) throw new RecordDomainError('NOT_FOUND', `Cycle ${stage.cycleId} not found`)
    if (input.matterId && input.matterId !== cycle.matterId) {
      throw new RecordDomainError('VALIDATION_FAILED', `Stage ${input.stageId} does not belong to Matter ${input.matterId}`)
    }
    return { matterId: input.matterId || cycle.matterId, cycleId: cycle.calmyId, stageId: stage.calmyId }
  }
  if (input.cycleId) {
    const cycle = unifiedRepository.find<Cycle>('cycle', input.cycleId)
    if (!cycle) throw new RecordDomainError('NOT_FOUND', `Cycle ${input.cycleId} not found`)
    if (input.matterId && input.matterId !== cycle.matterId) {
      throw new RecordDomainError('VALIDATION_FAILED', `Cycle ${input.cycleId} does not belong to Matter ${input.matterId}`)
    }
    return { matterId: input.matterId || cycle.matterId, cycleId: cycle.calmyId }
  }
  return { matterId: input.matterId }
}

function actorFor(source: RecordSource): 'user' | 'ai_assisted' | 'import' | 'sync' {
  return source === 'ai' ? 'ai_assisted' : source
}

function appendRevision(record: RealityRecord, reason: string, actor: RecordSource, changedAt: number, actorId = 'local-user'): void {
  revisions.create({
    id: createEntityId(), recordId: record.calmyId, revision: record.revision, body: record.body,
    matterId: record.matterId, cycleId: record.cycleId, stageId: record.stageId, actionId: record.actionId,
    reason, actor, actorId, changedAt
  })
}

function attachRecordToStage(record: RealityRecord): void {
  if (!record.stageId) return
  const stage = unifiedRepository.find<Stage>('stage', record.stageId)
  if (!stage || stage.recordIds.includes(record.calmyId)) return
  unifiedRepository.update<Stage>('stage', stage.calmyId, { recordIds: [...stage.recordIds, record.calmyId] }, {
    expectedRevision: stage.revision, actor: actorFor(record.source), sourceIds: [record.calmyId]
  })
}

function detachRecordFromStage(recordId: string, stageId?: string): void {
  if (!stageId) return
  const stage = unifiedRepository.find<Stage>('stage', stageId)
  if (!stage || !stage.recordIds.includes(recordId)) return
  unifiedRepository.update<Stage>('stage', stage.calmyId, { recordIds: stage.recordIds.filter(id => id !== recordId) }, {
    expectedRevision: stage.revision, sourceIds: [recordId]
  })
}

export const recordRepository = {
  list(): RealityRecord[] { return records.list().slice().sort((a, b) => b.occurredAt - a.occurredAt) },
  listForMatter(matterId: string): RealityRecord[] { return this.list().filter(item => item.matterId === matterId) },
  listForCycle(cycleId: string): RealityRecord[] { return this.list().filter(item => item.cycleId === cycleId) },
  listForStage(stageId: string): RealityRecord[] {
    const stage = unifiedRepository.find<Stage>('stage', stageId)
    return this.list().filter(item => item.stageId === stageId || !!stage?.recordIds.includes(item.calmyId))
  },
  find(calmyId: string): RealityRecord | undefined { return records.find(calmyId) },
  importEntity(item: RealityRecord): 'created' | 'unchanged' {
    const current = records.find(item.calmyId)
    if (current) {
      if (JSON.stringify(current) === JSON.stringify(item)) return 'unchanged'
      throw new RecordDomainError('REVISION_CONFLICT', 'Record ' + item.calmyId + ' has local changes')
    }
    records.create(item)
    appendRevision(item, 'imported', 'import', item.updatedAt, 'import')
    attachRecordToStage(item)
    return 'created'
  },
  replaceImported(item: RealityRecord): 'replaced' | 'unchanged' {
    const current = records.find(item.calmyId)
    if (!current) return this.importEntity(item) === 'created' ? 'replaced' : 'unchanged'
    if (JSON.stringify(current) === JSON.stringify(item)) return 'unchanged'
    if (!records.update(item.calmyId, () => item)) throw new RecordDomainError('NOT_FOUND', 'Record import target disappeared')
    if (current.stageId !== item.stageId) detachRecordFromStage(item.calmyId, current.stageId)
    appendRevision(item, 'import-replaced', 'import', item.updatedAt, 'import')
    attachRecordToStage(item)
    return 'replaced'
  },
  revisions(calmyId: string): RecordRevision[] {
    return revisions.list().filter(item => item.recordId === calmyId).sort((a, b) => a.revision - b.revision)
  },
  history(calmyId: string): RecordRevision[] { return this.revisions(calmyId) },
  replay(calmyId: string): RecordRevision[] { return this.revisions(calmyId) },
  create(input: RecordCreateInput, meta: RecordCommandMeta = {}): RealityRecord {
    const now = Date.now()
    const type = input.type || 'fact'
    const source = input.source || 'user'
    const evidenceIds = input.evidenceIds || []
    if (type === 'observation' && source === 'ai' && evidenceIds.length === 0) {
      throw new RecordDomainError('VALIDATION_FAILED', 'AI observations require evidenceIds')
    }
    const sourceContextValue = sourceContext(input)
    const record: RealityRecord = {
      calmyId: createEntityId(), type, body: assertBody(input.body), occurredAt: input.occurredAt || now,
      createdAt: now, updatedAt: now, ...sourceContextValue, actionId: input.actionId,
      source, evidenceIds, revision: 1, impact: type === 'negative' ? input.impact || 'other' : undefined
    }
    records.create(record)
    appendRevision(record, 'created', source, now, meta.actorId)
    attachRecordToStage(record)
    return record
  },
  createNegative(input: Omit<RecordCreateInput, 'type'> & { impact: NonNullable<RecordCreateInput['impact']> }): RealityRecord {
    return this.create({ ...input, type: 'negative' })
  },
  revise(calmyId: string, body: string, reason: string, actor: RecordSource = 'user', expectedRevision?: number, actorId = 'local-user'): RealityRecord {
    const current = records.find(calmyId)
    if (!current) throw new RecordDomainError('NOT_FOUND', `Record ${calmyId} not found`)
    assertRevision(current, expectedRevision)
    const now = Date.now()
    const next: RealityRecord = { ...current, body: assertBody(body), updatedAt: now, revision: current.revision + 1 }
    records.update(calmyId, () => next)
    appendRevision(next, reason.trim() || 'revised', actor, now, actorId)
    return next
  },
  redact(calmyId: string, reason: string, expectedRevision?: number, actorId = 'local-user'): RealityRecord {
    const current = records.find(calmyId)
    if (!current) throw new RecordDomainError('NOT_FOUND', `Record ${calmyId} not found`)
    assertRevision(current, expectedRevision)
    const now = Date.now()
    const next: RealityRecord = { ...current, body: '[已隐藏]', redactedAt: now, updatedAt: now, revision: current.revision + 1 }
    records.update(calmyId, () => next)
    appendRevision(next, reason.trim() || 'redacted', 'user', now, actorId)
    return next
  }
}
