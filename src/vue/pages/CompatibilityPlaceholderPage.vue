<script setup lang="ts">
withDefaults(defineProps<{ title?: string; description?: string }>(), {
  title: '这个模块正在迁移',
  description: '今天、记录、处境、回顾和设置已由 React 接管，其余入口保留在迁移队列中。',
})
</script>

<template>
  <div class="simple-page">
    <section class="beryl-card empty-state compatibility-placeholder-card">
      <p class="eyebrow">REACT MIGRATION</p>
      <h1 class="font-title">{{ title }}</h1>
      <p>{{ description }}</p>
    </section>
  </div>
</template>

