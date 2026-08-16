<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { readSession, ensureAuth } from '@/core/auth'
import { currentSceneId, applySceneTheme } from '@/core/scenes'
import { lsGet } from '@/core/storage'
import { restoreSync, startPolling, stopPolling, pollCheck } from '@/core/sync'

const router = useRouter()

onMounted(async () => {
  applySceneTheme(currentSceneId())
  // 会话恢复
  const s = readSession()
  let authenticated = false
  if (s) {
    try {
      const rec = await ensureAuth()
      if (!rec._d && rec.u === s.u) {
        authenticated = true
        router.replace(lsGet('b_scene') != null ? '/app/home' : '/scene')
      }
    } catch { /* 保持登录页 */ }
  }
  if (!authenticated) return
  // 同步：只有已恢复有效会话后才自动连接，避免登录页提前读取/写入业务数据。
  void restoreSync()
  startPolling()
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('focus', onFocus)
})
function onVis() {
  if (document.hidden) stopPolling()
  else { startPolling(); void pollCheck() }
}
function onFocus() { startPolling(); void pollCheck() }
onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVis)
  window.removeEventListener('focus', onFocus)
})
</script>

<template>
  <RouterView />
</template>
