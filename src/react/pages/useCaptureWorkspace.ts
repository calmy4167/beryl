import { useEffect, useMemo, useState } from 'react'
import { captureText, decideCapture, type CaptureDecision } from '@/application'
import { withSaveState } from '@/core/save-state'
import { captureAsyncRepository } from '@/domain/capture'
import type { AiSuggestion, CaptureItem } from '@/domain/capture'
import { captureDecisionOptions, suggestionText } from './CapturePendingCard'

const toast = (message: string, kind: 'success' | 'warning' | 'error' = 'success') => {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

export function useCaptureWorkspace() {
  const [body, setBody] = useState('')
  const [captures, setCaptures] = useState<CaptureItem[]>([])
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string>()
  const [error, setError] = useState('')

  async function refresh(): Promise<void> {
    setLoading(true)
    try {
      const [nextCaptures, nextSuggestions] = await Promise.all([captureAsyncRepository.list(), captureAsyncRepository.listSuggestions()])
      setCaptures(nextCaptures)
      setSuggestions(nextSuggestions)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '记录读取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    const onSynced = () => { void refresh() }
    window.addEventListener('beryl-data-synced', onSynced)
    return () => window.removeEventListener('beryl-data-synced', onSynced)
  }, [])

  const suggestionByCapture = useMemo(() => new Map(suggestions.map(item => [item.captureId, item])), [suggestions])
  const openCaptures = useMemo(() => captures.filter(item => item.status === 'inbox' || item.status === 'suggested'), [captures])
  const history = useMemo(() => captures.filter(item => item.status !== 'inbox' && item.status !== 'suggested').slice(0, 8), [captures])

  async function capture(): Promise<void> {
    if (!body.trim()) {
      toast('先写下一段原文', 'warning')
      return
    }
    try {
      const result = await withSaveState(() => captureText(body))
      setBody('')
      await refresh()
      toast(result.suggestionError ? '原文已保存，建议生成失败但不影响使用' : '原文已安全保存')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '记录保存失败', 'error')
    }
  }

  async function decide(item: CaptureItem, decision: CaptureDecision): Promise<void> {
    setBusyId(item.calmyId)
    try {
      await withSaveState(() => decideCapture({ captureId: item.calmyId, decision }))
      await refresh()
      toast(decision === 'let_go' ? '已放下，不再进入主列表' : `已${captureDecisionOptions.find(option => option.value === decision)?.label}`)
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '处理记录失败', 'error')
      await refresh()
    } finally {
      setBusyId(undefined)
    }
  }

  async function acceptSuggestion(item: AiSuggestion): Promise<void> {
    setBusyId(item.calmyId)
    try {
      const candidate = item.candidates[0]
      const value = drafts[item.calmyId] ?? suggestionText(item)
      await withSaveState(() => captureAsyncRepository.acceptSuggestion(item.calmyId, 0, candidate?.entityType === 'record' ? { body: value } : { title: value }))
      await refresh()
      toast('已采纳 AI 建议，原文仍可追溯')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '采纳建议失败', 'error')
    } finally {
      setBusyId(undefined)
    }
  }

  async function rejectSuggestion(item: AiSuggestion): Promise<void> {
    setBusyId(item.calmyId)
    try {
      await withSaveState(() => captureAsyncRepository.rejectSuggestion(item.calmyId))
      await refresh()
      toast('已忽略建议，原文仍保留')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '忽略建议失败', 'error')
    } finally {
      setBusyId(undefined)
    }
  }

  function updateDraft(suggestionId: string, value: string): void {
    setDrafts(current => ({ ...current, [suggestionId]: value }))
  }

  return { body, setBody, openCaptures, suggestionByCapture, history, loading, busyId, error, drafts, refresh, capture, decide, acceptSuggestion, rejectSuggestion, updateDraft }
}
