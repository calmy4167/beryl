<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { withSaveState } from '@/core/save-state'
import { readServerSession } from '@/core/auth'
import { unifiedAsyncRepository, unifiedFactories } from '@/domain/unified'
import type { ImportantDate, Ownership, Person } from '@/domain/unified'
import { usePersonStatusDictionary } from '@/vue/composables/usePersonStatusDictionary'
import DomainPicker from '@/vue/components/DomainPicker.vue'
import OwnershipEditor from '@/vue/components/OwnershipEditor.vue'
import ContextRelationPicker from '@/vue/components/ContextRelationPicker.vue'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import LbPanel from '@/vue/liubai/LbPanel.vue'
import LbCollapsible from '@/vue/liubai/LbCollapsible.vue'
import LbStatGrid from '@/vue/liubai/LbStatGrid.vue'
import type { LbStat } from '@/vue/liubai/types'

const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

// 独立路由时页面自带头部（参考稿里 .slide-head 属于页面自身），外壳因此不再渲染第二行标题；
// 嵌在主数据页时头部由宿主负责，这里不能抢。
if (!props.embedded) useOwnSlideHead()

type PersonFilter = 'active' | 'archived' | 'all'
type PersonForm = { displayName: string; roles: string; notes: string; tags: string }
const emptyForm = (): PersonForm => ({ displayName: '', roles: '', notes: '', tags: '' })
const people = ref<Person[]>([])
const importantDates = ref<ImportantDate[]>([])
const showArchivedImportantDates = ref(false)
const dateForm = ref({ title: '', personId: '', date: '', kind: 'other' as ImportantDate['kind'], recurrence: 'yearly' as ImportantDate['recurrence'], keepYear: false, notes: '' })
const currentUserId = readServerSession()?.user.id
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
    const [loadedPeople, loadedDates] = await Promise.all([
      unifiedAsyncRepository.list<Person>('person'), unifiedAsyncRepository.list<ImportantDate>('important_date')
    ])
    people.value = loadedPeople.sort((a, b) => b.updatedAt - a.updatedAt)
    importantDates.value = loadedDates.sort((a, b) => a.monthDay.localeCompare(b.monthDay) || a.title.localeCompare(b.title))
    error.value = ''
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '人物数据加载失败' }
  finally { loading.value = false }
}
onMounted(() => { void refresh() })

async function createImportantDate(event: Event): Promise<void> {
  event.preventDefault()
  const title = dateForm.value.title.trim()
  const [year, month, day] = dateForm.value.date.split('-').map(Number)
  if (!title || !dateForm.value.date || !dateForm.value.personId) { toast('请填写日期名称、日期并选择相关人物', 'warning'); return }
  saving.value = true
  try {
    const item = unifiedFactories.importantDate({
      title, kind: dateForm.value.kind, personId: dateForm.value.personId, monthDay: `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      year: dateForm.value.keepYear || dateForm.value.recurrence === 'once' ? year : undefined,
      recurrence: dateForm.value.recurrence, notes: dateForm.value.notes.trim() || undefined,
      ownership: { createdByUserId: currentUserId, ownerRef: { type: 'user', id: currentUserId || 'local-user' }, subjectRef: { entityType: 'person', calmyId: dateForm.value.personId }, stewardRefs: [], privacy: 'private' }
    })
    await withSaveState(async () => {
      await unifiedAsyncRepository.create(item, { commandId: `important-date:create:${item.calmyId}` })
      await unifiedAsyncRepository.create(unifiedFactories.relation({
        from: { entityType: 'important_date', calmyId: item.calmyId }, to: { entityType: 'person', calmyId: item.personId! },
        relationType: 'subject_of', directed: true, sourceIds: ['people:important-date']
      }), { commandId: `important-date:person:${item.calmyId}:${item.personId}` })
    })
    dateForm.value = { title: '', personId: '', date: '', kind: 'other', recurrence: 'yearly', keepYear: false, notes: '' }
    await refresh()
    toast('重要日期已保存，并关联到人物')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '重要日期保存失败', 'error') }
  finally { saving.value = false }
}

async function archiveImportantDate(item: ImportantDate): Promise<void> {
  saving.value = true
  try {
    await withSaveState(() => unifiedAsyncRepository.update<ImportantDate>('important_date', item.calmyId, { archivedAt: Date.now() }, {
      expectedRevision: item.revision, commandId: `important-date:archive:${item.calmyId}:${item.revision}`
    }))
    await refresh()
    toast('重要日期已归档，历史关系仍保留')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '重要日期归档失败', 'error') }
  finally { saving.value = false }
}

async function restoreImportantDate(item: ImportantDate): Promise<void> {
  saving.value = true
  try {
    await withSaveState(() => unifiedAsyncRepository.update<ImportantDate>('important_date', item.calmyId, { archivedAt: undefined }, {
      expectedRevision: item.revision, commandId: `important-date:restore:${item.calmyId}:${item.revision}`
    }))
    await refresh()
    toast('重要日期已恢复')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '重要日期恢复失败', 'error') }
  finally { saving.value = false }
}

async function saveImportantDateOwnership(item: ImportantDate, ownership: Ownership | undefined): Promise<void> {
  saving.value = true
  try {
    await withSaveState(() => unifiedAsyncRepository.update<ImportantDate>('important_date', item.calmyId, { ownership }, { expectedRevision: item.revision }))
    await refresh()
    toast('重要日期归属与隐私已保存')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '重要日期归属设置保存失败', 'error') }
  finally { saving.value = false }
}

function dateLabel(item: ImportantDate): string {
  return `${item.year ? `${item.year} 年 ` : ''}${item.monthDay.replace('-', ' 月 ')} 日${item.recurrence === 'yearly' ? ' · 每年' : ' · 一次'}`
}

const visiblePeople = computed(() => people.value.filter(person => {
  const matchesFilter = filter.value === 'all' || person.status === filter.value
  return matchesFilter && matchesSearch(person, query.value)
}))
const activeCount = computed(() => people.value.filter(person => person.status === 'active').length)
const archivedCount = computed(() => people.value.filter(person => person.status === 'archived').length)
const currentUserPerson = computed(() => currentUserId ? people.value.find(person => person.linkedUserId === currentUserId) : undefined)

/** 「留白」统计卡（HUD 第 3 档收起）。口径全部来自已有实体，不新造数据。 */
const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0')
const stats = computed<LbStat[]>(() => [
  { label: '活跃人物', value: activeCount.value, unit: ' 位' },
  { label: '已归档', value: archivedCount.value, unit: ' 位' },
  { label: '重要日期', value: importantDates.value.length, unit: ' 条' },
  {
    label: '本月纪念',
    value: importantDates.value.filter(item => !item.archivedAt && item.monthDay.startsWith(currentMonth)).length,
    unit: ' 条'
  }
])

function personBindingLabel(person: Person): string {
  if (!currentUserId) return person.linkedUserId ? '已关联账号' : '尚未关联账号'
  if (person.linkedUserId === currentUserId) return '已关联当前账号'
  if (person.linkedUserId) return '已关联账号'
  if (currentUserPerson.value) return `当前账号已关联「${currentUserPerson.value.displayName}」`
  return person.status === 'active' ? '尚未关联账号' : '已归档，无法关联账号'
}

function canBindCurrentUser(person: Person): boolean {
  return Boolean(currentUserId && person.status === 'active' && !person.linkedUserId && !currentUserPerson.value)
}

async function bindPersonToCurrentUser(person: Person): Promise<void> {
  if (!currentUserId || !canBindCurrentUser(person)) return
  saving.value = true
  try {
    const current = await unifiedAsyncRepository.find<Person>('person', person.calmyId)
    if (!current || current.status !== 'active' || current.linkedUserId) throw new Error('此人物已变更，请刷新后重试')
    const existing = (await unifiedAsyncRepository.list<Person>('person')).find(item => item.linkedUserId === currentUserId)
    if (existing) throw new Error(`当前账号已关联「${existing.displayName}」`)
    await withSaveState(() => unifiedAsyncRepository.update<Person>('person', person.calmyId, { linkedUserId: currentUserId }, {
      expectedRevision: current.revision,
      commandId: `person:bind-user:${person.calmyId}:${currentUserId}:${current.revision}`,
      actorId: currentUserId,
      sourceIds: ['people:self-account-binding']
    }))
    await refresh()
    toast('已将此人物关联到当前账号；这不会邀请他人或授予其他账号访问权限。')
  } catch (cause) {
    toast(cause instanceof Error ? cause.message : '人物账号关联失败', 'error')
    await refresh()
  } finally { saving.value = false }
}

async function unbindPersonFromCurrentUser(person: Person): Promise<void> {
  if (!currentUserId || person.linkedUserId !== currentUserId) return
  if (!window.confirm('解除后，此人物不再代表当前账号。相关归属数据会按当前账号权限规则重新判断。确定解除吗？')) return
  saving.value = true
  try {
    const current = await unifiedAsyncRepository.find<Person>('person', person.calmyId)
    if (!current || current.linkedUserId !== currentUserId) throw new Error('人物账号关联已变更，请刷新后重试')
    await withSaveState(() => unifiedAsyncRepository.update<Person>('person', person.calmyId, { linkedUserId: undefined }, {
      expectedRevision: current.revision,
      commandId: `person:unbind-user:${person.calmyId}:${currentUserId}:${current.revision}`,
      actorId: currentUserId,
      sourceIds: ['people:self-account-unbinding']
    }))
    await refresh()
    toast('当前账号与人物的关联已解除')
  } catch (cause) {
    toast(cause instanceof Error ? cause.message : '解除人物账号关联失败', 'error')
    await refresh()
  } finally { saving.value = false }
}

async function createPerson(event: Event): Promise<void> {
  event.preventDefault()
  const displayName = form.value.displayName.trim()
  if (!displayName) { toast('请先填写人物名称', 'warning'); return }
  saving.value = true
  try {
    await withSaveState(() => unifiedAsyncRepository.create(unifiedFactories.person({
      displayName,
      roles: splitValues(form.value.roles),
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
async function saveOwnership(person: Person, ownership: Ownership | undefined): Promise<void> {
  saving.value = true
  try {
    await withSaveState(() => unifiedAsyncRepository.update<Person>('person', person.calmyId, { ownership }, { expectedRevision: person.revision }))
    await refresh()
    toast('人物归属与可见范围已保存')
  } catch (cause) {
    toast(cause instanceof Error ? cause.message : '人物归属设置保存失败', 'error')
  } finally { saving.value = false }
}
</script>

<template>
  <div :class="['people-page', { 'people-page-embedded': embedded }]">
    <header v-if="!embedded" class="slide-head">
      <div class="head-main">
        <p class="hint">关系 · People</p>
        <div class="head-title-row">
          <h2 v-if="loading">正在读取…</h2>
          <h2 v-else-if="!visiblePeople.length">还没有可回看的人。</h2>
          <h2 v-else>手上有 <em>{{ visiblePeople.length }}</em> 个人。</h2>
          <span class="info" tabindex="0" data-tip="人物是关系的锚点：重要日期、归属与隐私、情境关联都挂在这里。H 收起辅助信息。" aria-label="人物说明">i</span>
        </div>
      </div>
      <span class="panel-note">{{ loading ? '正在读取…' : `${personStatusLabel('active')} ${activeCount}` }}</span>
    </header>

    <LbCollapsible block="peopleDates" :rank="2">
      <LbPanel title="人物重要日期" note="生日、纪念日和其他重要时间单独保存，可关联人物并设置隐私">
      <form class="matter-create" @submit="createImportantDate">
        <div class="two-col">
          <label>日期名称<input v-model="dateForm.title" aria-label="日期名称" placeholder="例如：爸爸生日" required></label>
          <label>相关人物<select v-model="dateForm.personId" aria-label="重要日期相关人物" required><option value="">选择人物</option><option v-for="person in people.filter(item => item.status === 'active')" :key="person.calmyId" :value="person.calmyId">{{ person.displayName }}</option></select></label>
          <label>日期<input v-model="dateForm.date" type="date" aria-label="重要日期" required></label>
          <label>日期类型<select v-model="dateForm.kind" aria-label="重要日期类型"><option value="birthday">生日</option><option value="anniversary">纪念日</option><option value="memorial">纪念日期</option><option value="other">其他</option></select></label>
          <label>重复方式<select v-model="dateForm.recurrence" aria-label="重要日期重复方式"><option value="yearly">每年</option><option value="once">仅一次</option></select></label>
          <label v-if="dateForm.recurrence === 'yearly'" class="date-year-choice"><input v-model="dateForm.keepYear" type="checkbox" aria-label="保留年份">保留年份（可能用于计算年数）</label>
        </div>
        <label>备注<textarea v-model="dateForm.notes" aria-label="重要日期备注" placeholder="补充纪念方式或需要记住的背景。" /></label>
        <button class="chip on" type="submit" :disabled="saving || loading || !people.some(person => person.status === 'active')">{{ saving ? '保存中…' : '保存重要日期' }}</button>
      </form>
      <div class="people-toolbar"><button class="chip" type="button" @click="showArchivedImportantDates = !showArchivedImportantDates">{{ showArchivedImportantDates ? '隐藏已归档日期' : `查看已归档日期（${importantDates.filter(item => item.archivedAt).length}）` }}</button></div>
      <div v-if="loading" class="dim" role="status">正在读取重要日期…</div>
      <div v-else-if="importantDates.some(item => showArchivedImportantDates || !item.archivedAt)" class="matter-grid">
        <article v-for="item in importantDates.filter(item => showArchivedImportantDates || !item.archivedAt)" :key="item.calmyId" class="matter-card">
          <div class="matter-card-head"><span class="matter-status">{{ item.archivedAt ? '已归档' : ({ birthday: '生日', anniversary: '纪念日', memorial: '纪念日期', other: '其他' } as Record<string, string>)[item.kind] }}</span><small>{{ dateLabel(item) }}</small></div>
          <h3>{{ item.title }}</h3><p>{{ item.personId ? people.find(person => person.calmyId === item.personId)?.displayName || '人物暂不可用' : '未关联人物' }}</p>
          <p v-if="item.notes">{{ item.notes }}</p>
          <DomainPicker :entity-ref="{ entityType: 'important_date', calmyId: item.calmyId }" />
          <ContextRelationPicker :entity-ref="{ entityType: 'important_date', calmyId: item.calmyId }" :target-types="['thing', 'scene', 'space']" :disabled="saving || !!item.archivedAt" />
          <OwnershipEditor :ownership="item.ownership" :people="people" :current-user-id="currentUserId" :disabled="saving" label="重要日期归属与隐私" @save="saveImportantDateOwnership(item, $event)" />
          <button v-if="item.archivedAt" class="chip" type="button" :aria-label="`日期恢复 ${item.calmyId}`" :disabled="saving" @click="void restoreImportantDate(item)">恢复日期</button>
          <button v-else class="chip danger" type="button" :aria-label="`日期归档 ${item.calmyId}`" :disabled="saving" @click="void archiveImportantDate(item)">归档日期</button>
        </article>
      </div>
      <p v-else class="dim">还没有重要日期。保存后它仍是一个独立日期记录，可在事情或情境沉淀时再次关联。</p>
      </LbPanel>
    </LbCollapsible>

    <LbCollapsible block="peopleCreate" :rank="2">
      <LbPanel title="新增人物" note="姓名必填，其余信息可以之后补充">
      <form class="matter-create" @submit="createPerson">
        <div class="two-col">
          <label>人物名称<input v-model="form.displayName" aria-label="人物名称" placeholder="例如：林老师" required></label>
          <label>角色 / 关系<input v-model="form.roles" aria-label="人物角色" placeholder="用逗号分隔，例如：朋友、合作者"></label>
          <label>标签<input v-model="form.tags" aria-label="人物标签" placeholder="用逗号分隔，例如：重要、长期"></label>
        </div>
        <label>上下文备注<textarea v-model="form.notes" aria-label="人物备注" placeholder="记录你希望在行动、复盘或关系判断时记住的背景。" /></label>
        <div class="detail-chips">
          <button class="chip on" type="submit" :disabled="saving || loading">{{ saving ? '保存中…' : '保存人物' }}</button>
          <button class="chip" type="button" :disabled="saving" @click="form = emptyForm()">清空</button>
        </div>
      </form>
      </LbPanel>
    </LbCollapsible>

    <LbPanel title="人物列表" :note="`${archivedCount} 位${personStatusLabel('archived')}`">
      <div class="people-toolbar">
        <input v-model="query" aria-label="搜索人物" placeholder="搜索姓名、角色、领域或备注">
        <div class="seg" role="tablist" aria-label="人物筛选">
          <button v-for="status in orderedStatuses" :key="status" type="button" :class="{ on: filter === status }" role="tab" :aria-selected="filter === status" @click="filter = status">{{ personStatusLabel(status) }}</button>
          <button type="button" :class="{ on: filter === 'all' }" role="tab" :aria-selected="filter === 'all'" @click="filter = 'all'">全部</button>
        </div>
      </div>

      <section v-if="error" class="panel people-error" role="alert"><b>人物数据暂时无法读取</b><p class="dim">{{ error }}</p><button class="chip" type="button" @click="void refresh()">重试</button></section>
      <div v-if="loading" class="dim" role="status">正在加载人物…</div>
      <div v-else-if="visiblePeople.length" class="matter-grid">
        <article v-for="person in visiblePeople" :key="person.calmyId" class="matter-card">
          <div class="matter-card-head"><span class="matter-status">{{ personStatusLabel(person.status) }}</span><small>更新于 {{ formatUpdatedAt(person.updatedAt) }}</small></div>
          <h2>{{ person.displayName }}</h2>
          <p>{{ person.notes || '还没有上下文备注。' }}</p>
          <small v-if="person.roles.length">{{ person.roles.join(' · ') }}</small>
          <small v-if="person.domain">旧版领域备注：{{ person.domain }}</small>
          <p v-if="person.tags.length" class="muted">#{{ person.tags.join('  #') }}</p>
          <div class="person-account-binding" aria-label="人物账号关联">
            <span>{{ personBindingLabel(person) }}</span>
            <button v-if="canBindCurrentUser(person)" class="chip" type="button" aria-label="绑定此人物到当前账号" :disabled="saving" @click="void bindPersonToCurrentUser(person)">绑定到当前账号</button>
            <button v-else-if="currentUserId && person.linkedUserId === currentUserId" class="chip" type="button" aria-label="解除此人物与当前账号的绑定" :disabled="saving" @click="void unbindPersonFromCurrentUser(person)">解除绑定</button>
          </div>
          <DomainPicker :entity-ref="{ entityType: 'person', calmyId: person.calmyId }" />
          <ContextRelationPicker :entity-ref="{ entityType: 'person', calmyId: person.calmyId }" />
          <OwnershipEditor :ownership="person.ownership" :people="people" :current-user-id="currentUserId" :disabled="saving" @save="saveOwnership(person, $event)" />
          <div class="detail-chips">
            <button v-if="person.status === 'active'" class="chip danger" type="button" :disabled="saving" @click="void updateStatus(person, 'archived')">归档人物</button>
            <button v-else class="chip" type="button" :disabled="saving" @click="void updateStatus(person, 'active')">恢复人物</button>
          </div>
        </article>
      </div>
      <p v-else class="dim">{{ query ? '没有匹配的人物。' : filter === 'archived' ? `还没有${personStatusLabel('archived')}人物。` : '还没有人物，先添加一个重要的人吧。' }}</p>
    </LbPanel>

    <LbCollapsible block="peopleStats" :rank="3">
      <LbPanel title="人物统计">
        <LbStatGrid :stats="stats" />
      </LbPanel>
    </LbCollapsible>
  </div>
</template>

<style scoped>
/* 人物页局部排版。颜色与面板语言取「留白」令牌。
   类名沿用 .matter-card / .matter-grid / .ownership-editor / .context-relation-picker，
   parity 测试按它们断言（后两个来自子组件，这里不动）。 */
.people-page { display: flex; flex-direction: column; gap: clamp(8px, 1.2vh, 14px); }
.people-error { border-color: color-mix(in srgb, var(--danger) 45%, transparent); }
.people-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.people-toolbar .seg { width: min(320px, 100%); flex: none; }
.people-toolbar input { flex: 1 1 200px; min-width: 0; min-height: 34px; padding: 6px 10px; font: inherit; font-size: .8rem; }

.matter-create { display: grid; gap: 12px; }
.matter-create .two-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
.matter-create label { display: grid; gap: 6px; color: var(--muted); font-size: .72rem; }
.matter-create input, .matter-create select { min-height: 34px; padding: 6px 10px; font: inherit; font-size: .8rem; }
.matter-create textarea { padding: 8px 10px; font: inherit; font-size: .8rem; min-height: 64px; }
.matter-create .date-year-choice { display: flex; align-items: center; gap: 8px; }
/* 表单里的提交按钮按内容宽度，不要被 grid 拉满整行 */
.matter-create > .chip { justify-self: start; }

.matter-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; align-items: start; }
.matter-card { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel-2); box-shadow: none; align-content: start; }
.matter-card h2, .matter-card h3 { font-size: .95rem; font-weight: 600; color: var(--fg); }
.matter-card p { font-size: .78rem; color: var(--muted); line-height: 1.6; }
.matter-card small { color: var(--muted); font-size: .7rem; }
.matter-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.matter-status { padding: 2px 8px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: .66rem; white-space: nowrap; }
.person-account-binding { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: .74rem; color: var(--muted); }
</style>
