<script setup lang="ts">
import { computed } from 'vue'
import type { DesktopCaptureHistoryItem } from '@/application'

const props = withDefaults(defineProps<{
  items: DesktopCaptureHistoryItem[]
  hiddenIds: string[]
  showHidden: boolean
  loading: boolean
  error: string
  actionError: string
  busyId: string
  selectedId?: string
}>(), { selectedId: '' })

const emit = defineEmits<{
  back: []
  retry: []
  select: [id: string]
  openTarget: [item: DesktopCaptureHistoryItem]
  hide: [item: DesktopCaptureHistoryItem]
  restore: [item: DesktopCaptureHistoryItem]
  'toggle-hidden': []
}>()

function isHidden(item: DesktopCaptureHistoryItem): boolean {
  return props.hiddenIds.includes(item.capture.calmyId)
}

function dayKey(time: number): string {
  const date = new Date(time)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function dayLabel(time: number): string {
  const date = new Date(time)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return '今天'
  if (date.toDateString() === yesterday.toDateString()) return '昨天'
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(date)
}

function timeLabel(time: number): string {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(time))
}

function dateTimeLabel(time: number): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(time))
}

function status(item: DesktopCaptureHistoryItem): string {
  if (isHidden(item)) return '已从列表隐藏'
  if (item.decision === 'action') return '今天的行动'
  if (item.decision === 'matter') return '处境'
  if (item.decision === 'record') return '记录'
  if (item.decision === 'seed') return '稍后再看'
  if (item.decision === 'let_go' || item.capture.status === 'archived' || item.capture.status === 'rejected') return '已放下'
  if (item.capture.status === 'suggested') return '已有整理建议'
  return '待处理'
}

const hiddenCount = computed(() => props.items.filter(isHidden).length)
const displayedItems = computed(() => props.items.filter(item => props.showHidden || !isHidden(item)))
const selectedItem = computed(() => displayedItems.value.find(item => item.capture.calmyId === props.selectedId) || displayedItems.value[0])
const groups = computed(() => {
  const result: Array<{ key: string; label: string; items: DesktopCaptureHistoryItem[] }> = []
  for (const item of displayedItems.value) {
    const key = dayKey(item.capture.createdAt)
    let group = result[result.length - 1]
    if (!group || group.key !== key) {
      group = { key, label: dayLabel(item.capture.createdAt), items: [] }
      result.push(group)
    }
    group.items.push(item)
  }
  return result
})
</script>

<template>
  <main class="desk-record-history grow" aria-label="完整记录">
    <section class="desk-record-list" aria-label="记录列表">
      <header class="desk-record-list-head">
        <div>
          <h1>记录</h1>
          <p>{{ items.length }} 条 · 慢慢回看</p>
        </div>
        <button class="desk-record-back" type="button" @click="emit('back')">返回首页</button>
      </header>

      <div class="desk-record-list-tools">
        <button type="button" :aria-pressed="showHidden" @click="emit('toggle-hidden')">
          {{ showHidden ? '隐藏已移出记录' : `显示已移出记录${hiddenCount ? ` · ${hiddenCount}` : ''}` }}
        </button>
      </div>

      <p v-if="loading" class="desk-record-state" role="status">正在读取记录…</p>
      <p v-else-if="error" class="desk-record-error" role="alert">
        {{ error }} <button type="button" @click="emit('retry')">重试读取</button>
      </p>
      <p v-else-if="!displayedItems.length" class="desk-record-state">
        {{ showHidden ? '没有已移出的记录。' : '还没有记录。写下当下正在面对的事，它会出现在这里。' }}
      </p>
      <div v-else class="desk-history-groups" aria-live="polite">
        <section v-for="group in groups" :key="group.key" class="desk-history-day">
          <h2>{{ group.label }}</h2>
          <ul>
            <li v-for="item in group.items" :key="item.capture.calmyId" class="desk-history-row" :class="{ 'is-selected': selectedItem?.capture.calmyId === item.capture.calmyId, 'is-action': item.decision === 'action', 'is-hidden': isHidden(item) }">
              <button
                type="button"
                class="desk-history-select"
                :aria-current="selectedItem?.capture.calmyId === item.capture.calmyId ? 'true' : undefined"
                @click="emit('select', item.capture.calmyId)"
              >
                <span class="desk-history-record-body">{{ item.capture.body }}</span>
                <span class="desk-history-meta">
                  <time :datetime="new Date(item.capture.createdAt).toISOString()">{{ timeLabel(item.capture.createdAt) }}</time>
                  <span>{{ status(item) }}</span>
                </span>
              </button>
              <button
                v-if="isHidden(item)"
                type="button"
                class="desk-history-action"
                :disabled="busyId === item.capture.calmyId"
                :aria-label="`恢复显示：${item.capture.body.slice(0, 36)}`"
                @click="emit('restore', item)"
              >↶</button>
              <button
                v-else
                type="button"
                class="desk-history-action"
                :disabled="busyId === item.capture.calmyId"
                :aria-label="`从记录列表隐藏：${item.capture.body.slice(0, 36)}`"
                @click="emit('hide', item)"
              >×</button>
            </li>
          </ul>
        </section>
      </div>
      <p v-if="actionError" class="desk-record-action-error" role="alert">{{ actionError }}</p>
    </section>

    <article v-if="selectedItem" class="desk-history-detail" aria-label="记录详情">
      <header class="desk-history-detail-head">
        <time :datetime="new Date(selectedItem.capture.createdAt).toISOString()">{{ dateTimeLabel(selectedItem.capture.createdAt) }}</time>
        <button v-if="selectedItem.entityId && !isHidden(selectedItem)" type="button" class="desk-history-related" @click="emit('openTarget', selectedItem)">打开关联内容 ↗</button>
      </header>
      <p class="desk-history-detail-status">{{ status(selectedItem) }}</p>
      <div class="desk-history-detail-body">{{ selectedItem.capture.body }}</div>
      <footer class="desk-history-detail-actions">
        <button
          v-if="isHidden(selectedItem)"
          type="button"
          :disabled="busyId === selectedItem.capture.calmyId"
          @click="emit('restore', selectedItem)"
        >恢复显示</button>
        <button
          v-else
          type="button"
          :disabled="busyId === selectedItem.capture.calmyId"
          @click="emit('hide', selectedItem)"
        >从记录列表隐藏</button>
      </footer>
    </article>
    <article v-else class="desk-history-detail desk-history-detail-empty" aria-label="记录详情">
      <p v-if="loading">记录加载后会显示在这里。</p>
      <p v-else-if="error">记录详情暂时无法显示。</p>
      <p v-else>选择一条记录，慢慢回看。</p>
    </article>
  </main>
</template>

<style scoped>
.desk-record-history {
  --desk-bg: #fbfbf8;
  --desk-ink: #25251f;
  --desk-muted: rgba(37, 37, 31, .55);
  --desk-line: rgba(37, 37, 31, .12);
  display: grid;
  flex: 1;
  grid-template-columns: minmax(220px, .7fr) minmax(0, 1.65fr);
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--desk-line);
  border-radius: 14px;
  background: var(--desk-bg);
  color: var(--desk-ink);
}
.desk-record-list { display: flex; min-width: 0; min-height: 0; flex-direction: column; overflow: hidden; border-right: 1px solid var(--desk-line); }
.desk-record-list-head { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 16px; padding: 24px 24px 20px; border-bottom: 1px solid var(--desk-line); }
.desk-record-list-head h1 { margin: 0; font-size: 21px; font-weight: 500; letter-spacing: -.04em; }
.desk-record-list-head p { margin: 6px 0 0; color: var(--desk-muted); font-size: 12px; }
.desk-record-back, .desk-record-list-tools button, .desk-history-related, .desk-history-detail-actions button { border: 1px solid var(--desk-line); border-radius: 8px; padding: 8px 10px; background: transparent; color: inherit; font: inherit; font-size: 11px; cursor: pointer; }
.desk-record-back:hover, .desk-record-list-tools button:hover, .desk-history-related:hover, .desk-history-detail-actions button:hover { background: rgb(37 37 31 / 4%); }
.desk-record-list-tools { display: flex; flex: none; justify-content: flex-end; padding: 9px 18px 2px; }
.desk-record-list-tools button { border-color: transparent; padding: 6px; color: var(--desk-muted); }
.desk-history-groups { min-height: 0; flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 4px 18px 20px; scrollbar-color: rgba(37, 37, 31, .22) transparent; scrollbar-width: thin; }
.desk-history-day + .desk-history-day { margin-top: 16px; }
.desk-history-day h2 { margin: 12px 8px 5px; color: var(--desk-muted); font-size: 11px; font-weight: 500; letter-spacing: .04em; }
.desk-history-day ul { margin: 0; padding: 0; list-style: none; }
.desk-history-row { display: grid; grid-template-columns: minmax(0, 1fr) 24px; gap: 4px; align-items: start; }
.desk-history-select { display: block; min-width: 0; border: 0; border-radius: 10px; padding: 11px 10px; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.desk-history-row.is-selected .desk-history-select { background: #edf0e9; }
.desk-history-record-body { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow-wrap: anywhere; font-size: 13px; line-height: 1.6; }
.desk-history-meta { display: flex; flex-wrap: wrap; gap: 4px 9px; margin-top: 7px; color: var(--desk-muted); font-size: 10px; }
.desk-history-action { align-self: start; width: 24px; height: 32px; border: 0; padding: 0; background: transparent; color: var(--desk-muted); font: inherit; cursor: pointer; opacity: .45; }
.desk-history-row:hover .desk-history-action, .desk-history-action:focus-visible { opacity: 1; }
.desk-history-row.is-hidden { opacity: .68; }
.desk-record-state, .desk-record-error { margin: 24px; color: var(--desk-muted); font-size: 13px; line-height: 1.75; }
.desk-record-error { color: #a64339; }
.desk-record-error button { border: 0; background: transparent; color: inherit; text-decoration: underline; cursor: pointer; }
.desk-record-action-error { flex: none; margin: 0 22px 15px; color: #a64339; font-size: 12px; }
.desk-history-detail { display: flex; min-width: 0; min-height: 0; flex-direction: column; overflow: auto; padding: clamp(28px, 4vw, 62px) clamp(24px, 6vw, 82px); background: #fbfbf8; }
.desk-history-detail-head { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 16px; color: var(--desk-muted); font-size: 12px; }
.desk-history-related { flex: none; }
.desk-history-detail-status { flex: none; margin: clamp(28px, 7vh, 64px) 0 12px; color: var(--desk-muted); font-size: 12px; }
.desk-history-detail-body { max-width: 68ch; overflow-wrap: anywhere; white-space: pre-wrap; font: 400 clamp(18px, 2vw, 24px)/1.85 Georgia, 'Songti SC', serif; }
.desk-history-detail-actions { display: flex; flex: none; gap: 8px; margin-top: auto; padding-top: 30px; }
.desk-history-detail-empty { justify-content: center; color: var(--desk-muted); text-align: center; }
.desk-history-detail-empty p { margin: 0; }
@media (max-width: 760px) {
  .desk-record-history { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(215px, 43dvh) minmax(250px, 1fr); border-radius: 11px; }
  .desk-record-list { border-right: 0; border-bottom: 1px solid var(--desk-line); }
  .desk-record-list-head { padding: 16px 16px 13px; }
  .desk-record-list-tools { padding-right: 12px; }
  .desk-history-groups { padding: 2px 10px 12px; }
  .desk-history-detail { padding: 24px 20px; }
  .desk-history-detail-status { margin-top: 28px; }
}
@media (prefers-reduced-motion: reduce) { .desk-history-select, .desk-record-back, .desk-record-list-tools button { transition: none; } }
</style>
