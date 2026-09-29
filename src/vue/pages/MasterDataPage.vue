<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { withSaveState } from '@/core/save-state'
import { unifiedAsyncRepository, unifiedFactories, type Resource } from '@/domain/unified'
import PeoplePage from './PeoplePage.vue'
import '@/styles/modules/master-data.css'

type ManagerTab = 'sentences' | 'people'
const tab = ref<ManagerTab>('sentences')
const items = ref<Resource[]>([])
const query = ref('')
const title = ref('')
const body = ref('')
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
    const resources = await unifiedAsyncRepository.list<Resource>('resource')
    items.value = resources.filter(item => item.kind === 'template').sort((left, right) => right.updatedAt - left.updatedAt)
    error.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '素材读取失败'
  } finally { loading.value = false }
}
onMounted(() => { void refresh() })

const activeCount = computed(() => items.value.filter(item => item.status !== 'retired').length)
const ActiveCountLabel = { setup: () => () => h('p', [String(activeCount.value), ' 条可用']) }
const visibleItems = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase()
  return items.value.filter(item => (showArchived.value || item.status !== 'retired')
    && (!normalized || `${item.title} ${item.body || ''} ${item.tags.join(' ')}`.toLocaleLowerCase().includes(normalized)))
})

function beginEdit(item: Resource): void {
  editing.value = item
  title.value = item.title
  body.value = item.body || ''
}
function resetForm(): void {
  editing.value = null
  title.value = ''
  body.value = ''
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
        }, { expectedRevision: editing.value.revision })
      } else {
        await unifiedAsyncRepository.create(unifiedFactories.resource({
          title: nextTitle, kind: 'template', status: 'active', body: nextBody,
          assetIds: [], matterIds: [], sourceIds: [], tags: [],
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
  <main class="master-data-page">
    <header class="master-data-heading">
      <div><h1 class="font-title">主数据管理</h1><p>整理可复用的内容，人物仍沿用现有数据。</p></div>
      <span class="load-pill">内容素材</span>
    </header>

    <div class="master-data-tabs" role="tablist" aria-label="主数据类型">
      <button type="button" role="tab" :aria-selected="tab === 'sentences'" :class="{ active: tab === 'sentences' }" @click="tab = 'sentences'">句子</button>
      <button type="button" role="tab" :aria-selected="tab === 'people'" :class="{ active: tab === 'people' }" @click="tab = 'people'">人物</button>
    </div>

    <PeoplePage v-if="tab === 'people'" embedded />
    <template v-else>
      <section class="master-data-composer" aria-labelledby="master-data-composer-title">
        <div class="master-data-composer-heading"><div><h2 id="master-data-composer-title">{{ editing ? '编辑句子素材' : '保存一句可复用的话' }}</h2><p>仅在你选择时插入，不会自动改变其他记录。</p></div></div>
        <form @submit="save">
          <label>名称<input v-model="title" aria-label="句子素材名称" placeholder="例如：先写事实" maxlength="100"></label>
          <label>内容<textarea v-model="body" aria-label="句子素材内容" placeholder="写下以后可能想再次使用的句子…" rows="3" maxlength="2000" /></label>
          <div class="master-data-form-actions">
            <button v-if="editing" class="app-button" type="button" :disabled="saving" @click="resetForm">取消</button>
            <button class="app-button primary" type="submit" :disabled="saving">{{ saving ? '保存中…' : editing ? '保存修改' : '保存素材' }}</button>
          </div>
        </form>
      </section>

      <section class="master-data-library" aria-labelledby="master-data-library-title">
        <div class="master-data-library-heading">
          <div><h2 id="master-data-library-title">句子素材</h2><ActiveCountLabel /></div>
          <label class="master-data-archived-toggle"><input v-model="showArchived" type="checkbox">显示已归档</label>
        </div>
        <input v-model="query" class="master-data-search" aria-label="搜索句子素材" placeholder="搜索名称、内容或标签…">
        <div v-if="error" class="master-data-state error" role="alert"><span>{{ error }}</span><button type="button" class="app-button" @click="void refresh()">重试</button></div>
        <p v-if="loading" class="master-data-state" role="status">正在读取素材…</p>
        <ul v-else-if="visibleItems.length" class="master-data-list">
          <li v-for="item in visibleItems" :key="item.calmyId" :class="{ retired: item.status === 'retired' }">
            <div class="master-data-copy"><div class="master-data-title-row"><h3>{{ item.title }}</h3><span v-if="item.status === 'retired'" class="master-data-status">已归档</span></div><p>{{ item.body }}</p><small v-if="item.tags.length">{{ item.tags.map(tag => `#${tag}`).join('　') }}</small></div>
            <div class="master-data-item-actions"><button v-if="item.status !== 'retired'" type="button" class="app-button" @click="beginEdit(item)">编辑</button><button type="button" class="app-button" :disabled="saving" @click="void setArchived(item, item.status !== 'retired')">{{ item.status === 'retired' ? '恢复' : '归档' }}</button></div>
          </li>
        </ul>
        <p v-else class="master-data-state">{{ query ? '没有匹配的句子素材。' : showArchived ? '还没有句子素材。' : '这里会显示你保存的句子。' }}</p>
      </section>
      <p class="master-data-dictionary-note">系统字典会在后续阶段接入，并按模块分别管理；现有状态流程保持不变。</p>
    </template>
  </main>
</template>
