import { todayAsyncRepository } from '@/domain/today/repository'
import { TODAY_REVIEW_FIELDS, type TodayPlan, type TodayReview } from '@/domain/today/model'

export interface CompleteReviewInput {
  date: string
  review: TodayReview
  letGo?: string[]
  expectedRevision: number
}

export interface CompleteReviewResult {
  plan: TodayPlan
}

function cleanReview(review: TodayReview): TodayReview {
  const sourceMaterialIds = Object.fromEntries(TODAY_REVIEW_FIELDS.flatMap(field => {
    const ids = review.sourceMaterialIds?.[field]
    const cleanIds = Array.isArray(ids) ? [...new Set(ids.filter(id => typeof id === 'string' && id.trim()).map(id => id.trim()))] : []
    return cleanIds.length ? [[field, cleanIds]] : []
  })) as TodayReview['sourceMaterialIds']
  return {
    observation: review.observation.trim(),
    analysis: review.analysis.trim(),
    adjustment: review.adjustment.trim(),
    seed: review.seed.trim(),
    ...(sourceMaterialIds && Object.keys(sourceMaterialIds).length ? { sourceMaterialIds } : {})
  }
}

export async function completeReview(input: CompleteReviewInput): Promise<CompleteReviewResult> {
  const plan = await todayAsyncRepository.update(input.date, {
    review: cleanReview(input.review),
    ...(input.letGo ? { letGo: input.letGo.map(item => item.trim()).filter(Boolean) } : {}),
  }, input.expectedRevision)
  return { plan }
}
