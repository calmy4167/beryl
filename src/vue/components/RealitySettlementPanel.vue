<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { listRealityDocumentsAsync, type RealityDocument } from '@/domain/reality'
import { settleRealityContext, settleThingContext, type RealitySettlementChoice } from '@/application/use-cases/settle-reality-context'
import { unifiedAsyncRepository, type EntityRef, type Relation, type Scene } from '@/domain/unified'
import type { Matter } from '@/domain/matter/model'

const props = defineProps<{ scene?: Scene; thing?: Matter; scenes: Scene[]; things: Matter[] }>()
const candidates = ref<RealityDocument[]>([])
const settlementHistory = ref(props.scene?.settlements || props.thing?.settlements || [])
const choices = ref<Record<string, RealitySettlementChoice | ''>>({})
const targets = ref<Record<string, string>>({})
const loading = ref(true)
const saving = ref(false)
const reopened = ref(false)
const error = ref('')
const info = ref('')
const eligible = (document: RealityDocument) => ['action', 'record', 'resource', 'asset', 'transaction', 'relationship', 'insight', 'important_date'].includes(document.entityType)
const documentEntityType = (document: RealityDocument): EntityRef['entityType'] => document.entityType === 'transaction' ? 'finance_entry' : document.entityType as EntityRef['entityType']
const targetOptions = computed(() => [
  ...props.scenes.filter(scene => scene.calmyId !== props.scene?.calmyId && scene.status !== 'archived').map(scene => ({ value: `scene:${scene.calmyId}`, label: `情境：${scene.title}`, entityType: 'scene' as const, calmyId: scene.calmyId })),
  ...props.things.filter(thing => thing.calmyId !== props.thing?.calmyId && thing.status !== 'archived').map(thing => ({ value: `matter:${thing.calmyId}`, label: `事情：${thing.title}`, entityType: 'matter' as const, calmyId: thing.calmyId }))
])
const selectedCount = computed(() => Object.values(choices.value).filter(Boolean).length)
const context = computed(() => props.scene || props.thing)
const contextRef = computed<EntityRef | undefined>(() => props.scene
  ? { entityType: 'scene', calmyId: props.scene.calmyId }
  : props.thing ? { entityType: 'thing', calmyId: props.thing.calmyId } : undefined)
const contextIsComplete = computed(() => props.scene
  ? props.scene.status === 'completed' || props.scene.status === 'archived'
  : props.thing?.status === 'archived')
const contextLabel = computed(() => props.scene ? '情境' : '这件事')
const documentTypeLabel = (document: RealityDocument): string => ({
  action: '行动', record: '记录', resource: '资料', asset: '文件', transaction: '财务记录', relationship: '人物关系', insight: '经验与反思', important_date: '重要日期'
} as Record<string, string>)[document.entityType] || document.entityType

async function refresh(): Promise<void> {
  const activeContext = contextRef.value
  if (!activeContext) { loading.value = false; candidates.value = []; return }
  loading.value = true
  error.value = ''
  try {
    const [documents, relations] = await Promise.all([
      listRealityDocumentsAsync(), unifiedAsyncRepository.list<Relation>('relation')
    ])
    const linkedIds = new Set(relations.filter(relation => !relation.archivedAt && ['used_in', 'context_of'].includes(relation.relationType)
      && relation.to.calmyId === activeContext.calmyId
      && (relation.to.entityType === activeContext.entityType || (activeContext.entityType === 'thing' && relation.to.entityType === 'matter'))).map(relation => `${relation.from.entityType}:${relation.from.calmyId}`))
    const retiredFromThisContext = new Set(settlementHistory.value.flatMap(settlement => settlement.decisions
      .filter(decision => decision.choice === 'retire' || decision.choice === 'reassociate')
      .map(decision => `${decision.entityRef.entityType}:${decision.entityRef.calmyId}`)))
    candidates.value = documents.filter(document => eligible(document) && (reopened.value || !retiredFromThisContext.has(`${documentEntityType(document)}:${document.calmyId}`)) && (
      linkedIds.has(`${documentEntityType(document)}:${document.calmyId}`)
      || (!!props.scene?.thingId && document.matterId === props.scene.thingId)
      || (!!props.thing && document.matterId === props.thing.calmyId)
    ))
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '读取可沉淀资料失败'
  } finally { loading.value = false }
}

function entityRef(document: RealityDocument): EntityRef {
  return { entityType: documentEntityType(document), calmyId: document.calmyId }
}

async function saveSettlement(): Promise<void> {
  if (saving.value || selectedCount.value === 0) return
  saving.value = true
  error.value = ''
  info.value = ''
  try {
    const inputs = candidates.value.flatMap(document => {
      const choice = choices.value[document.calmyId]
      if (!choice) return []
      const target = targetOptions.value.find(item => item.value === targets.value[document.calmyId])
      return [{
        entityRef: entityRef(document), choice,
        targetRef: choice === 'reassociate' && target ? { entityType: target.entityType, calmyId: target.calmyId } : undefined
      }]
    })
    const commandId = `settlement:${contextRef.value?.calmyId}:${Date.now()}`
    const updated = props.scene
      ? await settleRealityContext(props.scene.calmyId, inputs, { commandId })
      : props.thing ? await settleThingContext(props.thing.calmyId, inputs, { commandId }) : undefined
    if (!updated) throw new Error('找不到可沉淀的事情或情境')
    settlementHistory.value = updated.settlements || settlementHistory.value
    info.value = '沉淀选择已保存；原资料 ID 和内容保持不变。'
    reopened.value = false
    choices.value = {}
    targets.value = {}
    await refresh()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '沉淀选择保存失败'
  } finally { saving.value = false }
}

watch(() => contextRef.value?.calmyId, () => { settlementHistory.value = context.value?.settlements || []; void refresh() })
onMounted(() => void refresh())
</script>

<template>
  <section class="beryl-card settlement-panel" :aria-label="`沉淀${contextLabel} ${context?.title || ''}`">
    <div><h3 class="font-title">留下值得保留的资料</h3><p class="field-hint">只记录选择并调整稳定 ID 关系，不复制资料内容。退役会结束它与本情境的活动关联，不会删除原资料。</p></div>
    <p v-if="loading" class="field-hint" role="status">正在查找本情境关联的资料…</p>
    <p v-else-if="!contextIsComplete" class="field-hint">{{ scene ? '完成情境' : '归档这件事' }}后可以整理需要留下的资料。</p>
    <template v-else>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <p v-if="info" class="field-hint" role="status">{{ info }}</p>
      <button v-if="settlementHistory.length && !reopened" class="app-button" type="button" :disabled="loading || saving" @click="reopened = true; refresh()">重新整理本情境的沉淀</button>
      <ul v-if="candidates.length" class="settlement-list">
        <li v-for="item in candidates" :key="`${item.entityType}:${item.calmyId}`">
          <span><strong>{{ item.title }}</strong><small>{{ documentTypeLabel(item) }} · {{ item.summary }}</small></span>
          <label>处理方式
            <select v-model="choices[item.calmyId]" :aria-label="`选择${item.title}的沉淀方式`">
              <option value="">暂不处理</option><option value="keep">留下在本情境</option><option value="retire">从本情境退役</option><option value="reassociate">关联到其他事情或情境</option>
            </select>
          </label>
          <label v-if="choices[item.calmyId] === 'reassociate'">关联目标
            <select v-model="targets[item.calmyId]" :aria-label="`选择${item.title}的关联目标`">
              <option value="">选择目标</option><option v-for="target in targetOptions" :key="target.value" :value="target.value">{{ target.label }}</option>
            </select>
          </label>
        </li>
      </ul>
      <p v-else class="field-hint">当前没有关联的行动、记录、资料、文件、费用、人物关系、重要日期或经验需要整理。</p>
      <details v-if="settlementHistory.length" class="settlement-history"><summary>过往沉淀记录（{{ settlementHistory.length }}）</summary><ul><li v-for="entry in settlementHistory" :key="entry.commandId">{{ new Date(entry.settledAt).toLocaleString('zh-CN') }} · 已记录 {{ entry.decisions.length }} 项选择</li></ul></details>
      <button class="app-button" type="button" :disabled="saving || !selectedCount || candidates.some(item => choices[item.calmyId] === 'reassociate' && !targets[item.calmyId])" @click="saveSettlement">{{ saving ? '保存中…' : `保存选择${selectedCount ? `（${selectedCount}）` : ''}` }}</button>
    </template>
  </section>
</template>

<style scoped>
.settlement-panel{display:grid;gap:12px}.settlement-panel h3{margin:0 0 6px}.settlement-list{display:grid;gap:10px;padding:0;list-style:none}.settlement-list li{display:flex;flex-wrap:wrap;align-items:center;gap:10px;border-top:1px solid var(--c-border);padding-top:10px}.settlement-list li>span{display:grid;gap:3px;flex:1 1 200px}.settlement-list small{color:var(--c-text-2)}.settlement-list label{display:grid;gap:4px;font-size:.8rem}.settlement-list select{min-height:36px;border:1px solid var(--c-border);border-radius:8px;background:var(--c-bg);color:var(--c-text);padding:6px}.settlement-history summary{cursor:pointer}.settlement-history ul{color:var(--c-text-2)}
</style>
