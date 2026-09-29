<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue'
import { withSaveState } from '@/core/save-state'
import { createAsyncCollectionRepository } from '@/core/repository'
import { dateKey, todayKey } from '@/core/storage'
import { listRealityDocumentsAsync } from '@/domain/reality'
import { unifiedAsyncRepository, type Resource } from '@/domain/unified'
import { insertTextAtRange } from '@/domain/master-data-text'
import '@/styles/shared/master-data-picker.css'

interface DiaryEntry { date: string; content: string }
interface SentenceItem { id: string; label: string; detail?: string }
const diaryRepository = createAsyncCollectionRepository<DiaryEntry>('diary', item => item.date)
const selectedDate = ref(todayKey())
const content = ref('')
const entries = ref<DiaryEntry[]>([])
const entryCountSegments = computed(() => [String(entries.value.length), ' 篇记录'])
const query = ref('')
const saving = ref(false)
const loading = ref(true)
const contentLoading = ref(true)
const error = ref('')
const sentenceItems = ref<SentenceItem[]>([])
const sentenceError = ref('')
const pickerQuery = ref('')
const drawerQuery = ref('')
const pickerOpen = ref(false)
const drawerOpen = ref(false)
const activeIndex = ref(0)
const editor = ref<HTMLTextAreaElement | null>(null)
const pickerRoot = ref<HTMLElement | null>(null)
const pickerInput = ref<HTMLInputElement | null>(null)
const listboxId = `diary-sentence-${useId()}`
let selection = { start: 0, end: 0 }
let contentRead = 0
let mounted = false
let drawerFocusTimer: number | undefined

function toast(message: string, kind: 'success' | 'warning' | 'error' = 'success'): void {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}
function isDiaryEntry(value: unknown): value is DiaryEntry {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<DiaryEntry>
  return typeof item.date === 'string' && typeof item.content === 'string'
}
async function readEntries(): Promise<DiaryEntry[]> {
  const documents = await listRealityDocumentsAsync({ types: ['diary'] })
  const stored = (await diaryRepository.list()).filter(isDiaryEntry)
  const storedByDate = new Map(stored.map(item => [item.date, item.content]))
  return documents.map(document => {
    const date = document.date || document.id
    const text = storedByDate.get(date) || document.body || document.summary
    return { date, content: text.trim() }
  }).filter(item => item.date && item.content).sort((left, right) => right.date.localeCompare(left.date))
}
async function readContent(date: string): Promise<string> {
  const stored = (await diaryRepository.list()).filter(isDiaryEntry)
  const exact = stored.find(item => item.date === date)
  if (exact) return exact.content
  const document = (await listRealityDocumentsAsync({ types: ['diary'] })).find(item => (item.date || item.id) === date)
  return document?.body || document?.summary || ''
}
function shiftDate(value: string, amount: number): string {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  date.setDate(date.getDate() + amount)
  return dateKey(date)
}
function shortContent(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length > 96 ? `${compact.slice(0, 96)}…` : compact
}
const visibleEntries = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase()
  return normalized ? entries.value.filter(item => `${item.date} ${item.content}`.toLocaleLowerCase().includes(normalized)) : entries.value
})
async function refresh(): Promise<void> {
  loading.value = true
  try { entries.value = await readEntries(); error.value = '' }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '日记读取失败' }
  finally { loading.value = false }
}
watch(selectedDate, async date => {
  const currentRead = ++contentRead
  contentLoading.value = true
  try {
    const nextContent = await readContent(date)
    if (mounted && currentRead === contentRead) content.value = nextContent
  } catch (cause) {
    if (mounted && currentRead === contentRead) error.value = cause instanceof Error ? cause.message : '日记读取失败'
  } finally {
    if (mounted && currentRead === contentRead) contentLoading.value = false
  }
}, { immediate: true })
function selectDate(date: string): void { if (date) selectedDate.value = date }
async function save(event: Event): Promise<void> {
  event.preventDefault()
  const value = content.value.trim()
  if (!value) { toast('写点什么再保存吧', 'warning'); return }
  const date = selectedDate.value
  saving.value = true
  try {
    await withSaveState(async () => {
      const current = (await diaryRepository.list()).filter(isDiaryEntry)
      const existing = current.find(item => item.date === date)
      if (existing) {
        if (!await diaryRepository.update(date, () => ({ ...existing, content: value }))) throw new Error('日记保存失败，请检查本地存储状态')
      } else await diaryRepository.create({ date, content: value })
    })
    content.value = value
    await refresh()
    toast(`日记已保存 · ${date} 📓`)
  } catch (cause) { toast(cause instanceof Error ? cause.message : '日记保存失败', 'error') }
  finally { saving.value = false }
}
function syncSelection(event?: Event): void {
  const target = (event?.currentTarget || editor.value) as HTMLTextAreaElement | null
  if (target) selection = { start: target.selectionStart, end: target.selectionEnd }
}
function insertSentence(item: SentenceItem): void {
  const next = insertTextAtRange(content.value, selection.start, selection.end, item.detail || item.label)
  content.value = next.value
  pickerOpen.value = false
  drawerOpen.value = false
  pickerQuery.value = ''
  drawerQuery.value = ''
  void nextTick(() => requestAnimationFrame(() => {
    editor.value?.focus()
    editor.value?.setSelectionRange(next.caret, next.caret)
    selection = { start: next.caret, end: next.caret }
  }))
}
const normalizedPickerQuery = computed(() => pickerQuery.value.trim().toLocaleLowerCase())
const sentenceMatches = computed(() => {
  const term = normalizedPickerQuery.value
  const matches = sentenceItems.value.filter(item => `${item.label} ${item.detail || ''}`.toLocaleLowerCase().includes(term))
  return term ? matches : matches.slice(0, 8)
})
const drawerMatches = computed(() => {
  const term = drawerQuery.value.trim().toLocaleLowerCase()
  return sentenceItems.value.filter(item => `${item.label} ${item.detail || ''}`.toLocaleLowerCase().includes(term))
})
function pickerKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault(); pickerOpen.value = true
    if (!sentenceMatches.value.length) return
    activeIndex.value = (activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + sentenceMatches.value.length) % sentenceMatches.value.length
  } else if (event.key === 'Home' && pickerOpen.value && sentenceMatches.value.length) {
    event.preventDefault(); activeIndex.value = 0
  } else if (event.key === 'End' && pickerOpen.value && sentenceMatches.value.length) {
    event.preventDefault(); activeIndex.value = sentenceMatches.value.length - 1
  } else if (event.key === 'Enter' && pickerOpen.value && sentenceMatches.value[activeIndex.value]) {
    event.preventDefault(); insertSentence(sentenceMatches.value[activeIndex.value])
  } else if (event.key === 'Escape') {
    pickerOpen.value = false; pickerQuery.value = ''; drawerOpen.value = false
  }
}
function openDrawer(): void {
  pickerOpen.value = false; drawerQuery.value = pickerQuery.value; drawerOpen.value = true
  drawerFocusTimer = window.setTimeout(() => pickerRoot.value?.querySelector<HTMLInputElement>('.master-picker-drawer-search')?.focus(), 0)
}
function closeDrawer(): void { drawerOpen.value = false; pickerInput.value?.focus() }
async function loadSentences(): Promise<void> {
  try {
    const resources = await unifiedAsyncRepository.list<Resource>('resource')
    if (!mounted) return
    sentenceItems.value = resources.filter(item => item.kind === 'template' && item.status === 'active').map(item => ({ id: item.calmyId, label: item.title, detail: item.body }))
    sentenceError.value = ''
  } catch (cause) { if (mounted) sentenceError.value = cause instanceof Error ? cause.message : '常用句读取失败' }
}
function onDataSynced(): void { void refresh(); void loadSentences() }
function onPointerDown(event: PointerEvent): void {
  if (drawerOpen.value) return
  if (pickerOpen.value && event.target instanceof Node && !pickerRoot.value?.contains(event.target)) pickerOpen.value = false
}
onMounted(() => {
  mounted = true
  void refresh()
  void loadSentences()
  window.addEventListener('beryl-data-synced', onDataSynced)
  document.addEventListener('pointerdown', onPointerDown)
})
onUnmounted(() => {
  mounted = false; contentRead++
  if (drawerFocusTimer !== undefined) window.clearTimeout(drawerFocusTimer)
  window.removeEventListener('beryl-data-synced', onDataSynced)
  document.removeEventListener('pointerdown', onPointerDown)
})
</script>

<template>
  <div class="diary-page">
    <header class="page-head"><div><p class="eyebrow">日记 · 每日回顾</p><h1 class="font-title">日记</h1><p>按日期留下今天的心情、观察与收获，历史记录保存在本机 diary 数据集中。</p></div><span class="load-pill"><template v-for="(segment,index) in entryCountSegments" :key="index">{{segment}}</template></span></header>
    <section v-if="error" class="beryl-card empty-state" role="alert" style="margin-bottom: 16px"><b>日记数据暂时无法读取</b><p>{{ error }}</p><button class="app-button" type="button" @click="refresh">重试</button></section>
    <section class="beryl-card" style="padding: 16px; margin-bottom: 16px">
      <div class="panel-head" style="align-items: flex-end; gap: 12px; flex-wrap: wrap"><div><p class="eyebrow">DAILY NOTE</p><h2 class="font-title">{{ selectedDate === todayKey() ? '今日日记' : '编辑日记' }}</h2></div><div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap"><button class="app-button" type="button" :disabled="saving" aria-label="前一天" @click="selectDate(shiftDate(selectedDate, -1))">←</button><input type="date" aria-label="选择日记日期" :value="selectedDate" :disabled="saving" @change="selectDate(($event.target as HTMLInputElement).value)"><button class="app-button" type="button" :disabled="saving" aria-label="后一天" @click="selectDate(shiftDate(selectedDate, 1))">→</button><button class="app-button" type="button" :disabled="saving" @click="selectDate(todayKey())">今天</button></div></div>
      <form style="margin-top: 16px" @submit="save">
        <div style="display: flex; justify-content: flex-end; margin-bottom: 8px">
          <div ref="pickerRoot" class="master-picker">
            <div class="master-picker-field"><input ref="pickerInput" v-model="pickerQuery" type="text" role="combobox" aria-label="插入常用句" aria-autocomplete="list" :aria-expanded="pickerOpen && !drawerOpen" :aria-controls="listboxId" :aria-activedescendant="pickerOpen && sentenceMatches[activeIndex] ? `${listboxId}-${encodeURIComponent(sentenceMatches[activeIndex].id)}` : undefined" placeholder="插入常用句…" @focus="pickerOpen = true; drawerOpen = false" @input="activeIndex = 0; pickerOpen = true" @keydown="pickerKeydown"></div>
            <div v-if="pickerOpen && !drawerOpen" :id="listboxId" class="master-picker-popup" role="listbox" aria-label="插入常用句选项">
              <button v-for="(item, index) in sentenceMatches" :id="`${listboxId}-${encodeURIComponent(item.id)}`" :key="item.id" type="button" role="option" :data-item-id="item.id" :aria-selected="false" :aria-current="activeIndex === index ? 'true' : undefined" :class="['master-picker-option', { active: activeIndex === index }]" @mousedown.prevent @mouseenter="activeIndex = index" @click="insertSentence(item)"><span class="master-picker-option-icon" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><path d="M10 16.5V9.7m0 2.1c0-3.2-2-5.1-5.3-5.4.1 3.6 1.6 5.7 5.3 6.1Zm0 1.2c.1-3.1 2-4.8 5.1-5-.1 3.2-1.7 5.2-5.1 5Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" /></svg></span><span class="master-picker-option-copy"><b>{{ item.label }}</b><small v-if="item.detail">{{ item.detail }}</small></span></button>
              <p v-if="!sentenceMatches.length" class="master-picker-empty">没有匹配结果</p>
              <div class="master-picker-popup-footer"><span v-if="!normalizedPickerQuery && sentenceItems.length > sentenceMatches.length" class="master-picker-more-hint">输入关键词筛选更多</span><button type="button" @click="openDrawer">浏览全部 →</button></div>
            </div>
            <div v-if="drawerOpen" class="master-picker-overlay" role="presentation"><button type="button" class="master-picker-scrim" aria-label="关闭选择面板" @click="closeDrawer" /><section class="master-picker-drawer" role="dialog" aria-modal="true" aria-label="选择常用句" @keydown.esc.stop="closeDrawer"><header><div><h2>选择常用句</h2><p>仍保留当前页面的编辑内容</p></div><button type="button" aria-label="关闭选择面板" @click="closeDrawer">×</button></header><input v-model="drawerQuery" class="master-picker-drawer-search" type="search" aria-label="搜索全部常用句" placeholder="搜索常用句…"><div class="master-picker-drawer-list"><button v-for="item in drawerMatches" :key="item.id" type="button" role="option" :data-item-id="item.id" @click="insertSentence(item)"><span class="master-picker-option-icon" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><path d="M10 16.5V9.7m0 2.1c0-3.2-2-5.1-5.3-5.4.1 3.6 1.6 5.7 5.3 6.1Zm0 1.2c.1-3.1 2-4.8 5.1-5-.1 3.2-1.7 5.2-5.1 5Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" /></svg></span><span class="master-picker-option-copy"><b>{{ item.label }}</b><small v-if="item.detail">{{ item.detail }}</small></span></button><p v-if="!drawerMatches.length" class="master-picker-empty">没有匹配的常用句。</p></div><footer><span>Esc 关闭</span></footer></section></div>
          </div>
        </div>
        <p v-if="sentenceError" class="master-sentence-error" role="alert">常用句暂不可用：{{ sentenceError }} <button type="button" @click="loadSentences">重试</button></p>
        <textarea ref="editor" :value="contentLoading ? '' : content" :aria-label="`${selectedDate} 日记内容`" :disabled="saving || contentLoading" placeholder="写下今天的心情、想法与收获…" rows="10" style="width: 100%; resize: vertical; min-height: 180px; box-sizing: border-box" @input="content = ($event.target as HTMLTextAreaElement).value" @select="syncSelection" @blur="syncSelection" />
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 12px"><span class="muted">{{ contentLoading ? '正在读取当前日期…' : `${content.length} 字 · 选择任意日期即可补写历史记录` }}</span><button class="app-button primary" type="submit" :disabled="saving || contentLoading">{{ saving ? '保存中…' : '保存日记' }}</button></div>
      </form>
    </section>
    <section class="beryl-card" style="padding: 16px"><div class="panel-head" style="gap: 12px; flex-wrap: wrap"><div><p class="eyebrow">DIARY INDEX</p><h2 class="font-title">历史记录</h2></div><input v-model="query" aria-label="搜索日记" placeholder="搜索日期或内容" style="flex: 1 1 220px; min-width: 0"></div>
      <div v-if="loading" class="empty-state" role="status">正在读取日记…</div>
      <div v-else-if="visibleEntries.length" class="list" aria-live="polite" style="margin-top: 16px; display: grid; gap: 8px"><button v-for="entry in visibleEntries" :key="entry.date" type="button" class="beryl-card hoverable" :aria-pressed="entry.date === selectedDate" :style="{ padding: '12px', textAlign: 'left', cursor: 'pointer', borderColor: entry.date === selectedDate ? 'var(--scene-border-strong)' : undefined }" @click="selectDate(entry.date)"><span style="display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap"><strong>{{ entry.date }}{{ entry.date === todayKey() ? ' · 今天' : '' }}</strong><span class="muted">打开编辑</span></span><span style="display: block; margin-top: 6px; color: var(--c-text-2); overflow-wrap: anywhere">{{ shortContent(entry.content) }}</span></button></div>
      <div v-else class="empty-state">{{ query ? '没有匹配的日记。' : '还没有日记，写下第一篇吧。' }}</div>
    </section>
  </div>
</template>
