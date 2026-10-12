import { todayKey } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import { matterAsyncRepository } from '@/domain/matter/repository'
import { recordAsyncRepository } from '@/domain/record/repository'
import { unifiedAsyncRepository, unifiedFactories } from '@/domain/unified'
import { captureAsyncRepository, withCaptureDecisionExclusion, type AcceptedCaptureEntity, type SuggestionEntityType } from '@/domain/capture'
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
  phase: 'started' | 'completed' | 'undone'
  entityType?: SuggestionEntityType
  entityId?: string
  capture?: DecideCaptureResult['capture']
  entity?: AcceptedCaptureEntity
}

const decisionCommands = createAsyncCollectionRepository<CaptureDecisionCommand>('captureDecisionCommands', item => item.id)
let decisionChain: Promise<void> = Promise.resolve()

export interface CaptureDecisionTarget {
  decision: CaptureDecision
  entityType?: SuggestionEntityType
  entityId?: string
}

/** Started/compensated decisions must never appear as navigable history targets. */
export async function findCaptureDecision(captureId: string): Promise<CaptureDecisionTarget | undefined> {
  const command = (await decisionCommands.list()).find(item => item.captureId === captureId && item.phase === 'completed')
  return command ? { decision: command.decision, entityType: command.entityType, entityId: command.entityId } : undefined
}

/** Load completed Capture decisions once when building a full history timeline. */
export async function listCaptureDecisionTargets(): Promise<Map<string, CaptureDecisionTarget>> {
  const commands = await decisionCommands.list()
  const targets = new Map<string, CaptureDecisionTarget>()
  for (const command of commands) {
    if (command.phase !== 'completed' || targets.has(command.captureId)) continue
    targets.set(command.captureId, { decision: command.decision, entityType: command.entityType, entityId: command.entityId })
  }
  return targets
}

export async function completeCaptureDecisionUndo(captureId: string, commandId: string, entityId: string): Promise<void> {
  const command = await decisionCommands.find(commandId)
  if (!command || command.captureId !== captureId || command.decision !== 'action' || command.entityId !== entityId || command.phase === 'started') throw new Error('capture-decision-undo-conflict')
  if (command.phase === 'undone') return
  if (!await decisionCommands.update(commandId, item => ({ ...item, phase: 'undone' }))) throw new Error('capture-decision-command-missing')
}

/** Keep a failed desktop conversion recoverable without returning a stale target. */
export async function recoverDesktopCaptureDecision(captureId: string, commandId: string): Promise<void> {
  const command = await decisionCommands.find(commandId)
  if (!command || command.captureId !== captureId || command.decision !== 'action' || command.phase === 'undone') return
  const current = await captureAsyncRepository.find(captureId)
  const lastHistory = current?.history?.[current.history.length - 1]
  if (!current || current.status !== 'accepted' || !lastHistory?.sourceIds.includes(commandId)) return
  if (command.phase === 'completed') {
    if (!await decisionCommands.update(commandId, item => ({ ...item, phase: 'started' }))) throw new Error('capture-decision-command-missing')
  }
  await captureAsyncRepository.restoreInbox(captureId, current.revision)
}

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
  if (command.phase === 'undone') throw new Error('capture-decision-command-undone')
  if (command.phase !== 'completed' || !command.capture) return undefined
  return { decision, capture: command.capture, entity: command.entity }
}

async function executeDecision(input: DecideCaptureInput): Promise<DecideCaptureResult> {
  const capture = await captureAsyncRepository.find(input.captureId)
  if (!capture) throw new Error(`Capture ${input.captureId} not found`)
  captureAsyncRepository.assertWritable(input.captureId)
  const allCommands = await decisionCommands.list()
  const existingForCapture = allCommands.find(command => command.captureId === input.captureId && command.phase !== 'undone')
  const defaultId = commandIdFor(input)
  const previousUndone = allCommands.some(command => command.id === defaultId && command.phase === 'undone')
  const commandId = input.commandId || (existingForCapture?.decision === input.decision ? existingForCapture.id : previousUndone ? `${defaultId}:revision-${capture.revision}` : defaultId)
  const repeated = await findExistingDecision(commandId, input.captureId, input.decision)
  if (repeated) return repeated

  if (existingForCapture && existingForCapture.id !== commandId) throw new Error('capture-already-decided')
  if (!existingForCapture) {
    await decisionCommands.create({ id: commandId, captureId: input.captureId, decision: input.decision, phase: 'started' })
  }

  const source = await captureAsyncRepository.find(input.captureId)
  if (!source) throw new Error(`Capture ${input.captureId} not found`)
  captureAsyncRepository.assertWritable(input.captureId)
  if (source.body !== capture.body) throw new Error('capture-decision-source-changed')

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
    : await captureAsyncRepository.resolve(input.captureId, input.decision === 'let_go' ? 'archived' : 'accepted', currentCapture.revision, [commandId])
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
  const execute = () => withCaptureDecisionExclusion(input.captureId, () => executeDecision(input))
  const next = decisionChain.then(execute, execute)
  decisionChain = next.then(() => undefined, () => undefined)
  return next
}
