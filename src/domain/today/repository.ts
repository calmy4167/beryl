import { createCollectionRepository } from '@/core/repository'
import type { TodayPatch, TodayPlan } from './model'

const plans = createCollectionRepository<TodayPlan>('mvpTodayPlans', item => item.date)

export const todayRepository = {
  list(): TodayPlan[] { return plans.list().slice().sort((a, b) => b.date.localeCompare(a.date)) },
  get(date: string): TodayPlan {
    const existing = plans.find(date)
    if (existing) return existing
    const plan: TodayPlan = { date, load: null, focusActionIds: [], why: '', mustProtect: [], letGo: [], review: { observation: '', analysis: '', adjustment: '', seed: '' }, revision: 1, updatedAt: Date.now() }
    return plans.create(plan)
  },
  importEntity(item: TodayPlan): 'created' | 'unchanged' {
    const current = plans.find(item.date)
    if (current) {
      if (JSON.stringify(current) === JSON.stringify(item)) return 'unchanged'
      throw new Error('Today ' + item.date + ' has local changes')
    }
    plans.create(item)
    return 'created'
  },
  update(date: string, patch: TodayPatch, expectedRevision?: number): TodayPlan {
    const current = this.get(date)
    if (expectedRevision !== undefined && expectedRevision !== current.revision) throw new Error(`Today ${date} revision conflict`)
    const next: TodayPlan = { ...current, ...patch, review: { ...current.review, ...(patch.review || {}) }, updatedAt: Date.now(), revision: current.revision + 1 }
    plans.update(date, () => next)
    return next
  }
}
