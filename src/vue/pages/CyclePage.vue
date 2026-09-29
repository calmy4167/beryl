<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { todayKey } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import type { ActionItem, ActionStatus } from '@/domain/action/model'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter, MatterStage } from '@/domain/matter/model'
import { todayAsyncRepository } from '@/domain/today/repository'
import type { TodayPlan } from '@/domain/today/model'

interface CycleStageDefinition {
  key: MatterStage
  symbol: string
  label: string
  hint: string
  color: string
}

const cycleStages: CycleStageDefinition[] = [
  { key: 'wood', symbol: '木', label: '生长', hint: '计划', color: '#55ae7d' },
  { key: 'fire', symbol: '火', label: '推进', hint: '行动', color: '#ef746c' },
  { key: 'earth', symbol: '土', label: '沉淀', hint: '积累', color: '#e4a649' },
  { key: 'metal', symbol: '金', label: '收敛', hint: '整理', color: '#9da5a8' },
  { key: 'water', symbol: '水', label: '回看', hint: '蓄力', color: '#73acd8' },
]

const actionStatusLabels: Record<ActionStatus, string> = {
  planned: '待开始',
  in_progress: '进行中',
  done: '已完成',
  skipped: '已跳过',
  cancelled: '已取消',
}

const loadLabels: Record<NonNullable<TodayPlan['load']>, string> = {
  good: '状态很好',
  normal: '状态平稳',
  tired: '有些疲惫',
  bad: '需要休息',
}

const router = useRouter()
const date = todayKey()
const matters = ref<Matter[]>([])
const actions = ref<ActionItem[]>([])
const plan = ref<TodayPlan>()
const loading = ref(true)
const error = ref('')
let active = true

const activeMatters = computed(() => matters.value.filter(item => item.status === 'active' || item.status === 'draft'))
const focusIds = computed(() => new Set(plan.value?.focusActionIds || []))
const focusActions = computed(() => actions.value.filter(item => focusIds.value.has(item.calmyId)))
const currentMatter = computed(() => {
  const focusedMatterId = focusActions.value.find(item => item.matterId)?.matterId
  return matters.value.find(item => item.calmyId === focusedMatterId) || activeMatters.value[0]
})
const currentStage = computed(() => currentMatter.value?.currentStage || 'wood')
const currentStageDefinition = computed(() => cycleStages.find(item => item.key === currentStage.value) || cycleStages[0])
const stageCounts = computed<Record<MatterStage, number>>(() => {
  const counts: Record<MatterStage, number> = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 }
  matters.value.forEach(item => {
    if (item.status !== 'archived') counts[item.currentStage] += 1
  })
  return counts
})
const countedActions = computed(() => actions.value.filter(item => item.status !== 'cancelled'))
const completedActions = computed(() => countedActions.value.filter(item => item.status === 'done'))
const completion = computed(() => countedActions.value.length
  ? Math.round((completedActions.value.length / countedActions.value.length) * 100)
  : 0)
const hasReview = computed(() => Boolean(plan.value && Object.values(plan.value.review).some(value => value.trim())))
const hasCycleData = computed(() => matters.value.length > 0 || actions.value.length > 0 || Boolean(plan.value))

function stageLabel(stage: MatterStage): string {
  return cycleStages.find(item => item.key === stage)?.label || stage
}

function displayDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })
}

async function loadCycleData(): Promise<void> {
  loading.value = true
  try {
    const [nextMatters, nextActions, plans] = await Promise.all([
      matterAsyncRepository.list(),
      actionAsyncRepository.listForDate(date),
      todayAsyncRepository.list(),
    ])
    if (!active) return
    matters.value = nextMatters
    actions.value = nextActions
    plan.value = plans.find(item => item.date === date)
    error.value = ''
  } catch (cause) {
    if (!active) return
    error.value = cause instanceof Error ? cause.message : '周期数据读取失败'
  } finally {
    if (active) loading.value = false
  }
}

function refresh(): void { void loadCycleData() }
function navigate(path: string): void { void router.push(path) }

onMounted(() => {
  active = true
  refresh()
  window.addEventListener('beryl-data-synced', refresh)
})
onUnmounted(() => {
  active = false
  window.removeEventListener('beryl-data-synced', refresh)
})
</script>

<template>
  <div class="cycle-page">
    <div v-if="loading && !hasCycleData" class="empty-state beryl-card" role="status">正在读取周期…</div>
    <section v-else-if="error && !hasCycleData" class="empty-state beryl-card" role="alert">
      <h1 class="font-title">周期暂时无法加载</h1>
      <p>{{ error }}</p>
      <button class="app-button primary" type="button" @click="refresh">重新读取</button>
    </section>
    <template v-else>
      <header class="page-head">
        <div>
          <p class="eyebrow">周期 · 阶段变化</p>
          <h1 class="font-title">周期</h1>
          <p>从现有课题、今日行动与复盘中，看见这一轮正在发生什么。</p>
        </div>
        <div>
          <button class="app-button" type="button" @click="navigate('/app/today')">回到今天</button>
          <button class="app-button" type="button" @click="navigate('/app/matters')">全部处境</button>
        </div>
      </header>

      <section v-if="error" class="empty-state beryl-card" role="alert">
        最新数据读取失败，当前仍展示上一次结果：{{ error }}
        <button class="app-button" type="button" @click="refresh">重试</button>
      </section>

      <section class="cycle-hero beryl-card" aria-labelledby="cycle-current-title">
        <div class="cycle-orbit" role="group" aria-label="课题五行阶段分布">
          <div
            v-for="(stage, index) in cycleStages"
            :key="stage.key"
            class="cycle-node"
            :class="[`node-${index}`, { current: stage.key === currentStage }]"
            :style="{ '--node-color': stage.color }"
            :aria-current="stage.key === currentStage ? 'step' : undefined"
          >
            <span aria-hidden="true">{{ stage.symbol }}</span>
            <b>{{ stage.label }} · {{ stage.hint }}</b>
            <small>{{ stageCounts[stage.key] }} 个课题</small>
          </div>
          <div class="cycle-center">
            <strong>{{ currentStageDefinition.symbol }}</strong>
            <b>{{ currentMatter ? currentMatter.title : '等待起步' }}</b>
            <small>{{ currentMatter ? `当前在${currentStageDefinition.label}阶段` : '尚无进行中的课题' }}</small>
          </div>
        </div>

        <div class="cycle-summary">
          <p class="eyebrow">当前阶段 · {{ displayDate(date) }}</p>
          <h2 id="cycle-current-title" class="font-title">{{ currentStageDefinition.symbol }} · {{ currentStageDefinition.label }}</h2>
          <template v-if="currentMatter">
            <p><b>{{ currentMatter.title }}</b></p>
            <p>{{ currentMatter.why || '这个课题还没有写下为什么重要。' }}</p>
          </template>
          <p v-else>当前没有进行中的课题。创建课题后，它会按真实阶段进入五行流。</p>
          <div
            class="cycle-progress"
            role="progressbar"
            aria-label="今日行动完成度"
            :aria-valuemin="0"
            :aria-valuemax="100"
            :aria-valuenow="completion"
          ><span :style="{ width: `${completion}%` }" /></div>
          <small>今日行动 <span class="cycle-completed-count" style="display: contents">{{ completedActions.length }}</span>/<span class="cycle-total-count" style="display: contents">{{ countedActions.length }}</span> · 完成度 <span class="cycle-completion-count" style="display: contents">{{ completion }}</span>%<template v-if="plan?.load"> · <span class="cycle-load-label" style="display: contents">{{ loadLabels[plan.load] }}</span></template></small>
          <button class="app-button primary" type="button" @click="navigate('/app/review')">
            {{ hasReview ? '查看今日复盘' : '开始今日复盘' }}
          </button>
        </div>
      </section>

      <div class="cycle-lower">
        <section class="cycle-block beryl-card" aria-labelledby="cycle-matters-title">
          <div class="panel-head">
            <div><p class="eyebrow">CURRENT MATTERS</p><h2 id="cycle-matters-title" class="font-title">这一轮的课题</h2></div>
            <button class="app-button" type="button" @click="navigate('/app/matters')">查看全部</button>
          </div>
          <ul v-if="activeMatters.length">
            <li v-for="item in activeMatters.slice(0, 5)" :key="item.calmyId">
              <button class="app-button" type="button" @click="navigate(`/app/matters/${item.calmyId}`)">
                {{ item.title }} · {{ stageLabel(item.currentStage) }}
              </button>
            </li>
          </ul>
          <p v-else class="empty-state">还没有进行中的课题。可以从课题页建立这一轮的现实主体。</p>
        </section>

        <section class="cycle-block beryl-card" aria-labelledby="cycle-actions-title">
          <div class="panel-head">
            <div><p class="eyebrow">TODAY FLOW</p><h2 id="cycle-actions-title" class="font-title">今日行动</h2></div>
            <button class="app-button" type="button" @click="navigate('/app/today')">打开今天</button>
          </div>
          <ul v-if="actions.length">
            <li v-for="item in actions.slice(0, 5)" :key="item.calmyId">
              {{ focusIds.has(item.calmyId) ? '★ ' : '' }}{{ item.title }} · {{ actionStatusLabels[item.status] }}
            </li>
          </ul>
          <p v-else class="empty-state">今天还没有行动。回到今天写下下一步，进度会自动出现在这里。</p>
        </section>
      </div>

      <section class="cycle-block beryl-card" aria-labelledby="cycle-timeline-title">
        <div class="panel-head">
          <div><p class="eyebrow">PHASE DISTRIBUTION</p><h2 id="cycle-timeline-title" class="font-title">阶段分布</h2></div>
          <span>{{ matters.filter(item => item.status !== 'archived').length }} 个未归档课题</span>
        </div>
        <div class="cycle-timeline">
          <span v-for="stage in cycleStages" :key="stage.key" :style="{ '--node-color': stage.color }">
            <b>{{ stage.symbol }}</b><small>{{ stage.label }} · {{ stageCounts[stage.key] }}</small>
          </span>
        </div>
        <p v-if="!plan" class="empty-state">今天尚未建立计划；本页保持只读，不会为了展示而创建新数据。</p>
      </section>
    </template>
  </div>
</template>
