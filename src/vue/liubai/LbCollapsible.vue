<script setup lang="ts">
/**
 * 「留白」可折叠块 = HUD 分层的载体。
 * 参考稿按 data-block 名单决定在哪一档隐藏；这里改为按 rank 表达：
 * rank 1 = 常显；rank 2 = 信息级别 ≥2 时收起；rank 3 = 级别 ≥1 时收起。
 * 外壳的 applyHud() 会给它加 .hud-hidden。
 */
defineProps<{ block: string; rank?: 1 | 2 | 3 }>()
</script>

<template>
  <div class="collapsible" :data-block="block" :data-hud-rank="rank ?? 2">
    <div class="collapsible-inner">
      <slot />
    </div>
  </div>
</template>
