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
  router.replace('/app/today')
}

onMounted(() => applySceneTheme(currentSceneId()))
</script>

<template>
  <div class="scene-wrap">
    <div class="text-center mb-8">
      <div class="logo" aria-hidden="true">⬡</div>
      <h1 id="scene-title" class="font-title title">选择使用场景</h1>
      <p class="subtitle">不同场景拥有不同的使用氛围与主题色</p>
    </div>

    <div class="grid" role="group" aria-labelledby="scene-title">
      <button
        v-for="s in SCENES"
        :key="s.id"
        class="beryl-card hoverable card"
        :class="{ sel: selected === s.id }"
        :aria-pressed="selected === s.id"
        :aria-label="`选择${s.name}场景`"
        :aria-describedby="`scene-description-${s.id}`"
        :style="selected === s.id ? { borderColor: s.color, boxShadow: `0 0 0 1px ${s.color}44, 0 8px 24px ${s.color}1a` } : {}"
        @click="pick(s.id)"
      >
        <div class="icon" aria-hidden="true" :style="{ background: s.color + '1a', borderColor: s.color + '33' }">{{ s.icon }}</div>
        <div class="font-title name">{{ s.name }}</div>
        <p :id="`scene-description-${s.id}`" class="desc">{{ s.desc }}</p>
        <p class="mods">{{ s.mods.length }} 个模块</p>
        <div class="bar" aria-hidden="true" :style="{ background: s.color }" />
        <p v-if="selected === s.id" class="cur" :style="{ color: s.color }">✓ 当前选择</p>
      </button>
    </div>

    <div class="text-center mt-8">
      <el-button type="primary" size="large" class="px-10" @click="start">开始使用</el-button>
    </div>
  </div>
</template>

<style scoped>
.scene-wrap { width: 100%; max-width: 880px; margin: 0 auto; padding: 40px 16px; }
.logo {
  width: 56px;
  height: 56px;
  margin: 0 auto;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  line-height: 1;
  color: var(--scene);
  background: var(--scene-soft);
  border: 1px solid var(--scene-border);
}
.title { font-size: 1.875rem; font-weight: 700; text-align: center; margin: 14px 0 4px; }
.subtitle { text-align: center; font-size: 12px; color: var(--c-text-2); }
.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-top: 24px; }
.card { padding: 20px; text-align: left; cursor: pointer; position: relative; }
.icon {
  width: 44px; height: 44px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px;
  border: 1px solid transparent;
}
.name { font-weight: 700; margin-top: 14px; font-size: 15px; }
.desc { font-size: 12px; color: var(--c-text-2); margin: 4px 0; }
.mods { font-size: 10px; color: var(--c-text-3); margin: 2px 0; }
.bar { width: 24px; height: 4px; border-radius: 2px; margin-top: 14px; }
.cur { font-size: 10px; margin-top: 8px; font-weight: 600; }
</style>
