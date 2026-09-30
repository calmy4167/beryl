<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useId } from 'vue'
import { withSaveState } from '@/core/save-state'
import { unifiedAsyncRepository, unifiedFactories, type Person } from '@/domain/unified'
import { usePersonStatusDictionary } from '@/vue/composables/usePersonStatusDictionary'
import '@/styles/shared/master-data-picker.css'

const props = withDefaults(defineProps<{
  modelValue?: string
  people: Person[]
  disabled?: boolean
}>(), { modelValue: '', disabled: false })
const emit = defineEmits<{
  'update:modelValue': [value: string]
  created: [person: Person]
}>()
const root = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const query = ref('')
const drawerQuery = ref('')
const open = ref(false)
const drawerOpen = ref(false)
const creating = ref(false)
const error = ref('')
const { labelFor: personStatusLabel } = usePersonStatusDictionary()
const activeIndex = ref(0)
const listboxId = `person-reference-${useId()}`
const normalizedQuery = computed(() => query.value.trim().toLocaleLowerCase())
const selectedPerson = computed(() => props.people.find(person => person.calmyId === props.modelValue))
const selectablePeople = computed(() => props.people.filter(person => person.status === 'active' || person.calmyId === props.modelValue))
const matches = computed(() => {
  const term = normalizedQuery.value
  const list = selectablePeople.value.filter(person => `${person.displayName} ${person.roles.join(' ')} ${person.domain || ''}`.toLocaleLowerCase().includes(term))
  return term ? list.slice(0, 8) : list.slice(0, 8)
})
const drawerMatches = computed(() => {
  const term = drawerQuery.value.trim().toLocaleLowerCase()
  return selectablePeople.value.filter(person => `${person.displayName} ${person.roles.join(' ')} ${person.domain || ''}`.toLocaleLowerCase().includes(term))
})
const canCreate = computed(() => !!normalizedQuery.value && !props.people.some(person => person.displayName.trim().toLocaleLowerCase() === normalizedQuery.value))

function choose(person: Person): void {
  emit('update:modelValue', person.calmyId)
  query.value = ''
  open.value = false
  drawerOpen.value = false
  error.value = ''
}
function clear(): void { emit('update:modelValue', ''); query.value = ''; open.value = false }
function openDrawer(): void {
  drawerQuery.value = query.value
  open.value = false
  drawerOpen.value = true
  requestAnimationFrame(() => root.value?.querySelector<HTMLInputElement>('.master-picker-drawer-search')?.focus())
}
function closeDrawer(): void { drawerOpen.value = false; input.value?.focus() }
async function createAndChoose(): Promise<void> {
  const displayName = query.value.trim()
  if (!displayName || !canCreate.value || creating.value || props.disabled) return
  creating.value = true
  error.value = ''
  try {
    const person = await withSaveState(() => unifiedAsyncRepository.create(unifiedFactories.person({ displayName })))
    emit('created', person)
    choose(person)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '人物创建失败'
  } finally { creating.value = false }
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    open.value = true
    const count = matches.value.length + (canCreate.value ? 1 : 0)
    if (count) activeIndex.value = (activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count
  } else if (event.key === 'Enter' && open.value) {
    event.preventDefault()
    if (canCreate.value && activeIndex.value === matches.value.length) void createAndChoose()
    else if (matches.value[activeIndex.value]) choose(matches.value[activeIndex.value])
  } else if (event.key === 'Escape') {
    open.value = false
    drawerOpen.value = false
  }
}
function onPointerDown(event: PointerEvent): void {
  if (event.target instanceof Node && !root.value?.contains(event.target)) open.value = false
}
onMounted(() => document.addEventListener('pointerdown', onPointerDown))
onUnmounted(() => document.removeEventListener('pointerdown', onPointerDown))
</script>

<template>
  <div ref="root" class="master-picker person-reference-picker">
    <label class="person-reference-label" :for="`${listboxId}-input`">关联人物</label>
    <div v-if="selectedPerson" class="person-reference-selected" aria-label="已关联人物">
      <span class="master-picker-option-icon" aria-hidden="true">人</span>
      <span><b>{{ selectedPerson.displayName }}</b><small>{{ [selectedPerson.roles.join(' · ') || '人物', selectedPerson.status === 'archived' ? personStatusLabel('archived') : ''].filter(Boolean).join(' · ') }}</small></span>
      <button type="button" aria-label="清除关联人物" :disabled="disabled" @click="clear">×</button>
    </div>
    <div v-else class="master-picker-field">
      <input :id="`${listboxId}-input`" ref="input" v-model="query" type="search" role="combobox" aria-label="搜索并关联人物" aria-autocomplete="list" :aria-expanded="open && !drawerOpen" :aria-controls="listboxId" :aria-activedescendant="open && (matches[activeIndex] || (canCreate && activeIndex === matches.length)) ? `${listboxId}-${activeIndex}` : undefined" :disabled="disabled" placeholder="搜索人物…" @focus="open = true" @input="activeIndex = 0; open = true" @keydown="onKeydown">
    </div>
    <div v-if="open && !drawerOpen" :id="listboxId" class="master-picker-popup" role="listbox" aria-label="人物选项">
      <button v-for="(person, index) in matches" :id="`${listboxId}-${index}`" :key="person.calmyId" type="button" role="option" :aria-selected="false" :aria-current="activeIndex === index ? 'true' : undefined" :class="['master-picker-option', { active: activeIndex === index }]" @mousedown.prevent @mouseenter="activeIndex = index" @click="choose(person)">
        <span class="master-picker-option-icon" aria-hidden="true">人</span><span class="master-picker-option-copy"><b>{{ person.displayName }}</b><small>{{ [person.roles.join(' · '), person.domain].filter(Boolean).join(' · ') || '人物' }}</small></span>
      </button>
      <button v-if="canCreate" :id="`${listboxId}-${matches.length}`" type="button" role="option" :aria-selected="false" :aria-current="activeIndex === matches.length ? 'true' : undefined" :class="['master-picker-option', { active: activeIndex === matches.length }]" :disabled="creating" @mousedown.prevent @mouseenter="activeIndex = matches.length" @click="createAndChoose"><span class="master-picker-option-icon" aria-hidden="true">＋</span><span class="master-picker-option-copy"><b>{{ creating ? '正在创建…' : `新建并关联“${query.trim()}”` }}</b><small>只需提供人物名称，可稍后补充资料</small></span></button>
      <p v-if="!matches.length && !canCreate" class="master-picker-empty">还没有人物资料。</p>
      <div class="master-picker-popup-footer"><span v-if="selectablePeople.length > matches.length" class="master-picker-more-hint">共 {{ selectablePeople.length }} 位可选人物</span><button type="button" @click="openDrawer">浏览全部 →</button></div>
    </div>
    <p v-if="error" class="master-sentence-error" role="alert">{{ error }}</p>
    <div v-if="drawerOpen" class="master-picker-overlay" role="presentation">
      <button type="button" class="master-picker-scrim" aria-label="关闭人物选择面板" @click="closeDrawer" />
      <section class="master-picker-drawer" role="dialog" aria-modal="true" aria-label="浏览并选择人物" @keydown.esc.stop="closeDrawer">
        <header><div><h2>关联人物</h2><p>选择现有人物，或先在主数据管理中补充资料</p></div><button type="button" aria-label="关闭人物选择面板" @click="closeDrawer">×</button></header>
        <input v-model="drawerQuery" class="master-picker-drawer-search" type="search" aria-label="搜索全部人物" placeholder="搜索姓名、角色或领域…">
        <div class="master-picker-drawer-list">
          <button v-for="person in drawerMatches" :key="person.calmyId" type="button" role="option" @click="choose(person)"><span class="master-picker-option-icon" aria-hidden="true">人</span><span class="master-picker-option-copy"><b>{{ person.displayName }}</b><small>{{ [person.roles.join(' · '), person.domain].filter(Boolean).join(' · ') || '人物' }}</small></span></button>
          <p v-if="!drawerMatches.length" class="master-picker-empty">没有匹配的人物。</p>
        </div>
        <footer><span>人物关系只保存稳定 ID</span><button v-if="modelValue" type="button" @click="clear(); closeDrawer()">清除关联</button></footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.person-reference-picker { position: relative; flex: 1 1 200px; min-width: 180px; }
.person-reference-label { display: block; margin-bottom: 6px; color: var(--c-text-2); font-size: .82rem; }
.person-reference-selected { min-height: 44px; display: flex; align-items: center; gap: 9px; padding: 5px 8px; border: 1px solid var(--c-border); border-radius: 10px; background: var(--c-surface); }
.person-reference-selected > span:nth-child(2) { display: grid; flex: 1; min-width: 0; }
.person-reference-selected small { color: var(--c-text-2); }
.person-reference-selected > button { border: 0; background: transparent; color: var(--c-text-2); font-size: 1.2rem; cursor: pointer; }
</style>
