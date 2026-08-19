export const RECORD_TYPES = ['fact', 'observation', 'insight', 'seed', 'review'] as const
export type RecordType = typeof RECORD_TYPES[number]

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
  actionId?: string
  source: RecordSource
  evidenceIds: string[]
  revision: number
  redactedAt?: number
}

export interface RecordCreateInput {
  type?: RecordType
  body: string
  occurredAt?: number
  matterId?: string
  actionId?: string
  source?: RecordSource
  evidenceIds?: string[]
}

export interface RecordRevision {
  id: string
  recordId: string
  revision: number
  body: string
  reason: string
  actor: RecordSource
  changedAt: number
}

export class RecordDomainError extends Error {
  constructor(public readonly code: 'VALIDATION_FAILED' | 'NOT_FOUND' | 'REVISION_CONFLICT', message: string) {
    super(message)
    this.name = 'RecordDomainError'
  }
}
