import { todayAsyncRepository } from '@/domain/today/repository'
import type { TodayPlan, TodayReview } from '@/domain/today/model'

export interface CompleteReviewInput {
  date: string
  review: TodayReview
  expectedRevision: number
}

export interface CompleteReviewResult {
  plan: TodayPlan
}

function cleanReview(review: TodayReview): TodayReview {
  return {
    observation: review.observation.trim(),
    analysis: review.analysis.trim(),
    adjustment: review.adjustment.trim(),
    seed: review.seed.trim()
  }
}

export async function completeReview(input: CompleteReviewInput): Promise<CompleteReviewResult> {
  const plan = await todayAsyncRepository.update(input.date, { review: cleanReview(input.review) }, input.expectedRevision)
  return { plan }
}
