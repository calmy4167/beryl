<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

export interface CalmySelectOption {
  value: string
  label: string
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  id: string
  ariaLabel: string
  modelValue: string
  options: CalmySelectOption[]
  disabled?: boolean
  compact?: boolean
  name?: string
  placeholder?: string
  required?: boolean
}>(), {
  disabled: false,
  compact: false,
  placeholder: '',
  required: false,
})
const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
}>()

const root = ref<HTMLElement | null>(null)
const open = ref(false)
const activeValue = ref(props.modelValue)
const typeahead = ref('')
let typeaheadTimer: ReturnType<typeof setTimeout> | undefined
const listboxId = computed(() => `${props.id}-listbox`)
const selectedOption = computed(() => props.options.find(option => option.value === props.modelValue) ?? props.options[0])
const activeOption = computed(() => props.options.find(option => option.value === activeValue.value && !option.disabled))

function firstEnabled(fromEnd = false): CalmySelectOption | undefined {
  return (fromEnd ? [...props.options].reverse() : props.options).find(option => !option.disabled)
}

function openList(initial?: CalmySelectOption): void {
  if (props.disabled) return
  const selected = props.options.find(option => option.value === props.modelValue && !option.disabled)
  activeValue.value = (initial ?? selected ?? firstEnabled())?.value ?? ''
  open.value = true
}

function choose(option: CalmySelectOption): void {
  if (props.disabled || option.disabled) return
  emit('update:modelValue', option.value)
  emit('change', option.value)
  activeValue.value = option.value
  open.value = false
}

function stepActive(direction: 1 | -1): void {
  if (!props.options.length) return
  const currentIndex = props.options.findIndex(option => option.value === activeValue.value)
  for (let offset = 1; offset <= props.options.length; offset += 1) {
    const index = (currentIndex + direction * offset + props.options.length) % props.options.length
    const candidate = props.options[index]
    if (!candidate.disabled) {
      activeValue.value = candidate.value
      return
    }
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const direction = event.key === 'ArrowDown' ? 1 : -1
    if (!open.value) openList(direction === 1 ? undefined : firstEnabled(true))
    else stepActive(direction)
    return
  }
  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    activeValue.value = (event.key === 'Home' ? firstEnabled() : firstEnabled(true))?.value ?? ''
    open.value = !props.disabled
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (open.value) {
      if (activeOption.value) choose(activeOption.value)
    } else openList()
    return
  }
  if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    open.value = false
    return
  }
  if (event.key === 'Tab') {
    open.value = false
    return
  }
  if (open.value && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const query = `${typeahead.value}${event.key}`.toLocaleLowerCase()
    typeahead.value = query
    if (typeaheadTimer) clearTimeout(typeaheadTimer)
    typeaheadTimer = setTimeout(() => { typeahead.value = '' }, 650)
    const match = props.options.find(option => !option.disabled && option.label.toLocaleLowerCase().startsWith(query))
    if (match) activeValue.value = match.value
  }
}

function onOutsidePointer(event: PointerEvent): void {
  if (!root.value?.contains(event.target as Node)) open.value = false
}

watch(() => props.modelValue, value => { if (!open.value) activeValue.value = value })
watch(() => props.options, options => {
  if (open.value && !options.some(option => option.value === activeValue.value && !option.disabled)) {
    activeValue.value = firstEnabled()?.value ?? ''
  }
})

onMounted(() => document.addEventListener('pointerdown', onOutsidePointer))
onUnmounted(() => {
  document.removeEventListener('pointerdown', onOutsidePointer)
  if (typeaheadTimer) clearTimeout(typeaheadTimer)
})
</script>

<template>
  <div ref="root" :class="['calmy-select', { 'is-compact': compact }]" data-calmy-select>
    <button
      :id="id"
      type="button"
      role="combobox"
      class="calmy-select__trigger"
      :aria-label="ariaLabel"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="listboxId"
      :aria-activedescendant="open && activeValue ? `${listboxId}-${encodeURIComponent(activeValue)}` : undefined"
      :aria-disabled="disabled || undefined"
      :aria-required="required || undefined"
      :disabled="disabled"
      @click="open ? (open = false) : openList()"
      @keydown="onKeydown"
    >
      <span :class="['calmy-select__value', { 'is-placeholder': !selectedOption }]">
        {{ selectedOption?.label ?? placeholder }}
      </span>
      <svg :class="['calmy-select__chevron', { 'is-open': open }]" viewBox="0 0 16 16" aria-hidden="true">
        <path d="m4 6 4 4 4-4" />
      </svg>
    </button>
    <input v-if="name" type="hidden" :name="name" :value="modelValue" :disabled="disabled">
    <div v-if="open" class="calmy-select__popup">
      <div :id="listboxId" role="listbox" :aria-labelledby="id" class="calmy-select__listbox">
        <div
          v-for="option in options"
          :id="`${listboxId}-${encodeURIComponent(option.value)}`"
          :key="option.value"
          role="option"
          :aria-selected="option.value === modelValue"
          :aria-disabled="option.disabled || undefined"
          :data-value="option.value"
          :class="['calmy-select__option', { 'is-selected': option.value === modelValue, 'is-active': option.value === activeValue, 'is-disabled': option.disabled }]"
          @mousedown.prevent
          @mouseenter="!option.disabled && (activeValue = option.value)"
          @click="choose(option)"
        >
          <span>{{ option.label }}</span>
          <span class="calmy-select__check" aria-hidden="true" />
        </div>
      </div>
    </div>
  </div>
</template>
