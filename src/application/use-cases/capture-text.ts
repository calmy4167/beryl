import { captureAsyncRepository, type AiSuggestion, type CaptureItem } from '@/domain/capture'

export interface CaptureTextResult {
  capture: CaptureItem
  suggestion?: AiSuggestion
  suggestionError?: unknown
}

/**
 * Capture 的应用用例：事实原文先落库，理解建议失败时也返回已保存的原文。
 * 这里不处理 UI 提示、路由或保存状态展示，避免页面重新编排事实写入边界。
 */
export async function captureText(body: string): Promise<CaptureTextResult> {
  const capture = await captureAsyncRepository.create(body)
  try {
    const suggestion = await captureAsyncRepository.suggest(capture.calmyId)
    return { capture, suggestion }
  } catch (suggestionError) {
    return { capture, suggestionError }
  }
}
