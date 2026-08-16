<script setup lang="ts">
defineProps<{ icon?: string; title: string; description?: string }>()
</script>

<template>
  <div class="empty-state" role="status">
    <span v-if="icon" class="icon" aria-hidden="true">{{ icon }}</span>
    <h3>{{ title }}</h3>
    <p v-if="description">{{ description }}</p>
    <slot />
  </div>
</template>

<style scoped>
.empty-state { text-align: center; color: var(--c-text-2); padding: 48px 16px; }
.icon { display: block; color: var(--scene); font-size: 30px; margin-bottom: 12px; }
h3 { font: 600 20px var(--font-title, inherit); margin: 0; }
p { color: var(--c-text-3); font-size: 12px; line-height: 1.6; margin: 8px auto 0; max-width: 360px; }
</style>
