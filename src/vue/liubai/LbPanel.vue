<script setup lang="ts">
/** 「留白」统一面板：.panel + .panel-head（标题 / 备注 / 可选操作），内容走默认插槽。 */
defineProps<{ title?: string; note?: string; noteTip?: string; grow?: boolean }>()
</script>

<template>
  <div class="panel" :class="{ grow }">
    <div v-if="title || note || noteTip || $slots['header-actions']" class="panel-head">
      <div class="panel-heading">
        <span v-if="title" class="panel-title">{{ title }}</span>
        <button
          v-if="noteTip"
          type="button"
          class="info panel-info-button"
          :aria-label="`补充说明：${noteTip}`"
          :data-tip="noteTip"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <circle cx="8" cy="8" r="6.2" />
            <path d="M8 7v4" />
            <circle cx="8" cy="4.6" r=".7" class="panel-info-dot" />
          </svg>
        </button>
      </div>
      <div v-if="note || $slots['header-actions']" class="panel-head-meta">
        <span v-if="note" class="panel-note">{{ note }}</span>
        <div v-if="$slots['header-actions']" class="panel-head-actions"><slot name="header-actions" /></div>
      </div>
    </div>
    <slot />
  </div>
</template>

<style scoped>
.panel-heading { display: flex; min-width: 0; align-items: center; gap: 8px; }
.panel-head-meta { display: flex; flex: 0 1 auto; max-width: 60%; min-width: 0; align-items: center; justify-content: flex-end; gap: 12px; }
.panel-head-actions { display: flex; align-items: center; gap: 8px; }
.panel-info-button { flex: none; margin-top: 1px; padding: 0; background: transparent; }
.panel-info-button svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.35; }
.panel-info-button .panel-info-dot { fill: currentColor; stroke: none; }
</style>
