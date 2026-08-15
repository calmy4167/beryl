<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { SCENES, currentSceneId } from '@/core/scenes'
import { store, nextId, fmtDate } from '@/core/storage'
import { randomHeroQuote } from '@/core/quotes'
import QuoteWall from '@/components/quotes/QuoteWall.vue'

const scene = computed(() => SCENES[currentSceneId()])
const heroQuote = ref('')
onMounted(() => { heroQuote.value = randomHeroQuote() })

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
</style>
