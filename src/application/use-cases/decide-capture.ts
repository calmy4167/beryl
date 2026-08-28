import { todayKey } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import { matterAsyncRepository } from '@/domain/matter/repository'
import { recordAsyncRepository } from '@/domain/record/repository'
import { unifiedAsyncRepository, unifiedFactories } from '@/domain/unified'
import { captureAsyncRepository, type AcceptedCaptureEntity } from '@/domain/capture'

export type CaptureDecision = 'action' | 'matter' | 'record' | 'seed' | 'let_go'

export interface DecideCaptureInput {
  captureId: string
  decision: CaptureDecision
  title?: string
  commandId?: string
}

export interface DecideCaptureResult {
  decision: CaptureDecision
  capture: Awaited<ReturnType<typeof captureAsyncRepository.resolve>>
  entity?: AcceptedCaptureEntity
}

function firstLine(body: string): string {
  return body.split(/\r?\n/, 1)[0].trim().slice(0, 120) || '未命名现实事项'
}

function commandIdFor(input: DecideCaptureInput, revision: number): string {
  return input.commandId || `capture-decision:${input.captureId}:${revision}:${input.decision}`
}

/**
 * Capture 的 Attention Gate：原文已经先保存，用户再决定它要不要进入行动、事项、记录、Seed，或直接放下。
 * 各实体仍写入现有 Repository；同一个 commandId 可安全重试，不建立新的 Capture/Memory 事实源。
 */
export async function decideCapture(input: DecideCaptureInput): Promise<DecideCaptureResult> {
  const capture = await captureAsyncRepository.find(input.captureId)
  if (!capture) throw new Error(`Capture ${input.captureId} not found`)
  const commandId = commandIdFor(input, capture.revision)
  const sourceIds = [capture.calmyId]
  let entity: AcceptedCaptureEntity | undefined

  if (input.decision === 'action') {
    entity = await actionAsyncRepository.create({ title: input.title?.trim() || firstLine(capture.body), date: todayKey() }, { commandId, sourceIds })
  } else if (input.decision === 'matter') {
    entity = await matterAsyncRepository.create({ title: input.title?.trim() || firstLine(capture.body), why: capture.body }, { commandId, sourceIds })
  } else if (input.decision === 'record') {
    entity = await recordAsyncRepository.create({ body: capture.body, type: 'fact', evidenceIds: sourceIds }, { commandId, sourceIds })
  } else if (input.decision === 'seed') {
    entity = await unifiedAsyncRepository.create(unifiedFactories.seed({ title: input.title?.trim() || firstLine(capture.body), body: capture.body, status: 'open', sourceRecordIds: [], targetMatterIds: [], tags: [] }), { commandId, sourceIds })
  }

  const resolved = await captureAsyncRepository.resolve(input.captureId, input.decision === 'let_go' ? 'archived' : 'accepted', capture.revision)
  return { decision: input.decision, capture: resolved, entity }
}
