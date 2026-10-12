<script setup lang="ts">
/** 「留白」统一面板：.panel + .panel-head（标题 / 备注），内容走默认插槽。 */
defineProps<{ title?: string; note?: string; grow?: boolean }>()
</script>

<template>
  <div class="panel" :class="{ grow }">
    <div v-if="title || note" class="panel-head">
      <span class="panel-title">{{ title }}</span>
      <span v-if="note" class="panel-note">{{ note }}</span>
    </div>
    <slot />
  </div>
</template>
