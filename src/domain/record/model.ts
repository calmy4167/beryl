export const RECORD_TYPES = ['fact', 'observation', 'insight', 'seed', 'review', 'negative'] as const
export type RecordType = typeof RECORD_TYPES[number]

export const NEGATIVE_RECORD_IMPACTS = ['waste', 'escape', 'retreat', 'loss', 'other'] as const
export type NegativeRecordImpact = typeof NEGATIVE_RECORD_IMPACTS[number]

export const RECORD_SOURCES = ['user', 'ai', 'import', 'sync'] as const
export type RecordSource = typeof RECORD_SOURCES[number]

export interface RealityRecord {
  calmyId: string
  type: RecordType
  body: string
  occurredAt: number
  createdAt: number
  updatedAt: number
  matterId?: string
  cycleId?: string
  stageId?: string
  actionId?: string
  source: RecordSource
  evidenceIds: string[]
  revision: number
  impact?: NegativeRecordImpact
  redactedAt?: number
}

export interface RecordCreateInput {
  type?: RecordType
  body: string
  occurredAt?: number
  matterId?: string
  cycleId?: string
  stageId?: string
  actionId?: string
  source?: RecordSource
  evidenceIds?: string[]
  impact?: NegativeRecordImpact
}

export interface RecordCommandMeta {
  commandId?: string
  actor?: RecordSource
  actorId?: string
  sourceIds?: string[]
  expectedRevision?: number
}

export interface RecordRevision {
  id: string
  recordId: string
  revision: number
  body: string
  matterId?: string
  cycleId?: string
  stageId?: string
  actionId?: string
  reason: string
  actor: RecordSource
  actorId?: string
  changedAt: number
}

export class RecordDomainError extends Error {
  constructor(public readonly code: 'VALIDATION_FAILED' | 'NOT_FOUND' | 'REVISION_CONFLICT', message: string) {
    super(message)
    this.name = 'RecordDomainError'
  }
}
