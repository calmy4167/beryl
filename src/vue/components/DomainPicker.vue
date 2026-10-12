<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { withSaveState } from '@/core/save-state'
import { CORE_ENTITY_TYPES, isValidTimeContextId, supportsDomainAssignment, unifiedAsyncRepository, unifiedFactories, type Domain, type EntityRef, type Relation } from '@/domain/unified'

const props = defineProps<{ entityRef: EntityRef; modelValue?: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string | undefined]; changed: [] }>()
const domains = ref<Domain[]>([])
const relation = ref<Relation>()
const archivedDomainRelations = ref<Relation[]>([])
const timeRelations = ref<Relation[]>([])
const archivedTimeRelations = ref<Relation[]>([])
const selectedDomainId = ref('')
const savingTimeId = ref('')
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const supported = computed(() => supportsDomainAssignment(props.entityRef.entityType))
const timeSupported = computed(() => {
  const type = props.entityRef.entityType
  const legacySupported = ['thing', 'matter', 'action', 'record', 'finance_entry', 'diary_entry', 'goal', 'post'].includes(type)
  const coreSupported = (CORE_ENTITY_TYPES as readonly string[]).includes(type)
    && !['domain', 'scope', 'permission', 'relation', 'scene_participant', 'dictionary_option'].includes(type)
  return legacySupported || coreSupported
})
const currentDomain = computed(() => domains.value.find(domain => domain.calmyId === selectedDomainId.value))
const visibleDomains = computed(() => {
  const active = domains.value.filter(domain => domain.status === 'active')
  if (currentDomain.value?.status === 'retired') return [currentDomain.value, ...active]
  return active
})

async function refresh() {
  if (!supported.value && !timeSupported.value) { loading.value = false; return }
  loading.value = true
  error.value = ''
  try {
    const [allDomains, allRelations] = await Promise.all([
      supported.value ? unifiedAsyncRepository.list<Domain>('domain') : Promise.resolve([] as Domain[]),
      unifiedAsyncRepository.list<Relation>('relation')
    ])
    domains.value = allDomains.sort((a, b) => a.displayName.localeCompare(b.displayName))
    const entityDomainRelations = allRelations.filter(item => item.relationType === 'belongs_to_domain'
      && item.from.entityType === props.entityRef.entityType && item.from.calmyId === props.entityRef.calmyId)
    relation.value = entityDomainRelations.find(item => !item.archivedAt)
    archivedDomainRelations.value = entityDomainRelations.filter(item => !!item.archivedAt)
    const entityTimeRelations = allRelations.filter(item => item.relationType === 'context_of'
      && item.from.entityType === props.entityRef.entityType && item.from.calmyId === props.entityRef.calmyId
      && item.to.entityType === 'time')
    timeRelations.value = entityTimeRelations.filter(item => !item.archivedAt).sort((a, b) => a.to.calmyId.localeCompare(b.to.calmyId))
    archivedTimeRelations.value = entityTimeRelations.filter(item => !!item.archivedAt)
    selectedDomainId.value = props.modelValue || relation.value?.to.calmyId || ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '领域读取失败'
  } finally { loading.value = false }
}

async function addTimeContext(value: string): Promise<void> {
  if (!value || !timeSupported.value || props.disabled || loading.value || saving.value || savingTimeId.value) return
  if (!isValidTimeContextId(value)) { error.value = '请输入有效的年份、月份或日期。'; return }
  if (timeRelations.value.some(item => item.to.calmyId === value)) return
  savingTimeId.value = value
  error.value = ''
  try {
    const archived = archivedTimeRelations.value.filter(item => item.to.calmyId === value).sort((a, b) => b.revision - a.revision)[0]
    if (archived) {
      await withSaveState(() => unifiedAsyncRepository.update<Relation>('relation', archived.calmyId, { archivedAt: undefined }, {
        expectedRevision: archived.revision, commandId: `time-context:restore:${archived.calmyId}:${archived.revision}`
      }))
    } else {
      await withSaveState(() => unifiedAsyncRepository.create(unifiedFactories.relation({
        from: props.entityRef, to: { entityType: 'time', calmyId: value }, relationType: 'context_of', directed: true, sourceIds: []
      }), { commandId: `time-context:create:${props.entityRef.entityType}:${props.entityRef.calmyId}:${value}` }))
    }
    emit('changed')
    window.dispatchEvent(new CustomEvent('beryl-data-synced'))
    await refresh()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '时间关系保存失败' }
  finally { savingTimeId.value = '' }
}

async function removeTimeContext(item: Relation): Promise<void> {
  if (props.disabled || loading.value || saving.value || savingTimeId.value) return
  savingTimeId.value = item.to.calmyId
  error.value = ''
  try {
    await withSaveState(() => unifiedAsyncRepository.update<Relation>('relation', item.calmyId, { archivedAt: Date.now() }, {
      expectedRevision: item.revision, commandId: `time-context:archive:${item.calmyId}:${item.revision}`
    }))
    emit('changed')
    window.dispatchEvent(new CustomEvent('beryl-data-synced'))
    await refresh()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '时间关系移除失败' }
  finally { savingTimeId.value = '' }
}

watch(() => props.modelValue, value => { if (value !== undefined) selectedDomainId.value = value })
watch(() => [props.entityRef.entityType, props.entityRef.calmyId] as const, () => { void refresh() })
onMounted(() => { void refresh() })

async function assignDomain(value: string) {
  if (saving.value || props.disabled || loading.value) return
  const nextId = value || undefined
  if (nextId === relation.value?.to.calmyId || (!nextId && !relation.value)) return
  const nextDomain = nextId ? domains.value.find(domain => domain.calmyId === nextId && domain.status === 'active') : undefined
  if (nextId && !nextDomain) {
    selectedDomainId.value = relation.value?.to.calmyId || ''
    error.value = '请选择一个有效的启用领域。'
    return
  }
  error.value = ''
  saving.value = true
  try {
    await withSaveState(async () => {
      if (!nextDomain) {
        if (relation.value) {
          await unifiedAsyncRepository.update<Relation>('relation', relation.value.calmyId, { archivedAt: Date.now() }, {
            expectedRevision: relation.value.revision,
            commandId: `domain-assignment:archive:${relation.value.calmyId}:${relation.value.revision}`
          })
          relation.value = undefined
        }
      } else if (relation.value) {
        relation.value = await unifiedAsyncRepository.update<Relation>('relation', relation.value.calmyId, {
          to: { entityType: 'domain', calmyId: nextDomain.calmyId }
        }, {
          expectedRevision: relation.value.revision,
          commandId: `domain-assignment:update:${relation.value.calmyId}:${relation.value.revision}:${nextDomain.calmyId}`
        })
      } else {
        const archived = archivedDomainRelations.value
          .filter(item => item.to.entityType === 'domain' && item.to.calmyId === nextDomain.calmyId)
          .sort((a, b) => b.revision - a.revision)[0]
        if (archived) {
          relation.value = await unifiedAsyncRepository.update<Relation>('relation', archived.calmyId, { archivedAt: undefined }, {
            expectedRevision: archived.revision, commandId: `domain-assignment:restore:${archived.calmyId}:${archived.revision}`
          })
          return
        }
        relation.value = await unifiedAsyncRepository.create(unifiedFactories.relation({
          from: props.entityRef, to: { entityType: 'domain', calmyId: nextDomain.calmyId },
          relationType: 'belongs_to_domain', directed: true, sourceIds: []
        }), { commandId: `domain-assignment:create:${props.entityRef.entityType}:${props.entityRef.calmyId}:${nextDomain.calmyId}` })
      }
    })
    selectedDomainId.value = nextDomain?.calmyId || ''
    emit('update:modelValue', nextDomain?.calmyId)
    emit('changed')
    window.dispatchEvent(new CustomEvent('beryl-data-synced'))
    await refresh()
  } catch (cause) {
    selectedDomainId.value = relation.value?.to.calmyId || ''
    error.value = cause instanceof Error ? cause.message : '领域保存失败'
  } finally { saving.value = false }
}
</script>

<template>
  <div v-if="supported || timeSupported" class="entity-context-controls">
    <label v-if="supported" class="domain-picker">
      所属领域（可选）
      <select aria-label="所属领域（可选）" :value="selectedDomainId" :disabled="disabled || loading || saving" @change="assignDomain(($event.target as HTMLSelectElement).value)">
        <option value="">未设置领域</option>
        <option v-for="domain in visibleDomains" :key="domain.calmyId" :value="domain.calmyId">{{ domain.displayName }}{{ domain.status === 'retired' ? '（已停用）' : '' }}</option>
      </select>
      <small v-if="saving" role="status">正在保存领域…</small>
    </label>
    <section v-if="timeSupported" class="time-context-picker" aria-label="时间上下文">
      <span>关联时间（可选）</span>
      <div class="time-context-inputs">
        <label>月份<input type="month" aria-label="添加月份时间关系" :disabled="disabled || loading || !!savingTimeId" @change="addTimeContext(($event.target as HTMLInputElement).value)" /></label>
        <label>具体日期<input type="date" aria-label="添加日期时间关系" :disabled="disabled || loading || !!savingTimeId" @change="addTimeContext(($event.target as HTMLInputElement).value)" /></label>
      </div>
      <ul v-if="timeRelations.length" class="time-context-list">
        <li v-for="item in timeRelations" :key="item.calmyId"><time>{{ item.to.calmyId }}</time><a :href="`/app/reality-context?time=${encodeURIComponent(item.to.calmyId)}`">查看</a><button type="button" :aria-label="`移除时间关系 ${item.to.calmyId}`" :disabled="disabled || loading || !!savingTimeId" @click="removeTimeContext(item)">{{ savingTimeId === item.to.calmyId ? '移除中…' : '移除' }}</button></li>
      </ul>
    </section>
    <small v-if="error" class="context-error" role="alert">{{ error }}</small>
  </div>
</template>

<style scoped>
.entity-context-controls{display:grid;gap:8px}.time-context-picker{display:grid;gap:6px;font-size:.8rem}.time-context-inputs{display:flex;flex-wrap:wrap;gap:8px}.time-context-inputs label{display:grid;gap:4px}.time-context-inputs input{min-height:36px;border:1px solid var(--c-border);border-radius:8px;background:var(--c-bg);color:var(--c-text);padding:6px}.time-context-list{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}.time-context-list li{display:flex;align-items:center;gap:6px;border:1px solid var(--c-border);border-radius:8px;padding:4px 7px}.time-context-list a,.time-context-list button{border:0;background:transparent;color:var(--c-text-2);cursor:pointer}.context-error{color:var(--c-danger)}
</style>
