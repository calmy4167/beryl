<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { SCENES, currentSceneId, applySceneTheme } from '@/core/scenes'
import { store } from '@/core/storage'

const router = useRouter()
const selected = ref(currentSceneId())

function pick(id: string) {
  selected.value = id
  store.set('scene', id)
}

function start() {
  applySceneTheme(selected.value)
  router.replace('/app/home')
}

onMounted(() => applySceneTheme(currentSceneId()))
</script>

<template>
  <div class="scene-wrap">
    <div class="text-center mb-8">
      <div class="logo">⬡</div>
      <h1 class="font-title title">选择使用场景</h1>
      <p class="subtitle">不同场景拥有不同的使用氛围与主题色</p>
    </div>

    <div class="grid">
      <button
        v-for="s in SCENES"
        :key="s.id"
        class="beryl-card hoverable card"
        :class="{ sel: selected === s.id }"
        :style="selected === s.id ? { borderColor: s.color, boxShadow: `0 0 0 1px ${s.color}44, 0 10px 34px rgba(0,0,0,0.35)` } : {}"
        @click="pick(s.id)"
      >
        <div class="icon">{{ s.icon }}</div>
        <div class="font-title name">{{ s.name }}</div>
        <p class="desc">{{ s.desc }}</p>
        <p class="mods">{{ s.mods.length }} 个模块</p>
        <div class="bar" :style="{ background: s.color }" />
        <p v-if="selected === s.id" class="cur" :style="{ color: s.color }">✓ 当前选择</p>
      </button>
    </div>

    <div class="text-center mt-8">
      <el-button type="primary" size="large" class="px-10" @click="start">开始使用</el-button>
    </div>
  </div>
</template>

<style scoped>
.scene-wrap { max-width: 768px; margin: 0 auto; padding: 40px 16px; }
.logo { font-size: 32px; color: var(--scene); text-align: center; }
.title { font-size: 1.875rem; font-weight: 700; text-align: center; margin: 8px 0 4px; }
.subtitle { text-align: center; font-size: 12px; color: #71717a; }
.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-top: 24px; }
.card { padding: 20px; text-align: left; cursor: pointer; }
.icon { font-size: 30px; }
.name { font-weight: 700; margin-top: 12px; }
.desc { font-size: 12px; color: #71717a; margin: 4px 0; }
.mods { font-size: 10px; color: #52525b; margin: 2px 0; }
.bar { width: 24px; height: 4px; border-radius: 2px; margin-top: 12px; }
.cur { font-size: 10px; margin-top: 8px; }
</style>
