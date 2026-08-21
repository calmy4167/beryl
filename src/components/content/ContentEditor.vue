<script setup lang="ts">
defineProps<{ modelValue: string; rows?: number; placeholder?: string }>()
defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <el-input :model-value="modelValue" type="textarea" :rows="rows || 6" :aria-label="placeholder || '内容编辑器'" :placeholder="placeholder || '支持 Markdown'" @update:model-value="$emit('update:modelValue', $event)" />
</template>
