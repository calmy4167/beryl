<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { decideCapture, listDesktopCaptureHistory, type DesktopCaptureHistoryItem } from '@/application'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import DeskCaptureHistory from './DeskCaptureHistory.vue'
import { hideDesktopCaptureId, readHiddenDesktopCaptureIds, restoreDesktopCaptureId } from './history-visibility'

useOwnSlideHead()

const router = useRouter()
const route = useRoute()
const items = ref<DesktopCaptureHistoryItem[]>([])
const hiddenIds = ref(readHiddenDesktopCaptureIds())
const showHidden = ref(false)
const loading = ref(false)
const error = ref('')
const actionError = ref('')
const busyId = ref('')
const selectedId = ref('')
const displayedItems = computed(() => items.value.filter(item => showHidden.value || !hiddenIds.value.includes(item.capture.calmyId)))
const previousTitle = typeof document === 'undefined' ? '' : document.title

watch(displayedItems, visible => {
  if (!visible.some(item => item.capture.calmyId === selectedId.value)) selectedId.value = visible[0]?.capture.calmyId || ''
}, { immediate: true })

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const history = await listDesktopCaptureHistory()
    items.value = [...history].sort((a, b) => b.capture.createdAt - a.capture.createdAt)
    hiddenIds.value = readHiddenDesktopCaptureIds()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loading.value = false
  }
}

async function hide(item: DesktopCaptureHistoryItem) {
  const id = item.capture.calmyId
  busyId.value = id
  actionError.value = ''
  try {
    const needsArchive = !item.decision && (item.capture.status === 'inbox' || item.capture.status === 'suggested')
    if (needsArchive) await decideCapture({ captureId: id, decision: 'let_go' })
    if (!hideDesktopCaptureId(id)) throw new Error('无法保存隐藏状态，请检查浏览器本机存储空间。')
    hiddenIds.value = readHiddenDesktopCaptureIds()
    await refresh()
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busyId.value = ''
  }
}

function restore(item: DesktopCaptureHistoryItem) {
  if (!restoreDesktopCaptureId(item.capture.calmyId)) {
    actionError.value = '未能恢复显示，请检查浏览器本机存储空间。'
    return
  }
  hiddenIds.value = readHiddenDesktopCaptureIds()
  actionError.value = ''
}

function openTarget(item: DesktopCaptureHistoryItem) {
  const path: Record<NonNullable<DesktopCaptureHistoryItem['decision']>, string | undefined> = {
    action: '/app/today',
    matter: '/app/matters',
    record: '/app/capture',
    seed: '/app/library',
    let_go: undefined,
  }
  const target = item.decision ? path[item.decision] : undefined
  if (target) void router.push(target)
}

onMounted(() => {
  document.title = '记录 — Calmy'
  void refresh()
})

onBeforeUnmount(() => { document.title = previousTitle })
</script>

<template>
  <DeskCaptureHistory
    :items="items"
    :hidden-ids="hiddenIds"
    :show-hidden="showHidden"
    :loading="loading"
    :error="error"
    :action-error="actionError"
    :busy-id="busyId"
    :selected-id="selectedId"
    @back="router.push(route.path.startsWith('/liubai-preview/') ? '/liubai-preview/desk' : '/app/desk')"
    @retry="refresh"
    @select="selectedId = $event"
    @open-target="openTarget"
    @hide="hide"
    @restore="restore"
    @toggle-hidden="showHidden = !showHidden"
  />
</template>
