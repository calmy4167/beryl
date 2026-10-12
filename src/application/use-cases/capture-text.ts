import { captureAsyncRepository, type AiSuggestion, type CaptureItem } from '@/domain/capture'

export interface CaptureTextResult {
  capture: CaptureItem
  suggestion?: AiSuggestion
  suggestionError?: unknown
  /** Only deferred desktop callers receive this live completion handle; never persisted. */
  suggestionCompletion?: Promise<CaptureTextResult>
}

export interface CaptureTextOptions { captureId?: string; deferSuggestion?: boolean }
const suggestionCompletions = new Map<string, Promise<CaptureTextResult>>()

/**
 * Capture 的应用用例：事实原文先落库，理解建议失败时也返回已保存的原文。
 * 这里不处理 UI 提示、路由或保存状态展示，避免页面重新编排事实写入边界。
 */
export async function captureText(body: string, sourceMaterialIds: string[] = [], options: CaptureTextOptions = {}): Promise<CaptureTextResult> {
  const capture = await captureAsyncRepository.create(body, sourceMaterialIds, options)
  if (options.deferSuggestion) return { capture }
  return suggestCapturedText(capture, options)
}

/** Suggestion completion never creates a missing Capture or reverses its decision. */
export function suggestCapturedText(capture: CaptureItem, options: CaptureTextOptions = {}): Promise<CaptureTextResult> {
  const pending = suggestionCompletions.get(capture.calmyId)
  if (pending) return pending
  const next = completeSuggestion(capture, options)
  suggestionCompletions.set(capture.calmyId, next)
  void next.then(() => suggestionCompletions.delete(capture.calmyId), () => suggestionCompletions.delete(capture.calmyId))
  return next
}

async function completeSuggestion(capture: CaptureItem, options: CaptureTextOptions): Promise<CaptureTextResult> {
  try {
    const suggestion = capture.suggestionIds.length
      ? await captureAsyncRepository.findSuggestion(capture.suggestionIds[0])
      : await captureAsyncRepository.suggest(capture.calmyId, options.captureId ? { suggestionId: `capture-suggestion:${options.captureId}` } : undefined)
    return { capture: await captureAsyncRepository.find(capture.calmyId) || capture, suggestion }
  } catch (suggestionError) {
    return { capture, suggestionError }
  }
}
