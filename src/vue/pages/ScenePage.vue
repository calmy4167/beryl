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
      <div class="scene-logo">⬡</div>
      <p class="hint">试验 · 场景</p>
      <h1>选择使用场景</h1>
      <p class="dim">不同场景拥有不同的使用氛围与主题色</p>
    </div>

    <div class="scene-grid" role="group" aria-label="使用场景">
      <button
        v-for="scene in Object.values(SCENES)"
        :key="scene.id"
        type="button"
        class="scene-card"
        :class="{ selected: selected === scene.id }"
        :aria-pressed="selected === scene.id"
        :aria-label="`选择${scene.name}场景`"
        @click="pick(scene.id)"
      >
        <span class="scene-icon">{{ scene.icon }}</span>
        <b>{{ scene.name }}</b>
        <p>{{ scene.desc }}</p>
        <small>{{ scene.mods.length }} 个模块</small>
        <em v-if="selected === scene.id">✓ 当前选择</em>
      </button>
    </div>

    <p v-if="error" class="dim form-error" role="alert">{{ error }}</p>
    <button class="chip on scene-start" type="button" @click="start">开始使用</button>
  </div>
</template>

<style scoped>
/* 场景选择页是 standalone 路由（不套「留白」外壳），因此自带排版；颜色一律取 v11 令牌。
   .scene-card / .scene-start / [data-page-archetype] / [role="group"] 是 parity 测试的钩子。 */
/* width:100% 是必需的：裸块级元素靠 margin:auto 居中没问题，但嵌在「留白」外壳的 .inner（flex 列）里时，
   交叉轴上的 auto margin 会让它收缩成内容宽度，卡片网格就会塌成一列。 */
.scene-page { width: 100%; max-width: 980px; margin: 0 auto; padding: clamp(24px, 5vh, 64px) clamp(16px, 3vw, 32px); display: grid; gap: clamp(18px, 3vh, 30px); }
.scene-intro { display: grid; gap: 6px; justify-items: start; }
.scene-logo { font-size: 1.6rem; color: var(--accent); }
.scene-intro h1 { margin: 0; font-size: clamp(1.6rem, 4vw, 2.4rem); font-weight: 700; letter-spacing: -.02em; }
.scene-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: clamp(10px, 1.4vw, 16px); }
.scene-card { display: grid; gap: 6px; justify-items: start; padding: 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); color: var(--muted); text-align: left; cursor: pointer; transition: border-color .2s var(--ease), background .2s var(--ease); }
.scene-card:hover { border-color: var(--line-strong); background: var(--panel-2); }
.scene-card.selected { border-color: var(--accent); background: var(--panel-2); }
.scene-icon { font-size: 1.4rem; }
.scene-card b { color: var(--fg); font-size: .95rem; font-weight: 600; }
.scene-card p { margin: 0; font-size: .78rem; }
.scene-card small { font-size: .7rem; }
.scene-card em { color: var(--accent); font-size: .72rem; font-style: normal; }
.form-error { margin: 0; color: var(--danger); }
.scene-start { justify-self: start; }
</style>
