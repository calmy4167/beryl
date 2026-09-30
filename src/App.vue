<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { apiBaseUrl } from '@/core/api/base-url'
import { readServerSession } from '@/core/auth'
import { syncVaultEntityData } from '@/core/entity-sync'

const route = useRoute()
let timer: number | undefined
let inFlight: Promise<void> | null = null
let generation = 0

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
  const baseUrl = apiBaseUrl()
  if (!baseUrl) return Promise.resolve()
  inFlight = syncVaultEntityData(baseUrl).then(() => undefined).catch(() => undefined).finally(() => {
    if (generation === current) inFlight = null
  })
  return inFlight
}
function onFocus() { if (!document.hidden) void runSync() }

watch(() => route.path, path => {
  stopSync()
  const session = readServerSession()
  if (!path.startsWith('/app/') || !session || session.mustChangePassword) return
  void runSync()
  timer = window.setInterval(() => { if (!document.hidden) void runSync() }, 10_000)
  window.addEventListener('focus', onFocus)
}, { immediate: true })

onUnmounted(() => {
  stopSync()
  window.removeEventListener('focus', onFocus)
})
</script>

<template><RouterView /></template>
