<script setup lang="ts">
/**
 * 日期切换（参考稿 .date-nav + .date-menu）。
 *
 * 结构照抄参考稿：.date-nav > .dn-trigger（.dn-text / .dn-dot / .dn-caret）
 * + 独立浮层 .date-menu（今天 / 昨天或上周 / 选择日期… / 全部 / 同步到所有模块）。
 * 浮层 teleport 到 body，避免被 .inner 的 overflow 裁掉。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ALL, dayKeyOffset, humanDay, isDetached, pickDate, syncAllDates, useModuleDate, weekRangeLabel, type ModuleKey } from './date-state'
import { todayKey } from '@/core/storage'
import { weekOf } from './focus'

const props = defineProps<{ module: ModuleKey; kind?: 'day' | 'week'; label?: string }>()

const { value, set } = useModuleDate(props.module)
const open = ref(false)
const trigger = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const firstMenuItem = ref<HTMLButtonElement | null>(null)
const menuStyle = ref<Record<string, string>>({})
const detached = computed(() => isDetached(props.module))

const text = computed(() => {
  if (props.label) return props.label
  if (value.value === ALL) return '全部'
  if (props.kind === 'week') {
    const week = weekOf(value.value)
    const isThisWeek = week.includes(todayKey())
    return isThisWeek ? `本周 · ${weekRangeLabel(week)}` : weekRangeLabel(week)
  }
  return humanDay(value.value)
})

function position() {
  const rect = trigger.value?.getBoundingClientRect()
  if (!rect) return
  const width = menu.value?.offsetWidth || 200
  const height = menu.value?.offsetHeight || 220
  const left = Math.min(Math.max(12, rect.right - width), window.innerWidth - width - 12)
  const below = rect.bottom + 6
  const top = below + height <= window.innerHeight - 12 ? below : Math.max(12, rect.top - height - 6)
  menuStyle.value = { left: `${left}px`, top: `${top}px` }
}

function toggle() {
  open.value = !open.value
  if (open.value) void nextTick(() => {
    position()
  })
}
function close(restoreFocus = true) {
  open.value = false
  if (restoreFocus) requestAnimationFrame(() => trigger.value?.focus())
}

function choose(next: string) {
  set(next)
  close()
}

/** 选择日期：原生 date picker（参考稿用隐藏 input + showPicker） */
function chooseDate() {
  pickDate(value.value, next => choose(next))
}

function onPointerDown(event: PointerEvent) {
  if (!open.value) return
  const target = event.target as Node
  if (menu.value?.contains(target) || trigger.value?.contains(target)) return
  close(false)
}
function onKey(event: KeyboardEvent) {
  if (!open.value || !menu.value) return
  if (event.key !== 'Escape' && !(event.target instanceof Node && menu.value.contains(event.target))) return
  const items = [...menu.value.querySelectorAll<HTMLButtonElement>('.dm-item:not([hidden])')]
  const index = items.indexOf(document.activeElement as HTMLButtonElement)
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopImmediatePropagation()
    close()
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }
}
function onViewportChange() { if (open.value) position() }
function onScroll() { close(false) }

watch(open, isOpen => {
  if (isOpen) {
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onScroll, true)
    void nextTick(() => firstMenuItem.value?.focus())
  } else {
    document.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('resize', onViewportChange)
    window.removeEventListener('scroll', onScroll, true)
  }
})
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onScroll, true)
})
</script>

<template>
  <div class="date-nav">
    <button
      ref="trigger"
      class="dn-trigger"
      type="button"
      aria-haspopup="true"
      :aria-expanded="open ? 'true' : 'false'"
      @click="toggle"
    >
      <span class="dn-text">{{ text }}</span>
      <span class="dn-dot" :hidden="!detached" />
      <span class="dn-caret" aria-hidden="true">▾</span>
    </button>

    <Teleport to="body">
      <div ref="menu" class="date-menu" :class="{ open }" :style="menuStyle" role="menu">
        <button ref="firstMenuItem" class="dm-item" role="menuitem" @click="choose(todayKey())"><span class="dm-icon">·</span>今天</button>
        <button class="dm-item" role="menuitem" @click="choose(dayKeyOffset(kind === 'week' ? -7 : -1))">
          <span class="dm-icon">·</span>{{ kind === 'week' ? '上周' : '昨天' }}
        </button>
        <button class="dm-item" role="menuitem" @click="chooseDate"><span class="dm-icon">⌖</span>选择日期…</button>
        <button class="dm-item" role="menuitem" @click="choose(ALL)"><span class="dm-icon">∞</span>全部</button>
        <div class="dm-sep" :hidden="!detached" />
        <button
          class="dm-item dm-sync"
          role="menuitem"
          :hidden="!detached"
          @click="syncAllDates(module); close()"
        ><span class="dm-icon">⇄</span>同步到所有模块</button>
      </div>
    </Teleport>
  </div>
</template>
