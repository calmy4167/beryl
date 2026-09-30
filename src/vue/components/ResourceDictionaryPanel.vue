<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { withSaveState } from '@/core/save-state'
import { unifiedAsyncRepository, unifiedFactories, type DictionaryOption, type DictionaryOptionField } from '@/domain/unified'
import { ACTION_STATUSES, type ActionStatus } from '@/domain/action/model'
import { ACTION_STATUS_DEFAULTS, actionStatusLabel } from '@/domain/action/status-labels'
import { CAPTURE_STATUSES, type CaptureStatus } from '@/domain/capture/model'
import { CAPTURE_STATUS_DEFAULTS, captureStatusLabel } from '@/domain/unified/capture-status-labels'
import { GOAL_STATUSES, type GoalStatus, GOAL_STATUS_DEFAULTS, goalStatusLabel } from '@/domain/goal/status-labels'
import { MATTER_STATUSES, type MatterStatus } from '@/domain/matter/model'
import { MATTER_STATUS_DEFAULTS, matterStatusLabel } from '@/domain/matter/status-labels'
import { ASSET_LIFECYCLES, PERSON_STATUSES, type AssetLifecycle, type PersonStatus } from '@/domain/unified/model'
import { PERSON_STATUS_DEFAULTS, personStatusLabel } from '@/domain/unified/person-status-labels'
import { RESOURCE_STATUSES, type ResourceStatus } from '@/domain/unified/model'
import { RESOURCE_STATUS_DEFAULTS, resourceStatusLabel } from '@/domain/unified/resource-status-labels'
import { ASSET_LIFECYCLE_DEFAULTS, assetLifecycleLabel } from '@/domain/unified/asset-lifecycle-labels'
import { SEED_STATUSES, INSIGHT_STATUSES, type SeedStatus, type InsightStatus } from '@/domain/unified/model'
import { SEED_STATUS_DEFAULTS, seedStatusLabel } from '@/domain/unified/seed-status-labels'
import { INSIGHT_STATUS_DEFAULTS, insightStatusLabel } from '@/domain/unified/insight-status-labels'
import '@/styles/modules/master-data.css'

type ConfigurableStatus = ActionStatus | CaptureStatus | GoalStatus | MatterStatus | PersonStatus | ResourceStatus | AssetLifecycle | SeedStatus | InsightStatus
type StatusModule = 'action' | 'capture' | 'goal' | 'matter' | 'person' | 'resource' | 'asset' | 'seed' | 'insight'
const fields: Array<{ key: string; value: DictionaryOptionField; module: 'resource' | 'asset' | 'seed' | 'insight' | 'action' | 'capture' | 'finance' | 'goal' | 'matter' | 'person'; label: string; help: string }> = [
  { key: 'resource:category', value: 'category', module: 'resource', label: '句子类别', help: '句子素材可以选择一个类别。' },
  { key: 'resource:tag', value: 'tag', module: 'resource', label: '句子标签', help: '句子素材可以选择多个标签。' },
  { key: 'resource:source', value: 'source', module: 'resource', label: '句子来源', help: '记录句子素材来自哪里。' },
  { key: 'resource:status', value: 'status', module: 'resource', label: '资源状态', help: '只调整资源有效、过期与退休的显示名称和顺序；资源状态操作保持不变。' },
  { key: 'asset:status', value: 'status', module: 'asset', label: '附件生命周期', help: '只调整附件存在、过期、退休与缺失的显示名称和顺序；附件生命周期代码保持不变。' },
  { key: 'seed:status', value: 'status', module: 'seed', label: '种子状态', help: '只调整待探索、培育中、已转为行动与退休状态的显示名称和顺序；探索流程保持不变。' },
  { key: 'insight:status', value: 'status', module: 'insight', label: '洞察状态', help: '只调整待确认、已确认与已结束状态的显示名称和顺序；确认及否认流程保持不变。' },
  { key: 'action:status', value: 'status', module: 'action', label: '任务状态', help: '只调整既有状态的显示名称和顺序；状态码与流转规则保持不变。' },
  { key: 'capture:status', value: 'status', module: 'capture', label: '收集状态', help: '只调整待处理、有建议、已处理、建议已忽略与已放下状态的显示名称和顺序；收集处理流程保持不变。' },
  { key: 'goal:status', value: 'status', module: 'goal', label: '目标状态', help: '只调整进行中与已完成的显示名称和顺序；目标完成规则保持不变。' },
  { key: 'matter:status', value: 'status', module: 'matter', label: '处境状态', help: '只调整既有处境状态的显示名称和顺序；允许的状态流转保持不变。' },
  { key: 'person:status', value: 'status', module: 'person', label: '人物状态', help: '只调整活跃与归档的显示名称和顺序；人物归档及恢复规则保持不变。' },
  { key: 'finance:category', value: 'category', module: 'finance', label: '财务类别', help: '财务记录的收入和支出共用这一组类别，可按需维护。' },
]
const emit = defineEmits<{ changed: [] }>()
const selectedKey = ref('resource:category')
const options = ref<DictionaryOption[]>([])
const value = ref('')
const editing = ref<DictionaryOption | null>(null)
const editingStatusKey = ref<ConfigurableStatus | ''>('')
const showRetired = ref(false)
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const canRetryRead = ref(false)
const currentField = computed(() => fields.find(item => item.key === selectedKey.value)!)
const field = computed(() => currentField.value.value)
const currentOptions = computed(() => options.value.filter(item => item.module === currentField.value.module && item.field === field.value)
  .filter(item => showRetired.value || item.status === 'active')
  .sort((a, b) => a.sortOrder - b.sortOrder || a.value.localeCompare(b.value, 'zh-CN')))
const activeCount = computed(() => field.value === 'status' ? statusRows.value.length : options.value.filter(item => item.module === currentField.value.module && item.field === field.value && item.status === 'active').length)
const duplicate = computed(() => options.value.some(item => item.module === currentField.value.module && item.field === field.value && item.calmyId !== editing.value?.calmyId && item.value.trim().toLocaleLowerCase() === value.value.trim().toLocaleLowerCase()))
const statusRows = computed(() => {
  const module = currentField.value.module
  const keys: readonly ConfigurableStatus[] = module === 'capture' ? CAPTURE_STATUSES : module === 'goal' ? GOAL_STATUSES : module === 'matter' ? MATTER_STATUSES : module === 'person' ? PERSON_STATUSES : module === 'resource' ? RESOURCE_STATUSES : module === 'asset' ? ASSET_LIFECYCLES : module === 'seed' ? SEED_STATUSES : module === 'insight' ? INSIGHT_STATUSES : ACTION_STATUSES
  const positions = new Map(keys.map((status, index) => [status, index]))
  return keys.map(status => ({
    status,
    option: options.value.find(item => item.module === module && item.field === 'status' && item.systemKey === status && item.status === 'active'),
    label: module === 'capture' ? captureStatusLabel(status as CaptureStatus, options.value) : module === 'goal' ? goalStatusLabel(status as GoalStatus, options.value) : module === 'matter' ? matterStatusLabel(status as MatterStatus, options.value) : module === 'person' ? personStatusLabel(status as PersonStatus, options.value) : module === 'resource' ? resourceStatusLabel(status as ResourceStatus, options.value) : module === 'asset' ? assetLifecycleLabel(status as AssetLifecycle, options.value) : module === 'seed' ? seedStatusLabel(status as SeedStatus, options.value) : module === 'insight' ? insightStatusLabel(status as InsightStatus, options.value) : actionStatusLabel(status as ActionStatus, options.value),
  })).sort((left, right) => (left.option?.sortOrder ?? (positions.get(left.status) || 0) * 10) - (right.option?.sortOrder ?? (positions.get(right.status) || 0) * 10) || (positions.get(left.status) || 0) - (positions.get(right.status) || 0))
})

async function refresh(): Promise<void> {
  loading.value = true
  try {
    options.value = await unifiedAsyncRepository.list<DictionaryOption>('dictionary_option')
    error.value = ''
    canRetryRead.value = false
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '字典读取失败'; canRetryRead.value = true }
  finally { loading.value = false }
}
function reset(): void { editing.value = null; editingStatusKey.value = ''; value.value = '' }
function beginEdit(option: DictionaryOption): void { editing.value = option; value.value = option.value }
function beginEditStatus(status: ConfigurableStatus): void {
  const option = options.value.find(item => item.module === currentField.value.module && item.field === 'status' && item.systemKey === status && item.status === 'active') || null
  editing.value = option
  editingStatusKey.value = status
  value.value = currentField.value.module === 'capture' ? captureStatusLabel(status as CaptureStatus, options.value) : currentField.value.module === 'goal' ? goalStatusLabel(status as GoalStatus, options.value) : currentField.value.module === 'matter' ? matterStatusLabel(status as MatterStatus, options.value) : currentField.value.module === 'person' ? personStatusLabel(status as PersonStatus, options.value) : currentField.value.module === 'resource' ? resourceStatusLabel(status as ResourceStatus, options.value) : currentField.value.module === 'asset' ? assetLifecycleLabel(status as AssetLifecycle, options.value) : currentField.value.module === 'seed' ? seedStatusLabel(status as SeedStatus, options.value) : currentField.value.module === 'insight' ? insightStatusLabel(status as InsightStatus, options.value) : actionStatusLabel(status as ActionStatus, options.value)
}
async function save(event: Event): Promise<void> {
  event.preventDefault()
  const changedModule = currentField.value.module
  const changedField = field.value
  const normalized = value.value.trim()
  if (!normalized) { error.value = '请填写选项名称。'; return }
  if (field.value !== 'status' && duplicate.value) { error.value = '此字段已有同名选项；可以恢复已停用的选项。'; return }
  saving.value = true
  error.value = ''
  try {
    await withSaveState(async () => {
      if (field.value === 'status' && editingStatusKey.value) {
        const module = changedModule as StatusModule
        const systemKey = editingStatusKey.value
        const sortOrder = statusRows.value.findIndex(row => row.status === systemKey) * 10
        if (editing.value) {
          await unifiedAsyncRepository.update<DictionaryOption>('dictionary_option', editing.value.calmyId, { value: normalized }, { expectedRevision: editing.value.revision })
        } else {
          await unifiedAsyncRepository.create(unifiedFactories.dictionaryOption({ module, field: 'status', systemKey, value: normalized, sortOrder }))
        }
      } else if (editing.value) {
        await unifiedAsyncRepository.update<DictionaryOption>('dictionary_option', editing.value.calmyId, { value: normalized }, { expectedRevision: editing.value.revision })
      } else {
        const sortOrder = options.value.filter(item => item.module === changedModule && item.field === changedField).reduce((max, item) => Math.max(max, item.sortOrder), -10) + 10
        await unifiedAsyncRepository.create(unifiedFactories.dictionaryOption({ module: changedModule, field: changedField, value: normalized, sortOrder }))
      }
    })
    reset()
    await refresh()
    emit('changed')
    window.dispatchEvent(new CustomEvent('calmy-dictionary-updated', { detail: { module: changedModule, field: changedField } }))
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '字典保存失败'; canRetryRead.value = false }
  finally { saving.value = false }
}
async function moveStatus(status: ConfigurableStatus, direction: -1 | 1): Promise<void> {
  const module = currentField.value.module as StatusModule
  const changedField = field.value
  const rows = [...statusRows.value]
  const index = rows.findIndex(row => row.status === status)
  const target = index + direction
  if (index < 0 || target < 0 || target >= rows.length || saving.value) return
  ;[rows[index], rows[target]] = [rows[target], rows[index]]
  saving.value = true
  error.value = ''
  try {
    await withSaveState(async () => {
      for (const [sortIndex, row] of rows.entries()) {
        const sortOrder = sortIndex * 10
        if (row.option) {
          if (row.option.sortOrder !== sortOrder) await unifiedAsyncRepository.update<DictionaryOption>('dictionary_option', row.option.calmyId, { sortOrder }, { expectedRevision: row.option.revision })
        } else {
          const value = module === 'capture' ? CAPTURE_STATUS_DEFAULTS[row.status as CaptureStatus] : module === 'goal' ? GOAL_STATUS_DEFAULTS[row.status as GoalStatus] : module === 'matter' ? MATTER_STATUS_DEFAULTS[row.status as MatterStatus] : module === 'person' ? PERSON_STATUS_DEFAULTS[row.status as PersonStatus] : module === 'resource' ? RESOURCE_STATUS_DEFAULTS[row.status as ResourceStatus] : module === 'asset' ? ASSET_LIFECYCLE_DEFAULTS[row.status as AssetLifecycle] : module === 'seed' ? SEED_STATUS_DEFAULTS[row.status as SeedStatus] : module === 'insight' ? INSIGHT_STATUS_DEFAULTS[row.status as InsightStatus] : ACTION_STATUS_DEFAULTS[row.status as ActionStatus].label
          await unifiedAsyncRepository.create(unifiedFactories.dictionaryOption({ module, field: 'status', systemKey: row.status, value, sortOrder }))
        }
      }
    })
    await refresh()
    emit('changed')
    window.dispatchEvent(new CustomEvent('calmy-dictionary-updated', { detail: { module, field: changedField } }))
  } catch (cause) { const message = cause instanceof Error ? cause.message : '状态顺序保存失败'; canRetryRead.value = false; await refresh(); error.value = message }
  finally { saving.value = false }
}
async function setRetired(option: DictionaryOption, retired: boolean): Promise<void> {
  saving.value = true
  error.value = ''
  try {
    await withSaveState(() => unifiedAsyncRepository.update<DictionaryOption>('dictionary_option', option.calmyId, { status: retired ? 'retired' : 'active', archivedAt: retired ? Date.now() : undefined }, { expectedRevision: option.revision }))
    await refresh()
    emit('changed')
    window.dispatchEvent(new CustomEvent('calmy-dictionary-updated', { detail: { module: option.module, field: option.field } }))
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '字典状态更新失败'; canRetryRead.value = false }
  finally { saving.value = false }
}
function onDataSynced(): void { void refresh() }
onMounted(() => { void refresh(); window.addEventListener('beryl-data-synced', onDataSynced) })
onUnmounted(() => window.removeEventListener('beryl-data-synced', onDataSynced))
</script>

<template>
  <section class="master-data-composer dictionary-panel" aria-labelledby="dictionary-title">
    <div class="master-data-composer-heading"><div><h2 id="dictionary-title">系统字典</h2><p>选项按模块维护；停用不会删除旧记录中的关联。</p></div><span class="load-pill">{{ activeCount }} 个可用选项</span></div>
    <div class="master-data-tabs dictionary-fields" role="tablist" aria-label="选择要管理的字段">
      <button v-for="item in fields" :key="item.key" type="button" role="tab" :aria-selected="selectedKey === item.key" :class="{ active: selectedKey === item.key }" :disabled="saving" @click="selectedKey = item.key; reset(); error = ''">{{ item.label }}</button>
    </div>
    <p class="dictionary-help">{{ currentField.help }}</p>
    <form v-if="field !== 'status' || editingStatusKey" class="dictionary-form" @submit="save">
      <label>{{ editing ? `修改${currentField.label}名称` : `新增${currentField.label}` }}<input v-model="value" maxlength="80" :disabled="saving" :aria-label="editing ? `修改${currentField.label}名称` : `新增${currentField.label}`" :placeholder="`输入${currentField.label}名称`"></label>
      <div class="master-data-form-actions"><button v-if="editing" class="app-button" type="button" :disabled="saving" @click="reset">取消</button><button class="app-button primary" type="submit" :disabled="saving || !value.trim() || (field !== 'status' && duplicate)">{{ saving ? '保存中…' : editing ? '保存修改' : '添加选项' }}</button></div>
    </form>
      <p v-if="error" class="master-data-state error" role="alert">{{ error }} <button v-if="canRetryRead" type="button" class="app-button" @click="void refresh()">重试读取</button></p>
      <p v-else-if="field !== 'status' && duplicate" class="master-data-state error" role="status">当前字段已经存在同名选项。</p>
    <section class="dictionary-library" :aria-label="`${currentField.label}选项`">
          <div class="master-data-library-heading"><div><h3>{{ currentField.label }}选项</h3><p>{{ field === 'status' ? '只管理固定状态的名称和顺序；不增加或停用状态。' : '名称变更会通过稳定 ID 更新所有关联显示。' }}</p></div><label v-if="field !== 'status'" class="master-data-archived-toggle"><input v-model="showRetired" type="checkbox">显示已停用</label></div>
      <p v-if="loading" class="master-data-state" role="status">正在读取字典…</p>
      <ul v-else-if="field === 'status'" class="master-data-list dictionary-status-list">
        <li v-for="(row, index) in statusRows" :key="row.status">
          <div class="master-data-copy"><div class="master-data-title-row"><h3>{{ row.label }}</h3><span class="master-data-status">{{ currentField.label }}</span></div><small>{{ row.status }}<template v-if="row.option"> · 稳定 ID：{{ row.option.calmyId }}</template></small></div>
          <div class="master-data-item-actions"><button type="button" class="app-button" :disabled="saving" @click="beginEditStatus(row.status)">改名</button><button type="button" class="app-button" :disabled="saving || !!editingStatusKey || index === 0" :aria-label="`上移${row.label}`" @click="moveStatus(row.status, -1)">上移</button><button type="button" class="app-button" :disabled="saving || !!editingStatusKey || index === statusRows.length - 1" :aria-label="`下移${row.label}`" @click="moveStatus(row.status, 1)">下移</button></div>
        </li>
      </ul>
      <ul v-else-if="currentOptions.length" class="master-data-list">
        <li v-for="option in currentOptions" :key="option.calmyId" :class="{ retired: option.status === 'retired' }">
          <div class="master-data-copy"><div class="master-data-title-row"><h3>{{ option.value }}</h3><span v-if="option.status === 'retired'" class="master-data-status">已停用</span></div><small>稳定 ID：{{ option.calmyId }}</small></div>
          <div class="master-data-item-actions"><button v-if="option.status === 'active'" type="button" class="app-button" :disabled="saving" @click="beginEdit(option)">改名</button><button type="button" class="app-button" :disabled="saving" @click="setRetired(option, option.status === 'active')">{{ option.status === 'active' ? '停用' : '恢复' }}</button></div>
        </li>
      </ul>
      <p v-else class="master-data-state">{{ showRetired ? `还没有${currentField.label}选项。` : `还没有可用${currentField.label}；需要时再添加即可。` }}</p>
    </section>
    <p class="dictionary-help">已存在记录不会因添加字典项而被改写；新关联使用这里维护的稳定选项 ID。</p>
  </section>
</template>

<style scoped>
.dictionary-panel { margin-top: 2px; }
.dictionary-fields { margin: 18px 0 8px; }
.dictionary-help { margin: 8px 0 12px; color: var(--c-text-2); font-size: 12px; line-height: 1.6; }
.dictionary-form { display: grid; grid-template-columns: minmax(180px, 1fr) auto; align-items: end; gap: 12px; margin: 14px 0 10px; }
.dictionary-form label { display: grid; gap: 6px; color: var(--c-text-2); font-size: 12px; }
.dictionary-form input { min-height: 42px; border: 1px solid var(--c-border); border-radius: 10px; background: var(--c-surface); color: var(--c-text); padding: 10px 11px; font: inherit; }
.dictionary-library { border-top: 1px solid var(--c-border); margin-top: 14px; padding-top: 14px; }
.dictionary-library h3 { margin: 0; font-size: 14px; }
@media (max-width: 620px) { .dictionary-form { grid-template-columns: 1fr; } .dictionary-form .master-data-form-actions { justify-content: flex-end; } }
</style>
