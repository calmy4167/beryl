<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  buildGroups, loadWallLayout, saveWallLayout, randomEmptyHint,
  type QuoteGroup,
} from '@/core/quotes'
import GroupCard from './GroupCard.vue'

const groups = ref<QuoteGroup[]>([])
const spans = ref<Record<string, 1 | 2>>({})
const draggingId = ref<string | null>(null)
const loading = ref(true)
const emptyHint = ref('')

async function load() {
  loading.value = true
  try {
    const gs = await buildGroups()
    const saved = loadWallLayout()
    if (saved) {
      // 按 kind 恢复顺序：换一批后依然尽量保持用户排好的次序
      const first = new Map<string, QuoteGroup>()
      gs.forEach(g => { if (!first.has(g.kind)) first.set(g.kind, g) })
      const ordered = saved.orderKinds.map(k => first.get(k)).filter((g): g is QuoteGroup => !!g)
      const rest = gs.filter(g => !saved.orderKinds.includes(g.kind))
      groups.value = [...ordered, ...rest]
    } else {
      groups.value = gs
    }
    spans.value = {}
    groups.value.forEach(g => { spans.value[g.id] = (saved && saved.spanByKind[g.kind]) || 1 })
  } finally {
    loading.value = false
  }
}

function persist() {
  saveWallLayout({
    orderKinds: groups.value.map(g => g.kind),
    spanByKind: Object.fromEntries(groups.value.map(g => [g.kind, spans.value[g.id] || 1])),
  })
}

/* 大卡排序：把正在拖拽的大卡插到目标卡前/后 */
function moveGroup(targetId: string, pos: 'before' | 'after') {
  const fromId = draggingId.value
  if (!fromId || fromId === targetId) return
  let from = groups.value.findIndex(g => g.id === fromId)
  let to = groups.value.findIndex(g => g.id === targetId)
  if (from < 0 || to < 0) return
  const [moved] = groups.value.splice(from, 1)
  to = groups.value.findIndex(g => g.id === targetId)
  groups.value.splice(pos === 'before' ? to : to + 1, 0, moved)
  draggingId.value = null
  persist()
}

/* 小卡排序：组内重排 */
function moveCard(groupId: string, from: number, to: number) {
  const g = groups.value.find(x => x.id === groupId)
  if (!g || from === to || from < 0 || to < 0 || to >= g.cards.length) return
  const [c] = g.cards.splice(from, 1)
  g.cards.splice(to, 0, c)
  persist()
}

/* 大卡大小：1 列 ⇄ 整行 */
function resizeGroup(id: string, span: 1 | 2) {
  spans.value[id] = span
  persist()
}

onMounted(() => {
  emptyHint.value = randomEmptyHint()
  void load()
})
</script>

<template>
  <div class="wall">
    <div class="head">
      <h2 class="font-title sec-title">卡片墙</h2>
      <button class="refresh-btn" :disabled="loading" @click="load">
        {{ loading ? '加载中…' : '换一批 ↻' }}
      </button>
    </div>

    <!-- 加载骨架：模拟大卡嵌小卡结构 -->
    <div v-if="loading" class="wall-grid">
      <div class="skeleton-card span-2">
        <div class="sk-head" />
        <div class="sk-cards">
          <div v-for="i in 6" :key="i" class="sk-mini" />
        </div>
      </div>
      <div class="skeleton-card">
        <div class="sk-head" />
        <div class="sk-cards">
          <div v-for="i in 3" :key="i" class="sk-mini" />
        </div>
      </div>
    </div>

    <div v-else-if="!groups.length" class="hint">{{ emptyHint }}</div>

    <!-- 卡片墙：渐入 + 拖拽排序/调大小 -->
    <div v-else class="wall-grid">
      <GroupCard
        v-for="(g, i) in groups"
        :key="g.id"
        :group="g"
        :span="spans[g.id] || 1"
        :dragging="draggingId === g.id"
        :style="{ animationDelay: i * 70 + 'ms' }"
        @drag-start="draggingId = g.id"
        @drag-end="draggingId = null"
        @drop-pos="moveGroup(g.id, $event)"
        @move-card="(f: number, t: number) => moveCard(g.id, f, t)"
        @resize="resizeGroup(g.id, $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: center; justify-content: space-between; margin: 32px 0 12px; }
.sec-title { font-size: 12px; color: var(--c-text-3); letter-spacing: 0.2em; margin: 0; }
.refresh-btn {
  font-size: 11px;
  color: var(--scene);
  background: var(--scene-soft);
  border: 1px solid var(--scene-border-soft);
  border-radius: 8px;
  padding: 5px 12px;
  cursor: pointer;
  font-family: inherit;
  transition: all .15s ease;
}
.refresh-btn:hover:not(:disabled) { border-color: var(--scene-border); background: var(--scene-soft); }
.refresh-btn:disabled { opacity: .6; cursor: default; }
.hint { text-align: center; color: var(--c-text-3); font-size: 13px; padding: 48px 0; }

/* 大卡片区域：两列，大卡可跨整行 */
.wall-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
  align-items: start;
}
@media (max-width: 900px) {
  .wall-grid { grid-template-columns: 1fr; }
}

/* 加载完成的一次性渐入（温柔随机原则允许的"短暂渐入"，非循环） */
.wall-grid > * { animation: cardIn .4s ease both; }
@keyframes cardIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}

/* 骨架屏（静态灰块，遵循"克制的动效"不做循环闪烁） */
.skeleton-card {
  border: 1px solid var(--c-border-soft);
  border-radius: 16px;
  padding: 14px;
  background: var(--c-card);
}
.skeleton-card.span-2 { grid-column: 1 / -1; }
.sk-head { height: 18px; width: 40%; background: var(--c-bg-2); border-radius: 6px; margin-bottom: 12px; }
.sk-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
.sk-mini { height: 64px; background: var(--c-bg-soft); border: 1px solid var(--c-border-soft); border-radius: 10px; }
</style>
