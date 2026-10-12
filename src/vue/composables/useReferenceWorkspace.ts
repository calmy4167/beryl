import { onMounted, onUnmounted, ref } from 'vue'
import { actionAsyncRepository } from '@/domain/action/repository'
import type { ActionItem } from '@/domain/action/model'
import { todayAsyncRepository } from '@/domain/today/repository'
import type { TodayPlan } from '@/domain/today/model'
import { diaryRepository } from '@/domain/diary/repository'
import type { DiaryEntry } from '@/domain/diary/model'
import { recordAsyncRepository } from '@/domain/record/repository'
import type { RealityRecord } from '@/domain/record/model'
import { captureAsyncRepository } from '@/domain/capture/repository'
import type { CaptureItem } from '@/domain/capture/model'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter } from '@/domain/matter/model'
import { createAsyncCollectionRepository, createEntityId, readAsyncStorageValue, writeAsyncStorageValue } from '@/core/repository'
import { withSaveState } from '@/core/save-state'
import { readServerSession } from '@/core/auth'
import { addActionToToday } from '@/application'

interface HabitSnapshot { name: string; color: string; days: number; dates: string[] }
interface HabitHistory { revision: number; operation: 'created' | 'updated'; source: 'user' | 'system'; occurredAt: number; actorUserId?: string; before?: HabitSnapshot; after: HabitSnapshot }
export interface ReferenceHabit extends HabitSnapshot { id: string; revision?: number; history?: HabitHistory[] }
export const focusPrefix = '[番茄钟] 完成专注'
const habitRepository = createAsyncCollectionRepository<ReferenceHabit>('habits', item => item.id)

export function useReferenceWorkspace() {
  const actions = ref<ActionItem[]>([])
  const plans = ref<TodayPlan[]>([])
  const habits = ref<ReferenceHabit[]>([])
  const notes = ref<DiaryEntry[]>([])
  const records = ref<RealityRecord[]>([])
  const inbox = ref<CaptureItem[]>([])
  const matters = ref<Matter[]>([])
  const loading = ref(true)
  const saving = ref(false)
  const error = ref('')
  let readVersion = 0
  let disposed = false
  let mutationQueue: Promise<unknown> = Promise.resolve()
  let pendingMutations = 0
  async function refresh() {
    const version = ++readVersion
    try {
      const data = await Promise.all([actionAsyncRepository.list(), todayAsyncRepository.list(), habitRepository.list(), diaryRepository.listDurable(), recordAsyncRepository.list(), captureAsyncRepository.list(), matterAsyncRepository.list()])
      if (disposed || version !== readVersion) return
      actions.value = data[0]; plans.value = data[1]
      habits.value = data[2].map(habit => ({ ...habit, dates: Array.isArray(habit.dates) ? [...new Set(habit.dates)].sort() : [] }))
      notes.value = data[3]; records.value = data[4]; inbox.value = data[5]; matters.value = data[6]
      error.value = ''
    } catch (cause) { if (!disposed && version === readVersion) error.value = cause instanceof Error ? cause.message : '数据读取失败' }
    finally { if (!disposed && version === readVersion) loading.value = false }
  }
  function mutate(work: () => Promise<unknown>): Promise<boolean> {
    pendingMutations++; saving.value = true
    const task = mutationQueue.catch(() => undefined).then(async () => {
      try { await withSaveState(work); await refresh(); return true }
      catch (cause) { error.value = cause instanceof Error ? cause.message : '保存失败，请重试'; return false }
      finally { pendingMutations--; saving.value = pendingMutations > 0 }
    })
    mutationQueue = task
    return task
  }
  async function addTask(title: string, date: string, matterId?: string) {
    return mutate(async () => { const plan = await todayAsyncRepository.get(date); await addActionToToday({ title, date, matterId, plan }) })
  }
  function toggleTask(item: ActionItem) {
    return mutate(() => item.status === 'done' ? actionAsyncRepository.reopen(item.calmyId, item.revision) : actionAsyncRepository.complete(item.calmyId, undefined, item.revision))
  }
  function renameTask(item: ActionItem, title: string) { return mutate(() => actionAsyncRepository.update(item.calmyId, { title }, { expectedRevision: item.revision })) }
  function cancelTask(item: ActionItem) { return mutate(() => actionAsyncRepository.cancel(item.calmyId, item.revision)) }
  function focusTask(item: ActionItem) {
    return mutate(async () => { const plan = await todayAsyncRepository.get(item.date); await todayAsyncRepository.update(item.date, { focusActionIds: [item.calmyId, ...plan.focusActionIds.filter(id => id !== item.calmyId)] }, plan.revision) })
  }
  function snapshot(habit: ReferenceHabit): HabitSnapshot { const dates = Array.isArray(habit.dates) ? [...habit.dates] : []; return { name: habit.name, color: habit.color, days: dates.length, dates } }
  function addHabit(name: string) {
    return mutate(async () => {
      const after = { name, color: '#c8ff4d', days: 0, dates: [] as string[] }
      await habitRepository.create({ id: createEntityId(), ...after, revision: 1, history: [{ revision: 1, operation: 'created', source: 'user', occurredAt: Date.now(), actorUserId: readServerSession()?.user.id, after }] })
    })
  }
  function toggleHabit(habit: ReferenceHabit, date: string) {
    return mutate(async () => {
      const updated = await habitRepository.update(habit.id, current => {
        if ((current.revision || 0) !== (habit.revision || 0)) throw new Error('习惯已更新，请刷新后重试')
        const dates = new Set(Array.isArray(current.dates) ? current.dates : []); dates.has(date) ? dates.delete(date) : dates.add(date)
        const after = { ...snapshot(current), dates: [...dates].sort(), days: dates.size }
        const revision = (current.revision || 0) + 1
        return { ...current, ...after, revision, history: [...(current.history || []), { revision, operation: 'updated', source: 'user', occurredAt: Date.now(), actorUserId: readServerSession()?.user.id, before: snapshot(current), after }] }
      })
      if (!updated) throw new Error('习惯已不存在，请刷新后重试')
    })
  }
  // Per-note queue prevents an older autosave from overwriting the next draft.
  const noteQueues = new Map<string, Promise<unknown>>()
  function saveNote(date: string, content: string): Promise<boolean> {
    const prior = noteQueues.get(date) || Promise.resolve()
    const task = prior.catch(() => undefined).then(async () => {
      const current = notes.value.find(note => note.date === date)
      if (current?.content === content || (!current && !content.trim())) return true
      try {
        const saved = await withSaveState(() => current
          ? diaryRepository.updateVersioned(date, { content }, 'content_updated', current.revision || 0, readServerSession()?.user.id)
          : diaryRepository.createVersioned({ date, content }, readServerSession()?.user.id))
        notes.value = [saved, ...notes.value.filter(note => note.date !== date)]
        return true
      } catch (cause) { error.value = cause instanceof Error ? cause.message : '笔记保存失败，草稿已保留'; return false }
    })
    noteQueues.set(date, task)
    return task
  }
  function capture(body: string) { return mutate(() => captureAsyncRepository.create(body)) }
  /** 采纳 / 放下一条记录（Capture 的固定状态机，不新建实体） */
  function resolveCapture(item: { calmyId: string; revision: number }, status: 'accepted' | 'archived') {
    return mutate(() => captureAsyncRepository.resolve(item.calmyId, status, item.revision))
  }
  /** 新建处境：仓储默认落到 active（见 matterAsyncRepository.create） */
  function addMatter(title: string) {
    return mutate(() => matterAsyncRepository.create({ title }))
  }
  /** 处境状态流转：active / paused / archived，走既有状态机与 revision 校验 */
  function setMatterStatus(item: { calmyId: string }, status: 'active' | 'paused' | 'archived') {
    return mutate(() => matterAsyncRepository.transition(item.calmyId, status))
  }
  function completeFocus(minutes: number, actionId?: string) {
    return mutate(async () => {
      const [total, count] = await Promise.all([readAsyncStorageValue('pomoTotal', 0), readAsyncStorageValue('pomoCount', 0)])
      if (!await writeAsyncStorageValue('pomoTotal', Number(total) + minutes) || !await writeAsyncStorageValue('pomoCount', Number(count) + 1)) throw new Error('专注统计保存失败')
      await recordAsyncRepository.create({ type: 'fact', body: focusPrefix + ' ' + minutes + ' 分钟', occurredAt: Date.now(), source: 'user', actionId })
    })
  }
  const onSync = () => void refresh()
  onMounted(() => { void refresh(); window.addEventListener('beryl-data-synced', onSync) })
  onUnmounted(() => { disposed = true; readVersion++; window.removeEventListener('beryl-data-synced', onSync) })
  return { actions, plans, habits, notes, records, inbox, matters, loading, saving, error, refresh, addTask, toggleTask, renameTask, cancelTask, focusTask, addHabit, toggleHabit, saveNote, capture, resolveCapture, addMatter, setMatterStatus, completeFocus }
}
