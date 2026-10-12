<script setup lang="ts">
/** 「留白」统计卡网格。DOM 结构与参考稿 renderStatGrid() 一致，保证 .stat-* 样式生效。 */
import type { LbStat } from './types'

defineProps<{ stats: LbStat[] }>()
</script>

<template>
  <div class="stat-grid">
    <div v-for="stat in stats" :key="stat.label" class="stat" :class="{ accent: stat.accent }">
      <span class="stat-label">{{ stat.label }}</span>
      <span class="stat-value">{{ stat.value }}<small v-if="stat.unit">{{ stat.unit }}</small></span>
      <div v-if="stat.bar" class="stat-bar">
        <span :style="{ width: `${Math.max(0, Math.min(100, stat.bar.pct))}%`, background: stat.bar.color || 'var(--accent)' }" />
      </div>
      <span v-if="stat.sub" class="stat-sub">{{ stat.sub }}</span>
    </div>
  </div>
</template>
