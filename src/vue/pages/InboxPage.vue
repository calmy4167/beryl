<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { captureAsyncRepository, type AiSuggestion, type CaptureItem } from '@/domain/capture'
import { captureText, convertLegacyInboxToCase, convertLegacyInboxToTask, removeLegacyInbox } from '@/application'
import { listRealityDocumentsAsync, type RealityDocument } from '@/domain/reality'
import { fmtDate, nextId } from '@/core/storage'
import { registerUndo } from '@/core/undo'
import { withSaveState } from '@/core/save-state'
import { CAPTURE_STATUSES, type CaptureStatus } from '@/domain/capture/model'
import { useCaptureStatusDictionary } from '@/vue/composables/useCaptureStatusDictionary'

type Filter = 'all' | 'open' | 'suggested' | 'accepted' | 'rejected' | 'archived'
interface InboxEntry {
  id: string
  source: 'legacy' | 'capture'
  text: string
  status: string
  updatedAt: number
  date?: string
  sourceIndex?: number
  capture?: CaptureItem
  legacy?: RealityDocument
}
const { labelFor: captureStatusLabel, statuses: orderedCaptureStatuses, error: captureStatusError, hasLoadedOptions: captureStatusHasLoaded, refresh: refreshCaptureStatusDictionary } = useCaptureStatusDictionary()
const filters = computed<Array<{ id: Filter; label: string }>>(() => [
  { id: 'all', label: '全部' },
  ...orderedCaptureStatuses.value.map(status => ({ id: (status === 'inbox' ? 'open' : status) as Filter, label: captureStatusLabel(status) })),
])
const statusLabels: Record<string, string> = {
  open: '待处理',
}

const captures = ref<CaptureItem[]>([])
const suggestions = ref<AiSuggestion[]>([])
const legacy = ref<InboxEntry[]>([])
const body = ref('')
const query = ref('')
const filter = ref<Filter>('all')
const expandedId = ref('')
const drafts = reactive<Record<string, string>>({})
const loading = ref(true)
const busyId = ref('')
const message = ref('')
const error = ref('')
const suggestionByCapture = computed(() => new Map(suggestions.value.map(item => [item.captureId, item])))
const entries = computed(() => [...legacy.value, ...captures.value.map(item => ({
  id: item.calmyId, source: 'capture' as const, text: item.body, status: item.status,
  updatedAt: item.updatedAt, date: new Date(item.createdAt).toISOString(), capture: item,
}))].sort((a, b) => b.updatedAt - a.updatedAt))
const visible = computed(() => {
  const term = query.value.trim().toLocaleLowerCase()
  return entries.value.filter(item => (!term || `${item.text} ${statusLabel(item.status)}`.toLocaleLowerCase().includes(term)) &&
    (filter.value === 'all' || item.status === filter.value || (filter.value === 'open' && item.status === 'inbox')))
})
const pendingCount = computed(() => suggestions.value.filter(item => item.status === 'suggested').length)
const captureCount = computed(() => captures.value.length + legacy.value.length)

function toast(text: string, kind: 'success' | 'warning' | 'error' = 'success') {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message: text, kind } }))
}
function statusLabel(status: string) { return (CAPTURE_STATUSES as readonly string[]).includes(status) ? captureStatusLabel(status as CaptureStatus) : statusLabels[status] || status }
function displayTime(timestamp: number, fallback?: string) {
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toLocaleString('zh-CN') : fallback || '时间未知'
}
function titleFor(item: InboxEntry) { return item.text.split(/\r?\n/, 1)[0].slice(0, 120) || '未命名收件项' }
function draftFor(suggestion: AiSuggestion) {
  return drafts[suggestion.calmyId] ?? suggestion.candidates[0]?.fields.title ?? suggestion.candidates[0]?.fields.body ?? ''
}
async function legacyEntries(): Promise<InboxEntry[]> {
  return (await listRealityDocumentsAsync({ types: ['inbox'] })).map(item => ({
    id: item.id, source: 'legacy', text: item.body || item.title, status: item.status || 'open',
    updatedAt: item.updatedAt, date: item.date, sourceIndex: item.sourceIndex, legacy: item,
  }))
}
async function refresh(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [nextCaptures, nextSuggestions] = await Promise.all([captureAsyncRepository.list(), captureAsyncRepository.listSuggestions()])
    captures.value = nextCaptures
    suggestions.value = nextSuggestions
    legacy.value = await legacyEntries()
    message.value = ''
  } catch (cause) {
    const text = cause instanceof Error ? cause.message : '收集内容读取失败'
    error.value = text
    toast(text, 'error')
  } finally { loading.value = false }
}
function onDataSynced() { void refresh() }
onMounted(() => { void refresh(); window.addEventListener('beryl-data-synced', onDataSynced) })
onUnmounted(() => window.removeEventListener('beryl-data-synced', onDataSynced))

async function addCapture(): Promise<void> {
  if (!body.value.trim()) { toast('先写下一段原文', 'warning'); return }
  try {
    const result = await withSaveState(() => captureText(body.value))
    body.value = ''
    await refresh()
    toast(result.suggestionError ? '原文已保存，但建议生成失败' : '已收入收集', result.suggestionError ? 'warning' : 'success')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '收件失败', 'error') }
}
function onEditorKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void addCapture() }
}
async function acceptSuggestion(suggestion: AiSuggestion): Promise<void> {
  const candidate = suggestion.candidates[0]
  if (!candidate) { toast('这条建议没有可处理的候选项', 'warning'); return }
  const value = draftFor(suggestion)
  if (!value.trim()) { toast('请先补充处理后的内容', 'warning'); return }
  busyId.value = suggestion.calmyId
  try {
    const overrides: Record<string, string> = candidate.entityType === 'record' ? { body: value } : { title: value }
    await withSaveState(() => captureAsyncRepository.acceptSuggestion(suggestion.calmyId, 0, overrides))
    await refresh()
    toast('已按建议处理原文')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '处理建议失败', 'error') }
  finally { busyId.value = '' }
}
async function rejectSuggestion(suggestion: AiSuggestion): Promise<void> {
  busyId.value = suggestion.calmyId
  try {
    await withSaveState(() => captureAsyncRepository.rejectSuggestion(suggestion.calmyId))
    await refresh()
    toast('已拒绝建议，原文仍保留')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '拒绝建议失败', 'error') }
  finally { busyId.value = '' }
}
async function removeCapture(item: InboxEntry): Promise<void> {
  if (item.source !== 'capture' || !item.capture) return
  if (!window.confirm('删除后原文将从收集记录中移除，确定继续吗？')) return
  busyId.value = item.id
  try {
    const removed = await withSaveState(() => captureAsyncRepository.remove(item.capture!.calmyId))
    await refresh()
    toast(removed ? '原文已删除' : '原文已经不存在', removed ? 'success' : 'warning')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '删除失败', 'error') }
  finally { busyId.value = '' }
}
async function removeLegacy(item: InboxEntry): Promise<void> {
  if (item.source !== 'legacy') return
  try {
    const result = await withSaveState(() => removeLegacyInbox({ id: item.legacy?.id, sourceIndex: item.sourceIndex }, `remove-inbox:${nextId()}`))
    registerUndo('inbox', result.removed, result.index, result.removed.id)
    await refresh()
    toast('旧版收件项已移除')
  } catch (cause) {
    toast(cause instanceof Error && cause.message === 'legacy-inbox-not-found' ? '旧版收件项已变化，请刷新后重试' : '旧版收件项移除失败', 'warning')
  }
}
async function convertLegacyToCase(item: InboxEntry): Promise<void> {
  if (item.source !== 'legacy') return
  const title = item.text.trim()
  if (!title) return
  try {
    const result = await withSaveState(() => convertLegacyInboxToCase({ id: item.legacy?.id, sourceIndex: item.sourceIndex }, title, `convert-case:${nextId()}`))
    registerUndo('inbox', result.removed, result.index, result.removed.id)
    await refresh()
    toast(`已转为现实课题「${result.case?.title || title}」`)
  } catch (cause) {
    toast(cause instanceof Error && cause.message === 'legacy-inbox-not-found' ? '课题可能已创建，但旧收件项已变化，请刷新后检查' : '转为课题失败，原文未确认移除', 'warning')
  }
}
async function convertLegacyToTask(item: InboxEntry): Promise<void> {
  if (item.source !== 'legacy') return
  try {
    const result = await withSaveState(() => convertLegacyInboxToTask({ id: item.legacy?.id, sourceIndex: item.sourceIndex }, item.text, `convert-task:${nextId()}`, { priority: '中', date: fmtDate(Date.now()) }))
    registerUndo('inbox', result.removed, result.index, result.removed.id)
    await refresh()
    toast('已转为行动任务')
  } catch (cause) {
    toast(cause instanceof Error && cause.message === 'legacy-inbox-not-found' ? '任务可能已创建，但旧收件项已变化，请刷新后检查' : '转为行动任务失败，原文未确认移除', 'warning')
  }
}
function archiveUnavailable() {
  message.value = '当前 inbox/capture API 没有 archive 操作，未执行删除或伪造归档；原文仍保持可读。'
  toast('当前 API 未提供归档操作，原文未改变', 'warning')
}
</script>

<template>
  <div class="inbox-page">
    <header class="page-head">
      <div><p class="eyebrow">收集 · 原文优先</p><h1 class="font-title">收集</h1><p>先保留原文，再把它处理成行动或现实处境。</p></div>
      <span class="load-pill">{{ loading ? '正在读取…' : `${captureCount} 条 · ${pendingCount} 条待确认建议` }}</span>
    </header>
    <p v-if="captureStatusError" class="info" role="alert">收集状态字典读取失败，{{ captureStatusHasLoaded ? '仍使用上次成功读取的名称。' : '当前使用内置名称。' }}<button type="button" class="app-button" @click="refreshCaptureStatusDictionary">重试</button></p>
    <section class="capture-box beryl-card">
      <textarea v-model="body" aria-label="新增收件内容" placeholder="脑中闪过什么？先放在这里…" @keydown="onEditorKeydown" />
      <div class="capture-footer"><span>Ctrl / ⌘ + Enter 保存原文</span><button class="app-button primary" :disabled="loading" @click="addCapture">收入收件箱</button></div>
    </section>
    <section class="beryl-card" :style="{ padding: '14px', marginTop: '16px' }">
      <div class="create-row" :style="{ margin: 0 }"><input v-model="query" aria-label="搜索收集" placeholder="搜索原文或状态…" /><select v-model="filter" aria-label="收集筛选"><option v-for="option in filters" :key="option.id" :value="option.id">{{ option.label }}</option></select><span class="muted">{{ visible.length }} 条</span></div>
    </section>
    <section v-if="error" class="beryl-card empty-state" role="alert"><b>收集内容暂时无法读取</b><p>{{ error }}</p><button class="app-button" type="button" @click="refresh">重试</button></section>
    <p v-if="message && !error" class="info" role="status">{{ message }}</p>
    <section class="history-list">
      <div v-if="loading" class="empty-state" role="status">正在读取收件内容…</div>
      <template v-else>
        <article v-for="item in visible" :key="`${item.source}:${item.id}`" class="history-card beryl-card">
          <div class="panel-head"><div><p class="eyebrow">{{ item.source === 'capture' ? 'CAPTURE' : 'LEGACY INBOX' }} · {{ statusLabel(item.status) }}</p><h2 class="font-title">{{ titleFor(item) }}</h2></div><small>{{ displayTime(item.updatedAt, item.date) }}</small></div>
          <div class="suggestion-actions">
            <button class="app-button" @click="expandedId = expandedId === `${item.source}:${item.id}` ? '' : `${item.source}:${item.id}`">{{ expandedId === `${item.source}:${item.id}` ? '收起原文' : '查看原文' }}</button>
            <template v-if="item.source === 'capture'"><button class="app-button" @click="archiveUnavailable">归档</button><button class="app-button danger" :disabled="busyId === item.id || busyId === suggestionByCapture.get(item.id)?.calmyId" @click="removeCapture(item)">删除</button></template>
            <template v-else><button class="app-button" @click="convertLegacyToTask(item)">→ 行动</button><button class="app-button" @click="convertLegacyToCase(item)">→ 课题</button><button class="app-button" @click="removeLegacy(item)">移除</button></template>
          </div>
          <div v-if="expandedId === `${item.source}:${item.id}`" class="opening-details"><p class="info" :style="{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }">{{ item.text }}</p><small v-if="item.source === 'capture' && item.capture" class="muted"><template v-for="(segment,index) in ['Capture ID：', item.capture.calmyId, ' · revision ', String(item.capture.revision)]" :key="index">{{segment}}</template></small></div>
          <div v-if="item.source === 'capture' && suggestionByCapture.get(item.id)?.status === 'suggested'" class="suggestion-card beryl-card">
            <div class="panel-head"><div><p class="eyebrow">SUGGESTION · {{ Math.round(suggestionByCapture.get(item.id)!.confidence * 100) }}%</p><h3 class="font-title">{{ suggestionByCapture.get(item.id)!.candidates[0]?.label || '建议' }}</h3></div><span class="muted">可拒绝</span></div>
            <p>{{ suggestionByCapture.get(item.id)!.rationale }}</p>
            <input :aria-label="`${item.text.slice(0, 20)}处理内容`" :value="draftFor(suggestionByCapture.get(item.id)!)" @input="drafts[suggestionByCapture.get(item.id)!.calmyId] = ($event.target as HTMLInputElement).value" />
            <div class="suggestion-actions"><button class="app-button primary" :disabled="busyId === item.id || busyId === suggestionByCapture.get(item.id)?.calmyId" @click="acceptSuggestion(suggestionByCapture.get(item.id)!)">采纳并处理</button><button class="app-button" :disabled="busyId === item.id || busyId === suggestionByCapture.get(item.id)?.calmyId" @click="rejectSuggestion(suggestionByCapture.get(item.id)!)">拒绝建议</button></div>
          </div>
        </article>
        <div v-if="!visible.length" class="empty-state">没有匹配的收件内容。</div>
      </template>
    </section>
  </div>
</template>
