<script setup lang="ts">
import type { QuoteCard } from '@/core/quotes'

defineProps<{ card: QuoteCard }>()
</script>

<template>
  <div class="qo">
    <p class="quote">「{{ card.quote || '…' }}」</p>
    <div class="foot">
      <span class="author">—— {{ card.author || '佚名' }}</span>
      <span v-if="card.fromNetwork" class="src-tag">网络</span>
    </div>
  </div>
</template>

<style scoped>
.qo {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--c-bg-soft);
  border: 1px solid var(--c-border-soft);
  border-radius: 10px;
  transition: border-color .15s ease;
}
.qo:hover { border-color: var(--scene-border-soft); }
.quote {
  flex: 1;
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--c-text);
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.foot { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.author { font-size: 10px; color: var(--c-text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.src-tag {
  font-size: 8px;
  color: var(--scene);
  background: var(--scene-soft);
  padding: 1px 6px;
  border-radius: 999px;
  flex-shrink: 0;
}
</style>
