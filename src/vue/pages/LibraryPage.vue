<script setup lang="ts">
import { computed, createTextVNode, defineComponent, h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { withSaveState } from '@/core/save-state'
import { unifiedAsyncRepository, unifiedFactories } from '@/domain/unified'
import type { Asset, Insight, Resource, Seed } from '@/domain/unified'
import type { ResourceStatus, SeedStatus, InsightStatus } from '@/domain/unified'
import { useResourceStatusDictionary } from '@/vue/composables/useResourceStatusDictionary'
import { useAssetLifecycleDictionary } from '@/vue/composables/useAssetLifecycleDictionary'
import { useSeedInsightStatusDictionary } from '@/vue/composables/useSeedInsightStatusDictionary'

const router = useRouter()
const resources = ref<Resource[]>([])
const seeds = ref<Seed[]>([])
const insights = ref<Insight[]>([])
const assets = ref<Asset[]>([])
const kind = ref<'resource' | 'seed'>('resource')
const title = ref('')
const body = ref('')
const uri = ref('')
const assetPath = ref('')
const assetMime = ref('')
const assetSize = ref('0')
const assetHash = ref('')
const resourceStatusFilter = ref<'all' | ResourceStatus>('all')
const contentStatusFilter = ref<'all' | `seed:${SeedStatus}` | `insight:${InsightStatus}`>('all')
const loading = ref(true)
const error = ref('')
const total = computed(() => resources.value.length + seeds.value.length + insights.value.length)
const { statuses: resourceStatuses, labelFor: resourceStatusLabel, error: resourceStatusError, refresh: refreshResourceStatuses } = useResourceStatusDictionary()
const { lifecycles: assetLifecycles, labelFor: assetLifecycleLabel, error: assetLifecycleError, refresh: refreshAssetLifecycles } = useAssetLifecycleDictionary()
const { seedStatuses, insightStatuses, seedLabelFor, insightLabelFor, error: contentStatusError, refresh: refreshContentStatuses } = useSeedInsightStatusDictionary()
const visibleResources = computed(() => resourceStatusFilter.value === 'all'
  ? resources.value
  : resources.value.filter(item => item.status === resourceStatusFilter.value))
const visibleInsights = computed(() => {
  if (contentStatusFilter.value === 'all') return insights.value
  if (!contentStatusFilter.value.startsWith('insight:')) return []
  return insights.value.filter(item => item.status === contentStatusFilter.value.slice('insight:'.length))
})
const visibleSeeds = computed(() => {
  if (contentStatusFilter.value === 'all') return seeds.value
  if (!contentStatusFilter.value.startsWith('seed:')) return []
  return seeds.value.filter(item => item.status === contentStatusFilter.value.slice('seed:'.length))
})
const visibleNotes = computed(() => [...visibleInsights.value, ...visibleSeeds.value])
const ResourceMetadata = defineComponent({
  props: { item: { type: Object as () => Resource | Insight | Seed, required: true }, statusLabel: { type: String, required: true } },
  setup(props) {
    return () => h('small', [
      createTextVNode('kind' in props.item ? props.item.kind : props.item.entityType === 'insight' ? 'Insight' : 'Seed'),
      createTextVNode(' · '),
      createTextVNode(props.statusLabel),
    ])
  },
})


function toast(message: string, kind: 'success' | 'warning' | 'error' = 'success'): void {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

async function refresh(): Promise<boolean> {
  loading.value = true
  error.value = ''
  try {
    const [nextResources, nextSeeds, nextInsights, nextAssets] = await Promise.all([
      unifiedAsyncRepository.list<Resource>('resource'),
      unifiedAsyncRepository.list<Seed>('seed'),
      unifiedAsyncRepository.list<Insight>('insight'),
      unifiedAsyncRepository.list<Asset>('asset'),
    ])
    resources.value = nextResources.filter(item => item.status !== 'retired')
    seeds.value = nextSeeds.filter(item => item.status !== 'retired')
    insights.value = nextInsights.filter(item => item.status !== 'retired')
    assets.value = nextAssets
    return true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Library 数据读取失败'
    return false
  } finally { loading.value = false }
}
onMounted(() => { void refresh() })

async function addItem(): Promise<void> {
  if (!title.value.trim() || !body.value.trim()) { toast('标题和内容都需要保留', 'warning'); return }
  const selectedKind = kind.value
  try {
    await withSaveState(() => unifiedAsyncRepository.create(selectedKind === 'resource'
      ? unifiedFactories.resource({ title: title.value.trim(), kind: 'knowledge', status: 'active', body: body.value.trim(), uri: uri.value.trim() || undefined, assetIds: [], matterIds: [], sourceIds: [], tags: [] })
      : unifiedFactories.seed({ title: title.value.trim(), body: body.value.trim(), status: 'open', sourceRecordIds: [], targetMatterIds: [], tags: [] })))
    title.value = ''; body.value = ''; uri.value = ''
    const refreshed = await refresh()
    toast(refreshed ? (selectedKind === 'resource' ? '资料已加入' : '种子已保留') : '内容已保存，但列表刷新失败，请重试', refreshed ? 'success' : 'warning')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '保存失败', 'error') }
}

async function addAsset(): Promise<void> {
  const size = Number(assetSize.value)
  if (!assetPath.value.trim() || !assetMime.value.trim() || !assetHash.value.trim() || !Number.isFinite(size) || size < 0) {
    toast('Asset 需要路径、类型、hash 和非负大小', 'warning'); return
  }
  try {
    await withSaveState(() => unifiedAsyncRepository.create(unifiedFactories.asset({ path: assetPath.value.trim(), mimeType: assetMime.value.trim(), sizeBytes: size, hash: assetHash.value.trim(), lifecycle: 'active', version: 1 })))
    assetPath.value = ''; assetMime.value = ''; assetSize.value = '0'; assetHash.value = ''
    const refreshed = await refresh()
    toast(refreshed ? 'Asset 元数据已保存' : 'Asset 已保存，但列表刷新失败，请重试', refreshed ? 'success' : 'warning')
  } catch (cause) { toast(cause instanceof Error ? cause.message : 'Asset 保存失败', 'error') }
}

async function updateResource(item: Resource, status: Resource['status']): Promise<void> {
  try {
    await withSaveState(() => unifiedAsyncRepository.update<Resource>('resource', item.calmyId, { status, archivedAt: status === 'retired' ? Date.now() : undefined }, { expectedRevision: item.revision }))
    const refreshed = await refresh()
    toast(refreshed ? '资源状态已更新' : '资源已更新，但列表刷新失败，请重试', refreshed ? 'success' : 'warning')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '资源状态更新失败', 'error') }
}

async function retireSeed(item: Seed): Promise<void> {
  try {
    await withSaveState(() => unifiedAsyncRepository.update<Seed>('seed', item.calmyId, { status: 'retired', archivedAt: Date.now() }, { expectedRevision: item.revision }))
    const refreshed = await refresh()
    toast(refreshed ? 'Seed 已退休' : 'Seed 已更新，但列表刷新失败，请重试', refreshed ? 'success' : 'warning')
  } catch (cause) { toast(cause instanceof Error ? cause.message : 'Seed 更新失败', 'error') }
}

async function updateAsset(item: Asset, lifecycle: Asset['lifecycle']): Promise<void> {
  try {
    await withSaveState(() => unifiedAsyncRepository.update<Asset>('asset', item.calmyId, { lifecycle, archivedAt: lifecycle === 'retired' ? Date.now() : undefined }, { expectedRevision: item.revision }))
    const refreshed = await refresh()
    toast(refreshed ? '附件状态已更新' : '附件已更新，但列表刷新失败，请重试', refreshed ? 'success' : 'warning')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '附件状态更新失败', 'error') }
}
</script>

<template>
  <div class="library-page">
    <header class="page-head">
      <div><p class="eyebrow">LIBRARY · EARTH</p><h1 class="font-title">资料</h1><p>保存可复用的内容，并保留来源。</p></div>
      <div class="library-head-actions"><span class="load-pill" role="status">{{ loading ? '读取中…' : `${total} 项开放资产` }}</span><button class="app-button" type="button" @click="router.push('/app/flow')">带着问题进探索</button></div>
    </header>
    <section v-if="error" class="beryl-card empty-state" role="alert"><b>Library 数据暂时无法读取</b><p>{{ error }}</p><button class="app-button" type="button" @click="refresh">重试</button></section>
    <section class="beryl-card admin-block">
      <div class="panel-head"><div><p class="eyebrow">CAPTURE ASSET</p><h2 class="font-title">保存一个可复用的东西</h2></div></div>
      <div class="create-row library-create">
        <select v-model="kind" aria-label="资源类型"><option value="resource">Resource 资源</option><option value="seed">Seed 种子</option></select>
        <input v-model="title" aria-label="资源标题" placeholder="标题">
        <input v-model="body" aria-label="资源内容" placeholder="内容、做法或下一步">
        <input v-if="kind === 'resource'" v-model="uri" aria-label="外部 URI" placeholder="外部 URI（可选）">
        <button class="primary" type="button" @click="addItem">保存</button>
      </div>
    </section>
    <section class="beryl-card admin-block">
      <div class="panel-head"><div><p class="eyebrow">ASSET LIFECYCLE</p><h2 class="font-title">附件元数据</h2></div><span>{{ assets.length }}</span></div>
      <div class="create-row library-create">
        <input v-model="assetPath" aria-label="附件路径" placeholder="路径，例如 assets/manual.pdf">
        <input v-model="assetMime" aria-label="附件类型" placeholder="MIME">
        <input v-model="assetSize" aria-label="附件大小" type="number" placeholder="大小 bytes">
        <input v-model="assetHash" aria-label="附件 hash" placeholder="hash">
        <button class="primary" type="button" @click="addAsset">保存附件</button>
      </div>
      <div v-if="loading && !assets.length" class="empty-state" role="status">正在读取附件…</div>
      <div v-else-if="!assets.length" class="empty-state">还没有附件元数据。</div>
      <p v-if="assetLifecycleError" class="form-error" role="alert">附件生命周期字典读取失败，当前使用内置名称。<button type="button" class="app-button" @click="refreshAssetLifecycles">重试</button></p>
      <div v-for="item in assets" :key="item.calmyId" class="evidence-row"><b>{{ item.path }}</b><span>{{ item.mimeType }} · {{ item.sizeBytes }} bytes</span><select :aria-label="`${item.path} 生命周期`" :value="item.lifecycle" @change="updateAsset(item, ($event.target as HTMLSelectElement).value as Asset['lifecycle'])"><option v-for="lifecycle in assetLifecycles" :key="lifecycle" :value="lifecycle">{{ assetLifecycleLabel(lifecycle) }}</option></select></div>
    </section>
    <div class="library-grid">
      <section>
        <div class="section-title"><h2 class="font-title">资源</h2><span>{{ visibleResources.length }}</span></div>
        <label class="library-status-filter">状态
          <select v-model="resourceStatusFilter" aria-label="按资源状态筛选">
            <option value="all">全部状态</option>
            <option v-for="status in resourceStatuses" :key="status" :value="status">{{ resourceStatusLabel(status) }}</option>
          </select>
        </label>
        <p v-if="resourceStatusError" class="form-error" role="alert">状态字典读取失败，当前使用内置名称。<button type="button" class="app-button" @click="refreshResourceStatuses">重试</button></p>
        <div v-if="loading && !resources.length" class="empty-state" role="status">正在读取资源…</div>
        <div v-else-if="!resources.length" class="empty-state">还没有资源。</div>
        <div v-else-if="!visibleResources.length" class="empty-state">当前状态下没有资源。</div>
        <article v-for="item in visibleResources" :key="item.calmyId" class="library-card beryl-card"><b>{{ item.title }}</b><p>{{ item.body || '暂无描述' }}</p><ResourceMetadata :item="item" :status-label="resourceStatusLabel(item.status)" /><div class="btns"><button type="button" @click="updateResource(item, item.status === 'active' ? 'expired' : 'active')">{{ item.status === 'active' ? '标记过期' : '恢复有效' }}</button><button type="button" @click="updateResource(item, 'retired')">退休</button></div></article>
      </section>
      <section>
        <div class="section-title"><h2 class="font-title">洞察与种子</h2><span>{{ visibleNotes.length }}</span></div>
        <label class="library-status-filter">状态
          <select v-model="contentStatusFilter" aria-label="按洞察或种子状态筛选">
            <option value="all">全部状态</option>
            <optgroup label="洞察"><option v-for="status in insightStatuses.filter(value => value !== 'retired')" :key="`insight:${status}`" :value="`insight:${status}`">{{ insightLabelFor(status) }}</option></optgroup>
            <optgroup label="种子"><option v-for="status in seedStatuses.filter(value => value !== 'retired')" :key="`seed:${status}`" :value="`seed:${status}`">{{ seedLabelFor(status) }}</option></optgroup>
          </select>
        </label>
        <p v-if="contentStatusError" class="form-error" role="alert">洞察与种子状态字典读取失败，当前使用内置名称。<button type="button" class="app-button" @click="refreshContentStatuses">重试</button></p>
        <div v-if="loading && !insights.length && !seeds.length" class="empty-state" role="status">正在读取洞察与种子…</div>
        <div v-else-if="!insights.length && !seeds.length" class="empty-state">复盘后留下的洞察和 Seed 会出现在这里。</div>
        <div v-else-if="!visibleNotes.length" class="empty-state">当前状态下没有洞察或种子。</div>
        <article v-for="item in visibleNotes" :key="item.calmyId" class="library-card beryl-card"><b>{{ item.title }}</b><p>{{ item.body }}</p><ResourceMetadata :item="item" :status-label="item.entityType === 'insight' ? insightLabelFor(item.status) : seedLabelFor(item.status)" /><button v-if="item.entityType === 'seed'" type="button" @click="retireSeed(item)">退休</button></article>
      </section>
    </div>
  </div>
</template>
