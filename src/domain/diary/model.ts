/** A date-keyed entry stored in the existing `diary` collection. */
export interface DiaryEntry {
  date: string
  content: string
  sourceMaterialIds?: string[]
  /** Missing on legacy records; readers treat it as revision zero. */
  revision?: number
  ownership?: import('@/domain/unified/model').Ownership
  /** Immutable snapshots stay inside the canonical date-keyed Diary record. */
  history?: DiaryRevision[]
}

export interface DiaryRevision {
  revision: number
  operation: 'created' | 'content_updated' | 'ownership_updated'
  occurredAt: number
  actorUserId?: string
  content: string
  sourceMaterialIds?: string[]
  ownership?: import('@/domain/unified/model').Ownership
}

export function isDiaryEntry(value: unknown): value is DiaryEntry {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<DiaryEntry>
  return typeof item.date === 'string' && typeof item.content === 'string'
}

export function isValidDiaryDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}
