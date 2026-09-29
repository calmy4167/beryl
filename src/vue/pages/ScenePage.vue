<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { SCENES, applySceneTheme, currentSceneId } from '@/core/scenes'
import { store } from '@/core/storage'

const router = useRouter()
const selected = ref(currentSceneId())
const error = ref('')

function pick(id: string) {
  if (!store.set('scene', id)) {
    error.value = '场景未能保存，请检查本地存储状态后重试'
    return
  }
  selected.value = id
  error.value = ''
}

function start() {
  applySceneTheme(selected.value)
  void router.replace('/app/today')
}
</script>

<template>
  <div class="scene-page" data-page-archetype="experiment">
    <div class="scene-intro">
      <div class="login-logo">⬡</div>
      <p class="eyebrow">试验 · 场景</p>
      <h1 class="font-title">选择使用场景</h1>
      <p>不同场景拥有不同的使用氛围与主题色</p>
    </div>

    <div class="scene-grid" role="group" aria-label="使用场景">
      <button
        v-for="scene in Object.values(SCENES)"
        :key="scene.id"
        type="button"
        :class="['beryl-card', 'scene-card', { selected: selected === scene.id }]"
        :aria-pressed="selected === scene.id"
        :aria-label="`选择${scene.name}场景`"
        @click="pick(scene.id)"
      >
        <span class="scene-icon">{{ scene.icon }}</span>
        <b class="font-title">{{ scene.name }}</b>
        <p>{{ scene.desc }}</p>
        <small>{{ scene.mods.length }} 个模块</small>
        <em v-if="selected === scene.id">✓ 当前选择</em>
      </button>
    </div>

    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <button class="primary scene-start" type="button" @click="start">开始使用</button>
  </div>
</template>
