<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { captureText, decideCapture, type CaptureDecision } from '@/application'
import { withSaveState } from '@/core/save-state'
import { captureAsyncRepository, type AiSuggestion, type CaptureItem } from '@/domain/capture'
import { unifiedAsyncRepository, type Resource } from '@/domain/unified'
import { useCaptureStatusDictionary } from '@/vue/composables/useCaptureStatusDictionary'
import { boundField, fieldValue } from '@/core/feishu/model'
import type { FeishuRecord, FeishuTableKey } from '@/core/api/feishu'
import { watchFeishuWorkspace, type WorkspaceSnapshot } from '@/core/feishu/workspace'
import { feishuWorkspace } from '@/domain/feishu/workspace-instance'
import '@/styles/shared/master-data-picker.css'

interface SentenceItem { id: string; label: string; detail?: string; keywords?: string[] }

const decisions: Array<{ value: CaptureDecision; label: string; hint: string }> = [
  { value: 'action', label: '现在行动', hint: '形成一条可执行的下一步' },
  { value: 'matter', label: '形成事项', hint: '进入持续面对的现实上下文' },
  { value: 'record', label: '保留记录', hint: '保存发生过的事实，不制造待办' },
  { value: 'seed', label: '稍后再看', hint: '保留为还未成熟的种子' },
  { value: 'let_go', label: '放下', hint: '现在不再让它占据注意力' },
]

const sourceStorageKey = 'calmy:workspace:source'
const sourceEvent = 'calmy-workspace-source'
const source = ref<'local' | 'feishu'>(readSource())
const { labelFor: captureStatusLabel, error: captureStatusError, hasLoadedOptions: captureStatusHasLoaded, refresh: refreshCaptureStatusDictionary } = useCaptureStatusDictionary()
const body = ref('')
const sourceMaterialIds = ref<string[]>([])
const captures = ref<CaptureItem[]>([])
const suggestions = ref<AiSuggestion[]>([])
const drafts = reactive<Record<string, string>>({})
const loading = ref(true)
const busyId = ref('')
const error = ref('')
const sentenceItems = ref<SentenceItem[]>([])
const sentenceError = ref('')
const sentenceAttempt = ref(0)
const feishuSnapshot = ref<WorkspaceSnapshot>(feishuWorkspace.getSnapshot())
const localCaptures = computed(() => captures.value.filter(item => item.status === 'inbox' || item.status === 'suggested'))
const history = computed(() => captures.value.filter(item => item.status !== 'inbox' && item.status !== 'suggested').slice(0, 8))
const suggestionByCapture = computed(() => new Map(suggestions.value.map(item => [item.captureId, item])))

const textArea = ref<HTMLTextAreaElement | null>(null)
let selection = { start: 0, end: 0 }
let pickerQuery = ref('')
let pickerOpen = ref(false)
let pickerDrawerOpen = ref(false)
let drawerQuery = ref('')
let activeIndex = ref(0)
let feishuStop: (() => void) | undefined
let unsubscribeFeishu: (() => void) | undefined

const normalizedPickerQuery = computed(() => pickerQuery.value.trim().toLocaleLowerCase())
const sentenceMatches = computed(() => {
  const term = normalizedPickerQuery.value
  const matches = sentenceItems.value.filter(item => [item.label, item.detail || '', ...(item.keywords || [])].join(' ').toLocaleLowerCase().includes(term))
  return term ? matches : matches.slice(0, 8)
})
const drawerMatches = computed(() => {
  const term = drawerQuery.value.trim().toLocaleLowerCase()
  return sentenceItems.value.filter(item => [item.label, item.detail || '', ...(item.keywords || [])].join(' ').toLocaleLowerCase().includes(term))
})

function readSource(): 'local' | 'feishu' {
  try { return localStorage.getItem(sourceStorageKey) === 'feishu' ? 'feishu' : 'local' } catch { return 'local' }
}
function toast(message: string, kind: 'success' | 'warning' | 'error' = 'success'): void {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}
function syncSelection(event?: Event): void {
  const target = (event?.currentTarget || textArea.value) as HTMLTextAreaElement | null
  if (target) selection = { start: target.selectionStart, end: target.selectionEnd }
}
function insertSentence(item: SentenceItem): void {
  const insertion = item.detail || item.label
  const from = Math.max(0, Math.min(selection.start, body.value.length))
  const to = Math.max(from, Math.min(selection.end, body.value.length))
  const next = `${body.value.slice(0, from)}${insertion}${body.value.slice(to)}`
  const caret = from + insertion.length
  body.value = next
  sourceMaterialIds.value = [...new Set([...sourceMaterialIds.value, item.id])]
  pickerQuery.value = ''
  pickerOpen.value = false
  requestAnimationFrame(() => {
    textArea.value?.focus()
    textArea.value?.setSelectionRange(caret, caret)
    selection = { start: caret, end: caret }
  })
}
function pickerKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    pickerOpen.value = true
    if (!sentenceMatches.value.length) return
    activeIndex.value = event.key === 'ArrowDown'
      ? (activeIndex.value + 1) % sentenceMatches.value.length
      : (activeIndex.value - 1 + sentenceMatches.value.length) % sentenceMatches.value.length
  } else if (event.key === 'Home' && pickerOpen.value && sentenceMatches.value.length) {
    event.preventDefault(); activeIndex.value = 0
  } else if (event.key === 'End' && pickerOpen.value && sentenceMatches.value.length) {
    event.preventDefault(); activeIndex.value = sentenceMatches.value.length - 1
  } else if (event.key === 'Enter' && pickerOpen.value && sentenceMatches.value[activeIndex.value]) {
    event.preventDefault(); insertSentence(sentenceMatches.value[activeIndex.value])
  } else if (event.key === 'Escape') {
    pickerOpen.value = false; pickerQuery.value = ''; pickerDrawerOpen.value = false
  }
}
function openSentenceDrawer(): void {
  pickerOpen.value = false
  drawerQuery.value = pickerQuery.value
  pickerDrawerOpen.value = true
}
function closeSentenceDrawer(): void {
  pickerDrawerOpen.value = false
  textArea.value?.focus()
}

async function refresh(): Promise<void> {
  loading.value = true
  try {
    const [nextCaptures, nextSuggestions] = await Promise.all([captureAsyncRepository.list(), captureAsyncRepository.listSuggestions()])
    captures.value = nextCaptures
    suggestions.value = nextSuggestions
    error.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '记录读取失败'
  } finally { loading.value = false }
}
async function loadSentences(): Promise<void> {
  try {
    const resources = await unifiedAsyncRepository.list<Resource>('resource')
    sentenceItems.value = resources.filter(item => item.kind === 'template' && item.status === 'active').map(item => ({ id: item.calmyId, label: item.title, detail: item.body }))
    sentenceError.value = ''
  } catch (cause) { sentenceError.value = cause instanceof Error ? cause.message : '常用句读取失败' }
}
function retrySentences(): void { sentenceAttempt.value++; void loadSentences() }
async function capture(): Promise<void> {
  if (!body.value.trim()) { toast('先写下一段原文', 'warning'); return }
  try {
    const result = await withSaveState(() => captureText(body.value, sourceMaterialIds.value))
    body.value = ''
    sourceMaterialIds.value = []
    await refresh()
    toast(result.suggestionError ? '原文已保存，建议生成失败但不影响使用' : '原文已安全保存')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '记录保存失败', 'error') }
}
async function decide(item: CaptureItem, decision: CaptureDecision): Promise<void> {
  busyId.value = item.calmyId
  try {
    await withSaveState(() => decideCapture({ captureId: item.calmyId, decision }))
    await refresh()
    toast(decision === 'let_go' ? '已放下，不再进入主列表' : `已${decisions.find(option => option.value === decision)?.label}`)
  } catch (cause) {
    toast(cause instanceof Error ? cause.message : '处理记录失败', 'error')
    await refresh()
  } finally { busyId.value = '' }
}
function suggestionText(item: AiSuggestion): string {
  const candidate = item.candidates[0]
  return candidate?.fields.title || candidate?.fields.body || candidate?.label || '建议'
}
async function acceptSuggestion(item: AiSuggestion): Promise<void> {
  busyId.value = item.calmyId
  try {
    const candidate = item.candidates[0]
    const value = drafts[item.calmyId] ?? suggestionText(item)
    await withSaveState(() => captureAsyncRepository.acceptSuggestion(item.calmyId, 0, candidate?.entityType === 'record' ? { body: value } : { title: value }))
    await refresh()
    toast('已采纳 AI 建议，原文仍可追溯')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '采纳建议失败', 'error') }
  finally { busyId.value = '' }
}
async function rejectSuggestion(item: AiSuggestion): Promise<void> {
  busyId.value = item.calmyId
  try {
    await withSaveState(() => captureAsyncRepository.rejectSuggestion(item.calmyId))
    await refresh()
    toast('已忽略建议，原文仍保留')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '忽略建议失败', 'error') }
  finally { busyId.value = '' }
}
function setSource(value: 'local' | 'feishu'): void {
  try {
    localStorage.setItem(sourceStorageKey, value)
    source.value = value
    window.dispatchEvent(new Event(sourceEvent))
  } catch { toast('浏览器无法保存来源选择，请允许网站存储。', 'error') }
}
function onSourceChanged(): void {
  source.value = readSource()
  if (source.value === 'feishu') openFeishuWatch()
  else closeFeishuWatch()
}
function updateFeishuSnapshot(): void { feishuSnapshot.value = feishuWorkspace.getSnapshot() }
function openFeishuWatch(): void {
  if (source.value !== 'feishu' || feishuStop) return
  feishuStop = watchFeishuWorkspace(feishuWorkspace)
}
function closeFeishuWatch(): void { feishuStop?.(); feishuStop = undefined }
function title(snapshot: WorkspaceSnapshot, table: FeishuTableKey, record: FeishuRecord): string {
  const raw = fieldValue(record, snapshot.fields[table] || [], snapshot.bindings[table] || {}, 'title')
  return valueText(raw) || '标题字段未识别'
}
function valueText(raw: unknown): string {
  if (raw == null) return ''
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw)
  if (Array.isArray(raw)) return raw.map(valueText).filter(Boolean).join('、')
  if (typeof raw === 'object' && 'text' in raw) return String((raw as { text?: unknown }).text ?? '')
  if (typeof raw === 'object' && 'name' in raw) return String((raw as { name?: unknown }).name ?? '')
  return ''
}
const projectField = computed(() => boundField(feishuSnapshot.value.fields.tasks || [], feishuSnapshot.value.bindings.tasks || {}, 'project'))
const taskTitleField = computed(() => boundField(feishuSnapshot.value.fields.tasks || [], feishuSnapshot.value.bindings.tasks || {}, 'title'))
const canCreateFeishuTask = computed(() => feishuSnapshot.value.ready && taskTitleField.value?.type === 1)
const feishuTaskTitle = ref('')
const feishuProjectId = ref('')
const feishuMessage = ref('')
const projectPickerRoot = ref<HTMLElement | null>(null)
const projectPickerOpen = ref(false)
const projectActiveValue = ref('')
const projectTypeahead = ref('')
let projectTypeaheadTimer: number | undefined
const projectOptions = computed(() => [
  { value: '', label: '不关联项目', disabled: false },
  ...feishuSnapshot.value.tables.projects.map(record => ({ value: record.record_id, label: title(feishuSnapshot.value, 'projects', record), disabled: false }))
])
const selectedProjectLabel = computed(() => projectOptions.value.find(option => option.value === feishuProjectId.value)?.label || projectOptions.value[0].label)
const projectPickerDisabled = computed(() => feishuSnapshot.value.saving || !!feishuSnapshot.value.tableErrors.projects || !projectField.value || ![18, 21].includes(projectField.value.type))
const projectListboxId = 'capture-feishu-project-listbox'

watch(body, value => { if (!value.trim()) sourceMaterialIds.value = [] })

function openProjectPicker(initialValue?: string): void {
  const selected = projectOptions.value.find(option => option.value === feishuProjectId.value && !option.disabled)
  projectActiveValue.value = initialValue ?? selected?.value ?? projectOptions.value.find(option => !option.disabled)?.value ?? ''
  projectPickerOpen.value = true
}
function chooseProject(value: string): void { feishuProjectId.value = value; projectPickerOpen.value = false }
function stepProjectOption(direction: 1 | -1): void {
  const currentIndex = projectOptions.value.findIndex(option => option.value === projectActiveValue.value)
  for (let offset = 1; offset <= projectOptions.value.length; offset++) {
    const index = (currentIndex + direction * offset + projectOptions.value.length) % projectOptions.value.length
    if (!projectOptions.value[index].disabled) { projectActiveValue.value = projectOptions.value[index].value; break }
  }
}
function projectPickerKeydown(event: KeyboardEvent): void {
  if (projectPickerDisabled.value) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!projectPickerOpen.value) openProjectPicker(event.key === 'ArrowUp' ? projectOptions.value.slice().reverse().find(option => !option.disabled)?.value : undefined)
    else stepProjectOption(event.key === 'ArrowDown' ? 1 : -1)
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    projectActiveValue.value = (event.key === 'Home' ? projectOptions.value : projectOptions.value.slice().reverse()).find(option => !option.disabled)?.value ?? ''
    projectPickerOpen.value = true
  } else if ((event.key === 'Enter' || event.key === ' ') && projectPickerOpen.value) {
    event.preventDefault(); chooseProject(projectActiveValue.value)
  } else if ((event.key === 'Enter' || event.key === ' ') && !projectPickerOpen.value) {
    event.preventDefault(); openProjectPicker()
  } else if (event.key === 'Escape' && projectPickerOpen.value) {
    event.preventDefault(); projectPickerOpen.value = false
  } else if (event.key === 'Tab') projectPickerOpen.value = false
  else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    projectTypeahead.value += event.key.toLocaleLowerCase()
    if (projectTypeaheadTimer) window.clearTimeout(projectTypeaheadTimer)
    projectTypeaheadTimer = window.setTimeout(() => { projectTypeahead.value = '' }, 650)
    const match = projectOptions.value.find(option => !option.disabled && option.label.toLocaleLowerCase().startsWith(projectTypeahead.value))
    if (match) projectActiveValue.value = match.value
  }
}
function onProjectPickerPointerDown(event: PointerEvent): void {
  if (event.target instanceof Node && !projectPickerRoot.value?.contains(event.target)) projectPickerOpen.value = false
}
watch(projectPickerOpen, open => {
  if (open) document.addEventListener('pointerdown', onProjectPickerPointerDown)
  else document.removeEventListener('pointerdown', onProjectPickerPointerDown)
})
async function createFeishuTask(): Promise<void> {
  if (!feishuTaskTitle.value.trim() || !feishuSnapshot.value.ready || feishuSnapshot.value.saving) return
  feishuMessage.value = ''
  try {
    await feishuWorkspace.createTask(feishuTaskTitle.value, feishuProjectId.value)
    feishuTaskTitle.value = ''; feishuProjectId.value = ''
    feishuMessage.value = '任务已保存到飞书。'
    toast(feishuMessage.value)
  } catch (cause) {
    feishuMessage.value = cause instanceof Error ? cause.message : '任务保存未确认'
    toast('飞书保存未确认，输入已保留，请先检查飞书。', 'error')
  }
}

onMounted(() => {
  void refresh()
  void loadSentences()
  window.addEventListener('beryl-data-synced', refresh)
  window.addEventListener('beryl-data-synced', loadSentences)
  window.addEventListener(sourceEvent, onSourceChanged)
  window.addEventListener('storage', onSourceChanged)
  unsubscribeFeishu = feishuWorkspace.subscribe(updateFeishuSnapshot)
  openFeishuWatch()
})
onUnmounted(() => {
  window.removeEventListener('beryl-data-synced', refresh)
  window.removeEventListener('beryl-data-synced', loadSentences)
  window.removeEventListener(sourceEvent, onSourceChanged)
  window.removeEventListener('storage', onSourceChanged)
  unsubscribeFeishu?.()
  closeFeishuWatch()
  document.removeEventListener('pointerdown', onProjectPickerPointerDown)
  if (projectTypeaheadTimer) window.clearTimeout(projectTypeaheadTimer)
})
</script>

<template>
    <p v-if="captureStatusError" class="info" role="alert">收集状态字典读取失败，{{ captureStatusHasLoaded ? '仍使用上次成功读取的名称。' : '当前使用内置名称。' }}<button type="button" class="app-button" @click="refreshCaptureStatusDictionary">重试</button></p>
    <section class="beryl-card workspace-source" aria-label="数据来源">
      <div><b>数据来源</b><div class="range-tabs" role="group" aria-label="选择数据来源">
        <button type="button" :aria-pressed="source === 'local'" :class="{ on: source === 'local' }" :disabled="feishuSnapshot.saving" @click="setSource('local')">本地</button>
        <button type="button" :aria-pressed="source === 'feishu'" :class="{ on: source === 'feishu' }" :disabled="feishuSnapshot.saving" @click="setSource('feishu')">飞书</button>
      </div></div>
      <small>{{ source === 'feishu' ? '任务直接保存在飞书；前台每 15 秒检查更新。' : '保留原有本机数据；切换来源不会迁移或删除数据。' }}</small>
      <RouterLink to="/app/admin">连接设置 →</RouterLink><RouterLink to="/app/feishu">飞书 →</RouterLink>
    </section>

    <div v-if="source === 'local'" class="capture-gate-page">
      <header class="page-head"><div><p class="eyebrow">记录 · 原文优先</p><h1 class="font-title">先收下来，再决定它是什么</h1><p>原文先安全保存；整理可以延后，判断权一直在你手里。</p></div><span class="load-pill">{{ loading ? '正在读取…' : `${localCaptures.length} 条等待选择` }}</span></header>

      <section class="capture-box capture-gate-input beryl-card">
        <div class="capture-composer-tools"><span>先保留原文</span>
          <div class="master-picker" @keydown="pickerKeydown">
            <div class="master-picker-field"><input aria-label="插入常用句" role="combobox" aria-autocomplete="list" :aria-expanded="pickerOpen && !pickerDrawerOpen" placeholder="插入常用句…" v-model="pickerQuery" @focus="pickerOpen = true; pickerDrawerOpen = false" @input="activeIndex = 0; pickerOpen = true" @keydown.esc.stop="pickerOpen = false; pickerQuery = ''; pickerDrawerOpen = false" /></div>
            <div v-if="pickerOpen && !pickerDrawerOpen" class="master-picker-popup" role="listbox" aria-label="插入常用句选项">
              <button v-for="(item, index) in sentenceMatches" :key="item.id" type="button" role="option" :data-item-id="item.id" :aria-current="activeIndex === index ? 'true' : undefined" :class="['master-picker-option', { active: activeIndex === index }]" @mousedown.prevent @mouseenter="activeIndex = index" @click="insertSentence(item)"><span class="master-picker-option-icon" aria-hidden="true">✦</span><span class="master-picker-option-copy"><b>{{ item.label }}</b><small v-if="item.detail">{{ item.detail }}</small></span></button>
              <p v-if="!sentenceMatches.length" class="master-picker-empty">没有匹配结果</p>
              <div class="master-picker-popup-footer"><span v-if="!normalizedPickerQuery && sentenceItems.length > sentenceMatches.length" class="master-picker-more-hint">输入关键词筛选更多</span><button type="button" @click="openSentenceDrawer">浏览全部 →</button></div>
            </div>
            <div v-if="pickerDrawerOpen" class="master-picker-overlay" role="presentation"><button type="button" class="master-picker-scrim" aria-label="关闭选择面板" @click="closeSentenceDrawer" /><section class="master-picker-drawer" role="dialog" aria-modal="true" aria-label="选择常用句" @keydown.esc.stop="closeSentenceDrawer"><header><div><h2>选择常用句</h2><p>仍保留当前页面的编辑内容</p></div><button type="button" aria-label="关闭选择面板" @click="closeSentenceDrawer">×</button></header><input v-model="drawerQuery" class="master-picker-drawer-search" type="search" aria-label="搜索全部常用句" placeholder="搜索常用句…" /><div class="master-picker-drawer-list"><button v-for="item in drawerMatches" :key="item.id" type="button" role="option" :data-item-id="item.id" @click="insertSentence(item)"><span class="master-picker-option-icon" aria-hidden="true">✦</span><span class="master-picker-option-copy"><b>{{ item.label }}</b><small v-if="item.detail">{{ item.detail }}</small></span></button><p v-if="!drawerMatches.length" class="master-picker-empty">没有匹配的常用句。</p></div><footer><span>Esc 关闭</span></footer></section></div>
          </div>
        </div>
        <p v-if="sentenceError" class="master-sentence-error" role="alert">常用句暂不可用：{{ sentenceError }} <button type="button" @click="retrySentences">重试</button></p>
        <textarea ref="textArea" v-model="body" aria-label="记录原文" placeholder="脑中闪过什么？先放在这里…" @select="syncSelection" @blur="syncSelection" @keydown.ctrl.enter.prevent="capture" @keydown.meta.enter.prevent="capture" />
        <small v-if="sourceMaterialIds.length" role="status">曾插入 {{ sourceMaterialIds.length }} 条句子素材作为来源记录，正文可能已编辑。 <button type="button" @click="sourceMaterialIds = []">清除来源记录</button></small>
        <div class="capture-footer"><span>Ctrl / ⌘ + Enter 保存原文</span><button class="app-button primary" type="button" @click="capture">保存原文</button></div>
      </section>

      <section v-if="error" class="beryl-card empty-state" role="alert"><b>记录数据暂时无法读取</b><p>{{ error }}</p><button class="app-button" type="button" @click="refresh">重试</button></section>
      <section class="capture-gate-list" aria-label="待处理记录">
        <article v-for="item in localCaptures" :key="item.calmyId" class="capture-gate-card beryl-card">
          <div class="capture-original"><div class="panel-head"><div><p class="eyebrow">原文 · 已安全保存</p><h2 class="font-title">{{ item.body.split(/\r?\n/, 1)[0].slice(0, 120) || '未命名原文' }}</h2></div><small>{{ new Date(item.updatedAt).toLocaleString('zh-CN') }}</small></div><p>{{ item.body }}</p><small v-if="item.sourceMaterialIds?.length">曾插入 {{ item.sourceMaterialIds.length }} 条句子素材 · 正文可能已编辑</small></div>
          <div class="attention-gate"><div class="attention-gate-question"><span class="gate-mark">?</span><div><h3>它值得我现在注意吗？</h3><small>选择一个处理方式，不需要当场解释全部。</small></div></div><div class="gate-actions"><button v-for="option in decisions" :key="option.value" type="button" :class="{ 'let-go-choice': option.value === 'let_go' }" :disabled="busyId === item.calmyId || busyId === suggestionByCapture.get(item.calmyId)?.calmyId" @click="decide(item, option.value)"><b>{{ option.label }}</b><small>{{ option.hint }}</small></button></div></div>
          <div v-if="suggestionByCapture.get(item.calmyId)?.status === 'suggested'" class="capture-ai-suggestion"><div class="panel-head"><div><span class="ai-chip">AI 建议</span><h3>{{ suggestionText(suggestionByCapture.get(item.calmyId)!) }}</h3></div><small>仅供参考 · {{ Math.round(suggestionByCapture.get(item.calmyId)!.confidence * 100) }}%</small></div><p>{{ suggestionByCapture.get(item.calmyId)!.rationale }}</p><details><summary>查看依据</summary><p>{{ suggestionByCapture.get(item.calmyId)!.candidates[0]?.evidence?.join('；') || '暂无额外依据' }} · 本地规则</p></details><input aria-label="AI 建议内容" :value="drafts[suggestionByCapture.get(item.calmyId)!.calmyId] ?? suggestionText(suggestionByCapture.get(item.calmyId)!)" @input="drafts[suggestionByCapture.get(item.calmyId)!.calmyId] = ($event.target as HTMLInputElement).value" /><div class="suggestion-actions"><button class="app-button" type="button" :disabled="busyId === suggestionByCapture.get(item.calmyId)!.calmyId" @click="acceptSuggestion(suggestionByCapture.get(item.calmyId)!)">采纳建议</button><button class="app-button" type="button" :disabled="busyId === suggestionByCapture.get(item.calmyId)!.calmyId" @click="rejectSuggestion(suggestionByCapture.get(item.calmyId)!)">忽略建议</button></div></div>
        </article>
        <div v-if="!loading && !localCaptures.length" class="capture-empty beryl-card"><span class="gate-mark">✓</span><h2 class="font-title">这里现在是空的</h2><p>新的念头先放进上面的原文框；没有需要处理的内容时，也可以直接离开。</p></div>
      </section>

      <section class="capture-history"><div class="section-title"><h2 class="font-title">已经处理的原文</h2><span>{{ history.length ? '最近 8 条' : '还没有' }}</span></div><article v-for="item in history" :key="item.calmyId" class="capture-history-row beryl-card"><div><b>{{ item.body.split(/\r?\n/, 1)[0].slice(0, 100) }}</b><small>{{ captureStatusLabel(item.status) }} · {{ new Date(item.updatedAt).toLocaleString('zh-CN') }}<template v-if="item.sourceMaterialIds?.length"> · 曾插入 {{ item.sourceMaterialIds.length }} 条素材</template></small></div><span>{{ item.status === 'accepted' ? '✓' : '—' }}</span></article></section>
    </div>

    <div v-else class="feishu-page">
      <header class="page-head"><div><p class="eyebrow">记录 · 飞书</p><h1 class="font-title">快速记下一项任务</h1><p>这里明确创建飞书任务。通用想法和原文仍可切换到本地记录保存。</p></div></header>
      <section class="feishu-read-state" aria-label="飞书连接状态"><span role="status">{{ feishuSnapshot.saving ? '正在写入飞书…' : feishuSnapshot.loading ? (feishuSnapshot.cacheUpdatedAt ? `正在检查更新 · 当前显示 ${new Date(feishuSnapshot.cacheUpdatedAt).toLocaleString('zh-CN')} 的本机缓存` : '正在连接飞书并读取数据…') : feishuSnapshot.error ? (feishuSnapshot.cacheUpdatedAt ? `飞书暂不可用 · 当前显示 ${new Date(feishuSnapshot.cacheUpdatedAt).toLocaleString('zh-CN')} 的本机缓存（只读）` : '飞书未连接，尚无本机缓存') : feishuSnapshot.usingCache && feishuSnapshot.cacheUpdatedAt ? `部分数据来自本机缓存 · ${new Date(feishuSnapshot.cacheUpdatedAt).toLocaleString('zh-CN')}` : feishuSnapshot.lastRead ? `上次读取 ${new Date(feishuSnapshot.lastRead).toLocaleTimeString('zh-CN')}` : '尚未读取飞书数据' }}</span><button class="app-button" type="button" :disabled="feishuSnapshot.loading || feishuSnapshot.saving" @click="feishuWorkspace.refresh()">刷新</button></section>
      <section v-if="feishuSnapshot.error" class="beryl-card empty-state" role="alert"><b>飞书连接暂不可用</b><p>{{ feishuSnapshot.error }}</p><small>{{ feishuSnapshot.cacheUpdatedAt ? `下方内容来自本机缓存，更新时间：${new Date(feishuSnapshot.cacheUpdatedAt).toLocaleString('zh-CN')}。当前只能查看，不能修改飞书数据。` : '没有可显示的本机缓存；连接恢复后可重新读取飞书数据。' }}</small><p><RouterLink to="/app/admin">检查 Worker 地址与同步密码</RouterLink></p></section>
      <p v-if="feishuSnapshot.writeError" class="beryl-card feishu-message" role="alert">{{ feishuSnapshot.writeError }}</p>
      <section class="beryl-card feishu-composer" aria-label="创建飞书任务"><label>任务标题<textarea v-model="feishuTaskTitle" aria-label="飞书任务标题" :disabled="feishuSnapshot.saving" placeholder="只写一个可以去做的下一步…" @keydown.ctrl.enter.prevent="createFeishuTask" @keydown.meta.enter.prevent="createFeishuTask" /></label><div class="create-row"><label>项目（可选）<div ref="projectPickerRoot" class="calmy-select" data-calmy-select><button id="capture-feishu-project" type="button" role="combobox" aria-haspopup="listbox" aria-controls="capture-feishu-project-listbox" aria-label="飞书任务关联项目" :aria-expanded="projectPickerOpen" :aria-activedescendant="projectPickerOpen ? `${projectListboxId}-${encodeURIComponent(projectActiveValue)}` : undefined" class="calmy-select__trigger" :disabled="projectPickerDisabled" @click="projectPickerOpen ? projectPickerOpen = false : openProjectPicker()" @keydown="projectPickerKeydown"><span class="calmy-select__value">{{ selectedProjectLabel }}</span><svg :class="['calmy-select__chevron', { 'is-open': projectPickerOpen }]" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></button><input type="hidden" name="projectId" :value="feishuProjectId" :disabled="projectPickerDisabled" /><div v-if="projectPickerOpen" class="calmy-select__popup"><div :id="projectListboxId" role="listbox" aria-labelledby="capture-feishu-project" class="calmy-select__listbox"><div v-for="option in projectOptions" :id="`${projectListboxId}-${encodeURIComponent(option.value)}`" :key="option.value" role="option" :aria-selected="option.value === feishuProjectId" :aria-disabled="option.disabled || undefined" :data-value="option.value" :class="['calmy-select__option', { 'is-selected': option.value === feishuProjectId, 'is-active': option.value === projectActiveValue, 'is-disabled': option.disabled }]" @mousedown.prevent @mouseenter="!option.disabled && (projectActiveValue = option.value)" @click="chooseProject(option.value)"><span>{{ option.label }}</span><span class="calmy-select__check" aria-hidden="true" /></div></div></div></div></label><button class="app-button primary" type="button" :disabled="!feishuTaskTitle.trim() || !canCreateFeishuTask || feishuSnapshot.saving" @click="createFeishuTask">{{ feishuSnapshot.saving ? '正在保存…' : '保存到飞书' }}</button></div><p v-if="feishuSnapshot.ready && !canCreateFeishuTask" role="alert">任务标题字段缺失或类型已变化，暂不能新增。</p><small>不要求日期或优先级；不会另建本地行动。Ctrl / ⌘ + Enter 保存。</small><p v-if="feishuMessage" role="status">{{ feishuMessage }}</p></section>
      <p><RouterLink to="/app/today">去今天选择任务 →</RouterLink>　<RouterLink to="/app/task-board">查看看板 →</RouterLink></p>
    </div>
</template>
