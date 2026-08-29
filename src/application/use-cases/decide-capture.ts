import { todayKey } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import { matterAsyncRepository } from '@/domain/matter/repository'
import { recordAsyncRepository } from '@/domain/record/repository'
import { unifiedAsyncRepository, unifiedFactories } from '@/domain/unified'
import { captureAsyncRepository, type AcceptedCaptureEntity, type SuggestionEntityType } from '@/domain/capture'
import { createAsyncCollectionRepository } from '@/core/repository'

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

interface CaptureDecisionCommand {
  id: string
  captureId: string
  decision: CaptureDecision
  phase: 'started' | 'completed'
  entityType?: SuggestionEntityType
  entityId?: string
  capture?: DecideCaptureResult['capture']
  entity?: AcceptedCaptureEntity
}

const decisionCommands = createAsyncCollectionRepository<CaptureDecisionCommand>('captureDecisionCommands', item => item.id)
let decisionChain: Promise<void> = Promise.resolve()

function firstLine(body: string): string {
  return body.split(/\r?\n/, 1)[0].trim().slice(0, 120) || '未命名现实事项'
}

function commandIdFor(input: DecideCaptureInput): string {
  // Revision 会在一次成功决策后改变，不能把它放入默认命令号；否则重试
  // 会被当成另一条跨集合命令，重新创建实体。
  return input.commandId || `capture-decision:${input.captureId}:${input.decision}`
}

function entityTypeOf(entity: AcceptedCaptureEntity | undefined): SuggestionEntityType | undefined {
  if (!entity) return undefined
  if ('entityType' in entity && (entity.entityType === 'resource' || entity.entityType === 'seed')) return entity.entityType
  if ('body' in entity) return 'record'
  if ('title' in entity && 'date' in entity) return 'action'
  if ('title' in entity && 'status' in entity) return 'matter'
  return undefined
}

async function findExistingDecision(commandId: string, captureId: string, decision: CaptureDecision): Promise<DecideCaptureResult | undefined> {
  const command = await decisionCommands.find(commandId)
  if (!command) return undefined
  if (command.captureId !== captureId || command.decision !== decision) throw new Error('capture-decision-command-conflict')
  if (command.phase !== 'completed' || !command.capture) return undefined
  return { decision, capture: command.capture, entity: command.entity }
}

async function executeDecision(input: DecideCaptureInput): Promise<DecideCaptureResult> {
  const capture = await captureAsyncRepository.find(input.captureId)
  if (!capture) throw new Error(`Capture ${input.captureId} not found`)
  const commandId = commandIdFor(input)
  const repeated = await findExistingDecision(commandId, input.captureId, input.decision)
  if (repeated) return repeated

  const existingForCapture = (await decisionCommands.list()).find(command => command.captureId === input.captureId)
  if (existingForCapture && existingForCapture.id !== commandId) throw new Error('capture-already-decided')
  if (!existingForCapture) {
    await decisionCommands.create({ id: commandId, captureId: input.captureId, decision: input.decision, phase: 'started' })
  }

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

  const currentCapture = await captureAsyncRepository.find(input.captureId)
  if (!currentCapture) throw new Error(`Capture ${input.captureId} not found`)
  const resolved = currentCapture.status === 'accepted' || currentCapture.status === 'archived'
    ? currentCapture
    : await captureAsyncRepository.resolve(input.captureId, input.decision === 'let_go' ? 'archived' : 'accepted', currentCapture.revision)
  const result = { decision: input.decision, capture: resolved, entity }
  const completed = await decisionCommands.update(commandId, current => ({ ...current, phase: 'completed', entityType: entityTypeOf(entity), entityId: entity && 'calmyId' in entity ? entity.calmyId : undefined, capture: resolved, entity }))
  if (!completed) throw new Error('capture-decision-command-missing')
  return result
}

/**
 * Capture 的 Attention Gate：原文已经先保存，用户再决定它要不要进入行动、事项、记录、Seed，或直接放下。
 * 各实体仍写入现有 Repository；同一个 commandId 可安全重试，不建立新的 Capture/Memory 事实源。
 */
export async function decideCapture(input: DecideCaptureInput): Promise<DecideCaptureResult> {
  const next = decisionChain.then(() => executeDecision(input), () => executeDecision(input))
  decisionChain = next.then(() => undefined, () => undefined)
  return next
}
