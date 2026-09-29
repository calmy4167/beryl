<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { readSession, ensureAuth } from '@/core/auth'
import { restoreSync, startPolling, stopPolling, pollCheck } from '@/core/sync'

const route = useRoute()
let activeUser: string | null = null
let generation = 0

function onVis() {
  if (document.hidden) stopPolling()
  else { startPolling(); void pollCheck() }
}
function onFocus() { startPolling(); void pollCheck() }
function stopActive() {
  document.removeEventListener('visibilitychange', onVis)
  window.removeEventListener('focus', onFocus)
  if (activeUser) stopPolling()
  activeUser = null
}

watch(() => route.path, path => {
  const session = readSession()
  const protectedPage = path.startsWith('/app') || path === '/scene'
  if (protectedPage && session && activeUser === session.u) return

  const currentGeneration = ++generation
  stopActive()
  if (!protectedPage || !session) return

  void ensureAuth().then(record => {
    if (currentGeneration !== generation || record._d || record.u !== session.u) return
    activeUser = session.u
    void restoreSync()
    startPolling()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onFocus)
  }).catch(() => { /* 同步仅在有效登录会话恢复后启动 */ })
}, { immediate: true })

onUnmounted(() => {
  generation++
  stopActive()
})
</script>

<template>
  <RouterView />
</template>
