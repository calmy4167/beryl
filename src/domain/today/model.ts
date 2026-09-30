export const TODAY_LOADS = ['good', 'normal', 'tired', 'bad'] as const
export type TodayLoad = typeof TODAY_LOADS[number]

export interface TodayReview {
  observation: string
  analysis: string
  adjustment: string
  seed: string
  sourceMaterialIds?: Partial<Record<TodayReviewField, string[]>>
}

export const TODAY_REVIEW_FIELDS = ['observation', 'analysis', 'adjustment', 'seed'] as const
export type TodayReviewField = typeof TODAY_REVIEW_FIELDS[number]

export interface TodayPlan {
  date: string
  load: TodayLoad | null
  focusActionIds: string[]
  why: string
  mustProtect: string[]
  letGo: string[]
  review: TodayReview
  revision: number
  updatedAt: number
}

export interface TodayPatch {
  load?: TodayLoad | null
  focusActionIds?: string[]
  why?: string
  mustProtect?: string[]
  letGo?: string[]
  review?: Partial<TodayReview>
}
