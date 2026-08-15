<script setup lang="ts">
import { ref } from 'vue'
import type { QuoteGroup } from '@/core/quotes'
import QuoteCardComp from './QuoteCard.vue'

const props = defineProps<{
  group: QuoteGroup
  span: 1 | 2
  dragging: boolean
  touch: boolean
}>()

const emit = defineEmits<{
  (e: 'drag-start'): void
  (e: 'drag-end'): void
  (e: 'drop-pos', pos: 'before' | 'after'): void
  (e: 'move-card', from: number, to: number): void
  (e: 'resize', span: 1 | 2): void
  (e: 'move-up'): void
  (e: 'move-down'): void
}>()

/* ---- 大卡拖拽排序 ---- */
const dropPos = ref<'before' | 'after' | null>(null)

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('text/plain', props.group.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  emit('drag-start')
}
function onDragOver(e: DragEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  dropPos.value = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}
function onDrop() {
  emit('drop-pos', dropPos.value || 'after')
  dropPos.value = null
}

/* ---- 小卡拖拽排序（组内） ---- */
const cardDrag = ref<number | null>(null)
const cardDrop = ref<number | null>(null)

function onCardDragStart(i: number, e: DragEvent) {
  e.stopPropagation()
  cardDrag.value = i
  e.dataTransfer?.setData('text/plain', 'mini')
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onCardDragOver(i: number, e: DragEvent) {
  e.stopPropagation()
  if (cardDrag.value !== null) cardDrop.value = i
}
function onCardDrop(i: number, e: DragEvent) {
  e.stopPropagation()
  if (cardDrag.value !== null && cardDrag.value !== i) emit('move-card', cardDrag.value, i)
  cardDrag.value = null
  cardDrop.value = null
}

/* ---- 大卡大小：拖动手柄切换 1 列 / 整行 ---- */
const resizing = ref(false)

function onResizeStart(e: PointerEvent) {
  resizing.value = true
  const startX = e.clientX
  const startSpan = props.span
  const move = (ev: PointerEvent) => {
    const dx = ev.clientX - startX
    if (startSpan === 1 && dx > 70) emit('resize', 2)
    else if (startSpan === 2 && dx < -70) emit('resize', 1)
  }
  const up = () => {
    resizing.value = false
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
</script>

<template>
  <div
    class="group"
    :class="['span-' + span, { 'drop-before': dropPos === 'before', 'drop-after': dropPos === 'after', resizing, dragging }]"
    draggable="true"
    @dragstart="onDragStart"
    @dragend="emit('drag-end'); dropPos = null"
    @dragover.prevent="onDragOver"
    @dragleave="dropPos = null"
    @drop.prevent="onDrop"
  >
    <!-- 大卡标题栏 -->
    <div class="g-head">
      <span class="g-icon">{{ group.icon }}</span>
      <span class="g-title">{{ group.title }}</span>
      <span class="g-count">{{ group.cards.length }} 张</span>
      <span class="g-actions">
        <template v-if="touch">
          <button class="g-move" title="上移" @click.stop="emit('move-up')">↑</button>
          <button class="g-move" title="下移" @click.stop="emit('move-down')">↓</button>
        </template>
        <span v-else class="g-hint">⠿ 拖动排序</span>
        <span class="resize-handle" title="拖动改变大小" @pointerdown.prevent="onResizeStart">⤡</span>
      </span>
    </div>

    <!-- 大卡内部：小卡网格 -->
    <div class="g-cards">
      <div
        v-for="(c, i) in group.cards"
        :key="c.id"
        class="mini-cell"
        :class="{ 'drop-target': cardDrop === i }"
        draggable="true"
        @dragstart="onCardDragStart(i, $event)"
        @dragover.prevent="onCardDragOver(i, $event)"
        @dragleave="cardDrop = null"
        @drop.prevent="onCardDrop(i, $event)"
      >
        <QuoteCardComp :card="c" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.group {
  background: var(--c-card);
  border: 1px solid var(--c-border-soft);
  border-radius: 16px;
  padding: 14px;
  transition: border-color .18s ease, box-shadow .18s ease, opacity .15s ease;
  position: relative;
}
.group:hover { border-color: var(--c-border); }
.group.drop-before { border-top: 3px solid var(--scene); }
.group.drop-after { border-bottom: 3px solid var(--scene); }
.group.resizing { outline: 2px dashed var(--scene-border); }
.group.dragging { opacity: .55; }

/* 跨列：大卡占满整行 */
.group.span-2 { grid-column: 1 / -1; }

.g-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; cursor: grab; }
.g-head:active { cursor: grabbing; }
.g-icon { font-size: 16px; }
.g-title { font-size: 13px; font-weight: 700; color: var(--c-text); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.g-count { font-size: 10px; color: var(--c-text-3); flex-shrink: 0; }
.g-actions { margin-left: auto; display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.g-hint { font-size: 9px; color: var(--c-text-3); opacity: 0; transition: opacity .15s ease; }
.group:hover .g-hint { opacity: 1; }
.g-move {
  width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px;
  color: var(--c-text-3);
  background: transparent;
  border: 1px solid var(--c-border-soft);
  border-radius: 7px;
  cursor: pointer;
  font-family: inherit;
  transition: all .15s ease;
}
.g-move:hover { color: var(--scene); border-color: var(--scene-border); background: var(--scene-soft); }
.resize-handle {
  width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px;
  color: var(--c-text-3);
  border-radius: 6px;
  cursor: ew-resize;
  user-select: none;
  touch-action: none; /* 触屏可拖动 */
  transition: all .15s ease;
}
.resize-handle:hover { color: var(--scene); background: var(--scene-soft); }

/* 内部小卡网格 */
.g-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
}
.mini-cell { min-width: 0; transition: opacity .15s ease; }
.mini-cell.drop-target { opacity: .5; }

/* ---- 手机端紧凑化 ---- */
@media (max-width: 640px) {
  .group { padding: 10px; border-radius: 12px; }
  .g-head { margin-bottom: 10px; }
  .g-cards { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
  .g-move { width: 30px; height: 30px; } /* 触控目标 ≥ 44px 的折中，30px 可点 */
  .resize-handle { width: 30px; height: 30px; }
}
</style>
