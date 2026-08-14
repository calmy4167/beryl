<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { SCENES, currentSceneId, applySceneTheme } from '@/core/scenes'
import { readSession } from '@/core/auth'

const router = useRouter()
const scene = ref(SCENES[currentSceneId()])
const avatar = ref('U')

onMounted(() => {
  applySceneTheme(scene.value.id)
  const s = readSession()
  if (s) avatar.value = (s.u[0] || 'U').toUpperCase()
})
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <div class="inner">
        <div class="left">
          <span class="brand-badge font-title">B</span>
          <span class="font-title brand-name">beryl</span>
          <span class="scene-tag" :style="{ color: scene.color, borderColor: scene.color + '66', background: scene.color + '1a' }">{{ scene.icon }} {{ scene.name }}</span>
        </div>
        <div class="right">
          <el-button circle text @click="router.push('/app/admin')" title="后台管理">⚙️</el-button>
          <el-button circle text @click="router.push('/scene')" title="切换场景">🎭</el-button>
          <span class="avatar">{{ avatar }}</span>
        </div>
      </div>
    </header>
    <main class="page-container">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.shell { min-height: 100vh; }
.topbar {
  position: sticky; top: 0; z-index: 40;
  backdrop-filter: blur(12px);
  background: rgba(10, 10, 15, 0.75);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.inner { max-width: 720px; margin: 0 auto; padding: 0 16px; height: 56px; display: flex; align-items: center; justify-content: space-between; }
.left { display: flex; align-items: center; gap: 10px; }
.brand-badge {
  width: 28px; height: 28px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: var(--scene); background: var(--scene-soft); border: 1px solid var(--scene-border);
}
.brand-name { font-weight: 700; letter-spacing: 0.05em; }
.scene-tag { font-size: 10px; padding: 2px 8px; border-radius: 999px; }
.right { display: flex; align-items: center; gap: 6px; }
.avatar {
  width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 14px;
  color: var(--scene); background: var(--scene-soft); border: 1px solid var(--scene-border-strong);
}
</style>
