import { createAsyncCollectionRepository, createCollectionRepository } from '@/core/repository'
import type { TodayPatch, TodayPlan } from './model'

const plans = createCollectionRepository<TodayPlan>('mvpTodayPlans', item => item.date)
const asyncPlans = createAsyncCollectionRepository<TodayPlan>('mvpTodayPlans', item => item.date)

function createTodayPlan(date: string): TodayPlan {
  return {
    date,
    load: null,
    focusActionIds: [],
    why: '',
    mustProtect: [],
    letGo: [],
    review: { observation: '', analysis: '', adjustment: '', seed: '' },
    revision: 1,
    updatedAt: Date.now()
  }
}

function samePlan(left: TodayPlan, right: TodayPlan): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export const todayRepository = {
  list(): TodayPlan[] { return plans.list().slice().sort((a, b) => b.date.localeCompare(a.date)) },
  get(date: string): TodayPlan {
    const existing = plans.find(date)
    if (existing) return existing
    return plans.create(createTodayPlan(date))
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
  replaceImported(item: TodayPlan): 'replaced' | 'unchanged' {
    const current = plans.find(item.date)
    if (!current) return this.importEntity(item) === 'created' ? 'replaced' : 'unchanged'
    if (JSON.stringify(current) === JSON.stringify(item)) return 'unchanged'
    if (!plans.update(item.date, () => item)) throw new Error('Today import target disappeared')
    return 'replaced'
  },
  update(date: string, patch: TodayPatch, expectedRevision?: number): TodayPlan {
    const current = this.get(date)
    if (expectedRevision !== undefined && expectedRevision !== current.revision) throw new Error(`Today ${date} revision conflict`)
    const next: TodayPlan = { ...current, ...patch, review: { ...current.review, ...(patch.review || {}) }, updatedAt: Date.now(), revision: current.revision + 1 }
    plans.update(date, () => next)
    return next
  }
}

export const todayAsyncRepository = {
  async list(): Promise<TodayPlan[]> {
    return (await asyncPlans.list()).slice().sort((a, b) => b.date.localeCompare(a.date))
  },
  async get(date: string): Promise<TodayPlan> {
    const existing = await asyncPlans.find(date)
    if (existing) return existing
    return asyncPlans.create(createTodayPlan(date))
  },
  async importEntity(item: TodayPlan): Promise<'created' | 'unchanged'> {
    const current = await asyncPlans.find(item.date)
    if (current) {
      if (samePlan(current, item)) return 'unchanged'
      throw new Error('Today ' + item.date + ' has local changes')
    }
    await asyncPlans.create(item)
    return 'created'
  },
  async replaceImported(item: TodayPlan): Promise<'replaced' | 'unchanged'> {
    const current = await asyncPlans.find(item.date)
    if (!current) return (await this.importEntity(item)) === 'created' ? 'replaced' : 'unchanged'
    if (samePlan(current, item)) return 'unchanged'
    if (!await asyncPlans.update(item.date, () => item)) throw new Error('Today import target disappeared')
    return 'replaced'
  },
  async update(date: string, patch: TodayPatch, expectedRevision?: number): Promise<TodayPlan> {
    await this.get(date)
    let next: TodayPlan | undefined
    await asyncPlans.update(date, current => {
      if (expectedRevision !== undefined && expectedRevision !== current.revision) {
        throw new Error(`Today ${date} revision conflict`)
      }
      next = {
        ...current,
        ...patch,
        review: { ...current.review, ...(patch.review || {}) },
        updatedAt: Date.now(),
        revision: current.revision + 1
      }
      return next
    })
    if (!next) throw new Error('Today ' + date + ' update target disappeared')
    return next
  },
  ready: asyncPlans.ready
}
