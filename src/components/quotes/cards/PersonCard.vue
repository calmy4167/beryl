<script setup lang="ts">
import type { QuoteCard } from '@/core/quotes'

defineProps<{ card: QuoteCard }>()
</script>

<template>
  <div class="pc">
    <span class="avatar" :style="{ background: card.personColor + '1a', color: card.personColor, borderColor: card.personColor + '44' }">
      {{ (card.personName || '?')[0] }}
    </span>
    <span class="name">{{ card.personName }}</span>
    <span v-if="card.personTitle" class="title">{{ card.personTitle }}</span>
  </div>
</template>

<style scoped>
.pc {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 12px;
  background: var(--c-bg-soft);
  border: 1px solid var(--c-border-soft);
  border-radius: 10px;
  text-align: center;
  transition: border-color .15s ease;
}
.pc:hover { border-color: var(--scene-border-soft); }
.avatar {
  width: 34px; height: 34px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 14px;
  border: 1px solid transparent;
  margin-bottom: 2px;
}
.name { font-size: 12px; font-weight: 600; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.title { font-size: 9px; color: var(--c-text-3); max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
