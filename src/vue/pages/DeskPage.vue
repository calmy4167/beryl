<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listDesktopCaptureHistory, saveDesktopEntry, undoDesktopEntry, upgradeDesktopEntry, type DesktopCaptureHistoryItem } from '@/application'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import DeskAppearancePanel from './desk/DeskAppearancePanel.vue'
import DeskComposer from './desk/DeskComposer.vue'
import { readHiddenDesktopCaptureIds } from './desk/history-visibility'
import { readDeskPreferences, resetDeskPreferences, saveDeskPreferences, type DeskPreferences } from './desk/preferences'

useOwnSlideHead()

const router = useRouter()
const route = useRoute()
const draft = ref('')
const busy = ref(false)
const error = ref('')
const notice = ref('')
const historyCount = ref(0)
const historyItems = ref<DesktopCaptureHistoryItem[]>([])
const hiddenHistoryIds = ref(readHiddenDesktopCaptureIds())
const historyLoading = ref(true)
const historyError = ref('')
const historyOpen = ref(false)
const selectedRecentId = ref('')
const historyTrigger = ref<HTMLButtonElement | null>(null)
const historyCloseTrigger = ref<HTMLButtonElement | null>(null)
const appearanceOpen = ref(false)
const warm = ref(false)
const composerRef = ref<{ focus: () => void; blur: () => void } | null>(null)
const preferences = ref<DeskPreferences>(readDeskPreferences())
const preferenceSaveError = ref(false)
const lastOperation = ref<{ operationId: string; kind: 'capture' | 'action'; completedAt: number } | null>(null)
const draftRevision = ref(0)

let upgradeRequested = false
let pendingOperationId = ''
let submitStartedAt = 0
let undoTimer: number | undefined
let noticeTimer: number | undefined
let warmTimer: number | undefined

function warmBackground(hex: string): string {
  const channels = [0, 2, 4].map(start => parseInt(hex.slice(start + 1, start + 3), 16))
  const isLight = 0.2126 * channels[0] / 255 + 0.7152 * channels[1] / 255 + 0.0722 * channels[2] / 255 > 0.45
  const shift = isLight ? -6 : 6
  return `#${channels.map(channel => Math.max(0, Math.min(255, channel + shift)).toString(16).padStart(2, '0')).join('')}`
}

const textColor = computed(() => {
  const hex = preferences.value.background.slice(1)
  const channels = [0, 2, 4].map(start => parseInt(hex.slice(start, start + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  return luminance > 0.36 ? '#25251f' : '#e9ebe8'
})

const composerStyle = computed(() => ({
  '--desk-bg': preferences.value.background,
  '--desk-bg-warm': warmBackground(preferences.value.background),
  '--desk-ink': textColor.value,
  '--desk-muted': textColor.value === '#25251f' ? 'rgba(37, 37, 31, .52)' : 'rgba(233, 235, 232, .48)',
  '--desk-faint': textColor.value === '#25251f' ? 'rgba(37, 37, 31, .16)' : 'rgba(233, 235, 232, .16)',
  '--desk-line': textColor.value === '#25251f' ? 'rgba(37, 37, 31, .12)' : 'rgba(233, 235, 232, .12)',
  '--desk-accent': textColor.value === '#25251f' ? '#718578' : '#9fcbb8',
  '--desk-font-size': `${preferences.value.fontSize}px`,
  '--desk-width': preferences.value.columnWidth === 'full' ? '100%' : `${preferences.value.columnWidth}rem`,
  '--desk-align': preferences.value.horizontalAlign,
  '--desk-line-height': String(preferences.value.lineSpacing),
  '--desk-letter-spacing': `${preferences.value.letterSpacing}em`,
  '--desk-paragraph-spacing': `${preferences.value.paragraphSpacing}em`,
  '--desk-vertical-align': preferences.value.verticalAlign === 'top' ? 'flex-start' : preferences.value.verticalAlign === 'middle' ? 'center' : 'flex-end',
}))

const canUndo = computed(() => !!lastOperation.value && Date.now() - lastOperation.value.completedAt <= 4000)
const recentRecords = computed(() => historyItems.value
  .filter(item => !hiddenHistoryIds.value.includes(item.capture.calmyId))
  .sort((a, b) => b.capture.createdAt - a.capture.createdAt)
  .slice(0, 6))
const selectedRecentRecord = computed(() => recentRecords.value.find(item => item.capture.calmyId === selectedRecentId.value) || recentRecords.value[0])
const previousTitle = typeof document === 'undefined' ? '' : document.title

watch(recentRecords, records => {
  if (!records.some(item => item.capture.calmyId === selectedRecentId.value)) {
    selectedRecentId.value = records[0]?.capture.calmyId || ''
  }
}, { immediate: true })

function makeOperationId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `desk-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function announce(message: string) {
  notice.value = message
  if (noticeTimer) window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => { notice.value = '' }, 1500)
}

function warmCanvas() {
  warm.value = true
  if (warmTimer) window.clearTimeout(warmTimer)
  warmTimer = window.setTimeout(() => { warm.value = false }, 1800)
}

function rememberOperation(operationId: string, kind: 'capture' | 'action') {
  lastOperation.value = { operationId, kind, completedAt: Date.now() }
  if (undoTimer) window.clearTimeout(undoTimer)
  undoTimer = window.setTimeout(() => {
    if (lastOperation.value?.operationId === operationId) lastOperation.value = null
  }, 4100)
}

async function refreshHistory() {
  historyLoading.value = true
  historyError.value = ''
  try {
    const [items, hiddenIds] = await Promise.all([listDesktopCaptureHistory(), Promise.resolve(readHiddenDesktopCaptureIds())])
    historyItems.value = items
    hiddenHistoryIds.value = hiddenIds
    historyCount.value = items.filter(item => !hiddenIds.includes(item.capture.calmyId)).length
  } catch (cause) {
    historyError.value = cause instanceof Error ? cause.message : '记录暂时无法读取'
  } finally {
    historyLoading.value = false
  }
}

function openHistoryDrawer() {
  composerRef.value?.blur()
  historyOpen.value = true
  void nextTick(() => historyCloseTrigger.value?.focus())
  void refreshHistory()
}

function closeHistoryDrawer() {
  historyOpen.value = false
  void nextTick(() => historyTrigger.value?.focus())
}

function openAllHistory() {
  historyOpen.value = false
  composerRef.value?.blur()
  const historyPath = route.path.startsWith('/liubai-preview/') ? '/liubai-preview/desk/history' : '/app/desk/history'
  void router.push(historyPath)
}

function recordStatus(item: DesktopCaptureHistoryItem): string {
  if (item.decision === 'action') return '今天的行动'
  if (item.decision === 'matter') return '处境'
  if (item.decision === 'record') return '记录'
  if (item.decision === 'seed') return '稍后再看'
  if (item.decision === 'let_go' || item.capture.status === 'archived' || item.capture.status === 'rejected') return '已放下'
  if (item.capture.status === 'suggested') return '已有整理建议'
  return '待处理'
}

function recordTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp))
}

function openAppearance() {
  composerRef.value?.blur()
  appearanceOpen.value = true
}

function focusComposer() { void nextTick(() => composerRef.value?.focus()) }

function focusCanvas(event: PointerEvent) {
  if (appearanceOpen.value) return
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('button, a, input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
  focusComposer()
}

function closeAppearance() { appearanceOpen.value = false; focusComposer() }

async function upgradeLast() {
  if (busy.value) {
    if (pendingOperationId && Date.now() - submitStartedAt <= 500) upgradeRequested = true
    return
  }
  const recent = lastOperation.value
  if (!recent || recent.kind !== 'capture' || Date.now() - recent.completedAt > 500) return
  await upgradeOperation(recent.operationId)
}

async function upgradeOperation(operationId: string) {
  busy.value = true
  error.value = ''
  try {
    await upgradeDesktopEntry({ operationId })
    rememberOperation(operationId, 'action')
    announce('已转为今天的行动')
    await refreshHistory()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
    announce('记录已保存，但暂时没有转成行动；可稍后从记录中继续处理。')
  } finally {
    busy.value = false
  }
}

async function submit(body: string) {
  if (busy.value || !body.trim()) return
  busy.value = true
  error.value = ''
  const submittedBody = body.trim()
  const revisionAtSubmit = draftRevision.value
  const operationId = makeOperationId()
  pendingOperationId = operationId
  submitStartedAt = Date.now()
  upgradeRequested = false
  draft.value = ''
  try {
    const result = await saveDesktopEntry({ operationId, body: submittedBody })
    if (draftRevision.value === revisionAtSubmit) rememberOperation(operationId, 'capture')
    announce('已记录')
    void refreshHistory()
    if (result.suggestionCompletion) {
      void result.suggestionCompletion.then(() => refreshHistory())
    }
    if (upgradeRequested && Date.now() - submitStartedAt <= 500) {
      upgradeRequested = false
      busy.value = false
      await upgradeOperation(operationId)
    }
  } catch (cause) {
    if (!draft.value) draft.value = submittedBody
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    pendingOperationId = ''
    busy.value = false
  }
}

async function undoLast() {
  const operation = lastOperation.value
  if (!operation || !canUndo.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await undoDesktopEntry({ operationId: operation.operationId })
    lastOperation.value = null
    if (undoTimer) window.clearTimeout(undoTimer)
    announce(operation.kind === 'action' ? '已撤销转为行动' : '已撤销这条记录')
    await refreshHistory()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false
  }
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    if (appearanceOpen.value) closeAppearance()
    else if (historyOpen.value) closeHistoryDrawer()
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !draft.value && !appearanceOpen.value) {
    if (!canUndo.value) return
    event.preventDefault()
    event.stopPropagation()
    void undoLast()
  }
}

function updatePreferences(value: DeskPreferences) {
  preferences.value = value
  preferenceSaveError.value = !saveDeskPreferences(value)
}

function restorePreferences() {
  preferences.value = resetDeskPreferences()
  preferenceSaveError.value = false
}

watch(() => preferences.value, value => {
  preferenceSaveError.value = !saveDeskPreferences(value)
}, { deep: true })
watch(() => draft.value, value => {
  if (value) {
    draftRevision.value += 1
    upgradeRequested = false
    lastOperation.value = null
    if (undoTimer) window.clearTimeout(undoTimer)
  }
})

onMounted(() => {
  document.title = '桌面 — Calmy'
  void refreshHistory()
  window.addEventListener('beryl-data-synced', refreshHistory)
})

onBeforeUnmount(() => {
  window.removeEventListener('beryl-data-synced', refreshHistory)
  if (undoTimer) window.clearTimeout(undoTimer)
  if (noticeTimer) window.clearTimeout(noticeTimer)
  if (warmTimer) window.clearTimeout(warmTimer)
  document.title = previousTitle
})
</script>

<template>
  <main class="desk-home" :class="{ 'is-warm': warm }" :style="composerStyle" @keydown.capture="onKey" @pointerdown="focusCanvas">
    <section class="desk-home-main" :class="`align-${preferences.horizontalAlign}`">
      <div class="desk-home-composer" :style="{ maxWidth: 'var(--desk-width)' }">
        <DeskComposer ref="composerRef" v-model="draft" :busy="busy" @submit="submit" @upgrade-last="upgradeLast" @activity="warmCanvas" />
        <p v-if="error" class="desk-home-error" role="alert">{{ error }}</p>
      </div>
    </section>

    <div class="desk-home-hint" :class="{ 'is-visible': !!notice }" role="status" aria-live="polite">
      <span>{{ notice }}</span>
      <button v-if="canUndo" type="button" :disabled="busy" aria-label="撤销最近操作" @click="undoLast">撤销</button>
    </div>
    <nav class="desk-home-corner" aria-label="桌面控制">
      <button ref="historyTrigger" type="button" aria-label="打开最近记录" title="查看最近记录" :aria-expanded="historyOpen" @click="openHistoryDrawer">记录 <span>{{ historyCount }}</span></button>
      <button type="button" aria-label="控制与外观" title="控制与外观设置" @click="openAppearance">控制</button>
    </nav>

    <div v-if="historyOpen" class="desk-recent-backdrop" role="presentation" @click.self="closeHistoryDrawer">
      <aside class="desk-recent-drawer" role="dialog" aria-modal="true" aria-labelledby="desk-recent-title" @keydown.esc.stop.prevent="closeHistoryDrawer">
        <header class="desk-recent-head">
          <div>
            <h2 id="desk-recent-title">最近记录</h2>
            <p>{{ historyCount }} 条 · 只属于你</p>
          </div>
          <button ref="historyCloseTrigger" type="button" class="desk-recent-close" aria-label="关闭最近记录" @click="closeHistoryDrawer">×</button>
        </header>
        <div class="desk-recent-list" aria-label="最近记录列表">
          <p v-if="historyLoading" class="desk-recent-state" role="status">正在读取记录…</p>
          <p v-else-if="historyError" class="desk-recent-state is-error" role="alert">{{ historyError }} <button type="button" @click="refreshHistory">重试</button></p>
          <p v-else-if="!recentRecords.length" class="desk-recent-state">还没有记录。写下此刻正在想的事，它会出现在这里。</p>
          <template v-else>
            <button
              v-for="item in recentRecords"
              :key="item.capture.calmyId"
              type="button"
              class="desk-recent-item"
              :class="{ 'is-selected': selectedRecentRecord?.capture.calmyId === item.capture.calmyId }"
              :aria-pressed="selectedRecentRecord?.capture.calmyId === item.capture.calmyId"
              @click="selectedRecentId = item.capture.calmyId"
            >
              <span class="desk-recent-item-body">{{ item.capture.body }}</span>
              <span class="desk-recent-item-meta"><time :datetime="new Date(item.capture.createdAt).toISOString()">{{ recordTime(item.capture.createdAt) }}</time><span>{{ recordStatus(item) }}</span></span>
            </button>
          </template>
        </div>
        <article v-if="!historyLoading && !historyError && selectedRecentRecord" class="desk-recent-detail" aria-label="所选记录详情">
          <p>{{ recordTime(selectedRecentRecord.capture.createdAt) }} · {{ recordStatus(selectedRecentRecord) }}</p>
          <div>{{ selectedRecentRecord.capture.body }}</div>
        </article>
        <footer class="desk-recent-foot">
          <button type="button" @click="openAllHistory">查看全部记录 <span aria-hidden="true">→</span></button>
        </footer>
      </aside>
    </div>

    <DeskAppearancePanel v-if="appearanceOpen" :model-value="preferences" :save-error="preferenceSaveError" @update:model-value="updatePreferences" @reset="restorePreferences" @close="closeAppearance" />
  </main>
</template>

<style scoped>
.desk-home {
  --desk-bg: #fbfbf8;
  --desk-bg-warm: #f5f5f2;
  --desk-ink: #25251f;
  --desk-muted: rgba(37, 37, 31, .52);
  --desk-faint: rgba(37, 37, 31, .16);
  --desk-line: rgba(37, 37, 31, .12);
  --desk-accent: #718578;
  position: fixed;
  z-index: 1;
  inset: 0;
  display: flex;
  flex: 1 0 100%;
  flex-direction: column;
  width: auto;
  min-height: 0;
  margin: 0;
  padding: clamp(16px, 2.4vh, 36px) clamp(16px, 2vw, 32px);
  overflow: hidden;
  background: var(--desk-bg);
  color: var(--desk-ink);
  font-family: "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", system-ui, sans-serif;
  transition: background-color 1.4s cubic-bezier(.4, 0, .2, 1), color .5s cubic-bezier(.4, 0, .2, 1);
}
.desk-home.is-warm { background-color: var(--desk-bg-warm); }
.desk-home-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: var(--desk-vertical-align);
  min-height: 0;
  /* Reserve the same toolbar breathing room on both ends. A single top inset
     shifts the centered writing line down by half the inset. */
  padding-block: clamp(44px, 7vh, 60px);
  padding-inline: clamp(20px, 2.5vw, 36px);
}
.desk-home-composer { width: 100%; margin-inline: auto; font-size: var(--desk-font-size); line-height: var(--desk-line-height); letter-spacing: var(--desk-letter-spacing); }
.desk-home-composer :deep(.desk-composer-editor) { text-align: var(--desk-align); }
.desk-home-composer :deep(.desk-composer-footer) { text-align: var(--desk-align); }
.desk-home-main.align-left :deep(.desk-composer-footer) { text-align: left; }
.desk-home-main.align-center :deep(.desk-composer-footer) { text-align: center; }
.desk-home-main.align-right :deep(.desk-composer-footer) { text-align: right; }
.desk-home-main.align-justify :deep(.desk-composer-footer) { text-align: justify; }
.desk-home-error { position: fixed; left: clamp(16px, 2vw, 32px); bottom: calc(46px + env(safe-area-inset-bottom)); z-index: 5; max-width: min(70vw, 620px); margin: 0; color: #a64339; font-size: 12px; line-height: 1.65; }
.desk-home-hint {
  position: fixed;
  left: clamp(16px, 2vw, 32px);
  bottom: calc(16px + env(safe-area-inset-bottom));
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 12px;
  color: color-mix(in srgb, currentColor 58%, transparent);
  font-size: 12px;
  letter-spacing: .12em;
  opacity: 0;
  pointer-events: none;
  transform: translateY(3px);
  transition: opacity .5s cubic-bezier(.4, 0, .2, 1), transform .5s cubic-bezier(.4, 0, .2, 1);
}
.desk-home-hint.is-visible { opacity: .9; transform: translateY(0); }
.desk-home-hint button {
  border: 0;
  padding: 5px 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.desk-home-hint button:hover { color: var(--desk-ink); }
.desk-home-corner {
  position: fixed;
  /* Keep the desk actions below the shell's fixed HUD / mode / settings row. */
  top: calc(clamp(16px, 3vh, 26px) + 40px);
  right: clamp(16px, 2vw, 32px);
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px;
  border: 1px solid var(--desk-line);
  border-radius: 11px;
  background: color-mix(in srgb, var(--desk-bg) 92%, transparent);
}
.desk-home-corner button {
  border: 0;
  padding: 7px 11px;
  border-radius: 8px;
  background: transparent;
  color: color-mix(in srgb, currentColor 70%, transparent);
  font: inherit;
  font-size: 13px;
  letter-spacing: .02em;
  cursor: pointer;
  transition: background-color .18s ease, color .18s ease;
}
.desk-home-corner button:hover, .desk-home-corner button:focus-visible { color: var(--desk-ink); background: color-mix(in srgb, var(--desk-ink) 7%, transparent); outline-color: var(--desk-accent); }
.desk-home-corner button span { margin-left: 4px; color: var(--desk-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.desk-recent-backdrop { position: fixed; z-index: 70; inset: 0; display: flex; justify-content: flex-end; background: rgb(20 23 19 / 22%); animation: desk-recent-fade .16s ease-out; }
.desk-recent-drawer { display: flex; width: min(420px, 100%); min-width: 0; height: 100%; flex-direction: column; padding: 26px 24px 18px; border-left: 1px solid var(--desk-line); background: var(--desk-bg); color: var(--desk-ink); box-shadow: -18px 0 50px rgb(31 35 29 / 10%); animation: desk-recent-enter .2s ease-out; }
.desk-recent-head { display: flex; flex: none; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 19px; border-bottom: 1px solid var(--desk-line); }
.desk-recent-head h2 { margin: 0; font-size: 20px; font-weight: 500; letter-spacing: -.04em; }
.desk-recent-head p, .desk-recent-item-meta, .desk-recent-detail > p { margin: 6px 0 0; color: var(--desk-muted); font-size: 12px; }
.desk-recent-close { display: grid; width: 32px; height: 32px; flex: none; place-items: center; border: 1px solid var(--desk-line); border-radius: 9px; background: transparent; color: var(--desk-muted); font-size: 18px; cursor: pointer; }
.desk-recent-close:hover, .desk-recent-close:focus-visible { color: var(--desk-ink); background: var(--desk-faint); }
.desk-recent-list { min-height: 0; flex: 1; overflow-y: auto; padding: 12px 0; }
.desk-recent-item { display: block; width: 100%; margin: 2px 0 5px; padding: 13px 12px; border: 0; border-radius: 11px; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.desk-recent-item:hover { background: color-mix(in srgb, var(--desk-ink) 4%, transparent); }
.desk-recent-item.is-selected { background: color-mix(in srgb, var(--desk-accent) 13%, transparent); }
.desk-recent-item-body { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow-wrap: anywhere; font-size: 13px; line-height: 1.55; }
.desk-recent-item-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 11px; }
.desk-recent-state { margin: 18px 6px; color: var(--desk-muted); font-size: 13px; line-height: 1.7; }
.desk-recent-state.is-error { color: #a64339; }
.desk-recent-state button { border: 0; background: transparent; color: inherit; text-decoration: underline; cursor: pointer; }
.desk-recent-detail { flex: none; max-height: 32vh; overflow-y: auto; padding: 14px 12px; border-top: 1px solid var(--desk-line); }
.desk-recent-detail > p { margin: 0 0 8px; font-size: 11px; }
.desk-recent-detail > div { overflow-wrap: anywhere; font-family: Georgia, serif; font-size: 14px; line-height: 1.8; white-space: pre-wrap; }
.desk-recent-foot { flex: none; padding-top: 14px; border-top: 1px solid var(--desk-line); }
.desk-recent-foot button { display: flex; width: 100%; align-items: center; justify-content: space-between; padding: 10px 4px; border: 0; background: transparent; color: var(--desk-muted); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.desk-recent-foot button:hover { color: var(--desk-ink); }
@keyframes desk-recent-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes desk-recent-enter { from { transform: translateX(24px); opacity: .7; } to { transform: translateX(0); opacity: 1; } }
@media (max-width: 620px) {
  .desk-home-corner { top: calc(10px + env(safe-area-inset-top)); right: 12px; }
  .desk-home-corner button { padding: 7px 9px; font-size: 12px; }
  .desk-home-error { max-width: calc(100vw - 32px); bottom: calc(52px + env(safe-area-inset-bottom)); }
  .desk-home-hint { max-width: 55vw; font-size: 10px; letter-spacing: .08em; }
  .desk-recent-drawer { padding: calc(20px + env(safe-area-inset-top)) 18px calc(14px + env(safe-area-inset-bottom)); }
}
@media (prefers-reduced-motion: reduce) { .desk-home, .desk-home-hint, .desk-home-corner button { transition: none; } .desk-recent-backdrop, .desk-recent-drawer { animation-duration: 1ms; } }
</style>
