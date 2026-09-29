<script setup lang="ts">
export interface ContextQuickAction {
  label: string
  hint: string
  path: string
}

defineProps<{
  collapsed: boolean
  expanded: boolean
  actions: readonly ContextQuickAction[]
}>()
const emit = defineEmits<{ navigate: [path: string]; toggle: [] }>()
</script>

<template>
  <aside id="app-right-sidebar" class="right-rail" :aria-label="collapsed ? '已收起的右侧快捷栏' : '右侧快捷栏'">
    <nav class="context-dock" data-context-dock aria-label="情境工具栏">
      <button class="app-button right-sidebar-toggle" type="button" aria-controls="context-drawer" :aria-expanded="expanded" :aria-label="collapsed ? '展开右侧栏' : '收起右侧栏'" @click="emit('toggle')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M9 4v16" /></svg>
      </button>
      <button v-for="item in actions" :key="item.path" class="app-button context-dock-action" type="button" :aria-label="`${item.label}：${item.hint}`" :title="item.hint" @click="emit('navigate', item.path)">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <template v-if="item.path.includes('/capture')"><path d="M7 3.5h7l3 3V20H7z" /><path d="M14 3.5V7h3M10 11h4M10 15h4" /></template>
          <template v-else-if="item.path.includes('/matters')"><circle cx="12" cy="12" r="8" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></template>
          <template v-else-if="item.path.includes('/review')"><path d="M5 5v4h4M5.8 9a7 7 0 1 1-.4 5" /><path d="M12 8v4l2.5 1.5" /></template>
          <template v-else><path d="m4 10 8-6 8 6v9H5v-9" /><path d="M9 19v-6h6v6" /></template>
        </svg>
      </button>
      <button class="app-button context-dock-settings" type="button" aria-label="打开设置" title="设置" @click="emit('navigate', '/app/admin')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></svg>
      </button>
    </nav>
    <div id="context-drawer" class="right-rail-content" :aria-hidden="collapsed">
      <section class="edge-actions" aria-labelledby="context-actions-title">
        <h2 id="context-actions-title">快捷操作</h2>
        <p v-if="actions.length === 0" class="context-empty">暂无快捷操作</p>
        <button v-for="item in actions" :key="item.path" class="app-button" type="button" :tabindex="collapsed ? -1 : undefined" @click="emit('navigate', item.path)">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <template v-if="item.path.includes('/capture')"><path d="M7 3.5h7l3 3V20H7z" /><path d="M14 3.5V7h3M10 11h4M10 15h4" /></template>
            <template v-else-if="item.path.includes('/matters')"><circle cx="12" cy="12" r="8" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></template>
            <template v-else-if="item.path.includes('/review')"><path d="M5 5v4h4M5.8 9a7 7 0 1 1-.4 5" /><path d="M12 8v4l2.5 1.5" /></template>
            <template v-else><path d="m4 10 8-6 8 6v9H5v-9" /><path d="M9 19v-6h6v6" /></template>
          </svg>
          <span><b>{{ item.label }}</b><small>{{ item.hint }}</small></span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </button>
      </section>
    </div>
  </aside>
</template>
