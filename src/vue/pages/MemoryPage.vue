<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { withSaveState } from '@/core/save-state'
import { recordAsyncRepository } from '@/domain/record/repository'
import type { RealityRecord } from '@/domain/record/model'
import { unifiedAsyncRepository, unifiedFactories } from '@/domain/unified'
import type { Insight } from '@/domain/unified'

type MemoryLayer = 'fact' | 'reflection' | 'ai_inference' | 'preference' | 'principle'
const layers: Array<{ value: MemoryLayer; label: string; hint: string }> = [
  { value: 'fact', label: '事实', hint: '你记录过的发生' },
  { value: 'reflection', label: '反思', hint: '复盘后留下的理解' },
  { value: 'ai_inference', label: 'AI 推断', hint: '可确认、修改或否认' },
  { value: 'preference', label: '偏好', hint: '只在你确认后保留' },
  { value: 'principle', label: '原则', hint: '只在你确认后保留' },
]
const router = useRouter()
const layer = ref<MemoryLayer>('ai_inference')
const records = ref<RealityRecord[]>([])
const insights = ref<Insight[]>([])
const loading = ref(true)
const error = ref('')
const busyId = ref<string>()
const editingId = ref<string>()
const editTitle = ref('')
const editBody = ref('')
const composerOpen = ref(false)
const composerBody = ref('')
const activeInsights = computed(() => insights.value.filter(item => item.status !== 'retired'))
const factRecords = computed(() => records.value.filter(item => item.type === 'fact' || item.type === 'observation' || item.type === 'negative'))
const reflectionRecords = computed(() => records.value.filter(item => item.type === 'review' || (item.type === 'insight' && item.source !== 'ai')))
const aiInsights = computed(() => activeInsights.value.filter(item => item.memoryLayer === 'ai_inference' || item.source === 'ai_assisted' || item.status === 'draft'))
const userMemory = computed(() => activeInsights.value.filter(item => item.memoryLayer === layer.value))
const currentLayer = computed(() => layers.find(item => item.value === layer.value) ?? layers[0])
const recordById = computed(() => new Map(records.value.map(item => [item.calmyId, item])))
const emptyCopy = computed(() => layer.value === 'ai_inference'
  ? '当前没有待你确认的 AI 理解。系统不会因为你记录了几条内容，就擅自替你下结论。'
  : layer.value === 'preference' || layer.value === 'principle'
    ? `还没有${currentLayer.value.label}。只有你主动写下并确认的内容，才会出现在这里。`
    : layer.value === 'fact' ? '还没有可展示的事实记录。' : '还没有可展示的反思记录。')

function toast(message: string, kind: 'success' | 'warning' | 'error' = 'success'): void {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}
function dateLabel(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(timestamp)
}
function recordKind(record: RealityRecord): string {
  if (record.type === 'negative') return '负面事实'
  if (record.type === 'observation') return '观察'
  if (record.type === 'review') return '复盘'
  if (record.type === 'insight') return '洞察'
  if (record.type === 'seed') return '种子'
  return '事实'
}
function insightStatus(item: Insight): string {
  if (item.status === 'confirmed') return '已确认'
  if (item.status === 'retired') return '已否认 / 已移除'
  return '待确认'
}
async function refresh(): Promise<void> {
  loading.value = true
  try {
    const [nextRecords, nextInsights] = await Promise.all([recordAsyncRepository.list(), unifiedAsyncRepository.list<Insight>('insight')])
    records.value = nextRecords; insights.value = nextInsights; error.value = ''
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '记忆读取失败' }
  finally { loading.value = false }
}
function onSynced(): void { void refresh() }
function retry(): void { window.dispatchEvent(new CustomEvent('beryl-data-synced')) }
onMounted(() => { void refresh(); window.addEventListener('beryl-data-synced', onSynced) })
onUnmounted(() => window.removeEventListener('beryl-data-synced', onSynced))

async function updateInsight(item: Insight, patch: Partial<Insight>, successMessage: string): Promise<void> {
  busyId.value = item.calmyId
  try {
    await withSaveState(() => unifiedAsyncRepository.update<Insight>('insight', item.calmyId, patch, { expectedRevision: item.revision, actor: 'user', sourceIds: item.sourceRecordIds }))
    editingId.value = undefined; await refresh(); toast(successMessage)
  } catch (cause) { toast(cause instanceof Error ? cause.message : '记忆更新失败', 'error'); await refresh() }
  finally { busyId.value = undefined }
}
function startEditing(item: Insight): void { editingId.value = item.calmyId; editTitle.value = item.title; editBody.value = item.body }
async function saveEdit(item: Insight): Promise<void> {
  if (!editTitle.value.trim() || !editBody.value.trim()) { toast('标题和内容都需要保留', 'warning'); return }
  await updateInsight(item, { title: editTitle.value.trim(), body: editBody.value.trim(), status: 'confirmed', memoryLayer: 'ai_inference', confirmedAt: Date.now(), deniedAt: undefined }, '已修改并确认这条 AI 理解')
}
async function confirmInsight(item: Insight): Promise<void> { await updateInsight(item, { status: 'confirmed', memoryLayer: 'ai_inference', confirmedAt: Date.now(), deniedAt: undefined }, '已确认，仍会作为 AI 理解单独保存') }
async function deny(item: Insight): Promise<void> { await updateInsight(item, { status: 'retired', archivedAt: Date.now(), deniedAt: Date.now() }, '已否认，不再作为 AI 建议') }
async function remove(item: Insight): Promise<void> {
  if (!window.confirm('移除后这条 AI 理解将不再出现在当前列表，是否继续？')) return
  await updateInsight(item, { status: 'retired', archivedAt: Date.now(), deniedAt: Date.now() }, '已移除这条 AI 理解')
}
async function addUserMemory(): Promise<void> {
  const body = composerBody.value.trim()
  if (!body || (layer.value !== 'preference' && layer.value !== 'principle')) { toast('请先选择偏好或原则，并写下内容', 'warning'); return }
  const title = body.length > 28 ? `${body.slice(0, 28)}…` : body
  busyId.value = 'new-memory'
  try {
    await withSaveState(() => unifiedAsyncRepository.create(unifiedFactories.insight({ title, body, status: 'confirmed', memoryLayer: layer.value as 'preference' | 'principle', sourceRecordIds: [], matterIds: [], resourceIds: [] }), { actor: 'user' }))
    composerBody.value = ''; composerOpen.value = false; await refresh(); toast(`已保存这条${currentLayer.value.label}`)
  } catch (cause) { toast(cause instanceof Error ? cause.message : '保存失败', 'error') }
  finally { busyId.value = undefined }
}
function selectLayer(value: MemoryLayer): void { layer.value = value; composerOpen.value = false; editingId.value = undefined }
</script>

<template>
  <div class="memory-page">
    <header class="page-head memory-page-head"><div><p class="eyebrow">个人 · 记忆</p><h1 class="font-title">记忆</h1><p>把发生过的事、你的反思和 AI 的推断分开。你始终拥有确认、修改、否认和删除的权利。</p></div><div class="memory-head-note"><b>不替你下结论</b><small>AI 推断不会自动变成事实</small><button class="quiet-link" type="button" @click="router.push('/app/flow')">带着问题进探索 →</button></div></header>
    <section class="memory-layer-tabs" aria-label="记忆层级"><button v-for="item in layers" :key="item.value" type="button" :class="{ on: layer === item.value }" :aria-pressed="layer === item.value" @click="selectLayer(item.value)"><b>{{ item.label }}</b><small>{{ item.hint }}</small></button></section>
    <section v-if="error" class="beryl-card empty-state memory-error" role="alert"><b>记忆数据暂时无法读取</b><p>{{ error }}</p><button class="app-button" type="button" @click="retry">重试</button></section>
    <section v-if="layer === 'preference' || layer === 'principle'" class="beryl-card memory-compose-card"><div><p class="eyebrow">USER CONTROLLED</p><h2 class="font-title">写下一条{{ currentLayer.label }}</h2><p>这是你的明确表达，不是系统从行为中猜出来的。</p></div><button class="primary" type="button" @click="composerOpen = !composerOpen">{{ composerOpen ? '收起' : `添加${currentLayer.label}` }}</button><div v-if="composerOpen" class="memory-composer"><textarea v-model="composerBody" :aria-label="`${currentLayer.label}内容`" :placeholder="`例如：我希望${layer === 'preference' ? '先看到今天真正要做的一件事' : '每次只承诺自己能在现实中完成的一步'}`"/><div><button class="primary" type="button" :disabled="busyId === 'new-memory'" @click="void addUserMemory()">保存并确认</button><button type="button" @click="composerOpen = false">取消</button></div></div></section>
    <section class="memory-list-section"><div class="section-title"><div><p class="eyebrow">{{ currentLayer.label.toUpperCase() }}</p><h2 class="font-title">{{ currentLayer.label }}</h2></div><span>{{ loading ? '读取中…' : layer === 'fact' ? `${factRecords.length} 条` : layer === 'reflection' ? `${reflectionRecords.length} 条` : layer === 'ai_inference' ? `${aiInsights.length} 条` : `${userMemory.length} 条` }}</span></div><div v-if="loading" class="empty-state" role="status">正在读取你的记录…</div><template v-else-if="layer === 'fact' || layer === 'reflection'"><article v-for="item in (layer === 'fact' ? factRecords : reflectionRecords)" :key="item.calmyId" class="beryl-card memory-card"><div class="memory-card-head"><span class="memory-kind">{{ recordKind(item) }}</span><time>{{ dateLabel(item.occurredAt) }}</time></div><p class="memory-card-body">{{ item.body }}</p><div class="memory-card-foot"><span>{{ item.source === 'ai' ? 'AI 辅助记录' : '你记录的内容' }}</span><span>{{ item.evidenceIds.length ? `证据 ${item.evidenceIds.length} 条` : '无额外证据' }}</span></div></article><div v-if="!(layer === 'fact' ? factRecords : reflectionRecords).length" class="empty-state">{{ emptyCopy }}</div></template><template v-else-if="layer === 'ai_inference' ? aiInsights.length > 0 : userMemory.length > 0"><article v-for="item in (layer === 'ai_inference' ? aiInsights : userMemory)" :key="item.calmyId" :class="['beryl-card','memory-card','memory-insight-card', { 'is-confirmed': item.status === 'confirmed' }]"><div class="memory-card-head"><span :class="['memory-kind', item.status === 'confirmed' ? 'confirmed' : 'pending']">{{ insightStatus(item) }}</span><time>{{ dateLabel(item.updatedAt) }}</time></div><div v-if="editingId === item.calmyId" class="memory-edit-form"><input v-model="editTitle" aria-label="记忆标题"><textarea v-model="editBody" aria-label="记忆内容"/><div class="memory-actions"><button class="primary" type="button" :disabled="busyId === item.calmyId" @click="void saveEdit(item)">保存修改</button><button type="button" @click="editingId = undefined">取消</button></div></div><template v-else><h3>{{ item.title }}</h3><p class="memory-card-body">{{ item.body }}</p></template><template v-if="editingId !== item.calmyId"><div class="memory-insight-meta"><span>{{ item.confidence === undefined ? '未设置置信度' : `置信度 ${Math.round(item.confidence * 100)}%` }}</span><span>{{ item.sourceRecordIds.filter(id => recordById.has(id)).length ? `来自 ${item.sourceRecordIds.filter(id => recordById.has(id)).length} 条记录` : '暂无已关联记录' }}</span></div><details v-if="item.sourceRecordIds.some(id => recordById.has(id))" class="memory-evidence"><summary>查看依据</summary><p v-for="recordId in item.sourceRecordIds.filter(id => recordById.has(id)).slice(0,3)" :key="recordId">“{{ recordById.get(recordId)?.body }}”</p></details><div class="memory-actions"><button type="button" :disabled="busyId === item.calmyId" @click="void confirmInsight(item)">确认</button><button type="button" :disabled="busyId === item.calmyId" @click="startEditing(item)">修改</button><button type="button" :disabled="busyId === item.calmyId" @click="void deny(item)">否认</button><button class="danger" type="button" :disabled="busyId === item.calmyId" @click="void remove(item)">删除</button></div></template></article></template><template v-else-if="layer === 'ai_inference'"><div class="beryl-card memory-empty"><span>✦</span><p>{{ emptyCopy }}</p><small>当未来有 AI 辅助洞察时，它会先以“待确认”状态出现在这里。</small></div></template><template v-else><div class="beryl-card memory-empty"><span>◌</span><p>{{ emptyCopy }}</p><small>偏好和原则只来自你的主动确认。</small></div></template></section>
    <footer class="memory-boundary-note"><span>边界</span><p>事实来自记录；反思来自复盘；AI 推断保留来源和状态。确认 AI 推断，也不会改写原始记录。</p></footer>
  </div>
</template>
<style scoped>
.memory-page {
  max-width: none;
}
</style>