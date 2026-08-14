<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { SCENES, currentSceneId } from '@/core/scenes'
import { CATS, catsFor, MODS, STAT_LABEL, STAT_COLOR, STAT_MOD, statValue } from '@/core/modules'
import { store, nextId, fmtDate } from '@/core/storage'

const router = useRouter()
const scene = computed(() => SCENES[currentSceneId()])
const cats = computed(() => catsFor(currentSceneId()))

// 统计卡片
const stats = computed(() => scene.value.stats.map(t => ({
  type: t,
  label: STAT_LABEL[t],
  color: STAT_COLOR[t],
  mod: STAT_MOD[t]
})))
const statValues = ref<Record<string, string>>({})
function refreshStats() {
  const v: Record<string, string> = {}
  scene.value.stats.forEach(t => { v[t] = statValue(t) })
  statValues.value = v
}

// 快速输入：Enter 记随想；1 秒内再按 Enter（可连续敲回车）升级为待办
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
    refreshStats()
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
  refreshStats()
}

// 十神分类下拉
const openCat = ref<string | null>(null)
function toggleCat(id: string) {
  openCat.value = openCat.value === id ? null : id
}
function onDocClick(e: MouseEvent) {
  const t = e.target as HTMLElement
  if (!t.closest('#cat-nav')) openCat.value = null
}
function openModule(id: string) {
  openCat.value = null
  router.push('/app/module/' + id)
}
function catMods(catId: string): string[] {
  const c = CATS.find(x => x.id === catId)
  return c ? c.mods.filter(m => scene.value.mods.includes(m)) : []
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  refreshStats()
})
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div>
    <!-- 品牌区 -->
    <div class="text-center pt-8">
      <div class="logo">⬡</div>
      <h1 class="font-title title">Beryl</h1>
      <p class="tagline">{{ scene.tagline }}</p>
    </div>

    <!-- 快速输入 -->
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

    <!-- 统计卡片 -->
    <div class="stats-grid">
      <div
        v-for="s in stats"
        :key="s.type"
        class="beryl-card hoverable stat-card"
        @click="router.push('/app/module/' + s.mod)"
      >
        <p class="stat-label">{{ s.label }}</p>
        <p class="font-title stat-value" :style="{ color: s.color }" v-html="statValues[s.type] || '0'" />
      </div>
    </div>

    <!-- 十神分类导航 -->
    <nav id="cat-nav" class="cat-nav">
      <div class="cat-row">
        <button
          v-for="c in cats"
          :key="c.id"
          class="cat-tag beryl-card"
          :class="{ on: openCat === c.id }"
          @click.stop="toggleCat(c.id)"
        >
          <span>{{ c.icon }}</span><span>{{ c.name }}</span><span class="caret">▼</span>
        </button>
      </div>
      <div v-if="openCat" class="beryl-card cat-drop">
        <button
          v-for="m in catMods(openCat)"
          :key="m"
          class="drop-item"
          @click.stop="openModule(m)"
        >
          <span class="dot" :style="{ background: MODS[m].color }" />
          <span>{{ MODS[m].icon }} {{ MODS[m].name }}</span>
        </button>
      </div>
    </nav>
  </div>
</template>

<style scoped>
.logo { font-size: 36px; color: var(--scene); }
.title { font-size: 2rem; font-weight: 700; letter-spacing: 0.3em; margin: 8px 0 4px; }
.tagline { font-size: 12px; color: #71717a; letter-spacing: 0.3em; }
.quick-box { padding: 16px; margin-top: 32px; }
.quick-hint { font-size: 10px; color: #52525b; margin: 10px 0 0; }
.stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 16px; }
@media (min-width: 768px) { .stats-grid { grid-template-columns: repeat(4, 1fr); } }
.stat-card { padding: 16px; cursor: pointer; }
.stat-label { font-size: 10px; color: #71717a; letter-spacing: 0.2em; }
.stat-value { font-size: 1.5rem; font-weight: 700; margin-top: 6px; }
.stat-value :deep(.unit) { font-size: 12px; color: #71717a; margin-left: 2px; }
.cat-nav { position: relative; margin-top: 32px; }
.cat-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.cat-tag { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 999px; font-size: 12px; cursor: pointer; background: rgba(24,24,29,0.75); border: 1px solid rgba(255,255,255,0.06); }
.cat-tag.on { border-color: var(--scene-border); background: var(--scene-soft); }
.caret { font-size: 9px; opacity: 0.6; }
.cat-drop { position: absolute; left: 0; right: 0; top: calc(100% + 8px); padding: 8px; z-index: 20; display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; }
@media (min-width: 640px) { .cat-drop { grid-template-columns: repeat(3, 1fr); } }
.drop-item { display: flex; align-items: center; gap: 8px; padding: 9px 11px; border-radius: 10px; font-size: 13px; cursor: pointer; background: transparent; border: none; color: var(--text); text-align: left; }
.drop-item:hover { background: rgba(255,255,255,0.05); }
.dot { width: 8px; height: 8px; border-radius: 50%; }
</style>
