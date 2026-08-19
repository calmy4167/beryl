import { createCollectionRepository, createEntityId } from '@/core/repository'
import { RecordDomainError, type RealityRecord, type RecordCreateInput, type RecordRevision, type RecordSource } from './model'

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

export const recordRepository = {
  list(): RealityRecord[] { return records.list().slice().sort((a, b) => b.occurredAt - a.occurredAt) },
  find(calmyId: string): RealityRecord | undefined { return records.find(calmyId) },
  importEntity(item: RealityRecord): 'created' | 'unchanged' {
    const current = records.find(item.calmyId)
    if (current) {
      if (JSON.stringify(current) === JSON.stringify(item)) return 'unchanged'
      throw new RecordDomainError('REVISION_CONFLICT', 'Record ' + item.calmyId + ' has local changes')
    }
    records.create(item)
    revisions.create({ id: createEntityId(), recordId: item.calmyId, revision: item.revision, body: item.body, reason: 'imported', actor: 'import', changedAt: item.updatedAt })
    return 'created'
  },
  revisions(calmyId: string): RecordRevision[] {
    return revisions.list().filter(item => item.recordId === calmyId).sort((a, b) => a.revision - b.revision)
  },
  create(input: RecordCreateInput): RealityRecord {
    const now = Date.now()
    const type = input.type || 'fact'
    const source = input.source || 'user'
    const evidenceIds = input.evidenceIds || []
    if (type === 'observation' && source === 'ai' && evidenceIds.length === 0) {
      throw new RecordDomainError('VALIDATION_FAILED', 'AI observations require evidenceIds')
    }
    const record: RealityRecord = {
      calmyId: createEntityId(), type, body: assertBody(input.body), occurredAt: input.occurredAt || now,
      createdAt: now, updatedAt: now, matterId: input.matterId, actionId: input.actionId,
      source, evidenceIds, revision: 1
    }
    records.create(record)
    revisions.create({ id: createEntityId(), recordId: record.calmyId, revision: 1, body: record.body, reason: 'created', actor: source, changedAt: now })
    return record
  },
  revise(calmyId: string, body: string, reason: string, actor: RecordSource = 'user', expectedRevision?: number): RealityRecord {
    const current = records.find(calmyId)
    if (!current) throw new RecordDomainError('NOT_FOUND', `Record ${calmyId} not found`)
    assertRevision(current, expectedRevision)
    const now = Date.now()
    const next: RealityRecord = { ...current, body: assertBody(body), updatedAt: now, revision: current.revision + 1 }
    records.update(calmyId, () => next)
    revisions.create({ id: createEntityId(), recordId: next.calmyId, revision: next.revision, body: next.body, reason: reason.trim() || 'revised', actor, changedAt: now })
    return next
  },
  redact(calmyId: string, reason: string, expectedRevision?: number): RealityRecord {
    const current = records.find(calmyId)
    if (!current) throw new RecordDomainError('NOT_FOUND', `Record ${calmyId} not found`)
    assertRevision(current, expectedRevision)
    const now = Date.now()
    const next: RealityRecord = { ...current, body: '[已隐藏]', redactedAt: now, updatedAt: now, revision: current.revision + 1 }
    records.update(calmyId, () => next)
    revisions.create({ id: createEntityId(), recordId: next.calmyId, revision: next.revision, body: next.body, reason: reason.trim() || 'redacted', actor: 'user', changedAt: now })
    return next
  }
}
