import { createAsyncCollectionRepository, createEntityId } from '@/core/repository'
import { captureAsyncRepository, type CaptureItem } from '@/domain/capture'
import { actionAsyncRepository } from '@/domain/action/repository'
import { captureText, suggestCapturedText, type CaptureTextResult } from './capture-text'
import { completeCaptureDecisionUndo, decideCapture, listCaptureDecisionTargets, recoverDesktopCaptureDecision, type CaptureDecision, type DecideCaptureResult } from './decide-capture'

export interface SaveDesktopEntryInput { operationId: string; body: string }
export interface UpgradeDesktopEntryInput { operationId: string }
export interface UndoDesktopEntryInput { operationId: string }
export interface DesktopCaptureHistoryItem { capture: CaptureItem; decision?: CaptureDecision; entityId?: string }

interface DesktopEntryCommand {
  id: string
  operationId: string
  captureId: string
  actionId?: string
  decisionCommandId: string
  body: string
  kind: 'capture' | 'action'
  createdAt: number
  completedAt?: number
  phase: 'started' | 'completed' | 'undo-started' | 'undone'
  saveResult?: CaptureTextResult
  upgradeResult?: DecideCaptureResult
  undoStep?: 'locked' | 'action-removed' | 'capture-compensated' | 'decision-compensated'
}

const commands = createAsyncCollectionRepository<DesktopEntryCommand>('desktopEntryCommands')
const UNDO_WINDOW_MS = 4000
let desktopChain: Promise<void> = Promise.resolve()

function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = desktopChain.then(work, work)
  desktopChain = next.then(() => undefined, () => undefined)
  return next
}

function operationId(value: string): string {
  if (!value.trim()) throw new Error('desktop-operation-id-required')
  return value
}

async function requiredCommand(id: string): Promise<DesktopEntryCommand> {
  const command = await commands.find(operationId(id))
  if (!command) throw new Error('desktop-operation-not-found')
  return command
}

async function persist(command: DesktopEntryCommand, patch: Partial<DesktopEntryCommand>): Promise<DesktopEntryCommand> {
  const next = { ...command, ...patch }
  if (!await commands.update(command.id, () => next)) throw new Error('desktop-operation-not-found')
  return next
}

function assertActive(command: DesktopEntryCommand): void {
  if (command.phase === 'undo-started') throw new Error('desktop-undo-pending')
  if (command.phase === 'undone') throw new Error('desktop-operation-undone')
}

function portableResult(result: CaptureTextResult): CaptureTextResult {
  return { capture: result.capture, ...(result.suggestion ? { suggestion: result.suggestion } : {}),
    ...(result.suggestionError !== undefined ? { suggestionError: result.suggestionError instanceof Error ? result.suggestionError.message : String(result.suggestionError) } : {}) }
}

function withDeferredSuggestion(id: string, saved: CaptureTextResult): CaptureTextResult {
  if (saved.suggestion || saved.suggestionError !== undefined) return saved
  const completion = suggestCapturedText(saved.capture, { captureId: saved.capture.calmyId }).then(async result => {
    const portable = portableResult(result)
    await commands.update(id, command => command.phase === 'completed' && command.kind === 'capture'
      ? { ...command, saveResult: portable } : command)
    return portable
  }).catch(suggestionError => ({ ...saved, suggestionError }))
  return { ...saved, suggestionCompletion: completion }
}

function captureBeforeUndo(command: DesktopEntryCommand, current: CaptureItem | undefined, original: CaptureItem): CaptureItem {
  if (!current) throw new Error('desktop-undo-capture-changed')
  if (JSON.stringify(current) === JSON.stringify(original)) return current
  const laterHistory = current.history?.slice(original.history?.length || 0) || []
  const ownSuggestionId = `capture-suggestion:${command.captureId}`
  if (command.kind === 'capture' && current.body === original.body && current.createdAt === original.createdAt
    && JSON.stringify(current.sourceMaterialIds) === JSON.stringify(original.sourceMaterialIds)
    && (current.status === 'inbox' || current.status === 'suggested')
    && JSON.stringify(current.history?.slice(0, original.history?.length || 0) || []) === JSON.stringify(original.history || [])
    && current.revision === original.revision + laterHistory.length && laterHistory.length > 0
    && laterHistory.every(entry => entry.operation === 'suggested' && entry.source === 'ai_assisted' && entry.sourceIds.length === 1 && entry.sourceIds[0] === ownSuggestionId)) return current
  throw new Error('desktop-undo-capture-changed')
}

/** Reserve the Capture ID durably before calling the existing Capture use case. */
export function saveDesktopEntry(input: SaveDesktopEntryInput): Promise<CaptureTextResult> {
  return serialize(async () => {
    const id = operationId(input.operationId)
    const body = input.body.trim()
    if (!body) throw new Error('desktop-entry-body-required')
    let command = await commands.find(id)
    if (command) {
      if (command.body !== body) throw new Error('desktop-operation-command-conflict')
      assertActive(command)
      if (command.saveResult) return command.saveResult
    } else {
      command = await commands.create({ id, operationId: id, captureId: createEntityId(), decisionCommandId: `desktop-action:${id}`, body, kind: 'capture', createdAt: Date.now(), phase: 'started' })
    }
    const result = await captureText(body, [], { captureId: command.captureId, deferSuggestion: true })
    const savedResult = portableResult(result)
    await persist(command, { saveResult: savedResult, phase: 'completed', completedAt: Date.now() })
    return savedResult
  }).then(result => withDeferredSuggestion(input.operationId, result))
}

/** The same decision command creates at most one Action, even after an interruption. */
export function upgradeDesktopEntry(input: UpgradeDesktopEntryInput): Promise<DecideCaptureResult> {
  return serialize(async () => {
    let command = await requiredCommand(input.operationId)
    assertActive(command)
    if (command.upgradeResult) return command.upgradeResult
    if (!command.saveResult) throw new Error('desktop-entry-save-not-completed')
    if (command.kind !== 'action') command = await persist(command, { kind: 'action', phase: 'started' })
    try {
      const result = await decideCapture({ captureId: command.captureId, decision: 'action', commandId: command.decisionCommandId })
      const actionId = result.entity?.calmyId
      if (!actionId) throw new Error('desktop-action-result-missing')
      await persist(command, { actionId, upgradeResult: result, phase: 'completed', completedAt: Date.now() })
      return result
    } catch (error) {
      await recoverDesktopCaptureDecision(command.captureId, command.decisionCommandId)
      throw error
    }
  })
}

/** Begin in the success window; once begun, recovery is allowed after that window. */
export function undoDesktopEntry(input: UndoDesktopEntryInput): Promise<void> {
  return serialize(async () => {
    let command = await requiredCommand(input.operationId)
    if (command.phase === 'undone') return
    const compensationId = `desktop-undo:${command.operationId}`
    let original = command.kind === 'action' ? command.upgradeResult?.capture : command.saveResult?.capture
    if (!original) throw new Error('desktop-operation-not-completed')
    if (command.phase !== 'undo-started') {
      if (command.phase !== 'completed' || command.completedAt === undefined || Date.now() - command.completedAt > UNDO_WINDOW_MS || Date.now() < command.completedAt) throw new Error('desktop-undo-window-expired')
      original = captureBeforeUndo(command, await captureAsyncRepository.find(command.captureId), original)
      if (command.kind === 'action') {
        if (!command.actionId) throw new Error('desktop-action-result-missing')
        await actionAsyncRepository.validateDesktopUndo(command.actionId, command.decisionCommandId, command.captureId)
      }
      command = await persist(command, { phase: 'undo-started', ...(command.kind === 'capture' ? { saveResult: { ...command.saveResult!, capture: original } } : {}) })
    }
    try {
      await captureAsyncRepository.beginDesktopUndo(command.captureId, original.revision, compensationId, command.kind === 'action' ? 'restore' : 'remove')
      if (!command.undoStep) command = await persist(command, { undoStep: 'locked' })
      if (command.undoStep === 'locked') await captureAsyncRepository.validateDesktopUndo(command.captureId, original, compensationId)
      if (command.kind === 'action') {
        const actionId = command.actionId
        if (!actionId) throw new Error('desktop-action-result-missing')
        if (command.undoStep === 'locked') {
          await actionAsyncRepository.removeDesktopCreated(actionId, command.decisionCommandId, command.captureId, compensationId)
          command = await persist(command, { undoStep: 'action-removed' })
        }
        if (command.undoStep === 'action-removed') {
          await captureAsyncRepository.restoreInbox(command.captureId, original.revision, compensationId)
          command = await persist(command, { undoStep: 'capture-compensated' })
        }
        if (command.undoStep === 'capture-compensated') {
          await completeCaptureDecisionUndo(command.captureId, command.decisionCommandId, actionId)
          command = await persist(command, { undoStep: 'decision-compensated' })
        }
      } else if (command.undoStep === 'locked') {
        await captureAsyncRepository.removeDesktopCreated(command.captureId, original.revision, compensationId)
        command = await persist(command, { undoStep: 'capture-compensated' })
      }
      if (command.kind === 'action') await actionAsyncRepository.finishDesktopUndo(compensationId)
      await captureAsyncRepository.finishDesktopUndo(compensationId)
      await persist(command, { phase: 'undone' })
    } catch (error) {
      // Release only pre-deletion attempts. Missing/removed originals retain guards.
      const actionSafe = command.kind !== 'action' || await actionAsyncRepository.abortDesktopUndo(compensationId)
      if (actionSafe && await captureAsyncRepository.abortDesktopUndo(compensationId)) {
        await persist(command, { phase: 'completed', undoStep: undefined })
      }
      throw error
    }
  })
}

export async function listDesktopCaptureHistory(): Promise<DesktopCaptureHistoryItem[]> {
  const [captures, decisions] = await Promise.all([captureAsyncRepository.list(), listCaptureDecisionTargets()])
  return captures.sort((a, b) => a.createdAt - b.createdAt).map(capture => {
    const target = decisions.get(capture.calmyId)
    return { capture, ...(target ? { decision: target.decision, entityId: target.entityId } : {}) }
  })
}
