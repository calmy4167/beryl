<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { actionAsyncRepository } from '@/domain/action/repository'
import { matterAsyncRepository } from '@/domain/matter/repository'
import { recordAsyncRepository } from '@/domain/record/repository'
import type { RealityRecord } from '@/domain/record/model'
import { unifiedAsyncRepository, type Resource, type Seed } from '@/domain/unified'
import { todayKey } from '@/core/storage'
import { withSaveState } from '@/core/save-state'
import '@/styles/modules/flow.css'

type FlowItem = { entity: Seed; kind: 'seed' } | { entity: Resource; kind: 'resource' }
type FlowMode = 'focus' | 'wander' | 'solve' | 'echo' | 'topic'
type EchoFeedback = '仍重要' | '已完成' | '需要更新'

const flowModes: Array<{ value: FlowMode; label: string; hint: string }> = [
  { value: 'focus', label: '专注', hint: '只看一条' },
  { value: 'wander', label: '漫游', hint: '有限探索' },
  { value: 'solve', label: '解题', hint: '优先看线索' },
  { value: 'echo', label: '回响', hint: '回看资料' },
  { value: 'topic', label: '专题', hint: '混合上下文' },
]

const route = useRoute()
const router = useRouter()
const seeds = ref<Seed[]>([])
const resources = ref<Resource[]>([])
const matters = ref<Awaited<ReturnType<typeof matterAsyncRepository.list>>>([])
const records = ref<RealityRecord[]>([])
const intent = ref('')
const desiredEvidence = ref('')
const application = ref('')
const topicScope = ref('')
const mode = ref<FlowMode>('solve')
const matterId = ref(typeof route.query.matter === 'string' ? route.query.matter : '')
const started = ref(false)
const ended = ref(false)
const loading = ref(true)
const error = ref('')
const expanded = ref<string | null>(null)
const echoFeedback = ref<Record<string, EchoFeedback>>({})

const selectedMatter = computed(() => matters.value.find(item => item.calmyId === matterId.value))
const recentRecords = computed(() => records.value.filter(item => item.matterId === matterId.value).slice(0, 3))
const echoRecords = computed(() => records.value.filter(item => !matterId.value || item.matterId === matterId.value).slice(0, 5))
const activeMode = computed(() => flowModes.find(item => item.value === mode.value)!)

const candidates = computed<FlowItem[]>(() => {
  const all: FlowItem[] = [
    ...seeds.value.map(entity => ({ entity, kind: 'seed' as const })),
    ...resources.value.map(entity => ({ entity, kind: 'resource' as const })),
  ]
  const related = matterId.value ? all.filter(item => item.kind === 'seed'
    ? item.entity.targetMatterIds.includes(matterId.value) || item.entity.sourceRecordIds.some(id => records.value.some(record => record.calmyId === id && record.matterId === matterId.value))
    : item.entity.matterIds.includes(matterId.value)) : all
  const matterScoped = matterId.value && related.length ? [...related, ...all.filter(item => !related.includes(item))] : all
  const normalizedTopic = topicScope.value.trim().toLocaleLowerCase()
  const topicRelated = mode.value === 'topic' && normalizedTopic
    ? matterScoped.filter(item => [item.entity.title, item.entity.body, ...item.entity.tags].join(' ').toLocaleLowerCase().includes(normalizedTopic))
    : []
  const scoped = topicRelated.length ? [...topicRelated, ...matterScoped.filter(item => !topicRelated.includes(item))] : matterScoped
  const ordered = mode.value === 'echo' ? scoped.filter(item => item.kind === 'resource')
    : mode.value === 'solve' ? scoped.filter(item => item.kind === 'seed')
      : mode.value === 'focus' ? scoped.slice(0, 1) : scoped
  return ordered.slice(0, mode.value === 'focus' ? 1 : 5)
})

function toast(message: string, kind: 'success' | 'warning' | 'error' = 'success'): void {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

async function refresh(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [nextSeeds, nextResources, nextMatters, nextRecords] = await Promise.all([
      unifiedAsyncRepository.list<Seed>('seed'),
      unifiedAsyncRepository.list<Resource>('resource'),
      matterAsyncRepository.list(),
      recordAsyncRepository.list(),
    ])
    seeds.value = nextSeeds.filter(item => item.status !== 'retired')
    resources.value = nextResources.filter(item => item.status === 'active')
    matters.value = nextMatters.filter(item => item.status !== 'archived')
    records.value = nextRecords.filter(item => !item.redactedAt)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '探索内容读取失败'
  } finally { loading.value = false }
}

watch([matters, matterId, intent, desiredEvidence, application], () => {
  const matter = selectedMatter.value
  if (!matter) return
  if (!intent.value.trim() && (matter.problem || matter.why)) intent.value = matter.problem || matter.why || ''
  if (!desiredEvidence.value.trim() && matter.progressEvidence) desiredEvidence.value = matter.progressEvidence
  if (!application.value.trim() && matter.nextTest) application.value = matter.nextTest
})

function onFocusEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape' && started.value && mode.value === 'focus') {
    event.preventDefault()
    ended.value = true
  }
}
onMounted(() => {
  void refresh()
  window.addEventListener('keydown', onFocusEscape)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onFocusEscape)
})

function selectMode(next: FlowMode): void {
  mode.value = next
  started.value = false
  ended.value = false
}
function start(): void {
  const matter = selectedMatter.value
  const effectiveIntent = intent.value.trim() || matter?.problem?.trim() || matter?.why?.trim() || ''
  const effectiveEvidence = desiredEvidence.value.trim() || matter?.progressEvidence?.trim() || ''
  const effectiveApplication = application.value.trim() || matter?.nextTest?.trim() || ''
  if (!effectiveIntent) { toast('先写下当前要解决的问题或探索意图', 'warning'); return }
  if (mode.value === 'solve' && (!effectiveEvidence || !effectiveApplication)) { toast('解题模式还需要写清希望得到的证据和应用位置', 'warning'); return }
  if (mode.value === 'topic' && !topicScope.value.trim()) { toast('专题模式还需要写清这次要聚焦的范围', 'warning'); return }
  if (!intent.value.trim()) intent.value = effectiveIntent
  if (!desiredEvidence.value.trim() && effectiveEvidence) desiredEvidence.value = effectiveEvidence
  if (!application.value.trim() && effectiveApplication) application.value = effectiveApplication
  started.value = true
  ended.value = false
}
function sourceLabel(item: FlowItem): string {
  const ids = item.kind === 'seed' ? item.entity.sourceRecordIds : item.entity.sourceIds
  if (!ids.length) return '未绑定来源'
  const bodies = records.value.filter(record => ids.includes(record.calmyId)).map(record => record.body).slice(0, 2)
  return bodies.length ? bodies.join(' · ') : `来源 ID：${ids.join('、')}`
}
function keep(item: FlowItem): void {
  toast(item.kind === 'seed' ? '已收下这条线索，之后仍可关联问题' : '已保留这份资料，不会强制继续浏览')
}
async function useForProblem(item: FlowItem): Promise<void> {
  if (!matterId.value) { toast('请选择关联处境，或先到处境页新建', 'warning'); return }
  try {
    await withSaveState(async () => {
      if (item.kind === 'seed') {
        const seed = item.entity
        await unifiedAsyncRepository.update<Seed>('seed', seed.calmyId, {
          status: 'cultivating', targetMatterIds: [...new Set([...seed.targetMatterIds, matterId.value])],
        }, { expectedRevision: seed.revision })
      } else {
        const resource = item.entity
        await unifiedAsyncRepository.update<Resource>('resource', resource.calmyId, {
          matterIds: [...new Set([...resource.matterIds, matterId.value])],
        }, { expectedRevision: resource.revision })
      }
    })
    await refresh()
    toast('已关联当前问题，可以继续验证')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '关联当前问题失败', 'error') }
}
async function tryIt(item: FlowItem): Promise<void> {
  try {
    await withSaveState(async () => {
      await actionAsyncRepository.create({ title: `验证：${item.entity.title}`, date: todayKey(), matterId: matterId.value || undefined })
      if (item.kind === 'seed') {
        const seed = item.entity
        await unifiedAsyncRepository.update<Seed>('seed', seed.calmyId, {
          status: 'promoted', targetMatterIds: matterId.value ? [...new Set([...seed.targetMatterIds, matterId.value])] : seed.targetMatterIds,
        }, { expectedRevision: seed.revision })
      }
    })
    await refresh()
    ended.value = true
    toast(matterId.value ? '已创建现实验证行动；现在可以退出探索去做' : '已创建现实验证行动；之后可再关联处境')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '创建验证行动失败', 'error') }
}
async function sayGoodbye(item: FlowItem): Promise<void> {
  try {
    if (item.kind === 'seed') await withSaveState(() => unifiedAsyncRepository.update<Seed>('seed', item.entity.calmyId, { status: 'retired', archivedAt: Date.now() }, { expectedRevision: item.entity.revision }))
    else await withSaveState(() => unifiedAsyncRepository.update<Resource>('resource', item.entity.calmyId, { status: 'retired', archivedAt: Date.now() }, { expectedRevision: item.entity.revision }))
    await refresh()
    toast('已从本次探索移除，不代表失败')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '结束内容失败', 'error') }
}
function giveEchoFeedback(record: RealityRecord, feedback: EchoFeedback): void {
  echoFeedback.value = { ...echoFeedback.value, [record.calmyId]: feedback }
  toast(feedback === '仍重要' ? '已保留为当前语境的重要证据' : feedback === '已完成' ? '已标记为过去的完成证据' : '已标记为需要更新，下一步可重新验证')
}
</script>

<template>
  <div class="flow-page">
    <header class="page-head"><div><p class="eyebrow">探索 · 有限内容</p><h1 class="font-title">带着问题找资料</h1><p>先写问题，再看最多 5 条相关内容；探索有明确边界，也有现实出口。</p></div></header>
    <section v-if="error" class="beryl-card empty-state" role="alert"><b>探索内容暂时无法读取</b><p>{{ error }}</p><button class="app-button" type="button" @click="refresh">重试</button></section>
    <section class="beryl-card flow-intent">
      <div><p class="eyebrow">当前意图</p><h2 class="font-title">这次为什么打开探索？</h2><p>可以是一个现实问题，也可以是明确的探索意图；不是为了打卡或延长停留。</p></div>
      <textarea v-model="intent" aria-label="当前问题或探索意图" placeholder="例如：我需要找到一个办法，减少跨团队需求误解。" />
      <div v-if="mode === 'solve'" class="flow-solve-fields"><textarea v-model="desiredEvidence" aria-label="希望得到的证据" placeholder="什么证据能说明这次学习够用了？" /><textarea v-model="application" aria-label="应用位置" placeholder="准备在哪里、对谁、何时马上应用？" /></div>
      <textarea v-if="mode === 'topic'" v-model="topicScope" class="flow-topic-field" aria-label="专题范围" placeholder="这次只聚焦什么范围？例如：面向新手的 onboarding 误解" />
      <div class="flow-mode-picker" role="group" aria-label="探索方式"><span>选择这次的方式</span><button v-for="item in flowModes" :key="item.value" type="button" :class="['app-button', { on: mode === item.value }]" :aria-pressed="mode === item.value" @click="selectMode(item.value)"><b>{{ item.label }}</b><small>{{ item.hint }}</small></button></div>
      <div class="flow-intent-controls"><label>关联处境（可选）<select id="flow-matter-select" aria-label="探索关联处境" :value="matterId" @change="matterId = ($event.target as HTMLSelectElement).value"><option value="">先不关联</option><option v-for="item in matters" :key="item.calmyId" :value="item.calmyId">{{ item.title }}</option></select></label><button class="app-button primary" type="button" @click="start">{{ started ? '重新开始本批' : '开始这一批' }}</button></div>
      <div v-if="selectedMatter" class="flow-context"><b>当前问题上下文：{{ selectedMatter.title }}</b><p>{{ selectedMatter.problem || selectedMatter.why || '这个处境还没有写下具体问题。' }}</p><small v-if="selectedMatter.currentGap">当前缺口：{{ selectedMatter.currentGap }}</small><small v-if="selectedMatter.stopCondition">停止条件：{{ selectedMatter.stopCondition }}</small><small v-if="recentRecords.length">最近现实证据：{{ recentRecords.map(record => record.body).join(' · ') }}</small></div>
    </section>
    <section v-if="ended" class="beryl-card flow-ended" role="status"><h2 class="font-title">这一批已结束</h2><p>你可以回到现实去验证，或稍后带着新的问题再来。不需要继续浏览。</p><div class="flow-exit-actions"><button class="app-button primary" type="button" @click="router.push('/app/today')">回到今天去做</button><button class="app-button" type="button" @click="ended = false">返回本批</button></div></section>
    <div v-else-if="!started" class="empty-state">写下问题并选择方式后，探索才会开始显示有限内容。</div>
    <div v-else-if="loading" class="empty-state" role="status">正在准备这一批内容…</div>
    <section v-else :class="['flow-batch', { 'focus-batch': mode === 'focus' }]"><div class="flow-batch-head"><div><p class="eyebrow">{{ activeMode.label.toUpperCase() }} · 本批 · {{ candidates.length + (mode === 'echo' ? echoRecords.length : 0) }} 项</p><h2 class="font-title">围绕“{{ intent.trim() }}”</h2><small v-if="mode === 'solve'" class="flow-solve-summary">证据：{{ desiredEvidence }} · 应用：{{ application }}</small><small v-if="mode === 'topic'" class="flow-topic-summary">专题范围：{{ topicScope.trim() }}</small></div><button class="app-button" type="button" @click="ended = true">已足够，结束探索</button></div>
      <div v-if="!candidates.length && mode !== 'echo'" class="empty-state beryl-card">资料里还没有符合本模式的内容；可以回到记录页先保存一条线索。</div>
      <article v-for="item in candidates" :key="`${item.kind}-${item.entity.calmyId}`" :class="['beryl-card', 'flow-card', { 'focus-card': mode === 'focus' }]"><div class="flow-card-head"><span class="flow-kind">{{ item.kind === 'seed' ? '线索 · 尚未成熟' : '资料 · 可复用' }}</span><button class="app-button" type="button" @click="expanded = expanded === item.entity.calmyId ? null : item.entity.calmyId">{{ expanded === item.entity.calmyId ? '收起来源' : '展开来源' }}</button></div><h3>{{ item.entity.title }}</h3><p>{{ item.entity.body }}</p><small class="flow-meta">{{ new Date(item.entity.createdAt).toLocaleDateString('zh-CN') }} · {{ item.kind === 'seed' ? item.entity.status : item.entity.kind }}</small><small v-if="expanded === item.entity.calmyId" class="flow-source">来源：{{ sourceLabel(item) }}{{ item.entity.tags.length ? ` · 标签：${item.entity.tags.join('、')}` : '' }}</small><div class="flow-card-actions"><button class="app-button" type="button" @click="keep(item)">收下</button><button class="app-button" type="button" @click="useForProblem(item)">用于当前问题</button><button class="app-button primary" type="button" @click="tryIt(item)">试一下</button><button class="app-button" type="button" @click="sayGoodbye(item)">再见</button></div></article>
      <section v-if="mode === 'echo'" class="echo-records"><div class="echo-records-head"><h3 class="font-title">过去的现实证据</h3><small>{{ matterId ? '当前处境 · 最近 5 条' : '最近 5 条' }}</small></div><div v-if="!echoRecords.length" class="empty-state beryl-card">还没有可回响的 现实记录。</div><article v-for="record in echoRecords" :key="record.calmyId" class="beryl-card echo-record"><time>{{ new Date(record.occurredAt).toLocaleString('zh-CN') }} · {{ record.source }}</time><p>{{ record.body }}</p><small v-if="record.matterId">关联处境：{{ matters.find(item => item.calmyId === record.matterId)?.title || record.matterId }}</small><div class="echo-actions"><button class="app-button" type="button" :class="{ on: echoFeedback[record.calmyId] === '仍重要' }" @click="giveEchoFeedback(record, '仍重要')">仍重要</button><button class="app-button" type="button" :class="{ on: echoFeedback[record.calmyId] === '已完成' }" @click="giveEchoFeedback(record, '已完成')">已完成</button><button class="app-button" type="button" :class="{ on: echoFeedback[record.calmyId] === '需要更新' }" @click="giveEchoFeedback(record, '需要更新')">需要更新</button></div></article></section>
    </section>
  </div>
</template>
