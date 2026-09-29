<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { WorkspaceTab } from '@/router/workspace-tabs'

const props = defineProps<{ tabs: readonly WorkspaceTab[]; activePath: string; saveState: string }>()
const emit = defineEmits<{ activate: [path: string]; close: [path: string]; reorder: [path: string, targetPath: string] }>()
const scroller = ref<HTMLDivElement>()
const activeTab = ref<HTMLButtonElement>()
const draggingPath = ref('')
const dropTarget = ref('')
const edges = ref({ left: false, right: false })
const visibleSaveStates = new Set(['saving', 'pending', 'conflict', 'failed'])

function updateEdges(): void {
  const element = scroller.value
  if (!element) return
  const max = Math.max(0, element.scrollWidth - element.clientWidth)
  edges.value = { left: element.scrollLeft > 1, right: element.scrollLeft < max - 1 }
}
function scroll(direction: -1 | 1): void {
  if (!scroller.value) return
  scroller.value.scrollLeft += direction * Math.max(160, Math.round(scroller.value.clientWidth * .7))
  updateEdges()
}
function onStart(event: DragEvent, tab: WorkspaceTab): void {
  if (tab.pinned || (event.target as HTMLElement).closest('.workspace-tab-close')) { event.preventDefault(); return }
  draggingPath.value = tab.path
  event.dataTransfer?.setData('text/plain', tab.path)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
function onOver(event: DragEvent, tab: WorkspaceTab): void {
  if (!draggingPath.value || draggingPath.value === tab.path || tab.pinned) { dropTarget.value = ''; return }
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dropTarget.value = tab.path
}
function onDrop(event: DragEvent, tab: WorkspaceTab): void {
  if (draggingPath.value && draggingPath.value !== tab.path && !tab.pinned) {
    event.preventDefault()
    emit('reorder', draggingPath.value, tab.path)
  }
  clearDrag()
}
function clearDrag(): void { draggingPath.value = ''; dropTarget.value = '' }
function onKey(event: KeyboardEvent, tab: WorkspaceTab, index: number): void {
  if (event.ctrlKey && event.shiftKey && !tab.pinned && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    const target = props.tabs[index + (event.key === 'ArrowLeft' ? -1 : 1)]
    if (!target || target.pinned) return
    event.preventDefault(); emit('reorder', tab.path, target.path); return
  }
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  const nextIndex = event.key === 'ArrowLeft' ? Math.max(0, index - 1)
    : event.key === 'ArrowRight' ? Math.min(props.tabs.length - 1, index + 1)
      : event.key === 'Home' ? 0 : event.key === 'End' ? props.tabs.length - 1 : -1
  if (nextIndex < 0 || nextIndex === index) return
  event.preventDefault()
  scroller.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus()
  emit('activate', props.tabs[nextIndex].path)
}
function scrollDuringDrag(event: DragEvent): void {
  if (!draggingPath.value || !scroller.value || scroller.value.scrollWidth <= scroller.value.clientWidth) return
  const bounds = scroller.value.getBoundingClientRect()
  if (event.clientX < bounds.left + 36) scroller.value.scrollLeft -= 28
  else if (event.clientX > bounds.right - 36) scroller.value.scrollLeft += 28
}

let observer: ResizeObserver | undefined
onMounted(() => {
  updateEdges()
  scroller.value?.addEventListener('scroll', updateEdges, { passive: true })
  window.addEventListener('resize', updateEdges)
  if (typeof ResizeObserver !== 'undefined' && scroller.value) { observer = new ResizeObserver(updateEdges); observer.observe(scroller.value) }
})
onUnmounted(() => {
  scroller.value?.removeEventListener('scroll', updateEdges)
  window.removeEventListener('resize', updateEdges)
  observer?.disconnect()
})
watch(() => [props.tabs, props.activePath], async () => { await nextTick(); activeTab.value?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }) })
</script>

<template>
  <nav class="workspace-tabs" aria-label="工作区标签">
    <div ref="scroller" class="workspace-tabs-scroll" role="tablist" aria-label="已打开的工作区" @dragover="scrollDuringDrag">
      <div v-for="(tab, index) in tabs" :key="tab.path" class="workspace-tab" :class="{ 'is-active': tab.path === activePath, 'is-pinned': tab.pinned, 'is-dragging': draggingPath === tab.path, 'is-drop-target': dropTarget === tab.path }" :draggable="!tab.pinned" @dragstart="onStart($event, tab)" @dragover="onOver($event, tab)" @drop="onDrop($event, tab)" @dragend="clearDrag">
        <button :ref="tab.path === activePath ? (el => activeTab = el as HTMLButtonElement) : undefined" type="button" role="tab" :aria-selected="tab.path === activePath" :tabindex="tab.path === activePath ? 0 : -1" :data-path="tab.path" :title="tab.pinned ? tab.title : `${tab.title} · 拖动排序，或按 Ctrl + Shift + 左右方向键`" :aria-keyshortcuts="tab.pinned ? undefined : 'Control+Shift+ArrowLeft Control+Shift+ArrowRight'" @click="emit('activate', tab.path)" @keydown="onKey($event, tab, index)">
          <svg v-if="tab.pinned" class="workspace-tab-pin" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 7 6v10H5V9z" /><path d="M9 19v-6h6v6" /></svg>
          <svg v-else class="workspace-tab-drag-hint" viewBox="0 0 12 16" aria-hidden="true"><circle cx="3" cy="3" r="1"/><circle cx="9" cy="3" r="1"/><circle cx="3" cy="8" r="1"/><circle cx="9" cy="8" r="1"/><circle cx="3" cy="13" r="1"/><circle cx="9" cy="13" r="1"/></svg>
          <span v-if="tab.path === activePath && visibleSaveStates.has(saveState)" class="workspace-tab-save-state" :data-tab-save-state="saveState" :aria-label="saveState === 'failed' ? '保存失败' : saveState === 'conflict' ? '保存冲突' : '正在保存'" />
          <span class="workspace-tab-title">{{ tab.title }}</span>
        </button>
        <button v-if="!tab.pinned" class="workspace-tab-close" type="button" :aria-label="`关闭${tab.title}`" @click="emit('close', tab.path)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8 8 8M16 8l-8 8" /></svg></button>
      </div>
    </div>
    <button v-if="edges.left" class="workspace-tab-scroll workspace-tab-scroll-left" type="button" aria-label="向左滚动标签页" @click="scroll(-1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg></button>
    <button v-if="edges.right" class="workspace-tab-scroll workspace-tab-scroll-right" type="button" aria-label="向右滚动标签页" @click="scroll(1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg></button>
  </nav>
</template>
