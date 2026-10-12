<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { withSaveState } from '@/core/save-state'
import { unifiedAsyncRepository, unifiedFactories, type DictionaryOption, type Resource } from '@/domain/unified'
import PeoplePage from './PeoplePage.vue'
import DomainManagerPanel from '@/vue/components/DomainManagerPanel.vue'
import ResourceDictionaryPanel from '@/vue/components/ResourceDictionaryPanel.vue'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import LbPanel from '@/vue/liubai/LbPanel.vue'
import LbCollapsible from '@/vue/liubai/LbCollapsible.vue'
import LbStatGrid from '@/vue/liubai/LbStatGrid.vue'
import type { LbStat } from '@/vue/liubai/types'
import '@/styles/modules/master-data.css'

type ManagerTab = 'sentences' | 'people' | 'dictionary' | 'domains'
// 页面自带头部（参考稿里 .slide-head 属于页面自身），外壳因此不再渲染第二行标题。
useOwnSlideHead()

/** 参考稿的标题是一句陈述；四个 tab 各一句，hint 里保留页面名（parity 测试断言含「主数据管理」）。 */
const TAB_HEADING: Record<ManagerTab, string> = {
  sentences: '句子素材是可复用的一句话。',
  people: '人物仍沿用现有数据。',
  dictionary: '系统字典决定下拉里的选项。',
  domains: '领域用于整理同一份资料。'
}
const tab = ref<ManagerTab>('sentences')
const items = ref<Resource[]>([])
const dictionaryOptions = ref<DictionaryOption[]>([])
const query = ref('')
const title = ref('')
const body = ref('')
const categoryOptionId = ref('')
const tagOptionIds = ref<string[]>([])
const sourceOptionId = ref('')
const editing = ref<Resource | null>(null)
const showArchived = ref(false)
const loading = ref(true)
const saving = ref(false)
const error = ref('')

function toast(message: string, kind: 'success' | 'warning' | 'error' = 'success'): void {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

async function refresh(): Promise<void> {
  loading.value = true
  try {
    const [resources, options] = await Promise.all([
      unifiedAsyncRepository.list<Resource>('resource'),
      unifiedAsyncRepository.list<DictionaryOption>('dictionary_option'),
    ])
    items.value = resources.filter(item => item.kind === 'template').sort((left, right) => right.updatedAt - left.updatedAt)
    dictionaryOptions.value = options
    error.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '素材读取失败'
  } finally { loading.value = false }
}
onMounted(() => { void refresh() })

const activeCount = computed(() => items.value.filter(item => item.status !== 'retired').length)
const heading = computed(() => TAB_HEADING[tab.value])
const retiredCount = computed(() => items.value.filter(item => item.status === 'retired').length)
/** 「留白」统计卡（HUD 第 3 档收起）。口径来自已有实体，不新造数据。 */
const stats = computed<LbStat[]>(() => [
  { label: '可用素材', value: activeCount.value, unit: ' 条' },
  { label: '已归档', value: retiredCount.value, unit: ' 条' },
  { label: '字典选项', value: dictionaryOptions.value.filter(item => item.status === 'active').length, unit: ' 项' },
  { label: '停用选项', value: dictionaryOptions.value.filter(item => item.status === 'retired').length, unit: ' 项' }
])
const activeCategories = computed(() => dictionaryOptions.value.filter(item => item.module === 'resource' && item.field === 'category' && item.status === 'active').sort((a, b) => a.sortOrder - b.sortOrder))
const activeTags = computed(() => dictionaryOptions.value.filter(item => item.module === 'resource' && item.field === 'tag' && item.status === 'active').sort((a, b) => a.sortOrder - b.sortOrder))
const activeSources = computed(() => dictionaryOptions.value.filter(item => item.module === 'resource' && item.field === 'source' && item.status === 'active').sort((a, b) => a.sortOrder - b.sortOrder))
const retiredSelectedCategory = computed(() => dictionaryOptions.value.find(item => item.calmyId === categoryOptionId.value && item.status === 'retired'))
const retiredSelectedSource = computed(() => dictionaryOptions.value.find(item => item.calmyId === sourceOptionId.value && item.status === 'retired'))
const retiredSelectedTags = computed(() => dictionaryOptions.value.filter(item => item.status === 'retired' && tagOptionIds.value.includes(item.calmyId)))
function optionLabel(id: string | undefined): string {
  if (!id) return ''
  const option = dictionaryOptions.value.find(item => item.calmyId === id)
  return option ? `${option.value}${option.status === 'retired' ? '（已停用）' : ''}` : '关联选项暂不可用'
}
function resourceMetadata(item: Resource): string[] {
  return [
    item.categoryOptionId ? `类别：${optionLabel(item.categoryOptionId)}` : '',
    ...(item.tagOptionIds || []).map(id => `#${optionLabel(id)}`),
    ...(item.tags || []).map(tag => `#${tag}`),
    item.sourceOptionId ? `来源：${optionLabel(item.sourceOptionId)}` : '',
  ].filter(Boolean)
}
const visibleItems = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase()
  return items.value.filter(item => (showArchived.value || item.status !== 'retired')
    && (!normalized || `${item.title} ${item.body || ''} ${resourceMetadata(item).join(' ')}`.toLocaleLowerCase().includes(normalized)))
})

function beginEdit(item: Resource): void {
  editing.value = item
  title.value = item.title
  body.value = item.body || ''
  categoryOptionId.value = item.categoryOptionId || ''
  tagOptionIds.value = item.tagOptionIds ? [...item.tagOptionIds] : []
  sourceOptionId.value = item.sourceOptionId || ''
}
function resetForm(): void {
  editing.value = null
  title.value = ''
  body.value = ''
  categoryOptionId.value = ''
  tagOptionIds.value = []
  sourceOptionId.value = ''
}
async function save(event: Event): Promise<void> {
  event.preventDefault()
  const nextTitle = title.value.trim()
  const nextBody = body.value.trim()
  if (!nextTitle || !nextBody) { toast('请填写素材名称和内容', 'warning'); return }
  const wasEditing = editing.value !== null
  saving.value = true
  try {
    await withSaveState(async () => {
      if (editing.value) {
        await unifiedAsyncRepository.update<Resource>('resource', editing.value.calmyId, {
          title: nextTitle, body: nextBody, status: 'active', archivedAt: undefined,
          categoryOptionId: categoryOptionId.value || undefined, tagOptionIds: [...new Set(tagOptionIds.value)], sourceOptionId: sourceOptionId.value || undefined,
        }, { expectedRevision: editing.value.revision })
      } else {
        await unifiedAsyncRepository.create(unifiedFactories.resource({
          title: nextTitle, kind: 'template', status: 'active', body: nextBody,
          assetIds: [], matterIds: [], sourceIds: [], tags: [], categoryOptionId: categoryOptionId.value || undefined,
          tagOptionIds: [...new Set(tagOptionIds.value)], sourceOptionId: sourceOptionId.value || undefined,
        }))
      }
    })
    resetForm()
    await refresh()
    toast(wasEditing ? '素材已更新' : '素材已保存')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '素材保存失败', 'error') }
  finally { saving.value = false }
}
async function setArchived(item: Resource, archived: boolean): Promise<void> {
  saving.value = true
  try {
    await withSaveState(() => unifiedAsyncRepository.update<Resource>('resource', item.calmyId, {
      status: archived ? 'retired' : 'active', archivedAt: archived ? Date.now() : undefined,
    }, { expectedRevision: item.revision }))
    await refresh()
    toast(archived ? '素材已归档' : '素材已恢复')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '素材状态更新失败', 'error') }
  finally { saving.value = false }
}
</script>

<template>
  <header class="slide-head">
    <div class="head-main">
      <p class="hint">主数据管理</p>
      <div class="head-title-row">
        <h2>{{ heading }}</h2>
        <span class="info" tabindex="0" data-tip="句子素材、字典选项与生活领域都在这一页；人物沿用现有数据。H 收起辅助信息。" aria-label="主数据说明">i</span>
      </div>
    </div>
    <span class="panel-note">{{ tab === 'sentences' ? `${activeCount} 条可用` : '' }}</span>
  </header>

    <div class="seg master-data-tabs" role="tablist" aria-label="主数据类型">
      <button type="button" role="tab" :aria-selected="tab === 'sentences'" :class="{ active: tab === 'sentences' }" @click="tab = 'sentences'">句子</button>
      <button type="button" role="tab" :aria-selected="tab === 'people'" :class="{ active: tab === 'people' }" @click="tab = 'people'">人物</button>
      <button type="button" role="tab" :aria-selected="tab === 'dictionary'" :class="{ active: tab === 'dictionary' }" @click="tab = 'dictionary'">系统字典</button>
      <button type="button" role="tab" :aria-selected="tab === 'domains'" :class="{ active: tab === 'domains' }" @click="tab = 'domains'">生活领域</button>
    </div>

    <PeoplePage v-if="tab === 'people'" embedded />
    <ResourceDictionaryPanel v-else-if="tab === 'dictionary'" @changed="refresh" />
    <DomainManagerPanel v-else-if="tab === 'domains'" />
    <template v-else>
      <LbCollapsible block="masterComposer" :rank="2">
        <LbPanel :title="editing ? '编辑句子素材' : '保存一句可复用的话'" note="仅在你选择时插入，不会自动改变其他记录">
        <form class="sentence-meta-form" @submit="save">
          <label>名称<input v-model="title" aria-label="句子素材名称" placeholder="例如：先写事实" maxlength="100"></label>
          <label>内容<textarea v-model="body" aria-label="句子素材内容" placeholder="写下以后可能想再次使用的句子…" rows="3" maxlength="2000" /></label>
          <label>类别<select v-model="categoryOptionId" aria-label="句子素材类别"><option value="">未设置类别</option><option v-if="retiredSelectedCategory" :value="retiredSelectedCategory.calmyId">{{ retiredSelectedCategory.value }}（已停用）</option><option v-for="option in activeCategories" :key="option.calmyId" :value="option.calmyId">{{ option.value }}</option></select></label>
          <fieldset class="master-data-tag-options"><legend>标签</legend><label v-for="option in activeTags" :key="option.calmyId"><input v-model="tagOptionIds" type="checkbox" :value="option.calmyId">{{ option.value }}</label><span v-if="!activeTags.length">暂无标签选项，可到“系统字典”添加。</span><small v-for="option in retiredSelectedTags" :key="option.calmyId">{{ option.value }}（已停用） <button type="button" @click="tagOptionIds = tagOptionIds.filter(id => id !== option.calmyId)">移除</button></small></fieldset>
          <label>来源<select v-model="sourceOptionId" aria-label="句子素材来源"><option value="">未设置来源</option><option v-if="retiredSelectedSource" :value="retiredSelectedSource.calmyId">{{ retiredSelectedSource.value }}（已停用）</option><option v-for="option in activeSources" :key="option.calmyId" :value="option.calmyId">{{ option.value }}</option></select></label>
          <div class="master-data-form-actions">
            <button v-if="editing" class="chip" type="button" :disabled="saving" @click="resetForm">取消</button>
            <button class="chip on" type="submit" :disabled="saving">{{ saving ? '保存中…' : editing ? '保存修改' : '保存素材' }}</button>
          </div>
        </form>
        </LbPanel>
      </LbCollapsible>

      <LbPanel title="句子素材" :note="`${activeCount} 条可用`">
        <div class="master-data-library-heading">
          <input v-model="query" class="master-data-search" aria-label="搜索句子素材" placeholder="搜索名称、内容或标签…">
          <label class="master-data-archived-toggle"><input v-model="showArchived" type="checkbox">显示已归档</label>
        </div>
        <div v-if="error" class="master-data-state error" role="alert"><span>{{ error }}</span><button type="button" class="chip" @click="void refresh()">重试</button></div>
        <p v-if="loading" class="master-data-state" role="status">正在读取素材…</p>
        <ul v-else-if="visibleItems.length" class="master-data-list">
          <li v-for="item in visibleItems" :key="item.calmyId" :class="{ retired: item.status === 'retired' }">
            <div class="master-data-copy"><div class="master-data-title-row"><h3>{{ item.title }}</h3><span v-if="item.status === 'retired'" class="master-data-status">已归档</span></div><p>{{ item.body }}</p><small v-if="resourceMetadata(item).length">{{ resourceMetadata(item).join('　') }}</small></div>
            <div class="master-data-item-actions"><button v-if="item.status !== 'retired'" type="button" class="chip" @click="beginEdit(item)">编辑</button><button type="button" class="chip" :disabled="saving" @click="void setArchived(item, item.status !== 'retired')">{{ item.status === 'retired' ? '恢复' : '归档' }}</button></div>
          </li>
        </ul>
        <p v-else class="master-data-state">{{ query ? '没有匹配的句子素材。' : showArchived ? '还没有句子素材。' : '这里会显示你保存的句子。' }}</p>
      </LbPanel>

      <LbCollapsible block="masterStats" :rank="3">
        <LbPanel title="主数据统计">
          <LbStatGrid :stats="stats" />
        </LbPanel>
      </LbCollapsible>

      <LbCollapsible block="masterNote" :rank="3">
        <LbPanel title="说明">
          <p class="dim">句子素材、财务类别，以及任务、目标、处境和人物状态已接入系统字典；更多模块会按各自的业务规则逐步开放。</p>
        </LbPanel>
      </LbCollapsible>
    </template>
</template>
