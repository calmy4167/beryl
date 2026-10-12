<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { withSaveState } from '@/core/save-state'
import { matterAsyncRepository } from '@/domain/matter/repository'
import { unifiedAsyncRepository, unifiedFactories, type EntityRef, type Person, type Relation, type Scene, type Space } from '@/domain/unified'

interface ContextOption { ref: EntityRef; label: string; route: string; active: boolean }

const props = defineProps<{ entityRef: EntityRef; disabled?: boolean; targetTypes?: EntityRef['entityType'][] }>()
const options = ref<ContextOption[]>([])
const relations = ref<Relation[]>([])
const archivedRelations = ref<Relation[]>([])
const selected = ref('')
const loading = ref(true)
const saving = ref(false)
const error = ref('')

function key(ref: EntityRef): string { return `${ref.entityType}:${ref.calmyId}` }
const available = computed(() => options.value.filter(option => option.active && !relations.value.some(relation => key(relation.to) === key(option.ref))))

async function refresh(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [people, scenes, spaces, things, allRelations] = await Promise.all([
      unifiedAsyncRepository.list<Person>('person'), unifiedAsyncRepository.list<Scene>('scene'),
      unifiedAsyncRepository.list<Space>('space'), matterAsyncRepository.list(), unifiedAsyncRepository.list<Relation>('relation')
    ])
    options.value = [
      ...people.map(item => ({ ref: { entityType: 'person' as const, calmyId: item.calmyId }, label: `人物 · ${item.displayName}${item.status === 'archived' ? '（已归档）' : ''}`, route: '/app/people', active: item.status === 'active' })),
      ...things.map(item => ({ ref: { entityType: 'thing' as const, calmyId: item.calmyId }, label: `事情 · ${item.title}${item.status === 'archived' ? '（已归档）' : ''}`, route: `/app/matters/${item.calmyId}`, active: item.status !== 'archived' })),
      ...scenes.map(item => ({ ref: { entityType: 'scene' as const, calmyId: item.calmyId }, label: `情境 · ${item.title}${item.status === 'archived' ? '（已归档）' : ''}`, route: '/app/reality-scenes', active: item.status !== 'archived' })),
      ...spaces.map(item => ({ ref: { entityType: 'space' as const, calmyId: item.calmyId }, label: `空间 · ${item.title}${item.status === 'archived' ? '（已归档）' : ''}`, route: '/app/reality-scenes', active: item.status !== 'archived' }))
    ].filter(option => !props.targetTypes || props.targetTypes.includes(option.ref.entityType))
    const matchingRelations = allRelations.filter(item => (item.relationType === 'context_of' || item.relationType === 'subject_of')
      && item.from.entityType === props.entityRef.entityType && item.from.calmyId === props.entityRef.calmyId
      && options.value.some(option => key(option.ref) === key(item.to)))
    relations.value = matchingRelations.filter(item => !item.archivedAt)
    archivedRelations.value = matchingRelations.filter(item => !!item.archivedAt)
    if (!available.value.some(option => key(option.ref) === selected.value)) selected.value = available.value[0] ? key(available.value[0].ref) : ''
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '读取情境关系失败' }
  finally { loading.value = false }
}

async function add(): Promise<void> {
  const target = options.value.find(option => key(option.ref) === selected.value)
  if (!target || props.disabled || loading.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    const archived = archivedRelations.value
      .filter(relation => key(relation.to) === key(target.ref))
      .sort((a, b) => b.revision - a.revision)[0]
    if (archived) {
      await withSaveState(() => unifiedAsyncRepository.update<Relation>('relation', archived.calmyId, { archivedAt: undefined }, {
        expectedRevision: archived.revision, commandId: `context-picker:restore:${archived.calmyId}:${archived.revision}`
      }))
    } else {
      const relation = unifiedFactories.relation({
        from: props.entityRef, to: target.ref,
        relationType: target.ref.entityType === 'person' && props.entityRef.entityType !== 'person' ? 'subject_of' : 'context_of',
        directed: true, sourceIds: ['context-picker']
      })
      await withSaveState(() => unifiedAsyncRepository.create(relation, { commandId: `context-picker:add:${key(props.entityRef)}:${key(target.ref)}` }))
    }
    window.dispatchEvent(new CustomEvent('beryl-data-synced'))
    await refresh()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '情境关系保存失败' }
  finally { saving.value = false }
}

async function remove(relation: Relation): Promise<void> {
  if (props.disabled || loading.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    await withSaveState(() => unifiedAsyncRepository.update<Relation>('relation', relation.calmyId, { archivedAt: Date.now() }, {
      expectedRevision: relation.revision, commandId: `context-picker:archive:${relation.calmyId}:${relation.revision}`
    }))
    window.dispatchEvent(new CustomEvent('beryl-data-synced'))
    await refresh()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '移除情境关系失败' }
  finally { saving.value = false }
}

function targetLabel(relation: Relation): string {
  return options.value.find(option => key(option.ref) === key(relation.to))?.label || relation.to.calmyId
}

watch(() => [props.entityRef.entityType, props.entityRef.calmyId] as const, () => void refresh())
onMounted(() => void refresh())
</script>

<template>
  <section class="context-relation-picker" aria-label="关联人物、事情、情境或空间">
    <div class="context-relation-head"><strong>关联到现实情境</strong><small>关联人物表示资料主体；关联事情、情境或空间表示上下文。这些关系不改变访问权限。</small></div>
    <div class="context-relation-add">
      <select v-model="selected" aria-label="选择关联的人物、事情、情境或空间" :disabled="disabled || loading || saving || !available.length">
        <option v-if="!available.length" value="">没有可添加的关联</option>
        <option v-for="option in available" :key="key(option.ref)" :value="key(option.ref)">{{ option.label }}</option>
      </select>
      <button type="button" :disabled="disabled || loading || saving || !selected" @click="void add()">{{ saving ? '保存中…' : '添加关联' }}</button>
    </div>
    <ul v-if="relations.length" class="context-relation-list">
      <li v-for="relation in relations" :key="relation.calmyId"><a :href="options.find(option => key(option.ref) === key(relation.to))?.route">{{ targetLabel(relation) }}</a><button type="button" :aria-label="`移除关联 ${targetLabel(relation)}`" :disabled="disabled || saving" @click="void remove(relation)">移除</button></li>
    </ul>
    <p v-if="loading" role="status" class="context-relation-note">正在读取关联…</p>
    <p v-if="error" role="alert" class="context-relation-error">{{ error }}</p>
  </section>
</template>

<style scoped>
.context-relation-picker{display:grid;gap:8px}.context-relation-head{display:grid;gap:3px}.context-relation-head small,.context-relation-note{color:var(--c-text-3);font-size:.75rem}.context-relation-add{display:flex;gap:8px;flex-wrap:wrap}.context-relation-add select{flex:1;min-width:180px}.context-relation-add select,.context-relation-add button,.context-relation-list button{min-height:34px;border:1px solid var(--c-border);border-radius:7px;background:var(--c-bg);color:var(--c-text);padding:6px 9px}.context-relation-add button,.context-relation-list button{cursor:pointer}.context-relation-list{display:flex;gap:7px;flex-wrap:wrap;margin:0;padding:0;list-style:none}.context-relation-list li{display:flex;align-items:center;gap:6px;border:1px solid var(--c-border);border-radius:8px;padding:3px 6px}.context-relation-list a,.context-relation-list button{color:var(--c-text-2);font-size:.75rem}.context-relation-list button{border:0;background:transparent;min-height:24px;padding:2px}.context-relation-error{color:var(--c-danger);margin:0}
</style>
