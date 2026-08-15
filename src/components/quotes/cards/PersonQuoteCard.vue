<script setup lang="ts">
import type { QuoteCard } from '@/core/quotes'

defineProps<{ card: QuoteCard }>()
</script>

<template>
  <div class="pq">
    <div class="person">
      <span class="avatar" :style="{ background: card.personColor || 'var(--scene-soft)', color: card.personColor || 'var(--scene)' }">
        {{ (card.author || card.personName || '?')[0] }}
      </span>
      <span class="name">{{ card.author || card.personName || '无名氏' }}</span>
      <span v-if="card.fromNetwork" class="src-tag">网络</span>
    </div>
    <p class="quote">「{{ card.quote }}」</p>
    <p v-if="card.source" class="source">—— {{ card.source }}</p>
  </div>
</template>

<style scoped>
.pq {
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
.pq:hover { border-color: var(--scene-border-soft); }
.person { display: flex; align-items: center; gap: 8px; min-width: 0; }
.avatar {
  width: 26px; height: 26px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 12px;
  flex-shrink: 0;
}
.name { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.src-tag {
  margin-left: auto;
  font-size: 8px;
  color: var(--scene);
  background: var(--scene-soft);
  padding: 1px 6px;
  border-radius: 999px;
  flex-shrink: 0;
}
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
.source { margin: 0; font-size: 10px; color: var(--c-text-3); text-align: right; }
</style>
