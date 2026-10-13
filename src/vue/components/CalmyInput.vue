<script setup lang="ts">
import { computed, inject, useAttrs } from 'vue'
import { calmyFieldContextKey } from './calmy-field-context'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  modelValue: string | number
  type?: string
  multiline?: boolean
}>(), { type: 'text', multiline: false })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const attrs = useAttrs()
const field = inject(calmyFieldContextKey, null)
const element = computed(() => props.multiline ? 'textarea' : 'input')

function joinIds(...values: unknown[]): string | undefined {
  const ids = values.flatMap(value => typeof value === 'string' ? value.split(/\s+/) : []).filter(Boolean)
  return [...new Set(ids)].join(' ') || undefined
}

const controlAttrs = computed(() => ({
  ...attrs,
  id: attrs.id || field?.controlId.value,
  'aria-labelledby': joinIds(attrs['aria-labelledby'], field?.labelId.value),
  'aria-describedby': joinIds(attrs['aria-describedby'], field?.describedBy.value),
  'aria-invalid': attrs['aria-invalid'] ?? (field?.invalid.value || undefined),
  required: attrs.required ?? field?.required.value,
}))

function updateValue(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement | HTMLTextAreaElement).value)
}
</script>

<template>
  <component
    :is="element"
    v-bind="controlAttrs"
    class="calmy-control"
    :type="multiline ? undefined : type"
    :value="modelValue"
    @input="updateValue"
  />
</template>
