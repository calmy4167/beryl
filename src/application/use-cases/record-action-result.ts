import { actionAsyncRepository } from '@/domain/action/repository'
import { ActionDomainError, type ActionItem } from '@/domain/action/model'
import { recordAsyncRepository } from '@/domain/record/repository'
import { RecordDomainError, type RealityRecord, type RecordType, type NegativeRecordImpact } from '@/domain/record/model'

export interface RecordActionResultInput {
  actionId: string
  recordBody: string
  resultNote?: string
  recordType?: RecordType
  impact?: NegativeRecordImpact
  occurredAt?: number
  expectedActionRevision?: number
  commandId?: string
}

export interface RecordActionResultResult {
  action: ActionItem
  record?: RealityRecord
  recordError?: unknown
}

export async function recordActionResult(input: RecordActionResultInput): Promise<RecordActionResultResult> {
  const current = await actionAsyncRepository.find(input.actionId)
  if (!current) throw new ActionDomainError('NOT_FOUND', `Action ${input.actionId} not found`)
  const body = input.recordBody.trim()
  if (!body) throw new RecordDomainError('VALIDATION_FAILED', 'Record body is required')

  const action = await actionAsyncRepository.complete(input.actionId, input.resultNote, input.expectedActionRevision, { commandId: input.commandId })

  try {
    const record = await recordAsyncRepository.create({
      body,
      type: input.recordType || 'fact',
      impact: input.impact,
      occurredAt: input.occurredAt,
      actionId: action.calmyId,
      ...(action.matterId ? { matterId: action.matterId } : {}),
      ...(action.cycleId ? { cycleId: action.cycleId } : {})
    }, { commandId: input.commandId })
    return { action, record }
  } catch (recordError) {
    return { action, recordError }
  }
}
