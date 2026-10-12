import { focusPrefix } from '@/vue/composables/useReferenceWorkspace'
import type { RealityRecord } from '@/domain/record/model'

/**
 * 专注记录解析。
 *
 * Calmy 没有「专注块」实体：一次专注由 useReferenceWorkspace.completeFocus() 落成一条
 * RealityRecord（body = `[番茄钟] 完成专注 N 分钟`，带 actionId）。参考稿的
 * 专注分布 / 注意力流向 / 过程指标都可以从这些真实记录聚合出来，不需要新造数据。
 */
export interface FocusEntry {
  minutes: number
  actionId?: string
  at: number
  date: string
}

export function pad(value: number) { return String(value).padStart(2, '0') }

export function dayKeyOf(at: number) {
  const d = new Date(at)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 包含该日期的那一周（周一起始） */
export function weekOf(value: string) {
  const base = new Date(`${value}T00:00:00`)
  const offset = (base.getDay() + 6) % 7
  const start = new Date(base)
  start.setDate(base.getDate() - offset)
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return dayKeyOf(day.getTime())
  })
}

/** 只认 completeFocus 写下的记录，其余 RealityRecord 忽略 */
export function focusEntries(records: RealityRecord[]): FocusEntry[] {
  const entries: FocusEntry[] = []
  for (const record of records) {
    if (!record.body.startsWith(focusPrefix)) continue
    const match = record.body.match(/(\d+)\s*分钟/)
    const minutes = match ? Number(match[1]) : 0
    entries.push({ minutes, actionId: record.actionId, at: record.occurredAt, date: dayKeyOf(record.occurredAt) })
  }
  return entries
}

export function minutesOn(entries: FocusEntry[], date: string): number {
  return entries.filter(entry => entry.date === date).reduce((sum, entry) => sum + entry.minutes, 0)
}

export function hoursLabel(minutes: number): string {
  return String(Math.round((minutes / 60) * 10) / 10)
}
