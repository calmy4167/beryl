<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { captureAsyncRepository, type AiSuggestion, type CaptureItem } from '@/domain/capture'
import { captureText } from '@/application/use-cases'
import { listRealityDocuments } from '@/domain/reality'
import { withSaveState } from '@/core/save-state'

const body = ref('')
const tick = ref(0)
const loading = ref(true)
const saving = ref(false)
const drafts = reactive<Record<string, Record<string, string>>>({})
const captureItems = ref<CaptureItem[]>([])
const suggestionItems = ref<AiSuggestion[]>([])
const captures = computed(() => {
  void tick.value
  const ids = new Set(listRealityDocuments({ types: ['capture'] }).map(item => item.id))
  return captureItems.value.filter(item => ids.has(item.calmyId))
})
const suggestions = computed(() => { void tick.value; return suggestionItems.value })
const pendingSuggestions = computed(() => suggestions.value.filter(item => item.status === 'suggested'))

async function refresh(): Promise<void> {
  loading.value = true
  try { [captureItems.value, suggestionItems.value] = await Promise.all([captureAsyncRepository.list(), captureAsyncRepository.listSuggestions()]); tick.value++ }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : 'Capture 读取失败') }
  finally { loading.value = false }
}
function latestSuggestion(capture: CaptureItem): AiSuggestion | undefined { return capture.suggestionIds.map(id => suggestionItems.value.find(item => item.calmyId === id)).find(item => item !== undefined) }
function draftFor(suggestion: AiSuggestion): Record<string, string> {
  if (!drafts[suggestion.calmyId]) drafts[suggestion.calmyId] = { ...suggestion.candidates[0].fields }
  return drafts[suggestion.calmyId]
}
async function capture(): Promise<void> {
  if (!body.value.trim()) { ElMessage.warning('先写下一段原文'); return }
  saving.value = true
  try {
    const result = await withSaveState(() => captureText(body.value))
    body.value = ''
    await refresh()
    if (result.suggestionError) ElMessage.warning(result.suggestionError instanceof Error ? `原文已保存，但 suggestion 生成失败：${result.suggestionError.message}` : '原文已保存，但 suggestion 生成失败')
    else ElMessage.success('已保存原文，并生成一条本地 suggestion')
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : 'Capture 保存失败') }
  finally { saving.value = false }
}
async function accept(suggestion: AiSuggestion): Promise<void> {
  const candidate = suggestion.candidates[0]
  const draft = draftFor(suggestion)
  const overrides = Object.fromEntries(Object.entries(draft).filter(([key, value]) => value !== candidate.fields[key]))
  try { const result = await withSaveState(() => captureAsyncRepository.acceptSuggestion(suggestion.calmyId, 0, overrides)); await refresh(); ElMessage.success(`已接受 suggestion，写入 ${result.suggestion.acceptedEntityType}`) }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : '接受 suggestion 失败') }
}
async function reject(suggestion: AiSuggestion): Promise<void> {
  try { await withSaveState(() => captureAsyncRepository.rejectSuggestion(suggestion.calmyId)); await refresh(); ElMessage.info('已拒绝 suggestion，原文仍保留') }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : '拒绝 suggestion 失败') }
}
function typeName(type: AiSuggestion['candidates'][number]['entityType']): string { return ({ matter: 'Matter', action: 'Action', record: 'Record', resource: 'Resource', seed: 'Seed' })[type] }
function onDataSynced(): void { void refresh() }
onMounted(() => { void refresh(); window.addEventListener('beryl-data-synced', onDataSynced) })
onUnmounted(() => window.removeEventListener('beryl-data-synced', onDataSynced))
</script>

<template>
  <div class="capture-page">
    <header class="page-head"><div><p class="eyebrow">CAPTURE · UNDERSTAND LATER</p><h1 class="font-title">先收下来</h1><p>原文先被保留，理解只是 suggestion；没有确认，不会写入事实。</p></div><div class="pending-count"><b>{{ pendingSuggestions.length }}</b><span>{{ loading ? '读取中' : '待确认' }}</span></div></header>
    <section class="capture-box beryl-card"><div class="capture-mark" aria-hidden="true">↓</div><div class="capture-input"><textarea v-model="body" aria-label="要保存的原文" placeholder="想到什么就写什么：一句话、一个链接、一个问题或一段事实。" @keydown.ctrl.enter.prevent="capture" @keydown.meta.enter.prevent="capture" /><div class="capture-footer"><small>先保存本机原文，再生成可拒绝建议</small><button :disabled="saving" @click="capture">{{ saving ? '保存中…' : '保存并理解' }}</button></div></div></section>

    <section class="suggestion-section"><div class="section-head"><div><p class="eyebrow">SUGGESTIONS</p><h2 class="font-title">等待你的确认</h2></div><span>{{ suggestions.length }} 条</span></div><div v-if="pendingSuggestions.length" class="suggestion-list"><article v-for="suggestion in pendingSuggestions" :key="suggestion.calmyId" class="suggestion-card beryl-card"><div class="suggestion-head"><div><span class="suggestion-type">{{ typeName(suggestion.candidates[0].entityType) }}</span><h3>{{ suggestion.candidates[0].label }}</h3></div><span class="confidence">{{ Math.round(suggestion.confidence * 100) }}% · {{ suggestion.privacyBoundary }}</span></div><div class="source-copy"><small>原文</small><p>{{ suggestion.sourceText }}</p></div><div class="reason-copy"><small>推断依据 · {{ suggestion.modelVersion }}</small><p>{{ suggestion.rationale }} {{ suggestion.candidates[0].evidence.join('；') }}</p></div><div class="candidate-editor"><label v-if="draftFor(suggestion).title">标题<input v-model="draftFor(suggestion).title"></label><label v-if="suggestion.candidates[0].entityType === 'action'">日期<input v-model="draftFor(suggestion).date" type="date"></label><label v-if="draftFor(suggestion).why">为什么 / 上下文<textarea v-model="draftFor(suggestion).why" /></label><label v-if="draftFor(suggestion).body">正文<textarea v-model="draftFor(suggestion).body" /></label><label v-if="draftFor(suggestion).uri">链接<input v-model="draftFor(suggestion).uri"></label></div><div class="suggestion-actions"><button class="reject" @click="reject(suggestion)">拒绝，保留原文</button><button class="accept" @click="accept(suggestion)">接受{{ Object.keys(drafts[suggestion.calmyId] || {}).length ? ' / 修改后写入' : '' }}</button></div></article></div><div v-else class="empty beryl-card"><span>✓</span><h3 class="font-title">没有待确认 suggestion</h3><p>Capture 一段原文，系统会先给出可拒绝、可修改的理解。</p></div></section>

    <section class="capture-history"><div class="section-head"><div><p class="eyebrow">SOURCE HISTORY</p><h2 class="font-title">原文不会消失</h2></div><span>事实与推断分开保存</span></div><div class="history-list"><article v-for="item in captures" :key="item.calmyId" class="history-card beryl-card"><div><small>{{ new Date(item.createdAt).toLocaleString('zh-CN') }} · {{ item.status }}</small><p>{{ item.body }}</p></div><span v-if="latestSuggestion(item)">{{ latestSuggestion(item)?.status }}</span></article><p v-if="!captures.length" class="muted">还没有 Capture。</p></div></section>
  </div>
</template>

<style scoped>
.capture-page{max-width:1050px;margin:0 auto}.page-head{display:flex;align-items:end;justify-content:space-between;gap:20px;margin:6px 0 28px}.eyebrow{font-size:10px;letter-spacing:.13em;color:var(--scene);font-weight:700;margin:0 0 8px}.page-head h1{font-size:clamp(35px,4vw,50px);line-height:1;margin:0;letter-spacing:-.04em}.page-head p:last-child{margin:11px 0 0;font-size:13px;color:var(--c-text-2)}.pending-count{display:grid;border-left:1px solid var(--c-border);padding-left:18px}.pending-count b{font:600 34px/1 var(--font-title);color:var(--scene)}.pending-count span{font-size:10px;color:var(--c-text-3);margin-top:4px}.capture-box{display:flex;gap:13px;padding:16px}.capture-mark{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:var(--scene-soft);color:var(--scene);font-size:22px}.capture-input{flex:1}.capture-input textarea{width:100%;min-height:100px;resize:vertical;border:0;background:transparent;color:var(--c-text);font:inherit;font-size:14px;line-height:1.7;outline:none}.capture-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid var(--c-border-soft);padding-top:10px}.capture-footer small,.section-head>span{font-size:10px;color:var(--c-text-3)}.capture-footer button,.accept,.reject{border:1px solid var(--c-border);background:var(--c-card);color:var(--c-text);border-radius:8px;padding:8px 12px;font-size:11px;cursor:pointer}.capture-footer button,.accept{border-color:var(--scene-border-strong);background:var(--scene-soft);color:var(--scene)}.suggestion-section,.capture-history{margin-top:28px}.section-head{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:12px}.section-head h2{font-size:24px;margin:0}.suggestion-list{display:grid;gap:13px}.suggestion-card{padding:16px}.suggestion-head{display:flex;align-items:start;justify-content:space-between;gap:12px}.suggestion-head h3{font-size:17px;margin:5px 0 0}.suggestion-type{font-size:10px;color:var(--scene);font-weight:700}.confidence{font-size:10px;color:var(--c-text-3)}.source-copy,.reason-copy{border-top:1px solid var(--c-border-soft);margin-top:13px;padding-top:10px}.source-copy small,.reason-copy small{font-size:10px;color:var(--c-text-3)}.source-copy p,.reason-copy p{font-size:12px;line-height:1.6;color:var(--c-text-2);margin:5px 0 0;white-space:pre-wrap}.reason-copy p{color:var(--scene)}.candidate-editor{display:grid;grid-template-columns:1fr 150px;gap:10px;margin-top:12px}.candidate-editor label{display:grid;gap:5px;font-size:10px;color:var(--c-text-2)}.candidate-editor label:first-child{grid-column:1/-1}.candidate-editor label:has(textarea){grid-column:1/-1}.candidate-editor input,.candidate-editor textarea{border:1px solid var(--c-border);border-radius:7px;background:var(--c-bg);color:var(--c-text);padding:8px;font:inherit;font-size:12px}.candidate-editor textarea{min-height:52px;resize:vertical}.suggestion-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:14px}.reject{color:var(--c-text-2)}.reject:hover{border-color:#bb665d;color:#bb665d}.accept:hover{border-color:var(--scene);color:var(--scene)}.empty{text-align:center;padding:50px;color:var(--c-text-2)}.empty span{font-size:28px;color:var(--scene)}.empty h3{font-size:22px;margin:10px 0 4px}.empty p,.muted{font-size:12px;color:var(--c-text-3)}.history-list{display:grid;gap:7px}.history-card{display:flex;align-items:start;justify-content:space-between;gap:12px;padding:12px 14px}.history-card small{font-size:10px;color:var(--c-text-3)}.history-card p{font-size:12px;line-height:1.6;margin:5px 0 0;white-space:pre-wrap}.history-card>span{font-size:10px;color:var(--scene);white-space:nowrap}@media(max-width:620px){.page-head{align-items:start}.capture-footer{display:block}.capture-footer button{margin-top:9px}.candidate-editor{grid-template-columns:1fr}.candidate-editor label,.candidate-editor label:first-child,.candidate-editor label:has(textarea){grid-column:1}.suggestion-head{display:block}.confidence{display:block;margin-top:8px}.suggestion-actions{justify-content:stretch}.suggestion-actions button{flex:1}}
.capture-mark{flex:none}.capture-footer button:disabled{opacity:.55;cursor:wait}
@media(max-width:900px){.capture-footer{flex-wrap:wrap}.capture-footer small{flex:1 1 100%}.candidate-editor{grid-template-columns:1fr}.source-copy p,.reason-copy p,.history-card p{overflow-wrap:anywhere}}
</style>
<style scoped>
.capture-footer button{font-size:0}.capture-footer button::after{content:'保存原文';font-size:11px}.capture-footer button:disabled::after{content:'保存中…'}.confidence{font-size:0;padding:6px 8px;border-radius:999px;background:var(--c-hover);color:var(--c-text-3)}.confidence::after{content:'待确认';font-size:11px}.reason-copy{background:var(--c-bg-soft);border:0;border-radius:9px;padding:10px 12px}.reason-copy small{font-size:0}.reason-copy small::after{content:'为什么会这样建议';font-size:10px}.capture-footer small{font-size:0}.capture-footer small::after{content:'原文先保存，建议不会自动写入事实';font-size:11px}
</style>
