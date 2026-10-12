<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { todayKey } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import type { ActionItem } from '@/domain/action/model'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter, MatterStage } from '@/domain/matter/model'
import { todayAsyncRepository } from '@/domain/today/repository'
import type { TodayPlan } from '@/domain/today/model'
import { useActionStatusDictionary } from '@/vue/composables/useActionStatusDictionary'
import ContextRelationPicker from '@/vue/components/ContextRelationPicker.vue'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'

// 页面自带头部（参考稿里 .slide-head 属于页面自身），外壳因此不再渲染第二行标题。
useOwnSlideHead()

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

const { labelFor: actionStatusLabel } = useActionStatusDictionary()

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
  <header class="slide-head">
    <div class="head-main">
      <p class="hint">周期 · 阶段变化</p>
      <div class="head-title-row">
        <h2 v-if="loading && !hasCycleData">正在读取周期…</h2>
        <h2 v-else-if="error && !hasCycleData">周期暂时无法加载。</h2>
        <h2 v-else>{{ currentStageDefinition.symbol }} · {{ currentStageDefinition.label }}</h2>
        <span class="info" tabindex="0" data-tip="从现有课题、今日行动与复盘中，看见这一轮正在发生什么。H 收起辅助信息。" aria-label="周期说明">i</span>
      </div>
    </div>
    <div class="detail-chips head-actions">
      <button class="chip" type="button" @click="navigate('/app/today')">回到今天</button>
      <button class="chip" type="button" @click="navigate('/app/matters')">全部处境</button>
    </div>
  </header>

    <p v-if="loading && !hasCycleData" class="panel dim" role="status">正在读取周期…</p>
    <section v-else-if="error && !hasCycleData" class="panel cycle-error" role="alert">
      <h2>周期暂时无法加载</h2>
      <p class="dim">{{ error }}</p>
      <button class="chip on" type="button" @click="refresh">重新读取</button>
    </section>
    <template v-else>
      <section v-if="error" class="panel cycle-error" role="alert">
        最新数据读取失败，当前仍展示上一次结果：{{ error }}
        <button class="chip" type="button" @click="refresh">重试</button>
      </section>

      <section class="cycle-hero panel" aria-labelledby="cycle-current-title">
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
          <h2 id="cycle-current-title">{{ currentStageDefinition.symbol }} · {{ currentStageDefinition.label }}</h2>
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
          <button class="chip on" type="button" @click="navigate('/app/review')">
            {{ hasReview ? '查看今日复盘' : '开始今日复盘' }}
          </button>
        </div>
      </section>

      <div class="cycle-lower">
        <section class="cycle-block panel" aria-labelledby="cycle-matters-title">
          <div class="panel-head">
            <div><p class="eyebrow">CURRENT MATTERS</p><h2 id="cycle-matters-title">这一轮的课题</h2></div>
            <button class="chip" type="button" @click="navigate('/app/matters')">查看全部</button>
          </div>
          <ul v-if="activeMatters.length">
            <li v-for="item in activeMatters.slice(0, 5)" :key="item.calmyId">
              <button class="chip" type="button" @click="navigate(`/app/matters/${item.calmyId}`)">
                {{ item.title }} · {{ stageLabel(item.currentStage) }}
              </button>
            </li>
          </ul>
          <p v-else class="dim">还没有进行中的课题。可以从课题页建立这一轮的现实主体。</p>
        </section>

        <section class="cycle-block panel" aria-labelledby="cycle-actions-title">
          <div class="panel-head">
            <div><p class="eyebrow">TODAY FLOW</p><h2 id="cycle-actions-title">今日行动</h2></div>
            <button class="chip" type="button" @click="navigate('/app/today')">打开今天</button>
          </div>
          <ul v-if="actions.length">
            <li v-for="item in actions.slice(0, 5)" :key="item.calmyId">
              {{ focusIds.has(item.calmyId) ? '★ ' : '' }}{{ item.title }} · {{ actionStatusLabel(item.status) }}
              <ContextRelationPicker :entity-ref="{ entityType: 'action', calmyId: item.calmyId }" />
            </li>
          </ul>
          <p v-else class="dim">今天还没有行动。回到今天写下下一步，进度会自动出现在这里。</p>
        </section>
      </div>

      <section class="cycle-block panel" aria-labelledby="cycle-timeline-title">
        <div class="panel-head">
          <div><p class="eyebrow">PHASE DISTRIBUTION</p><h2 id="cycle-timeline-title">阶段分布</h2></div>
          <span class="dim">{{ matters.filter(item => item.status !== 'archived').length }} 个未归档课题</span>
        </div>
        <div class="cycle-timeline">
          <span v-for="stage in cycleStages" :key="stage.key" :style="{ '--node-color': stage.color }">
            <b>{{ stage.symbol }}</b><small>{{ stage.label }} · {{ stageCounts[stage.key] }}</small>
          </span>
        </div>
        <p v-if="!plan" class="dim">今天尚未建立计划；本页保持只读，不会为了展示而创建新数据。</p>
      </section>
    </template>
</template>

<style scoped>
/* 页面局部排版：颜色一律取「留白」令牌。
   钩子：.cycle-node(+.current/aria-current) / .cycle-center / #cycle-current-title / #cycle-matters-title /
   #cycle-actions-title / .cycle-completed-count|total-count|completion-count（带内联 display:contents）
   / .cycle-timeline / .cycle-progress。两个 #cycle-*-title 所在的容器必须仍是 <section>（测试用 closest('section')）。 */
.slide-head .head-actions { align-self: flex-end; margin-left: auto; }
.cycle-error { border-color: color-mix(in srgb, var(--danger) 45%, transparent); }
.cycle-hero { gap: 18px; }
.cycle-lower { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: clamp(10px, 1.2vw, 14px); align-items: start; }

/* 五行转盘：位置（.node-0..4 的 absolute 定位）与尺寸来自 app.css，这里只把它的浅色底换成 v11 令牌：
   内圈原来是 #f5fbf6、节点圆盘原来是 #fff，在深色主题下会露出白块。 */
.cycle-orbit { background: radial-gradient(circle at center, var(--panel) 0 28%, transparent 29%), conic-gradient(from -20deg, #55ae7d 0 20%, #ef746c 20% 40%, #e4a649 40% 60%, #9da5a8 60% 80%, #73acd8 80% 100%); }
.cycle-node { text-align: center; }
.cycle-node > span { background: var(--panel-2); border: 1px solid color-mix(in srgb, var(--node-color, var(--accent)) 50%, transparent); border-radius: 50%; }
.cycle-node > b { color: var(--fg); font-size: .8rem; }
.cycle-node small { color: var(--muted); font-size: .68rem; }
.cycle-node.current { border-color: var(--accent); }
.cycle-center { display: grid; gap: 4px; justify-items: center; padding: 14px; border: 1px dashed var(--line-strong); border-radius: 12px; background: var(--panel); }
.cycle-center strong { font-size: 1.6rem; color: var(--accent); }
.cycle-center b { font-size: .9rem; }
.cycle-center small { color: var(--muted); font-size: .7rem; }

.cycle-summary { display: grid; gap: 8px; }
.cycle-summary h2 { margin: 0; font-size: 1.2rem; font-weight: 600; }
.cycle-summary p { margin: 0; font-size: .82rem; line-height: 1.7; color: var(--muted); }
.cycle-summary p b { color: var(--fg); }
.cycle-summary small { color: var(--muted); font-size: .72rem; }
.cycle-progress { height: 6px; border-radius: 999px; background: var(--panel-2); overflow: hidden; }
.cycle-progress span { display: block; height: 100%; background: var(--accent); }

.cycle-block { gap: 8px; }
.cycle-block h2 { margin: 0; font-size: 1rem; font-weight: 600; }
.cycle-block ul { display: grid; gap: 6px; list-style: none; margin: 0; padding: 0; }
.cycle-block li { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: .78rem; color: var(--muted); }
.cycle-timeline { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; }
.cycle-timeline > span { display: grid; gap: 3px; padding: 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-2); text-align: center; }
.cycle-timeline b { color: var(--node-color, var(--accent)); }
.cycle-timeline small { color: var(--muted); font-size: .68rem; }
</style>
