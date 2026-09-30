<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { apiBaseUrl } from '@/core/api/base-url'
import { readServerSession } from '@/core/auth'
import { syncVaultEntityData } from '@/core/entity-sync'
import { SAVE_STATE_EVENT, type SaveStateDetail } from '@/core/save-state'

const route = useRoute()
let timer: number | undefined
let inFlight: Promise<void> | null = null
let generation = 0
let hasCloudAcknowledgement = false
let activeSyncUserId: string | null = null
let localSaveSequence = 0

function reportCloudSync(state: 'idle' | 'pending' | 'syncing' | 'synced' | 'failed') {
  window.dispatchEvent(new CustomEvent('beryl-cloud-sync-state', { detail: { state } }))
}

function stopSync() {
  generation++
  if (timer) window.clearInterval(timer)
  timer = undefined
  inFlight = null
  window.removeEventListener('focus', onFocus)
}
function runSync() {
  if (inFlight) return inFlight
  const current = generation
  const saveSequence = localSaveSequence
  const baseUrl = apiBaseUrl()
  if (!baseUrl) return Promise.resolve()
  if (!hasCloudAcknowledgement) reportCloudSync('syncing')
  inFlight = syncVaultEntityData(baseUrl).then(() => {
    hasCloudAcknowledgement = true
    reportCloudSync(localSaveSequence === saveSequence ? 'synced' : 'pending')
  }).catch(() => {
    reportCloudSync('failed')
  }).finally(() => {
    if (generation === current) {
      inFlight = null
      if (localSaveSequence !== saveSequence && route.path.startsWith('/app/')) window.setTimeout(() => { void runSync() }, 0)
    }
  })
  return inFlight
}
function onFocus() { if (!document.hidden) void runSync() }
function onLocalSave(event: Event) {
  const detail = (event as CustomEvent<SaveStateDetail>).detail
  if (detail?.state === 'saved' || detail?.state === 'pending') {
    localSaveSequence++
    reportCloudSync('pending')
  }
}

window.addEventListener(SAVE_STATE_EVENT, onLocalSave)

watch(() => route.path, path => {
  stopSync()
  const session = readServerSession()
  const userId = session?.user.id || null
  if (userId !== activeSyncUserId) {
    activeSyncUserId = userId
    hasCloudAcknowledgement = false
    reportCloudSync('idle')
  }
  if (!path.startsWith('/app/') || !session || session.mustChangePassword) return
  void runSync()
  timer = window.setInterval(() => { if (!document.hidden) void runSync() }, 10_000)
  window.addEventListener('focus', onFocus)
}, { immediate: true })

onUnmounted(() => {
  stopSync()
  window.removeEventListener('focus', onFocus)
  window.removeEventListener(SAVE_STATE_EVENT, onLocalSave)
})
</script>

<template><RouterView /></template>
