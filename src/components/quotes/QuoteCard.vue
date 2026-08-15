<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'
import type { QuoteCard } from '@/core/quotes'
import PersonQuoteCard from './cards/PersonQuoteCard.vue'
import QuoteOnlyCard from './cards/QuoteOnlyCard.vue'
import PersonCard from './cards/PersonCard.vue'

const props = defineProps<{ card: QuoteCard }>()

/* ---- 类型注册表：新增卡片类型 = 新增一个渲染器文件 + 在这里注册一行 ----
 * 分发只依赖 kind，不感知各类型内部结构；未知 kind 走兜底渲染。 */
const RENDERERS: Record<string, Component> = {
  'person-quote': PersonQuoteCard,
  quote: QuoteOnlyCard,
  person: PersonCard,
}

const renderer = computed(() => RENDERERS[props.card.kind] || QuoteOnlyCard)
</script>

<template>
  <component :is="renderer" :card="card" />
</template>
