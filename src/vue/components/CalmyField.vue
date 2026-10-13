<script setup lang="ts">
import { computed, provide, useId } from 'vue'
import { calmyFieldContextKey } from './calmy-field-context'

const props = withDefaults(defineProps<{
  id?: string
  label: string
  hint?: string
  error?: string
  required?: boolean
}>(), { required: false })

const uid = useId()
const controlId = computed(() => props.id || `calmy-field-${uid}`)
const labelId = computed(() => `${controlId.value}-label`)
const hintId = computed(() => props.hint ? `${controlId.value}-hint` : '')
const errorId = computed(() => props.error ? `${controlId.value}-error` : '')
const describedBy = computed(() => [hintId.value, errorId.value].filter(Boolean).join(' ') || undefined)
const required = computed(() => props.required)
const invalid = computed(() => Boolean(props.error))

provide(calmyFieldContextKey, { controlId, labelId, describedBy, required, invalid })
</script>

<template>
  <div class="calmy-field" :class="{ 'is-invalid': error }">
    <label class="calmy-field__label" :id="labelId" :for="controlId">
      <span>{{ label }}</span><span v-if="required" class="calmy-field__required" aria-hidden="true">*</span>
    </label>
    <slot />
    <small v-if="hint" :id="hintId" class="calmy-field__hint">{{ hint }}</small>
    <small v-if="error" :id="errorId" class="calmy-field__error" role="alert">{{ error }}</small>
  </div>
</template>

<style scoped>
.calmy-field { display: grid; min-width: 0; align-content: start; gap: 6px; }
.calmy-field__label { display: flex; align-items: baseline; gap: 4px; color: var(--muted); font-size: .72rem; line-height: 1.35; }
.calmy-field__required { color: var(--danger); }
.calmy-field__hint, .calmy-field__error { margin: 0; font-size: .72rem; line-height: 1.5; }
.calmy-field__hint { color: var(--muted); }
.calmy-field__error { color: var(--danger); }
</style>
