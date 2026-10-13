<script setup lang="ts">
import { computed, inject } from 'vue'
import { calmyFieldContextKey } from './calmy-field-context'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  modelValue: string
  id?: string
  ariaLabel?: string
  required?: boolean
  disabled?: boolean
}>(), { required: false, disabled: false })
const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
}>()
const field = inject(calmyFieldContextKey, null)
const controlId = computed(() => props.id || field?.controlId.value)
const required = computed(() => props.required || field?.required.value || false)
const invalid = computed(() => field?.invalid.value || false)

function updateValue(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  emit('update:modelValue', value)
  emit('change', value)
}
</script>

<template>
  <select
    v-bind="$attrs"
    :id="controlId"
    class="calmy-native-select"
    :aria-label="ariaLabel"
    :aria-labelledby="field?.labelId.value"
    :aria-describedby="field?.describedBy.value"
    :aria-invalid="invalid || undefined"
    :required="required"
    :disabled="disabled"
    :value="modelValue"
    @change="updateValue"
  ><slot /></select>
</template>

<style scoped>
.calmy-native-select { min-width: 0; max-width: 100%; }
</style>
