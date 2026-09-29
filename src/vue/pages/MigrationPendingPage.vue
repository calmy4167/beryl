<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const title = computed(() => String(route.meta.title || 'Calmy'))
</script>

<template>
  <section class="beryl-card empty-state migration-preview-pending" :aria-label="`${title}预览页面`">
    <p class="eyebrow">VUE PREVIEW</p>
    <h1 class="font-title">{{ title }}</h1>
    <p>此页面将在迁移计划中逐项对照当前工作台后接入。</p>
  </section>
</template>
