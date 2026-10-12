import { actionRepository } from '@/domain/action/repository'
import { matterFromThing } from '@/domain/matter/model'
import { matterRepository } from '@/domain/matter/repository'
import { recordRepository } from '@/domain/record/repository'
import { todayRepository } from '@/domain/today/repository'
import { captureAsyncRepository, captureRepository } from '@/domain/capture/repository'
import { diaryRepository } from '@/domain/diary/repository'
import type { CaptureItem } from '@/domain/capture/model'
import type { DiaryEntry } from '@/domain/diary/model'
import type { TodayPlan } from '@/domain/today/model'
import { financeAsyncRepository, financeRepository } from '@/domain/finance/repository'
import type { FinanceMutation } from '@/domain/finance/repository'
import { store } from '@/core/storage'
import { createAsyncCollectionRepository, createCollectionRepository } from '@/core/repository'
import { CORE_ENTITY_TYPES, type CoreEntity, unifiedRepository } from '@/domain/unified'
import { assetRepository } from './assets'
import type { OpenAsset, OpenEntity, OpenWorkspace, OpenWorkspaceInput, OpenFieldDecision, OpenFinanceEntry, OpenGoal, OpenHabit, OpenLegacyInboxHistory, OpenPost } from './open-format'
import { exportOpenWorkspace, isGoal, isUnifiedOpenEntity, mergeOpenEntity, openEntityId, openEntityKey, openEntityType, scanOpenAssetReferences } from './open-format'

export interface OpenApplyResult {
  created: number
  unchanged: number
  replaced: number
  merged: number
  keptLocal: number
  conflicts: string[]
  errors: string[]
}

export interface OpenAssetApplyResult {
  created: number
  unchanged: number
  conflicts: string[]
}

export type OpenConflictDecision = 'keep-local' | 'use-incoming' | { mode: 'merge'; fields: Record<string, OpenFieldDecision> }

const goalRepository = createCollectionRepository<OpenGoal>('goals', item => item.id)
const asyncGoalRepository = createAsyncCollectionRepository<OpenGoal>('goals', item => item.id)
const postRepository = createCollectionRepository<OpenPost>('posts', item => item.id)
const asyncPostRepository = createAsyncCollectionRepository<OpenPost>('posts', item => item.id)
type StoredHabit = Omit<OpenHabit, 'entityType'>
const habitRepository = createCollectionRepository<StoredHabit>('habits', item => item.id)
const asyncHabitRepository = createAsyncCollectionRepository<StoredHabit>('habits', item => item.id)
type StoredInboxHistory = Omit<OpenLegacyInboxHistory, 'entityType'>
const inboxHistoryRepository = createCollectionRepository<StoredInboxHistory>('inboxHistory', item => item.id)
const asyncInboxHistoryRepository = createAsyncCollectionRepository<StoredInboxHistory>('inboxHistory', item => item.id)

function storedHabit(entity: OpenHabit): StoredHabit {
  const { entityType: _entityType, ...habit } = entity
  return habit
}

function portableHabits(): OpenHabit[] {
  return habitRepository.list().filter(item => typeof item.id === 'string' && typeof item.name === 'string')
    .map(item => ({ ...item, entityType: 'habit_entry' as const }))
}

function storedInboxHistory(entity: OpenLegacyInboxHistory): StoredInboxHistory {
  const { entityType: _entityType, ...history } = entity
  return history
}

function portableInboxHistory(): OpenLegacyInboxHistory[] {
  return inboxHistoryRepository.list().filter(item => typeof item.id === 'string')
    .map(item => ({ ...item, entityType: 'inbox_history' as const }))
}

function portablePosts(): OpenPost[] {
  return postRepository.list().filter(item => typeof item.id === 'string' && typeof item.title === 'string')
    .map(item => ({ ...item, entityType: 'post' as const }))
}

function openImportOrder(entities: OpenEntity[]): OpenEntity[] {
  return [...entities].sort((left, right) => Number(isUnifiedOpenEntity(left) && left.entityType === 'relation') - Number(isUnifiedOpenEntity(right) && right.entityType === 'relation'))
}

function conflictDecision(entities: OpenEntity[], decisions: Record<string, OpenConflictDecision>, key: string, id: string): OpenConflictDecision | undefined {
  if (decisions[key] !== undefined) return decisions[key]
  const identities = new Set([...entities, ...currentOpenEntities()].filter(entity => openEntityId(entity) === id).map(openEntityKey))
  return identities.size === 1 ? decisions[id] : undefined
}

export function currentOpenEntities(): OpenEntity[] {
  return [
    ...matterRepository.list(),
    ...actionRepository.list(),
    ...recordRepository.list(),
    ...todayRepository.list(),
    ...diaryRepository.list(),
    ...portablePosts(),
    ...portableHabits(),
    ...portableInboxHistory(),
    ...captureRepository.list(),
    ...goalRepository.list(),
    ...financeRepository.list().map(item => ({ ...item, entityType: 'finance_entry' as const })),
    ...CORE_ENTITY_TYPES.flatMap(type => unifiedRepository.list(type as CoreEntity['entityType']))
  ]
}

export function currentOpenAssets(): OpenAsset[] { return assetRepository.list() }

export function currentOpenOrphanAssets(): OpenAsset[] {
  const referenced = new Set(scanOpenAssetReferences(exportCurrentOpenWorkspace().files).map(reference => reference.asset_path))
  return currentOpenAssets().filter(asset => !referenced.has(asset.path))
}

export function removeOpenAssets(paths: string[]): number {
  return paths.filter(path => assetRepository.removeAsset(path)).length
}

function replaceOpenEntity(entity: OpenEntity): 'replaced' | 'unchanged' {
  if ('entityType' in entity && entity.entityType === 'inbox_history') {
    const history = storedInboxHistory(entity)
    const current = inboxHistoryRepository.find(history.id)
    if (current && JSON.stringify(current) === JSON.stringify(history)) return 'unchanged'
    return current ? (inboxHistoryRepository.update(history.id, () => history), 'replaced') : (inboxHistoryRepository.create(history), 'replaced')
  }
  if ('entityType' in entity && entity.entityType === 'habit_entry') {
    const habit = storedHabit(entity)
    const current = habitRepository.find(habit.id)
    if (current && JSON.stringify(current) === JSON.stringify(habit)) return 'unchanged'
    return current ? (habitRepository.update(habit.id, () => habit), 'replaced') : (habitRepository.create(habit), 'replaced')
  }
  if ('entityType' in entity && entity.entityType === 'finance_entry') {
    const finance = entity as OpenFinanceEntry
    const current = financeRepository.find(finance.id)
    if (current && JSON.stringify(current) === JSON.stringify(finance)) return 'unchanged'
    return current ? (financeRepository.update(finance.id, () => finance), 'replaced') : (financeRepository.create(finance), 'replaced')
  }
  if (isGoal(entity)) {
    const goal = entity
    const current = goalRepository.find(goal.id)
    if (current && JSON.stringify(current) === JSON.stringify(goal)) return 'unchanged'
    return current ? (goalRepository.update(goal.id, () => goal), 'replaced') : (goalRepository.create(goal), 'replaced')
  }
  if ('entityType' in entity && entity.entityType === 'post') {
    const current = postRepository.find(entity.id)
    if (current && JSON.stringify(current) === JSON.stringify(entity)) return 'unchanged'
    return current ? (postRepository.update(entity.id, () => entity), 'replaced') : (postRepository.create(entity), 'replaced')
  }
  if (openEntityType(entity) === 'diary') return diaryRepository.replaceSync(entity as DiaryEntry)
  if (openEntityType(entity) === 'capture') return captureRepository.replacePortableCapture(entity as CaptureItem)
  if (isUnifiedOpenEntity(entity)) {
    const outcome = unifiedRepository.replaceImported(entity)
    return outcome === 'created' ? 'replaced' : outcome
  }
  if ('entityType' in entity && entity.entityType === 'thing') {
    return matterRepository.replaceImported(matterFromThing(entity))
  }
  if (isGoal(entity)) {
    const goal = entity
    const current = goalRepository.find(goal.id)
    if (current && JSON.stringify(current) === JSON.stringify(goal)) return 'unchanged'
    return current ? (goalRepository.update(goal.id, () => goal), 'replaced') : (goalRepository.create(goal), 'replaced')
  }
  return 'currentStage' in entity
    ? matterRepository.replaceImported(entity)
    : 'occurredAt' in entity
      ? recordRepository.replaceImported(entity)
      : 'title' in entity
        ? actionRepository.replaceImported(entity)
        : todayRepository.replaceImported(entity as TodayPlan)
}

export function exportCurrentOpenWorkspace(): OpenWorkspace {
  const input: OpenWorkspaceInput = {
    matters: matterRepository.list(),
    actions: actionRepository.list(),
    records: recordRepository.list(),
    dailies: todayRepository.list(),
    diaries: diaryRepository.list(),
    posts: portablePosts(),
    habits: portableHabits(),
    inboxHistory: portableInboxHistory(),
    captures: captureRepository.list(),
    goals: goalRepository.list(),
    finance: financeRepository.list().map(item => ({ ...item, entityType: 'finance_entry' as const })),
    financeMutations: store.get<FinanceMutation[]>('financeMutations', []),
    unified: CORE_ENTITY_TYPES.flatMap(type => unifiedRepository.list(type as CoreEntity['entityType'])),
    assets: currentOpenAssets()
  }
  return exportOpenWorkspace(input)
}

export function applyOpenAssets(assets: OpenAsset[]): OpenAssetApplyResult {
  const result: OpenAssetApplyResult = { created: 0, unchanged: 0, conflicts: [] }
  for (const asset of assets) {
    const outcome = assetRepository.importAsset(asset)
    if (outcome === 'created') result.created++
    else if (outcome === 'unchanged') result.unchanged++
    else result.conflicts.push(asset.path)
  }
  return result
}

export function applyOpenEntities(entities: OpenEntity[], decisions: Record<string, OpenConflictDecision> = {}, identityScope: OpenEntity[] = entities): OpenApplyResult {
  const result: OpenApplyResult = { created: 0, unchanged: 0, replaced: 0, merged: 0, keptLocal: 0, conflicts: [], errors: [] }
  const orderedEntities = openImportOrder(entities)
  for (const entity of orderedEntities) {
    try {
      const id = openEntityId(entity)
      const key = openEntityKey(entity)
      const decision = conflictDecision(identityScope, decisions, key, id)
      if (decision === 'keep-local') {
        result.keptLocal++
        continue
      }
      if (decision === 'use-incoming') {
        const outcome = replaceOpenEntity(entity)
        if (outcome === 'replaced') result.replaced++
        else result.unchanged++
        continue
      }
      if (typeof decision === 'object' && decision.mode === 'merge') {
        const local = currentOpenEntities().find(item => openEntityKey(item) === key)
        if (!local) {
          result.errors.push('Merge target disappeared: ' + id)
          continue
        }
        const outcome = replaceOpenEntity(mergeOpenEntity(local, entity, decision.fields))
        if (outcome === 'replaced') result.merged++
        else result.unchanged++
        continue
      }
      const outcome = openEntityType(entity) === 'diary'
        ? diaryRepository.importSync(entity as DiaryEntry)
        : openEntityType(entity) === 'capture'
        ? captureRepository.importPortableCapture(entity as CaptureItem)
        : 'entityType' in entity && entity.entityType === 'habit_entry'
        ? (() => { const habit = storedHabit(entity); if (habitRepository.find(habit.id)) return 'unchanged'; habitRepository.create(habit); return 'created' })()
        : 'entityType' in entity && entity.entityType === 'inbox_history'
        ? (() => { const history = storedInboxHistory(entity); if (inboxHistoryRepository.find(history.id)) return 'unchanged'; inboxHistoryRepository.create(history); return 'created' })()
        : 'entityType' in entity && entity.entityType === 'post'
        ? (() => { if (postRepository.find(entity.id)) return 'unchanged'; postRepository.create(entity); return 'created' })()
        : isGoal(entity)
        ? (() => { if (goalRepository.find(entity.id)) return 'unchanged'; goalRepository.create(entity); return 'created' })()
        : 'entityType' in entity && entity.entityType === 'finance_entry'
        ? (() => { const current = financeRepository.find(entity.id); if (current) { if (JSON.stringify(current) === JSON.stringify(entity)) return 'unchanged'; throw new Error(`finance ${entity.id} has local changes`) }; financeRepository.create(entity); return 'created' })()
        : isUnifiedOpenEntity(entity)
        ? unifiedRepository.importEntity(entity)
        : 'entityType' in entity && entity.entityType === 'thing'
        ? matterRepository.importEntity(matterFromThing(entity))
        : isGoal(entity)
        ? (() => { if (goalRepository.find(entity.id)) return 'unchanged'; goalRepository.create(entity); return 'created' })()
        : 'currentStage' in entity
        ? matterRepository.importEntity(entity)
        : 'occurredAt' in entity
          ? recordRepository.importEntity(entity)
          : 'title' in entity
            ? actionRepository.importEntity(entity)
            : todayRepository.importEntity(entity as TodayPlan)
      if (outcome === 'created') result.created++
      else result.unchanged++
    } catch (error) {
      const message = error instanceof Error ? error.message : 'import-failed'
      if (message.includes('local changes')) result.conflicts.push(message)
      else result.errors.push(message)
    }
  }
  return result
}

/** Durable import path for collections whose existing canonical repository is asynchronous. */
export async function applyOpenEntitiesDurable(
  entities: OpenEntity[], decisions: Record<string, OpenConflictDecision> = {}, financeMutations: FinanceMutation[] = []
): Promise<OpenApplyResult> {
  const result: OpenApplyResult = { created: 0, unchanged: 0, replaced: 0, merged: 0, keptLocal: 0, conflicts: [], errors: [] }
  const orderedEntities = openImportOrder(entities)
  for (const entity of orderedEntities) {
    const type = openEntityType(entity)
    if (type !== 'diary' && type !== 'capture' && type !== 'finance_entry' && type !== 'habit_entry' && type !== 'inbox_history' && type !== 'goal' && type !== 'post') {
      const part = applyOpenEntities([entity], decisions, entities)
      for (const key of ['created', 'unchanged', 'replaced', 'merged', 'keptLocal'] as const) result[key] += part[key]
      result.conflicts.push(...part.conflicts); result.errors.push(...part.errors)
      continue
    }
    const id = openEntityId(entity); const key = openEntityKey(entity); const decision = conflictDecision(entities, decisions, key, id)
    try {
      if (decision === 'keep-local') { result.keptLocal++; continue }
      const diary = type === 'diary' ? entity as DiaryEntry : undefined
      const capture = type === 'capture' ? entity as CaptureItem : undefined
      const habit = type === 'habit_entry' ? entity as OpenHabit : undefined
      const inboxHistory = type === 'inbox_history' ? entity as OpenLegacyInboxHistory : undefined
      const goal = type === 'goal' ? entity as OpenGoal : undefined
      const post = type === 'post' ? entity as OpenPost : undefined
      let current: OpenEntity | undefined
      if (diary) current = await diaryRepository.findDurable(diary.date)
      else if (capture) current = await captureAsyncRepository.find(capture.calmyId)
      else if (habit) current = await asyncHabitRepository.find(habit.id).then(item => item ? { ...item, entityType: 'habit_entry' as const } : undefined)
      else if (inboxHistory) current = await asyncInboxHistoryRepository.find(inboxHistory.id).then(item => item ? { ...item, entityType: 'inbox_history' as const } : undefined)
      else if (goal) current = await asyncGoalRepository.find(goal.id)
      else if (post) current = await asyncPostRepository.find(post.id)
      else if (type === 'finance_entry') current = (await financeAsyncRepository.find((entity as OpenFinanceEntry).id)) as OpenFinanceEntry | undefined
      let next = entity
      if (typeof decision === 'object' && decision.mode === 'merge') {
        if (!current) { result.errors.push(`Merge target disappeared: ${key}`); continue }
        next = mergeOpenEntity(current, entity, decision.fields)
      }
      const replace = decision === 'use-incoming' || (typeof decision === 'object' && decision.mode === 'merge')
      const outcome = diary
        ? replace ? await diaryRepository.replaceImported(next as DiaryEntry) : await diaryRepository.importEntity(next as DiaryEntry)
        : capture
          ? replace ? await captureAsyncRepository.replacePortableCapture(next as CaptureItem) : await captureAsyncRepository.importPortableCapture(next as CaptureItem)
          : habit
          ? replace ? (await asyncHabitRepository.update(habit.id, () => storedHabit(next as OpenHabit)) ? 'replaced' : 'unchanged') : await asyncHabitRepository.create(storedHabit(next as OpenHabit)) ? 'created' : 'unchanged'
          : inboxHistory
          ? replace ? (await asyncInboxHistoryRepository.update(inboxHistory.id, () => storedInboxHistory(next as OpenLegacyInboxHistory)) ? 'replaced' : 'unchanged') : await asyncInboxHistoryRepository.create(storedInboxHistory(next as OpenLegacyInboxHistory)) ? 'created' : 'unchanged'
          : goal
          ? replace
            ? (await asyncGoalRepository.update(goal.id, () => next as OpenGoal) ? 'replaced' : 'unchanged')
            : await asyncGoalRepository.create(next as OpenGoal) ? 'created' : 'unchanged'
          : post
          ? replace ? await asyncPostRepository.update(post.id, () => next as OpenPost) ? 'replaced' : 'unchanged' : await asyncPostRepository.create(next as OpenPost) ? 'created' : 'unchanged'
          : replace ? await financeAsyncRepository.replaceImported(next as OpenFinanceEntry) : await financeAsyncRepository.importEntity(next as OpenFinanceEntry)
      if (outcome === 'created') result.created++
      else if (outcome === 'replaced') result.replaced++
      else result.unchanged++
      if (typeof decision === 'object' && decision.mode === 'merge') result.merged += outcome === 'replaced' ? 1 : 0
    } catch (error) {
      const message = error instanceof Error ? error.message : 'import-failed'
      if (message.includes('local changes')) result.conflicts.push(message)
      else result.errors.push(message)
    }
  }
  for (const mutation of financeMutations) {
    try { await financeAsyncRepository.importMutation(mutation) }
    catch (error) { result.errors.push(error instanceof Error ? error.message : `finance-mutation-import-failed:${mutation.id}`) }
  }
  return result
}
