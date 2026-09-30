<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { withSaveState } from '@/core/save-state'
import { unifiedAsyncRepository, unifiedFactories } from '@/domain/unified'
import type { Person } from '@/domain/unified'
import { usePersonStatusDictionary } from '@/vue/composables/usePersonStatusDictionary'

withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

type PersonFilter = 'active' | 'archived' | 'all'
type PersonForm = { displayName: string; roles: string; domain: string; notes: string; tags: string }
const emptyForm = (): PersonForm => ({ displayName: '', roles: '', domain: '', notes: '', tags: '' })
const people = ref<Person[]>([])
const form = ref<PersonForm>(emptyForm())
const query = ref('')
const filter = ref<PersonFilter>('active')
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const { statuses: orderedStatuses, labelFor: personStatusLabel } = usePersonStatusDictionary()

function toast(message: string, kind: 'success' | 'warning' | 'error' = 'success'): void {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}
function splitValues(value: string): string[] {
  return [...new Set(value.split(/[,，、\n]/).map(item => item.trim()).filter(Boolean))]
}
function matchesSearch(person: Person, value: string): boolean {
  if (!value.trim()) return true
  const haystack = [person.displayName, person.domain || '', person.notes || '', ...person.roles, ...person.tags].join(' ').toLocaleLowerCase()
  return haystack.includes(value.trim().toLocaleLowerCase())
}
function formatUpdatedAt(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(timestamp)
}
async function refresh(): Promise<void> {
  loading.value = true
  try {
    people.value = (await unifiedAsyncRepository.list<Person>('person')).sort((a, b) => b.updatedAt - a.updatedAt)
    error.value = ''
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '人物数据加载失败' }
  finally { loading.value = false }
}
onMounted(() => { void refresh() })

const visiblePeople = computed(() => people.value.filter(person => {
  const matchesFilter = filter.value === 'all' || person.status === filter.value
  return matchesFilter && matchesSearch(person, query.value)
}))
const activeCount = computed(() => people.value.filter(person => person.status === 'active').length)
const archivedCount = computed(() => people.value.filter(person => person.status === 'archived').length)

async function createPerson(event: Event): Promise<void> {
  event.preventDefault()
  const displayName = form.value.displayName.trim()
  if (!displayName) { toast('请先填写人物名称', 'warning'); return }
  saving.value = true
  try {
    await withSaveState(() => unifiedAsyncRepository.create(unifiedFactories.person({
      displayName,
      roles: splitValues(form.value.roles),
      domain: form.value.domain.trim() || undefined,
      notes: form.value.notes.trim() || undefined,
      tags: splitValues(form.value.tags),
      status: 'active',
    })))
    form.value = emptyForm()
    await refresh()
    toast('人物已加入上下文')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '人物保存失败', 'error') }
  finally { saving.value = false }
}
async function updateStatus(person: Person, status: Person['status']): Promise<void> {
  saving.value = true
  try {
    await withSaveState(() => unifiedAsyncRepository.update<Person>('person', person.calmyId, {
      status,
      archivedAt: status === 'archived' ? Date.now() : undefined,
    }, { expectedRevision: person.revision }))
    await refresh()
    toast(`人物状态已设为「${personStatusLabel(status)}」`)
  } catch (cause) {
    toast(cause instanceof Error ? cause.message : '人物状态更新失败', 'error')
    await refresh()
  } finally { saving.value = false }
}
</script>

<template>
  <div :class="['people-page', { 'people-page-embedded': embedded }]">
    <header v-if="!embedded" class="page-head">
      <div>
        <p class="eyebrow">关系 · 人物</p>
        <h1 class="font-title">人物</h1>
        <p>把重要的人、关系背景和相处边界放在同一个可回看的地方。</p>
      </div>
      <span class="load-pill">{{ loading ? '正在读取…' : `${personStatusLabel('active')}：${activeCount}` }}</span>
    </header>

    <section class="beryl-card admin-block">
      <div class="panel-head">
        <div><p class="eyebrow">ADD PERSON</p><h2 class="font-title">新增人物</h2></div>
        <span>姓名必填，其余信息可以之后补充</span>
      </div>
      <form class="matter-create" @submit="createPerson">
        <div class="two-col">
          <label>人物名称<input v-model="form.displayName" aria-label="人物名称" placeholder="例如：林老师" required></label>
          <label>角色 / 关系<input v-model="form.roles" aria-label="人物角色" placeholder="用逗号分隔，例如：朋友、合作者"></label>
          <label>所属领域<input v-model="form.domain" aria-label="人物领域" placeholder="例如：设计、家庭、客户"></label>
          <label>标签<input v-model="form.tags" aria-label="人物标签" placeholder="用逗号分隔，例如：重要、长期"></label>
        </div>
        <label>上下文备注<textarea v-model="form.notes" aria-label="人物备注" placeholder="记录你希望在行动、复盘或关系判断时记住的背景。" /></label>
        <div class="btns">
          <button class="primary" type="submit" :disabled="saving || loading">{{ saving ? '保存中…' : '保存人物' }}</button>
          <button type="button" :disabled="saving" @click="form = emptyForm()">清空</button>
        </div>
      </form>
    </section>

    <section class="beryl-card admin-block">
      <div class="panel-head">
        <div><p class="eyebrow">PEOPLE INDEX</p><h2 class="font-title">人物列表</h2></div>
        <span>{{ archivedCount }} 位{{ personStatusLabel('archived') }}</span>
      </div>
      <div class="people-toolbar" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:16px 0">
        <input v-model="query" class="global-search" aria-label="搜索人物" placeholder="搜索姓名、角色、领域或备注">
        <div class="range-tabs" role="tablist" aria-label="人物筛选">
          <button v-for="status in orderedStatuses" :key="status" type="button" :class="{ on: filter === status }" role="tab" :aria-selected="filter === status" @click="filter = status">{{ personStatusLabel(status) }}</button>
          <button type="button" :class="{ on: filter === 'all' }" role="tab" :aria-selected="filter === 'all'" @click="filter = 'all'">全部</button>
        </div>
      </div>

      <section v-if="error" class="beryl-card empty-state" role="alert"><b>人物数据暂时无法读取</b><p>{{ error }}</p><button class="app-button" type="button" @click="void refresh()">重试</button></section>
      <div v-if="loading" class="empty-state" role="status">正在加载人物…</div>
      <div v-else-if="visiblePeople.length" class="matter-grid">
        <article v-for="person in visiblePeople" :key="person.calmyId" class="matter-card beryl-card">
          <div class="matter-card-head"><span class="matter-status">{{ personStatusLabel(person.status) }}</span><small>更新于 {{ formatUpdatedAt(person.updatedAt) }}</small></div>
          <h2>{{ person.displayName }}</h2>
          <p>{{ person.notes || '还没有上下文备注。' }}</p>
          <small v-if="person.roles.length || person.domain">{{ [person.domain, ...person.roles].filter(Boolean).join(' · ') }}</small>
          <p v-if="person.tags.length" class="muted">#{{ person.tags.join('  #') }}</p>
          <div class="btns">
            <button v-if="person.status === 'active'" type="button" class="danger" :disabled="saving" @click="void updateStatus(person, 'archived')">归档人物</button>
            <button v-else type="button" :disabled="saving" @click="void updateStatus(person, 'active')">恢复人物</button>
          </div>
        </article>
      </div>
      <div v-else class="empty-state">{{ query ? '没有匹配的人物。' : filter === 'archived' ? `还没有${personStatusLabel('archived')}人物。` : '还没有人物，先添加一个重要的人吧。' }}</div>
    </section>
  </div>
</template>
