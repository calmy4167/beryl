export const CAPTURE_STATUSES = ['inbox', 'suggested', 'accepted', 'rejected', 'archived'] as const
export type CaptureStatus = typeof CAPTURE_STATUSES[number]

export const SUGGESTION_STATUSES = ['suggested', 'accepted', 'modified', 'rejected', 'expired'] as const
export type SuggestionStatus = typeof SUGGESTION_STATUSES[number]

export const SUGGESTION_ENTITY_TYPES = ['matter', 'action', 'record', 'resource', 'seed'] as const
export type SuggestionEntityType = typeof SUGGESTION_ENTITY_TYPES[number]

export interface CaptureItem {
  calmyId: string
  body: string
  status: CaptureStatus
  suggestionIds: string[]
  createdAt: number
  updatedAt: number
  revision: number
}

export interface SuggestionCandidate {
  entityType: SuggestionEntityType
  label: string
  fields: Record<string, string>
  evidence: string[]
}

export interface AiSuggestion {
  calmyId: string
  captureId: string
  sourceText: string
  candidates: SuggestionCandidate[]
  rationale: string
  confidence: number
  modelVersion: string
  privacyBoundary: 'local-only' | 'network-allowed'
  status: SuggestionStatus
  acceptedEntityType?: SuggestionEntityType
  acceptedEntityId?: string
  createdAt: number
  updatedAt: number
  revision: number
}

export class CaptureDomainError extends Error {
  constructor(public readonly code: 'VALIDATION_FAILED' | 'NOT_FOUND' | 'INVALID_STATUS' | 'REVISION_CONFLICT', message: string) {
    super(message)
    this.name = 'CaptureDomainError'
  }
}
