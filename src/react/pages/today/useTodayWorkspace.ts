import { useEffect, useMemo, useState } from 'react'
import { addActionToToday, openToday } from '@/application'
import { withSaveState } from '@/core/save-state'
import { todayKey } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import type { ActionItem } from '@/domain/action/model'
import type { Matter } from '@/domain/matter/model'
import { todayAsyncRepository } from '@/domain/today/repository'
import type { TodayLoad, TodayPlan } from '@/domain/today/model'
import { recordAsyncRepository } from '@/domain/record/repository'
import type { JournalCategory } from '@/domain/record/model'

const date = todayKey()

const toast = (message: string, kind: 'success' | 'warning' | 'error' = 'success') => {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

function loadNarrative(load: TodayLoad | null, primary: ActionItem | undefined): string {
  if (load === 'bad') return '今天先照顾承载，不需要追赶。'
  if (load === 'tired') return '今天在降低承载，保留一件真正重要的事就够了。'
  if (primary?.status === 'in_progress') return '这一件事正在现实中展开，先把注意力放回手边。'
  if (primary?.status === 'done') return '这一轮已经有了真实发生，可以停下来让它结束。'
  return '这一天还在展开，先保留一个可以去现实中做的下一步。'
}

export function useTodayWorkspace() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [plan, setPlan] = useState<TodayPlan>()
  const [actions, setActions] = useState<ActionItem[]>([])
  const [matters, setMatters] = useState<Matter[]>([])
  const [protect, setProtect] = useState('')
  const [letGo, setLetGo] = useState('')
  const [actionTitle, setActionTitle] = useState('')
  const [matterId, setMatterId] = useState('')
  const [recordBody, setRecordBody] = useState('')
  const [journalCategory, setJournalCategory] = useState<JournalCategory>('fact')
  const [realityMessage, setRealityMessage] = useState('')
  const [error, setError] = useState('')

  async function refresh(): Promise<void> {
    setLoading(true)
    setError('')
    try {
      const opened = await openToday(date)
      setPlan(opened.plan)
      setActions(opened.actions)
      setMatters(opened.matters)
      setProtect(opened.plan.mustProtect.join('\n'))
      setLetGo(opened.plan.letGo.join('\n'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Today 读取失败')
      toast(cause instanceof Error ? cause.message : 'Today 读取失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  async function savePlan(patch: Partial<TodayPlan>): Promise<void> {
    if (!plan) return
    setSaving(true)
    try {
      const next = await withSaveState(() => todayAsyncRepository.update(date, patch, plan.revision))
      setPlan(next)
      setProtect(next.mustProtect.join('\n'))
      setLetGo(next.letGo.join('\n'))
      toast('已保存到本地')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function addAction(): Promise<void> {
    if (!plan || !actionTitle.trim()) {
      toast('先写下一个现实行动', 'warning')
      return
    }
    try {
      await withSaveState(() => addActionToToday({ title: actionTitle, date, matterId: matterId || undefined, plan }))
      setActionTitle('')
      setMatterId('')
      await refresh()
      toast('行动已加入今天')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '添加行动失败', 'error')
    }
  }

  async function goToReality(item: ActionItem): Promise<void> {
    try {
      if (item.status === 'planned') await withSaveState(() => actionAsyncRepository.start(item.calmyId, item.revision))
      setRealityMessage('可以关闭 Calmy，去现实中做这件事。回来后再记录真实发生了什么。')
      await refresh()
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '行动状态更新失败', 'error')
    }
  }

  async function toggleAction(item: ActionItem): Promise<void> {
    try {
      if (item.status === 'done') await withSaveState(() => actionAsyncRepository.reopen(item.calmyId, item.revision))
      else await withSaveState(() => actionAsyncRepository.complete(item.calmyId, undefined, item.revision))
      await refresh()
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '行动更新失败', 'error')
    }
  }

  async function addRecord(): Promise<void> {
    if (!recordBody.trim()) {
      toast('先写下今天实际发生了什么', 'warning')
      return
    }
    try {
      await withSaveState(() => recordAsyncRepository.create({ body: recordBody, type: 'fact', journalCategory }))
      setRecordBody('')
      await refresh()
      toast('已保存现实记录')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '记录失败', 'error')
    }
  }

  const availableActions = useMemo(() => actions.filter(item => item.status !== 'cancelled'), [actions])
  const primaryAction = useMemo(() => {
    const focused = plan?.focusActionIds || []
    return availableActions.find(item => focused.includes(item.calmyId) && (item.status === 'planned' || item.status === 'in_progress')) || availableActions.find(item => item.status === 'in_progress' || item.status === 'planned')
  }, [availableActions, plan])
  const extraLimit = plan?.load === 'bad' ? 0 : plan?.load === 'tired' ? 1 : 2
  const extraActions = useMemo(() => availableActions.filter(item => item.calmyId !== primaryAction?.calmyId && item.status !== 'done').slice(0, extraLimit), [availableActions, extraLimit, primaryAction])
  const narrative = loadNarrative(plan?.load || null, primaryAction)

  return {
    date, loading, saving, plan, actions, matters, protect, letGo, actionTitle, matterId, recordBody, journalCategory,
    realityMessage, error, availableActions,
    primaryAction, extraActions, narrative, refresh, savePlan, addAction, goToReality, toggleAction,
    addRecord, setProtect, setLetGo, setActionTitle, setMatterId, setRecordBody, setJournalCategory,
  }
}
