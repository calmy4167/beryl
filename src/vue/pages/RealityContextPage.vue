<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { readServerSession } from '@/core/auth'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter } from '@/domain/matter/model'
import { listRealityDocumentsAsync, type RealityDocument } from '@/domain/reality'
import { buildContextualView, projectEntityContexts, projectTimeContexts } from '@/domain/reality/contextual-view'
import { listRealityActivityAsync } from '@/domain/social/collaboration'
import { isValidTimeContextId, unifiedAsyncRepository, type Domain, type EntityRef, type Person, type Permission, type Relation, type RealityActivity, type Scene, type SceneParticipant, type Scope, type Space } from '@/domain/unified'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import LbPanel from '@/vue/liubai/LbPanel.vue'
import LbCollapsible from '@/vue/liubai/LbCollapsible.vue'

// 页面自带头部（参考稿里 .slide-head 属于页面自身），外壳因此不再渲染第二行标题。
useOwnSlideHead()

const route = useRoute()
const router = useRouter()
const session = readServerSession()
const documents = ref<RealityDocument[]>([])
const permissions = ref<Permission[]>([])
const scopes = ref<Scope[]>([])
const participants = ref<SceneParticipant[]>([])
const relations = ref<Relation[]>([])
const people = ref<Person[]>([])
const spaces = ref<Space[]>([])
const scenes = ref<Scene[]>([])
const things = ref<Matter[]>([])
const domains = ref<Domain[]>([])
const selectedPersonId = ref('')
const selectedDomainId = ref('')
const selectedThingId = ref('')
const selectedSceneId = ref('')
const selectedSpaceId = ref('')
const selectedTimeId = ref('')
const selectionError = ref('')
const loading = ref(true)
const error = ref('')
const historyByDocument = ref<Record<string, RealityActivity[]>>({})
const historyLoading = ref<Record<string, boolean>>({})
const historyErrors = ref<Record<string, string>>({})
const context = computed(() => ({
  personId: typeof route.query.person === 'string' ? route.query.person : undefined,
  domainId: typeof route.query.domain === 'string' ? route.query.domain : undefined,
  thingId: typeof route.query.thing === 'string' ? route.query.thing : undefined,
  sceneId: typeof route.query.scene === 'string' ? route.query.scene : undefined,
  spaceId: typeof route.query.space === 'string' ? route.query.space : undefined
}))
const requestedTimeId = computed(() => typeof route.query.time === 'string' ? route.query.time : undefined)
const hasSelectedContext = computed(() => Object.values(context.value).some(Boolean) || !!requestedTimeId.value)

function syncContextSelection(): void {
  selectedPersonId.value = typeof route.query.person === 'string' ? route.query.person : ''
  selectedDomainId.value = typeof route.query.domain === 'string' ? route.query.domain : ''
  selectedThingId.value = typeof route.query.thing === 'string' ? route.query.thing : ''
  selectedSceneId.value = typeof route.query.scene === 'string' ? route.query.scene : ''
  selectedSpaceId.value = typeof route.query.space === 'string' ? route.query.space : ''
  selectedTimeId.value = typeof route.query.time === 'string' ? route.query.time : ''
}
watch(() => route.query, syncContextSelection, { immediate: true })

async function applyContextSelection(): Promise<void> {
  const timeId = selectedTimeId.value.trim()
  if (timeId && !isValidTimeContextId(timeId)) {
    selectionError.value = '时间请输入有效的年份、月份或日期。'
    return
  }
  selectionError.value = ''
  await router.replace({ path: route.path, query: {
    ...route.query,
    person: selectedPersonId.value || undefined,
    domain: selectedDomainId.value || undefined,
    thing: selectedThingId.value || undefined,
    scene: selectedSceneId.value || undefined,
    space: selectedSpaceId.value || undefined,
    time: timeId || undefined
  } })
}

const participantUserIds = computed(() => {
  const sceneId = context.value.sceneId
  if (!sceneId) return []
  const activePersonIds = new Set(participants.value.filter(item => item.sceneId === sceneId && item.leftAt === undefined).map(item => item.personId))
  return people.value.filter(person => activePersonIds.has(person.calmyId) && person.linkedUserId).map(person => person.linkedUserId!)
})
const sceneParticipantsByScene = computed(() => {
  const usersByScene = new Map<string, string[]>()
  const personById = new Map(people.value.filter(person => person.linkedUserId && person.status === 'active').map(person => [person.calmyId, person.linkedUserId!]))
  for (const participant of participants.value.filter(item => item.leftAt === undefined)) {
    const userId = personById.get(participant.personId)
    if (userId) usersByScene.set(participant.sceneId, [...(usersByScene.get(participant.sceneId) || []), userId])
  }
  return usersByScene
})
const spaceMemberUserIds = computed(() => {
  const space = spaces.value.find(item => item.calmyId === context.value.spaceId)
  if (!space) return []
  const members = new Set(space.memberPersonIds)
  return people.value.filter(person => members.has(person.calmyId) && person.linkedUserId).map(person => person.linkedUserId!)
})
const spaceMembersBySpace = computed(() => {
  const usersBySpace = new Map<string, string[]>()
  const personById = new Map(people.value.filter(person => person.linkedUserId && person.status === 'active').map(person => [person.calmyId, person.linkedUserId!]))
  for (const space of spaces.value.filter(item => item.status === 'active' && !item.archivedAt)) {
    const users = space.memberPersonIds.map(personId => personById.get(personId)).filter((id): id is string => !!id)
    usersBySpace.set(space.calmyId, users)
  }
  return usersBySpace
})
const view = computed(() => buildContextualView({
  documents: documents.value,
  principalUserId: session?.user.id,
  action: 'view', permissions: permissions.value, scopes: scopes.value,
  requestedContext: context.value,
  documentContexts: projectEntityContexts(documents.value, relations.value),
  timeContexts: projectTimeContexts(documents.value, relations.value), requestedTimeId: requestedTimeId.value,
  sceneParticipantUserIds: participantUserIds.value, spaceMemberUserIds: spaceMemberUserIds.value,
  sceneParticipantsByScene: sceneParticipantsByScene.value, spaceMembersBySpace: spaceMembersBySpace.value,
  personUserBindings: people.value.filter(person => person.linkedUserId && person.status === 'active').map(person => ({ personId: person.calmyId, userId: person.linkedUserId! }))
}))
const selectedThing = computed(() => things.value.find(item => item.calmyId === context.value.thingId))
const selectedScene = computed(() => scenes.value.find(item => item.calmyId === context.value.sceneId))
const thingScenes = computed(() => selectedThing.value
  ? scenes.value.filter(item => item.thingId === selectedThing.value!.calmyId).sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || (a.startedAt ?? 0) - (b.startedAt ?? 0) || a.calmyId.localeCompare(b.calmyId))
  : [])
const overviewScenes = computed(() => selectedScene.value ? [selectedScene.value] : thingScenes.value)
const overviewParticipants = computed(() => {
  const sceneIds = new Set(overviewScenes.value.map(item => item.calmyId))
  const personIds = new Set(participants.value.filter(item => sceneIds.has(item.sceneId) && item.leftAt === undefined).map(item => item.personId))
  return people.value.filter(person => personIds.has(person.calmyId) && person.status === 'active')
})
const overviewGroups = computed(() => {
  const categories: Array<{ label: string; types: string[] }> = [
    { label: '待处理', types: ['action', 'task', 'today'] },
    { label: '费用', types: ['transaction'] },
    { label: '记录', types: ['record', 'diary'] },
    { label: '文件与资料', types: ['resource', 'asset'] }
  ]
  const claimed = new Set<string>()
  const groups = categories.map(category => {
    const items = view.value.visible.filter(item => category.types.includes(item.entityType))
    for (const item of items) claimed.add(`${item.entityType}:${item.calmyId}`)
    return { label: category.label, items }
  }).filter(group => group.items.length)
  const other = view.value.visible.filter(item => !claimed.has(`${item.entityType}:${item.calmyId}`))
  if (other.length) groups.push({ label: '相关内容', items: other })
  return groups
})
const overviewTitle = computed(() => selectedThing.value ? `${selectedThing.value.title}概览` : selectedScene.value ? `${selectedScene.value.title}概览` : '')

function statusLabel(status: string): string {
  const labels: Record<string, string> = { draft: '草稿', active: '进行中', paused: '已暂停', completed: '已完成', archived: '已归档', closed: '已关闭' }
  return labels[status] || status
}

function perspective(document: RealityDocument): string {
  const ownership = document.ownership
  const userId = session?.user.id
  if (ownership?.ownerRef.type === 'user' && ownership.ownerRef.id === userId
    || ownership?.coOwnerRefs?.some(ref => ref.type === 'user' && ref.id === userId)
    || people.value.some(person => person.linkedUserId === userId && person.status === 'active'
      && (ownership?.ownerRef.type === 'person' && ownership.ownerRef.id === person.calmyId
        || ownership?.coOwnerRefs?.some(ref => ref.type === 'person' && ref.id === person.calmyId)))) return '所有者视图'
  if (ownership?.subjectRef?.entityType === 'person' && people.value.some(person => person.calmyId === ownership.subjectRef?.calmyId && person.linkedUserId === session?.user.id)) return '主体人物视图'
  if (context.value.sceneId && participantUserIds.value.includes(userId || '')) return '场景参与者视图'
  return '授权查看视图'
}

function accessReason(document: RealityDocument): string {
  const decision = view.value.decisions.find(item => item.documentId === document.calmyId)
  const permission = decision?.permissionDecision
  if (permission?.decisiveRule === 'ownership-owner') return '当前账号是这份资料的所有者'
  const actionLabels = { view: '查看', comment: '评论', edit: '编辑', manage: '管理' } as const
  const action = actionLabels[permission?.action || 'view']
  if (permission?.decisiveRule === 'explicit-allow') return `已明确授予当前账号${action}权限`
  if (permission?.decisiveRule === 'inherited-allow') {
    const scope = scopes.value.find(item => item.calmyId === permission.matchedScopeId)
    const labels = [
      scope?.personId && `人物「${people.value.find(item => item.calmyId === scope.personId)?.displayName || '已关联人物'}」`,
      scope?.domainId && `领域「${domains.value.find(item => item.calmyId === scope.domainId)?.displayName || '已关联领域'}」`,
      scope?.thingId && `事情「${things.value.find(item => item.calmyId === scope.thingId)?.title || '已关联事情'}」`,
      scope?.sceneId && `情境「${scenes.value.find(item => item.calmyId === scope.sceneId)?.title || '已关联情境'}」`,
      scope?.spaceId && `空间「${spaces.value.find(item => item.calmyId === scope.spaceId)?.title || '已关联空间'}」`
    ].filter((label): label is string => !!label)
    const contextLabel = labels.length ? labels.join('、') : permission.contextLevel === 'scene' ? '当前情境' : permission.contextLevel === 'space' ? '当前空间' : '当前数据范围'
    return `通过${contextLabel}获得${action}权限`
  }
  const reason = decision?.reason
  const labels: Record<string, string> = {
    'The current User owns this Entity': '当前账号是这份资料的所有者',
    'An explicit entity permission allows this action': '这份资料已明确授予当前账号此权限',
    'An attached Scope permission allows this action': '当前账号通过关联的数据范围获得此权限'
  }
  return (reason && labels[reason]) || '当前账号权限已确认'
}

function historyKey(document: RealityDocument): string { return `${document.entityType}:${document.calmyId}` }

function permissionRef(document: RealityDocument): EntityRef | undefined {
  const allowed = new Set(['person', 'important_date', 'organization', 'relationship', 'shared_space', 'cycle', 'stage', 'resource', 'relation', 'seed', 'insight', 'outcome', 'practice', 'daily_state', 'asset', 'scene', 'scene_participant', 'space', 'domain', 'thing', 'matter', 'action', 'record', 'today', 'transaction', 'diary', 'diary_entry', 'goal', 'post'])
  const entityType = document.entityType === 'transaction' ? 'finance_entry' : document.entityType === 'diary' ? 'diary_entry' : document.entityType
  return allowed.has(document.entityType) ? { entityType: entityType as EntityRef['entityType'], calmyId: document.calmyId } : undefined
}

async function showHistory(document: RealityDocument): Promise<void> {
  const key = historyKey(document)
  if (historyByDocument.value[key] || historyLoading.value[key]) return
  const ref = permissionRef(document)
  if (!ref) { historyErrors.value[key] = '该类型暂不支持历史查看'; return }
  historyLoading.value[key] = true
  delete historyErrors.value[key]
  try { historyByDocument.value[key] = await listRealityActivityAsync(ref) }
  catch (cause) { historyErrors.value[key] = cause instanceof Error ? cause.message : '历史读取失败' }
  finally { historyLoading.value[key] = false }
}

function activityLabel(activity: RealityActivity): string {
  return activity.source === 'reality_record' ? '现实记录' : activity.source === 'record_revision' ? '记录修订' : activity.source === 'shared_audit' ? '共享审计' : activity.source === 'finance_mutation' ? activity.operation === 'created' ? '财务记录创建' : activity.operation === 'updated' ? '财务内容修订' : '财务归属修订' : activity.source === 'diary_revision' ? '日记修订' : activity.source === 'daily_state_revision' ? activity.operation === 'created' ? '日常状态创建' : '日常状态修订' : activity.source === 'goal_revision' ? '目标修订' : activity.source === 'post_revision' ? '文章修订' : '对象变更'
}

const snapshotFieldLabels: Record<string, string> = {
  title: '标题', displayName: '人物名称', status: '状态', why: '原因', primaryContradiction: '主要矛盾',
  date: '日期', body: '正文', notes: '备注', domain: '领域', roles: '角色', tags: '标签',
  privacy: '隐私范围', ownerRef: '所有者', currentStage: '当前阶段', trajectory: '趋势',
  load: '负荷', actualTimeMinutes: '实际时长', resultNote: '结果说明', amountCents: '金额（分）'
}

function snapshotValue(value: unknown): string {
  if (value === undefined) return '未设置'
  if (value === null) return '无'
  if (typeof value === 'string') return `「${value}」`
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (Array.isArray(value)) return value.length ? value.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('、') : '无'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function snapshotChangeSummary(activity: RealityActivity): string {
  if (!('previousSnapshot' in activity) || !activity.previousSnapshot || !activity.snapshot) return ''
  const ignored = new Set(['calmyId', 'entityType', 'createdAt', 'updatedAt', 'revision', 'revisionHistory', 'history', 'source'])
  const keys = new Set([...Object.keys(activity.previousSnapshot), ...Object.keys(activity.snapshot)])
  const changes = [...keys].filter(key => !ignored.has(key)
    && JSON.stringify(activity.previousSnapshot?.[key]) !== JSON.stringify(activity.snapshot?.[key]))
  if (!changes.length) return ''
  const values = (snapshot: Record<string, unknown>) => changes
    .map(key => `${snapshotFieldLabels[key] || key}${snapshotValue(snapshot[key])}`).join(' · ')
  return ` · 修改前：${values(activity.previousSnapshot)} · 修改后：${values(activity.snapshot)}`
}

function activityAttribution(activity: RealityActivity): string {
  if (!('actor' in activity) || !activity.actor) return ''
  const labels: Record<string, string> = { user: '用户', import: '导入', sync: '同步', ai_assisted: 'AI 协助' }
  const actor = 'actorUserId' in activity && activity.actorUserId ? ` · 操作人：${activity.actorUserId}` : ''
  return ` · 来源：${labels[activity.actor] || activity.actor}${actor}`
}

function activitySummary(activity: RealityActivity): string {
  if (activity.source === 'reality_record') return activity.body
  if (activity.source === 'record_revision') return `版本 ${activity.recordRevision} · ${activity.reason} · ${activity.body}`
  if (activity.source === 'diary_revision') return `${activity.operation} · 版本 ${activity.fromRevision} → ${activity.toRevision} · ${activity.patch.content}`
  if (activity.source === 'daily_state_revision') {
    const patch = activity.patch
    const body = ({ good: '良好', normal: '一般', tired: '疲惫', bad: '很差' } as const)[patch.bodyState]
    const mental = ({ clear: '清晰', normal: '一般', heavy: '沉重', overloaded: '超载' } as const)[patch.mentalState]
    const trajectory = ({ advancing: '前进', stable: '稳定', stalled: '停滞', retreating: '退步', diverging: '偏离', lost: '迷失', recovering: '恢复中', restarting: '重新开始', unknown: '未记录' } as const)[patch.trajectory]
    return `版本 ${activity.fromRevision} → ${activity.toRevision} · 身体 ${body} · 心理 ${mental} · 负荷 ${patch.load}% · 趋势 ${trajectory}`
  }
  if (activity.source === 'goal_revision') { const patch = activity.patch as { title?: string; progress?: number } | undefined; return `${activity.operation} · 版本 ${activity.fromRevision} → ${activity.toRevision} · ${patch?.title || '目标'} · ${patch?.progress ?? 0}%` }
  if (activity.source === 'post_revision') { const patch = activity.patch as { title?: string; content?: string } | undefined; return `${activity.operation} · 版本 ${activity.fromRevision} → ${activity.toRevision} · ${patch?.title || '文章'} · ${(patch?.content || '').slice(0, 160)}` }
  if (activity.source === 'finance_mutation') { const patch = activity.patch as { snapshot?: { category?: string; type?: string; amountCents?: number; note?: string } } | undefined; const entry = patch?.snapshot; return `${activity.operation} · 版本 ${activity.fromRevision} → ${activity.toRevision}${entry ? ` · ${entry.type === 'income' ? '收入' : '支出'} ${entry.category || '其他'} ${entry.amountCents ?? ''} 分${entry.note ? ` · ${entry.note}` : ''}` : ''}` }
  if (activity.fromRevision === undefined || activity.toRevision === undefined) return activity.operation
  return `${activity.operation} · 版本 ${activity.fromRevision} → ${activity.toRevision}${activityAttribution(activity)}${snapshotChangeSummary(activity)}`
}

async function refresh(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [docs, rules, scopeRows, participantRows, personRows, spaceRows, relationRows, sceneRows, thingRows, domainRows] = await Promise.all([
      listRealityDocumentsAsync(), unifiedAsyncRepository.list<Permission>('permission'), unifiedAsyncRepository.list<Scope>('scope'),
      unifiedAsyncRepository.list<SceneParticipant>('scene_participant'), unifiedAsyncRepository.list<Person>('person'), unifiedAsyncRepository.list<Space>('space'),
      unifiedAsyncRepository.list<Relation>('relation'), unifiedAsyncRepository.list<Scene>('scene'), matterAsyncRepository.list(),
      unifiedAsyncRepository.list<Domain>('domain')
    ])
    documents.value = docs
    permissions.value = rules
    scopes.value = scopeRows
    participants.value = participantRows
    people.value = personRows
    spaces.value = spaceRows
    relations.value = relationRows
    scenes.value = sceneRows
    things.value = thingRows
    domains.value = domainRows
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '情境视图读取失败'
  } finally { loading.value = false }
}

onMounted(() => void refresh())
</script>

<template>
  <header class="slide-head">
    <div class="head-main">
      <p class="hint">现实视图 · Context</p>
      <div class="head-title-row">
        <h2 v-if="loading">正在核对资料范围…</h2>
        <h2 v-else-if="error">情境视图暂时无法读取。</h2>
        <h2 v-else-if="!view.visible.length">当前情境没有已授权的资料。</h2>
        <h2 v-else>有 <em>{{ view.visible.length }}</em> 份资料可以查看。</h2>
        <span class="info" tabindex="0" data-tip="组合人物、领域、事情、情境、空间或时间，查看同一批资料中当前账号有权访问的部分。参与与成员关系本身不开放访问。" aria-label="情境视图说明">i</span>
      </div>
    </div>
  </header>

    <p v-if="loading" class="dim" role="status">正在核对资料范围…</p>
    <section v-else-if="error" class="panel context-error" role="alert"><b>情境视图暂时无法读取</b><p class="dim">{{ error }}</p><button class="chip" type="button" @click="refresh">重试</button></section>
    <template v-else>
      <LbCollapsible block="contextFilters" :rank="2">
        <LbPanel title="筛选" note="人物参与和空间成员关系本身不会开放访问">
      <form class="context-filters" aria-label="现实情境筛选" @submit.prevent="void applyContextSelection()">
        <label>人物<select v-model="selectedPersonId" aria-label="选择人物上下文"><option value="">所有人物</option><option v-for="item in people" :key="item.calmyId" :value="item.calmyId">{{ item.displayName }}{{ item.status === 'archived' ? '（已归档）' : '' }}</option></select></label>
        <label>领域<select v-model="selectedDomainId" aria-label="选择领域上下文"><option value="">所有领域</option><option v-for="item in domains" :key="item.calmyId" :value="item.calmyId">{{ item.displayName }}{{ item.status === 'retired' ? '（已停用）' : '' }}</option></select></label>
        <label>事情<select v-model="selectedThingId" aria-label="选择事情上下文"><option value="">所有事情</option><option v-for="item in things" :key="item.calmyId" :value="item.calmyId">{{ item.title }}{{ item.status === 'archived' ? '（已归档）' : '' }}</option></select></label>
        <label>情境<select v-model="selectedSceneId" aria-label="选择情境上下文"><option value="">所有情境</option><option v-for="item in scenes" :key="item.calmyId" :value="item.calmyId">{{ item.title }}{{ item.status === 'archived' ? '（已归档）' : '' }}</option></select></label>
        <label>空间<select v-model="selectedSpaceId" aria-label="选择空间上下文"><option value="">所有空间</option><option v-for="item in spaces" :key="item.calmyId" :value="item.calmyId">{{ item.title }}{{ item.status === 'archived' ? '（已归档）' : '' }}</option></select></label>
        <label>时间<input v-model="selectedTimeId" aria-label="选择时间上下文" placeholder="YYYY、YYYY-MM 或 YYYY-MM-DD" /></label>
        <div class="context-filter-actions"><button class="chip on" type="submit" aria-label="应用情境筛选">应用筛选</button><button v-if="hasSelectedContext" class="chip" type="button" @click="selectedPersonId = ''; selectedDomainId = ''; selectedThingId = ''; selectedSceneId = ''; selectedSpaceId = ''; selectedTimeId = ''; void applyContextSelection()">清除筛选</button></div>
        <small v-if="selectionError" role="alert">{{ selectionError }}</small>
      </form>
        </LbPanel>
      </LbCollapsible>
      <p v-if="requestedTimeId" class="dim">时间：{{ requestedTimeId }} · 日期只筛选已关联资料，不改变访问权限。</p>
      <section v-if="overviewTitle" class="panel context-overview" aria-label="情境概览">
        <div class="overview-heading"><div><p class="eyebrow">同一事情与现实情境</p><h2>{{ overviewTitle }}</h2></div><span class="status-chip">{{ statusLabel(selectedThing?.status || selectedScene?.status || '') }}</span></div>
        <div v-if="overviewScenes.length" class="overview-section"><h3>相关情境</h3><ul><li v-for="scene in overviewScenes" :key="scene.calmyId"><span>{{ scene.title }}</span><small>{{ statusLabel(scene.status) }}</small></li></ul></div>
        <div class="overview-section"><h3>参与的人</h3><p v-if="overviewParticipants.length">{{ overviewParticipants.map(person => person.displayName).join('、') }}</p><p v-else class="dim">暂时没有记录中的参与者。</p></div>
        <div v-for="group in overviewGroups" :key="group.label" class="overview-section"><h3>{{ group.label }} <small>({{ group.items.length }})</small></h3><ul><li v-for="document in group.items" :key="`${document.entityType}:${document.calmyId}`"><RouterLink :to="document.route">{{ document.title }}</RouterLink><small>{{ document.summary }}</small></li></ul></div>
        <p v-if="!overviewGroups.length" class="dim">当前情境没有可显示的已授权资料。</p>
      </section>
      <section aria-label="当前允许查看的资料" class="context-documents">
      <article v-for="item in view.visible" :key="`${item.source}:${item.entityType}:${item.calmyId}`" class="panel context-document">
        <div><p class="eyebrow">{{ perspective(item) }}</p><h2>{{ item.title }}</h2><p>{{ item.summary }}</p><small class="access-reason">{{ accessReason(item) }}</small></div>
        <div class="context-actions"><RouterLink class="chip" :to="item.route">打开资料</RouterLink><button class="chip" type="button" :aria-label="`查看${item.title}的历史`" @click="showHistory(item)">查看历史</button></div>
        <section v-if="historyLoading[historyKey(item)] || historyByDocument[historyKey(item)] || historyErrors[historyKey(item)]" class="history-panel" :aria-label="`${item.title}的历史`">
          <p v-if="historyLoading[historyKey(item)]" role="status">正在读取历史…</p>
          <p v-else-if="historyErrors[historyKey(item)]" role="alert">历史暂时无法读取：{{ historyErrors[historyKey(item)] }} <button class="chip" type="button" @click="void showHistory(item)">重试</button></p>
          <ul v-else><li v-for="activity in historyByDocument[historyKey(item)]" :key="activity.originalId"><b>{{ activityLabel(activity) }}</b><span>{{ activitySummary(activity) }}</span><time>{{ new Date(activity.occurredAt).toLocaleString() }}</time></li><li v-if="!historyByDocument[historyKey(item)]?.length">暂无历史。</li></ul>
        </section>
      </article>
      <p v-if="!view.visible.length" class="dim">当前情境没有已授权的资料。未知权限和未绑定账号的参与记录默认不可见。</p>
      </section>
    </template>
</template>

<style scoped>
/* 页面局部排版：颜色取「留白」令牌。.context-filters 是 parity 测试的钩子（触发 submit），类名保留。 */
.context-error { border-color: color-mix(in srgb, var(--danger) 45%, transparent); }
.context-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); align-items: end; gap: 10px; }
.context-filters label { display: grid; gap: 5px; color: var(--muted); font-size: .72rem; }
.context-filters select, .context-filters input { min-height: 34px; padding: 6px 10px; font: inherit; font-size: .8rem; }
.context-filter-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.context-overview { gap: 14px; }
.overview-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.overview-heading h2 { margin: 0; font-size: 1rem; font-weight: 600; }
.overview-heading .eyebrow { margin: 0 0 4px; }
.status-chip { border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px; color: var(--muted); font-size: .72rem; }
.overview-section h3 { font-size: .9rem; font-weight: 600; margin: 0 0 6px; }
.overview-section h3 small, .overview-section li small { color: var(--muted); font-size: .75rem; }
.overview-section p { margin: 0; font-size: .82rem; }
.overview-section ul { display: grid; gap: 7px; list-style: none; padding: 0; margin: 0; }
.overview-section li { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; font-size: .82rem; }
.overview-section li small { margin-left: auto; }
.context-documents { display: grid; gap: 10px; }
.context-document { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px; }
.context-document h2 { margin: 0 0 6px; font-size: 1rem; font-weight: 600; }
.context-document p { margin: 0 0 6px; font-size: .82rem; color: var(--muted); }
.context-document .eyebrow, .access-reason { color: var(--muted); font-size: .72rem; }
.context-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.history-panel { grid-column: 1 / -1; border-top: 1px solid var(--line); padding-top: 10px; }
.history-panel ul { display: grid; gap: 8px; list-style: none; padding: 0; margin: 0; }
.history-panel li { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; font-size: .8rem; }
.history-panel time { margin-left: auto; color: var(--muted); font-size: .72rem; }
@media (max-width: 640px) {
  .context-document { grid-template-columns: 1fr; align-items: start; }
}
</style>
