<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { SCENES, currentSceneId } from '@/core/scenes'
import { store, nextId, fmtDate } from '@/core/storage'
import { randomHeroQuote } from '@/core/quotes'
import QuoteWall from '@/components/quotes/QuoteWall.vue'
import { caseRepository } from '@/domain/case/repository'
import { PHASE_META, STATUS_LABEL, type CaseItem } from '@/domain/case/model'

const router = useRouter()
const scene = computed(() => SCENES[currentSceneId()])
const heroQuote = ref('')
const dataTick = ref(0)
const activeCases = computed<CaseItem[]>(() => { void dataTick.value; return caseRepository.list().filter(item => item.status === 'active' || item.status === 'inbox').sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4) })
const todayTasks = computed(() => { void dataTick.value; return store.get<any[]>('tasks', []).filter(task => !task.done).slice(0, 5) })
const inboxCount = computed(() => { void dataTick.value; return store.get<any[]>('inbox', []).length })
function refreshDashboard() { dataTick.value++ }
onMounted(() => { heroQuote.value = randomHeroQuote(); window.addEventListener('beryl-data-synced', refreshDashboard) })
onUnmounted(() => window.removeEventListener('beryl-data-synced', refreshDashboard))

/* 合并输入框：Enter 记随想；1 秒内再按 Enter 升级为待办 */
const QUICK_DBL_MS = 1000
const quickText = ref('')
let last: { text: string; id: string; time: number } | null = null

function quickKeydown(e: KeyboardEvent) {
  if (e.key !== 'Enter') return
  e.preventDefault()
  const now = Date.now()
  const v = quickText.value.trim()
  const L = last
  if (L && now - L.time < QUICK_DBL_MS && (!v || v === L.text)) {
    const inbox = store.get<any[]>('inbox', [])
    store.set('inbox', inbox.filter(x => x.id !== L.id))
    const tasks = store.get<any[]>('tasks', [])
    tasks.unshift({ id: nextId(), title: L.text, priority: '中', date: fmtDate(now), done: false })
    store.set('tasks', tasks)
    last = null
    quickText.value = ''
    ElMessage.success('已转为待办（中优先级）')
    return
  }
  if (!v) return
  const items = store.get<any[]>('inbox', [])
  const it = { id: nextId(), text: v, date: fmtDate(now) }
  items.unshift(it)
  store.set('inbox', items)
  last = { text: v, id: it.id, time: now }
  quickText.value = ''
  ElMessage.success('已记录随想，1 秒内再按 Enter 转为待办')
}
</script>

<template>
  <div>
    <!-- Hero -->
    <div class="hero text-center">
      <div class="hero-badge">{{ scene.icon }} BERYL · {{ scene.name }}</div>
      <h1 class="font-title hero-title">{{ scene.tagline }}</h1>
      <p class="hero-sub">{{ scene.desc }}</p>
      <p v-if="heroQuote" class="hero-quote">{{ heroQuote }}</p>
    </div>

    <section class="case-overview">
      <div class="section-head"><h2 class="font-title">正在解决</h2><el-button text @click="router.push('/app/cases')">全部课题 →</el-button></div>
      <div class="case-grid"><button v-for="item in activeCases" :key="item.id" class="beryl-card case-card" @click="router.push('/app/cases/' + item.id)"><span>{{ PHASE_META[item.currentPhase].icon }} {{ PHASE_META[item.currentPhase].label }}</span><b>{{ item.title }}</b><small>{{ STATUS_LABEL[item.status] }} · {{ item.desiredOutcome || '尚未定义结果' }}</small></button><button v-if="!activeCases.length" class="beryl-card case-card empty-case" @click="router.push('/app/cases')">◈ 创建第一个现实课题</button></div>
      <div class="today-grid"><div class="beryl-card today"><div class="section-head"><h3>今日行动</h3><el-button text size="small" @click="router.push('/app/module/tasks')">任务 →</el-button></div><p v-for="task in todayTasks" :key="task.id">□ {{ task.title }}</p><p v-if="!todayTasks.length" class="muted">暂无待办行动</p></div><button class="beryl-card today inbox" @click="router.push('/app/module/inbox')"><h3>待处理收集箱</h3><b>{{ inboxCount }}</b><span>条想法等待归入课题或行动</span></button></div>
    </section>

    <!-- 合并输入框：随想 / 待办 -->
    <div class="beryl-card hoverable quick-box">
      <el-input
        v-model="quickText"
        size="large"
        placeholder="此刻在想什么？"
        class="quick-input"
        @keydown="quickKeydown"
      />
      <p class="quick-hint">Enter 记录随想 · 1 秒内再按 Enter 转为待办</p>
    </div>

    <!-- 大卡片墙：大卡嵌小卡，可拖动排序/调整大小 -->
    <QuoteWall />
  </div>
</template>

<style scoped>
/* ---- hero ---- */
.hero { padding: 40px 0 8px; }
.hero-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--scene);
  background: var(--scene-soft);
  border: 1px solid var(--scene-border-soft);
  padding: 5px 14px;
  border-radius: 999px;
  margin-bottom: 16px;
}
.hero-title { font-size: 2.25rem; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 8px; line-height: 1.25; }
.hero-sub { font-size: 14px; color: var(--c-text-2); margin: 0; }
.hero-quote { margin: 12px 0 0; font-size: 12px; color: var(--c-text-3); font-style: italic; letter-spacing: 0.05em; }

/* ---- 合并输入框 ---- */
.quick-box { padding: 16px; margin-top: 28px; }
.quick-hint { font-size: 10px; color: var(--c-text-3); margin: 10px 0 0; }
.case-overview { margin-top:28px; }.section-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }.section-head h2 { margin:0; font-size:16px; }.section-head h3 { margin:0; font-size:13px; }.case-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:10px; margin-top:10px; }.case-card { min-height:116px; text-align:left; display:flex; flex-direction:column; gap:8px; padding:14px; border:1px solid var(--c-border-soft); background:var(--c-card); color:var(--c-text); cursor:pointer; }.case-card:hover { border-color:var(--scene-border-strong); }.case-card span { font-size:10px; color:var(--scene); }.case-card b { font-size:14px; }.case-card small { color:var(--c-text-2); font-size:10px; line-height:1.5; }.empty-case { align-items:center; justify-content:center; color:var(--c-text-3); }.today-grid { display:grid; grid-template-columns:2fr 1fr; gap:10px; margin-top:10px; }.today { padding:14px; text-align:left; }.today p { margin:8px 0 0; font-size:12px; }.muted { color:var(--c-text-3); }.inbox { border:1px solid var(--c-border-soft); background:var(--c-card); color:var(--c-text); cursor:pointer; display:flex; flex-direction:column; gap:8px; }.inbox b { font-size:30px; color:var(--scene); }.inbox span { font-size:11px; color:var(--c-text-2); line-height:1.5; }

/* ---- 手机端 ---- */
@media (max-width: 640px) {
  .hero { padding: 24px 0 0; }
  .hero-title { font-size: 1.6rem; }
  .hero-badge { font-size: 10px; padding: 4px 12px; margin-bottom: 12px; }
  .hero-sub { font-size: 13px; }
  .hero-quote { font-size: 11px; }
  .quick-box { padding: 12px; margin-top: 20px; }
  .today-grid { grid-template-columns:1fr; }
}
</style>
