import { createAsyncCollectionRepository } from '@/core/repository'
import { caseAsyncRelationRepository, caseAsyncRepository } from '@/domain/case/repository'
import type { CasePhase, CaseRelation, CaseItem } from '@/domain/case/model'

export interface LegacyInboxItem {
  id?: string
  text?: string
  date?: string
}

export interface LegacyTaskItem {
  id?: string
  title?: string
  priority?: string
  date?: string
  done?: boolean
}

export interface LegacyInboxTarget {
  id?: string
  sourceIndex?: number
}

export interface LegacyInboxRemovalResult {
  removed: LegacyInboxItem
  index: number
}

export interface ConvertLegacyInboxResult extends LegacyInboxRemovalResult {
  task?: LegacyTaskItem
  case?: CaseItem
}

const legacyInboxRepository = createAsyncCollectionRepository<LegacyInboxItem>('inbox', item => item.id)
const legacyTasksRepository = createAsyncCollectionRepository<LegacyTaskItem>('tasks', item => item.id)
const commandRepository = createAsyncCollectionRepository<{ id: string; result: unknown }>('applicationCommands', item => item.id)
const financeLinkCommandPrefix = 'finance-link:'

function requiredCommandId(commandId: string): string {
  const value = commandId.trim()
  if (!value) throw new Error('commandId is required')
  return value
}

function stableLegacyId(commandId: string, kind: 'task' | 'case'): string {
  return `legacy-${kind}:${commandId}`
}

async function commandResult<T>(commandId: string): Promise<T | undefined> {
  return (await commandRepository.find(commandId))?.result as T | undefined
}

async function saveCommand<T>(commandId: string, result: T): Promise<T> {
  await commandRepository.create({ id: commandId, result })
  return result
}

async function removeLegacyInboxItem(target: LegacyInboxTarget): Promise<LegacyInboxRemovalResult> {
  const items = await legacyInboxRepository.list()
  const idIndex = target.id ? items.findIndex(item => String(item.id) === target.id) : -1
  const index = idIndex >= 0 ? idIndex : target.sourceIndex ?? -1
  if (index < 0 || index >= items.length) throw new Error('legacy-inbox-not-found')
  const [removed] = items.splice(index, 1)
  if (!removed || !await legacyInboxRepository.replace(items)) throw new Error('legacy-inbox-remove-failed')
  return { removed, index }
}

const conversionChains = new Map<string, Promise<unknown>>()

function serial<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = conversionChains.get(key) || Promise.resolve()
  const next = previous.then(work, work)
  conversionChains.set(key, next.catch(() => undefined))
  return next
}

export async function removeLegacyInbox(target: LegacyInboxTarget, commandId: string): Promise<LegacyInboxRemovalResult> {
  const id = requiredCommandId(commandId)
  return serial(id, async () => {
    const duplicate = await commandResult<LegacyInboxRemovalResult>(id)
    if (duplicate) return duplicate
    return saveCommand(id, await removeLegacyInboxItem(target))
  })
}

export async function convertLegacyInboxToTask(
  target: LegacyInboxTarget,
  text: string,
  commandId: string,
  taskInput: Pick<LegacyTaskItem, 'priority' | 'date'>,
): Promise<ConvertLegacyInboxResult> {
  const id = requiredCommandId(commandId)
  return serial(id, async () => {
    const duplicate = await commandResult<ConvertLegacyInboxResult>(id)
    if (duplicate) return duplicate
    const taskId = stableLegacyId(id, 'task')
    let task = await legacyTasksRepository.find(taskId)
    if (!task) {
      task = await legacyTasksRepository.create({ id: taskId, title: text, priority: taskInput.priority, date: taskInput.date, done: false })
    }
    const removed = await removeLegacyInboxItem(target)
    return saveCommand(id, { ...removed, task })
  })
}

export async function convertLegacyInboxToCase(
  target: LegacyInboxTarget,
  text: string,
  commandId: string,
): Promise<ConvertLegacyInboxResult> {
  const id = requiredCommandId(commandId)
  return serial(id, async () => {
    const duplicate = await commandResult<ConvertLegacyInboxResult>(id)
    if (duplicate) return duplicate
    const caseId = stableLegacyId(id, 'case')
    let createdCase = await caseAsyncRepository.get(caseId)
    if (!createdCase) {
      createdCase = await caseAsyncRepository.create({ id: caseId, title: text, status: 'inbox' })
    } else if (createdCase.title !== text) {
      throw new Error('legacy-inbox-case-command-conflict')
    }
    const removed = await removeLegacyInboxItem(target)
    return saveCommand(id, { ...removed, case: createdCase })
  })
}

export interface LinkFinanceToCaseInput {
  caseId: string
  transactionId: string
  phase?: CasePhase
  commandId: string
}

export interface LinkFinanceToCaseResult {
  relation?: CaseRelation
  unlinked: boolean
}

export async function linkFinanceToCase(input: LinkFinanceToCaseInput): Promise<LinkFinanceToCaseResult> {
  const commandId = requiredCommandId(`${financeLinkCommandPrefix}${input.commandId}`)
  return serial(commandId, async () => {
    const duplicate = await commandResult<LinkFinanceToCaseResult>(commandId)
    if (duplicate) return duplicate
    if (input.caseId && !await caseAsyncRepository.get(input.caseId)) throw new Error('case-not-found')
    const current = await caseAsyncRelationRepository.listForTarget('transaction', input.transactionId)
    const same = current.find(item => item.caseId === input.caseId && item.phase === input.phase)
    if (same && current.length === 1) return saveCommand(commandId, { relation: same, unlinked: false })
    const unlinked = await caseAsyncRelationRepository.unlinkForTarget('transaction', input.transactionId)
    if (!input.caseId) return saveCommand(commandId, { unlinked, relation: undefined })
    const relation = await caseAsyncRelationRepository.link(input.caseId, 'transaction', input.transactionId, input.phase)
    return saveCommand(commandId, { relation, unlinked })
  })
}

export const legacyInboxRepositories = {
  inbox: legacyInboxRepository,
  tasks: legacyTasksRepository,
  commands: commandRepository,
}
