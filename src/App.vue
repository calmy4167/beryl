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
  // 同步：自动重连已保存配置 + 轮询 + 切回/聚焦立即拉取
  void restoreSync()
  startPolling()
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('focus', onFocus)

  // 会话恢复
  const s = readSession()
  if (s) {
    try {
      const rec = await ensureAuth()
      if (!rec._d && rec.u === s.u) {
        router.replace(lsGet('b_scene') != null ? '/app/home' : '/scene')
      }
    } catch { /* 保持登录页 */ }
  }
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
