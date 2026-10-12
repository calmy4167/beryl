<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listDesktopCaptureHistory, saveDesktopEntry, undoDesktopEntry, upgradeDesktopEntry } from '@/application'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import DeskAppearancePanel from './desk/DeskAppearancePanel.vue'
import DeskComposer from './desk/DeskComposer.vue'
import { readDeskPreferences, resetDeskPreferences, saveDeskPreferences, type DeskPreferences } from './desk/preferences'

useOwnSlideHead()

const router = useRouter()
const route = useRoute()
const draft = ref('')
const busy = ref(false)
const error = ref('')
const notice = ref('')
const historyCount = ref(0)
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
const previousTitle = typeof document === 'undefined' ? '' : document.title

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
  try {
    historyCount.value = (await listDesktopCaptureHistory()).length
  } catch {
    historyCount.value = 0
  }
}

function openHistory() {
  composerRef.value?.blur()
  const historyPath = route.path.startsWith('/liubai-preview/') ? '/liubai-preview/desk/history' : '/app/desk/history'
  void router.push(historyPath)
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
})

onBeforeUnmount(() => {
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
      <button type="button" aria-label="打开完整记录页" title="查看全部记录" @click="openHistory">记录 <span>{{ historyCount }}</span></button>
      <button type="button" aria-label="控制与外观" title="控制与外观设置" @click="openAppearance">控制</button>
    </nav>

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
  top: clamp(16px, 3vh, 26px);
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
@media (max-width: 620px) {
  .desk-home-corner { top: calc(10px + env(safe-area-inset-top)); right: 12px; }
  .desk-home-corner button { padding: 7px 9px; font-size: 12px; }
  .desk-home-error { max-width: calc(100vw - 32px); bottom: calc(52px + env(safe-area-inset-bottom)); }
  .desk-home-hint { max-width: 55vw; font-size: 10px; letter-spacing: .08em; }
}
@media (prefers-reduced-motion: reduce) { .desk-home, .desk-home-hint, .desk-home-corner button { transition: none; } }
</style>
