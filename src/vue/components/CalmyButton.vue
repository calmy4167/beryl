<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  type?: 'button' | 'submit' | 'reset'
  variant?: 'default' | 'primary' | 'danger' | 'active'
  loading?: boolean
  disabled?: boolean
}>(), { type: 'button', variant: 'default', loading: false, disabled: false })

const isDisabled = computed(() => props.disabled || props.loading)
const variantClass = computed(() => ({
  on: props.variant === 'primary' || props.variant === 'active',
  danger: props.variant === 'danger',
}))
</script>

<template>
  <button
    :type="type"
    class="chip"
    :class="variantClass"
    :disabled="isDisabled"
    :aria-busy="loading || undefined"
  ><slot /></button>
</template>

<style scoped>
.chip:disabled { cursor: not-allowed; opacity: .48; }
.chip:disabled:hover { color: inherit; border-color: inherit; }
</style>
