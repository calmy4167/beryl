<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useId } from 'vue'
import { completeReview } from '@/application'
import { withSaveState } from '@/core/save-state'
import { todayKey } from '@/core/storage'
import { listActionRecordDocumentsAsync, type RealityDocument } from '@/domain/reality'
import { todayAsyncRepository } from '@/domain/today/repository'
import type { TodayPlan, TodayReview, TodayReviewField } from '@/domain/today/model'
import { unifiedAsyncRepository, type Resource } from '@/domain/unified'
import { insertTextAtRange } from '@/domain/master-data-text'
import '@/styles/shared/master-data-picker.css'

type ReviewRange = 7 | 30 | 90

const date = todayKey()
const DAY_MS = 24 * 60 * 60 * 1000
const review = ref<TodayReview>({ observation: '', analysis: '', adjustment: '', seed: '' })
const letGo = ref('')
const plan = ref<TodayPlan>()
const dirty = ref(false)
const range = ref<ReviewRange>(7)
const docs = ref<RealityDocument[]>([])
const loading = ref(true)
const error = ref('')
const saving = ref(false)
interface SentenceItem { id: string; label: string; detail?: string }
const reviewFields: { key: TodayReviewField; label: string; aria: string }[] = [
  { key: 'observation', label: '观：今天实际发生了什么？', aria: '今日复盘：观，今天实际发生了什么' },
  { key: 'analysis', label: '察：哪些条件影响了今天？', aria: '今日复盘：察，哪些条件影响了今天' },
  { key: 'adjustment', label: '调：明天如何调整？', aria: '今日复盘：调，明天如何调整' },
  { key: 'seed', label: '下一轮线索', aria: '今日复盘：下一轮线索' },
]
const sentenceItems = ref<SentenceItem[]>([])
const sentenceError = ref('')
const pickerQuery = ref('')
const pickerOpen = ref(false)
const drawerOpen = ref(false)
const drawerQuery = ref('')
const activeIndex = ref(0)
const activeField = ref<TodayReviewField | null>(null)
const sentenceInput = ref<HTMLInputElement | null>(null)
const pickerRoot = ref<HTMLElement | null>(null)
const reviewTextareas: Partial<Record<TodayReviewField, HTMLTextAreaElement>> = {}
const listboxId = `review-sentence-${useId()}`
let selection = { start: 0, end: 0 }
let mounted = false

function setTextarea(field: TodayReviewField, element: Element | null): void {
  if (element instanceof HTMLTextAreaElement) reviewTextareas[field] = element
}
function rememberTarget(field: TodayReviewField, event: FocusEvent): void {
  activeField.value = field
  const target = event.currentTarget as HTMLTextAreaElement
  selection = { start: target.selectionStart, end: target.selectionEnd }
}
function syncSelection(field: TodayReviewField, event: Event): void {
  const target = event.currentTarget as HTMLTextAreaElement
  activeField.value = field
  selection = { start: target.selectionStart, end: target.selectionEnd }
}
const normalizedPickerQuery = computed(() => pickerQuery.value.trim().toLocaleLowerCase())
const sentenceMatches = computed(() => {
  const term = normalizedPickerQuery.value
  const matches = sentenceItems.value.filter(item => `${item.label} ${item.detail || ''}`.toLocaleLowerCase().includes(term))
  return matches.slice(0, 8)
})
const drawerMatches = computed(() => {
  const term = drawerQuery.value.trim().toLocaleLowerCase()
  return sentenceItems.value.filter(item => `${item.label} ${item.detail || ''}`.toLocaleLowerCase().includes(term))
})
function insertSentence(item: SentenceItem): void {
  const field = activeField.value
  if (!field) return
  const next = insertTextAtRange(review.value[field], selection.start, selection.end, item.detail || item.label)
  const sourceMaterialIds = review.value.sourceMaterialIds || {}
  review.value = {
    ...review.value,
    [field]: next.value,
    sourceMaterialIds: { ...sourceMaterialIds, [field]: [...new Set([...(sourceMaterialIds[field] || []), item.id])] },
  }
  selection = { start: next.caret, end: next.caret }
  pickerOpen.value = false
  drawerOpen.value = false
  pickerQuery.value = ''
  drawerQuery.value = ''
  dirty.value = true
  window.requestAnimationFrame(() => {
    const textarea = reviewTextareas[field]
    textarea?.focus()
    textarea?.setSelectionRange(next.caret, next.caret)
  })
}
function openDrawer(): void {
  pickerOpen.value = false
  drawerQuery.value = pickerQuery.value
  drawerOpen.value = true
  void nextTick(() => pickerRoot.value?.querySelector<HTMLInputElement>('.master-picker-drawer-search')?.focus())
}
function closeDrawer(): void {
  drawerOpen.value = false
  sentenceInput.value?.focus()
}
function pickerKeydown(event: KeyboardEvent): void {
  if (event.target !== sentenceInput.value) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    pickerOpen.value = true
    if (sentenceMatches.value.length) activeIndex.value = (activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + sentenceMatches.value.length) % sentenceMatches.value.length
  } else if (event.key === 'Home' && pickerOpen.value && sentenceMatches.value.length) {
    event.preventDefault(); activeIndex.value = 0
  } else if (event.key === 'End' && pickerOpen.value && sentenceMatches.value.length) {
    event.preventDefault(); activeIndex.value = sentenceMatches.value.length - 1
  } else if (event.key === 'Enter' && pickerOpen.value && sentenceMatches.value[activeIndex.value]) {
    event.preventDefault(); insertSentence(sentenceMatches.value[activeIndex.value])
  } else if (event.key === 'Escape') {
    pickerOpen.value = false; pickerQuery.value = ''
  }
}
function drawerKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeDrawer()
}
function clearProvenance(field: TodayReviewField): void {
  const sourceMaterialIds = { ...(review.value.sourceMaterialIds || {}) }
  delete sourceMaterialIds[field]
  review.value = { ...review.value, sourceMaterialIds: Object.keys(sourceMaterialIds).length ? sourceMaterialIds : undefined }
  dirty.value = true
}
async function loadSentences(): Promise<void> {
  try {
    const resources = await unifiedAsyncRepository.list<Resource>('resource')
    if (!mounted) return
    sentenceItems.value = resources.filter(item => item.kind === 'template' && item.status === 'active').map(item => ({ id: item.calmyId, label: item.title, detail: item.body }))
    sentenceError.value = ''
  } catch (cause) {
    if (mounted) sentenceError.value = cause instanceof Error ? cause.message : '常用句读取失败'
  }
}

function inDateRange(document: RealityDocument, days: ReviewRange): boolean {
  const end = new Date(date + 'T23:59:59').getTime()
  const start = end - ((days - 1) * DAY_MS)
  const timestamp = new Date(document.occurredAt ?? document.updatedAt).getTime()
  return timestamp >= start && timestamp <= end
}

function notify(message: string, kind: 'success' | 'warning' | 'error' = 'success'): void {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

function splitLines(value: string): string[] {
  return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
}

async function refresh(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [current, nextDocs] = await Promise.all([
      todayAsyncRepository.get(date),
      listActionRecordDocumentsAsync({ types: ['action', 'record'] }),
    ])
    plan.value = current
    review.value = { ...current.review }
    letGo.value = current.letGo.join('\n')
    docs.value = nextDocs
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '复盘数据读取失败'
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  if (!plan.value || saving.value) return
  saving.value = true
  try {
    const result = await withSaveState(() => completeReview({
      date,
      review: review.value,
      letGo: splitLines(letGo.value),
      expectedRevision: plan.value!.revision,
    }))
    plan.value = result.plan
    review.value = { ...result.plan.review }
    letGo.value = result.plan.letGo.join('\n')
    dirty.value = false
    notify('今日复盘已保存')
  } catch (cause) {
    notify(cause instanceof Error ? cause.message : '复盘保存失败', 'error')
  } finally {
    saving.value = false
  }
}

function updateReview(key: TodayReviewField, value: string): void {
  review.value = { ...review.value, [key]: value }
  dirty.value = true
}

const scopedDocs = computed(() => docs.value.filter(document => inDateRange(document, range.value)))
const done = computed(() => scopedDocs.value.filter(item => item.entityType === 'action' && item.status === 'done').length)
const records = computed(() => scopedDocs.value.filter(item => item.entityType === 'record').length)

onMounted(() => { mounted = true; void refresh(); void loadSentences() })
onUnmounted(() => { mounted = false })
</script>

<template>
  <div class="review-page">
    <header class="page-head">
      <div>
        <p class="eyebrow">CROSS-DOMAIN REVIEW</p>
        <h1 class="font-title">复盘，不只看完成率</h1>
        <p>把身体、心理、行动和现实记录放回同一段时间里观察。</p>
      </div>
      <div class="range-tabs">
        <button
          v-for="item in ([7, 30, 90] as const)"
          :key="item"
          type="button"
          class="app-button"
          :class="{ on: range === item }"
          :aria-pressed="range === item"
          @click="range = item"
        >近 {{ item }} 天</button>
      </div>
    </header>

    <section v-if="error" class="beryl-card empty-state" role="alert">
      <b>复盘数据暂时无法读取</b>
      <p>{{ error }}</p>
      <button class="app-button" type="button" @click="void refresh()">重试</button>
    </section>
    <div v-if="loading" class="empty-state" role="status">正在读取复盘数据…</div>

    <section class="today-review beryl-card">
      <div class="panel-head">
        <div>
          <p class="eyebrow">TODAY REVIEW · <span style="display: contents">{{ date }}</span></p>
          <h2 class="font-title">今天的复盘</h2>
          <p class="review-intro">把事实、条件和明天的调整写下来。</p>
        </div>
        <span v-if="dirty" class="review-dirty">尚未保存</span>
      </div>
      <div ref="pickerRoot" class="master-picker" @keydown="pickerKeydown">
        <div class="master-picker-field">
          <input ref="sentenceInput" v-model="pickerQuery" type="search" role="combobox" aria-label="搜索并插入常用句" aria-autocomplete="list" :aria-expanded="pickerOpen && !drawerOpen" :aria-controls="listboxId" :aria-activedescendant="pickerOpen && sentenceMatches[activeIndex] ? `${listboxId}-${encodeURIComponent(sentenceMatches[activeIndex].id)}` : undefined" placeholder="先聚焦一个复盘字段，再搜索插入常用句…" :disabled="loading || !plan || saving" @focus="pickerOpen = true; drawerOpen = false" @input="activeIndex = 0; pickerOpen = true" @keydown.esc.stop="pickerOpen = false; pickerQuery = ''" />
        </div>
        <div v-if="pickerOpen && !drawerOpen" :id="listboxId" class="master-picker-popup" role="listbox" aria-label="常用句选项">
          <button v-for="(item, index) in sentenceMatches" :id="`${listboxId}-${encodeURIComponent(item.id)}`" :key="item.id" type="button" role="option" :aria-current="activeIndex === index ? 'true' : undefined" :class="['master-picker-option', { active: activeIndex === index }]" :disabled="!activeField" @mousedown.prevent @mouseenter="activeIndex = index" @click="insertSentence(item)"><span class="master-picker-option-icon" aria-hidden="true">✦</span><span class="master-picker-option-copy"><b>{{ item.label }}</b><small v-if="item.detail">{{ item.detail }}</small></span></button>
          <p v-if="sentenceError" class="master-picker-empty" role="alert">常用句加载失败：{{ sentenceError }} <button type="button" @click="void loadSentences()">重试</button></p>
          <p v-else-if="!sentenceMatches.length" class="master-picker-empty">{{ sentenceItems.length ? '没有匹配结果' : '暂无可用常用句' }}</p>
          <div class="master-picker-popup-footer"><span v-if="!activeField" class="master-picker-more-hint">请先点击一个复盘字段</span><span v-else>插入后仍可继续编辑</span><button type="button" @click="openDrawer">浏览全部 →</button></div>
        </div>
        <div v-if="drawerOpen" class="master-picker-overlay" role="presentation"><button type="button" class="master-picker-scrim" aria-label="关闭选择面板" @click="closeDrawer" /><section class="master-picker-drawer" role="dialog" aria-modal="true" aria-label="浏览全部常用句" @keydown.stop="drawerKeydown"><header><div><h2>选择常用句</h2><p>当前编辑的复盘草稿会保留</p></div><button type="button" aria-label="关闭选择面板" @click="closeDrawer">×</button></header><input v-model="drawerQuery" class="master-picker-drawer-search" type="search" aria-label="搜索全部常用句" placeholder="搜索常用句…" /><div class="master-picker-drawer-list"><button v-for="item in drawerMatches" :key="item.id" type="button" role="option" @click="insertSentence(item)"><span class="master-picker-option-icon" aria-hidden="true">✦</span><span class="master-picker-option-copy"><b>{{ item.label }}</b><small v-if="item.detail">{{ item.detail }}</small></span></button><p v-if="!drawerMatches.length" class="master-picker-empty">没有匹配的常用句。</p></div><footer><span>Esc 关闭</span></footer></section></div>
      </div>
      <div class="today-review-grid">
        <label v-for="field in reviewFields" :key="field.key">{{ field.label }}<textarea
          :ref="element => setTextarea(field.key, element as Element | null)"
          :value="review[field.key]"
          :disabled="loading || !plan || saving"
          :aria-label="field.aria"
          @focus="rememberTarget(field.key, $event)"
          @select="syncSelection(field.key, $event)"
          @keyup="syncSelection(field.key, $event)"
          @click="syncSelection(field.key, $event)"
          @input="updateReview(field.key, ($event.target as HTMLTextAreaElement).value); syncSelection(field.key, $event)"
        /><small v-if="review.sourceMaterialIds?.[field.key]?.length" role="status">插入过 {{ review.sourceMaterialIds[field.key]?.length }} 条素材作为来源记录，文字可能已编辑。 <button type="button" :disabled="saving" @click="clearProvenance(field.key)">清除来源</button></small></label>
      </div>
      <div class="today-review-footer">
        <small>本地优先保存 · 冲突时不会覆盖正在编辑的内容</small>
        <button class="app-button primary" type="button" :disabled="loading || !plan || saving" @click="void save()">
          {{ saving ? '保存中…' : '保存今日复盘' }}
        </button>
      </div>
    </section>

    <section class="review-let-go beryl-card">
      <div>
        <p class="eyebrow">LET GO · 结束能力</p>
        <h2 class="font-title">无需继续 / 主动放下</h2>
        <p>写下这轮不再继续的事，不会被系统记作失败。</p>
      </div>
      <textarea
        :value="letGo"
        :disabled="loading || !plan || saving"
        aria-label="复盘中无需继续或主动放下的事项"
        placeholder="例如：这周不再追这个方向；暂时不展开新的学习线索"
        @input="letGo = ($event.target as HTMLTextAreaElement).value; dirty = true"
      />
    </section>

    <section class="stats-grid">
      <article class="stat-card beryl-card"><small>复盘范围</small><b>{{ range }}</b><span>天</span></article>
      <article class="stat-card beryl-card"><small>现实完成</small><b>{{ loading ? '…' : done }}</b><span>条</span></article>
      <article class="stat-card beryl-card"><small>Reality Record</small><b>{{ loading ? '…' : records }}</b><span>条</span></article>
      <article class="stat-card beryl-card"><small>本地优先</small><b>✓</b><span>可离线</span></article>
    </section>

    <section class="review-evidence beryl-card">
      <div class="panel-head">
        <h2 class="font-title">最近证据</h2>
        <span>近 {{ range }} 天 · 先看发生了什么</span>
      </div>
      <div v-for="item in scopedDocs.slice(0, 12)" :key="item.entityType + '-' + item.id" class="evidence-row">
        <i class="dot" :class="item.entityType" />
        <b>{{ item.title || item.body || '未命名' }}</b>
        <span>{{ item.status || item.entityType }}</span>
      </div>
      <p v-if="!loading && !scopedDocs.length" class="muted">近 {{ range }} 天还没有行动或记录。</p>
    </section>
  </div>
</template>
