<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/core/content/markdown'

const props = defineProps<{ content: string }>()
const html = computed(() => renderMarkdown(props.content))
</script>

<template><article class="markdown" v-html="html" /></template>

<style scoped>
.markdown { white-space: normal; line-height: 1.85; word-break: break-word; }
.markdown :deep(h1), .markdown :deep(h2), .markdown :deep(h3) { margin: 1em 0 .45em; font-family: var(--font-title, inherit); }
.markdown :deep(p) { margin: .55em 0; }
.markdown :deep(ul) { padding-left: 1.35em; margin: .55em 0; }
.markdown :deep(blockquote) { margin: .7em 0; padding-left: .8em; border-left: 3px solid var(--scene); color: var(--c-text-2); }
.markdown :deep(code) { padding: .1em .35em; border-radius: 4px; background: var(--c-bg-2); font-family: ui-monospace, monospace; }
.markdown :deep(a) { color: var(--scene); text-decoration: underline; }
</style>
