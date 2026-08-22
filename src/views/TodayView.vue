<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { todayKey } from '@/core/storage'
import { matterAsyncRepository } from '@/domain/matter/repository'
import { actionAsyncRepository } from '@/domain/action/repository'
import { recordAsyncRepository } from '@/domain/record/repository'
import { todayAsyncRepository } from '@/domain/today/repository'
import type { TodayLoad, TodayPatch, TodayPlan } from '@/domain/today/model'
import { evaluateConstraints } from '@/domain/constraints'
import { unifiedFactories, unifiedAsyncRepository, type DailyState } from '@/domain/unified'
import type { NegativeRecordImpact } from '@/domain/record/model'
import { listRealityDocuments } from '@/domain/reality'

const router = useRouter(); const date = todayKey(); const tick = ref(0); const loading = ref(true); const saving = ref(false)
function emptyPlan(): TodayPlan { return { date, load: null, focusActionIds: [], why: '', mustProtect: [], letGo: [], review: { observation: '', analysis: '', adjustment: '', seed: '' }, revision: 1, updatedAt: Date.now() } }
const plan = ref<TodayPlan>(emptyPlan()); const actionItems = ref<Awaited<ReturnType<typeof actionAsyncRepository.listForDate>>>([]); const matterItems = ref<Awaited<ReturnType<typeof matterAsyncRepository.list>>>([]); const relationships = ref<import('@/domain/unified').Relationship[]>([]); const sharedSpaces = ref<import('@/domain/unified').SharedSpace[]>([]); const actionTitle = ref(''); const selectedMatterId = ref(''); const recordBody = ref(''); const recordMatterId = ref('')
const dailyState = ref<DailyState>(unifiedFactories.dailyState({ date, bodyState: 'normal', mentalState: 'normal', load: 40, trajectory: 'stable', protectedItems: [] }))
const bodyState = ref(dailyState.value.bodyState); const mentalState = ref(dailyState.value.mentalState)
const recordType = ref<'fact' | 'negative'>('fact'); const negativeImpact = ref<NegativeRecordImpact>('other')
const why = ref(plan.value.why); const mustProtect = ref(plan.value.mustProtect.join('\n')); const letGo = ref(plan.value.letGo.join('\n'))
const observation = ref(plan.value.review.observation); const analysis = ref(plan.value.review.analysis); const adjustment = ref(plan.value.review.adjustment); const seed = ref(plan.value.review.seed)
const matters = computed(() => { void tick.value; return matterItems.value.filter(item => item.status === 'active' || item.status === 'paused') })
function dayStart(value: string): number { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day).getTime() }
function dayEnd(value: string): number { return dayStart(value) + 24 * 60 * 60 * 1000 - 1 }
const realityDocuments = computed(() => {
  void tick.value
  return listRealityDocuments({ types: ['action', 'record', 'today', 'daily_state'], from: dayStart(date), to: dayEnd(date) })
})
const actions = computed(() => {
  void tick.value
  const actionIds = new Set(realityDocuments.value.filter(item => item.entityType === 'action').map(item => item.id))
  return actionItems.value.filter(item => actionIds.has(item.calmyId))
})
const focusActions = computed(() => actions.value.filter(item => plan.value.focusActionIds.includes(item.calmyId)))
const optionalActions = computed(() => actions.value.filter(item => !plan.value.focusActionIds.includes(item.calmyId)))

async function refresh(): Promise<void> {
  loading.value = true
  try {
    const [nextPlan, nextActions, nextMatters, nextRelationships, nextSpaces, nextDailyStates] = await Promise.all([
      todayAsyncRepository.get(date), actionAsyncRepository.listForDate(date), matterAsyncRepository.list(),
      unifiedAsyncRepository.list<import('@/domain/unified').Relationship>('relationship'), unifiedAsyncRepository.list<import('@/domain/unified').SharedSpace>('shared_space'), unifiedAsyncRepository.list<DailyState>('daily_state')
    ])
    plan.value = nextPlan; actionItems.value = nextActions; matterItems.value = nextMatters
    relationships.value = nextRelationships.filter(item => item.status === 'active'); sharedSpaces.value = nextSpaces.filter(item => item.status === 'active')
    const nextState = nextDailyStates.find(item => item.date === date)
    if (nextState) dailyState.value = nextState
    bodyState.value = dailyState.value.bodyState; mentalState.value = dailyState.value.mentalState
    why.value = plan.value.why; mustProtect.value = plan.value.mustProtect.join('\n'); letGo.value = plan.value.letGo.join('\n')
    observation.value = plan.value.review.observation; analysis.value = plan.value.review.analysis; adjustment.value = plan.value.review.adjustment; seed.value = plan.value.review.seed
    tick.value++
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : 'Today 读取失败') }
  finally { loading.value = false }
}
async function savePlan(patch: TodayPatch): Promise<void> {
  saving.value = true
  try { plan.value = await todayAsyncRepository.update(date, patch, plan.value.revision); tick.value++ }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : 'Today 保存失败') }
  finally { saving.value = false }
}
function loadScore(load: TodayLoad | null): number { return load === 'bad' ? 90 : load === 'tired' ? 65 : load === 'good' ? 20 : 40 }
async function saveDailyState(patch: Partial<Pick<DailyState, 'bodyState' | 'mentalState' | 'load' | 'protectedItems' | 'trajectory'>>): Promise<void> {
  try {
    const current = (await unifiedAsyncRepository.list<DailyState>('daily_state')).find(item => item.date === date)
    dailyState.value = current
      ? await unifiedAsyncRepository.update<DailyState>('daily_state', current.calmyId, patch, { expectedRevision: current.revision })
      : await unifiedAsyncRepository.create(unifiedFactories.dailyState({ ...dailyState.value, ...patch }))
    bodyState.value = dailyState.value.bodyState; mentalState.value = dailyState.value.mentalState; tick.value++
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '今日容量保存失败') }
}
async function setLoad(load: TodayLoad): Promise<void> { await savePlan({ load }); await saveDailyState({ bodyState: load, load: loadScore(load) }) }
async function setBodyState(value: DailyState['bodyState']): Promise<void> { bodyState.value = value; await saveDailyState({ bodyState: value, load: loadScore(value) }); await savePlan({ load: value }) }
async function setMentalState(value: DailyState['mentalState']): Promise<void> { mentalState.value = value; await saveDailyState({ mentalState: value }) }
async function saveOpening(): Promise<void> { await savePlan({ why: why.value.trim(), mustProtect: lines(mustProtect.value), letGo: lines(letGo.value) }); ElMessage.success('今日方向已保存') }
function lines(value: string): string[] { return value.split('\n').map(item => item.trim()).filter(Boolean) }
async function addAction(): Promise<void> {
  if (!actionTitle.value.trim()) { ElMessage.warning('先写下一个行动'); return }
  const action = await actionAsyncRepository.create({ title: actionTitle.value, date, matterId: selectedMatterId.value || undefined })
  const focus = plan.value.focusActionIds.length < 3 ? [...plan.value.focusActionIds, action.calmyId] : plan.value.focusActionIds
  await savePlan({ focusActionIds: focus }); await refresh(); actionTitle.value = ''; selectedMatterId.value = ''; ElMessage.success(focus.includes(action.calmyId) ? '已加入今日核心行动' : '已加入候选行动')
}
function toggleFocus(id: string) {
  const focus = plan.value.focusActionIds.includes(id) ? plan.value.focusActionIds.filter(item => item !== id) : plan.value.focusActionIds.length < 3 ? [...plan.value.focusActionIds, id] : plan.value.focusActionIds
  savePlan({ focusActionIds: focus })
}
async function complete(actionId: string): Promise<void> { const item = actionItems.value.find(action => action.calmyId === actionId); if (!item) return; if (item.status === 'done') await actionAsyncRepository.reopen(actionId, item.revision); else await actionAsyncRepository.complete(actionId, undefined, item.revision); await refresh() }
async function skip(actionId: string): Promise<void> { const item = actionItems.value.find(action => action.calmyId === actionId); if (!item) return; if (item.status === 'skipped') await actionAsyncRepository.reopen(actionId, item.revision); else await actionAsyncRepository.skip(actionId, undefined, item.revision); await refresh() }
async function addRecord(): Promise<void> { if (!recordBody.value.trim()) { ElMessage.warning('先写下今天实际发生了什么'); return }; await recordAsyncRepository.create({ body: recordBody.value, type: recordType.value, impact: recordType.value === 'negative' ? negativeImpact.value : undefined, matterId: recordMatterId.value || undefined }); recordBody.value = ''; recordMatterId.value = ''; ElMessage.success(recordType.value === 'negative' ? '已记录负向变化' : '已记录现实'); await refresh() }
async function saveReview(): Promise<void> { await savePlan({ review: { observation: observation.value.trim(), analysis: analysis.value.trim(), adjustment: adjustment.value.trim(), seed: seed.value.trim() } }); ElMessage.success('复盘已保存') }
function onDataSynced(): void { void refresh() }
onMounted(() => { void refresh(); window.addEventListener('beryl-data-synced', onDataSynced) })
onUnmounted(() => window.removeEventListener('beryl-data-synced', onDataSynced))
const constraintEvaluation = computed(() => {
  void tick.value
  const preferredMatter = focusActions.value.map(item => item.matterId).find(Boolean)
  const candidates = actions.value
    .filter(item => !['done', 'cancelled'].includes(item.status))
    .map(item => {
      const matterId = item.matterId
      return {
        actionId: item.calmyId,
        title: item.title,
        estimatedMinutes: 25,
        intensity: plan.value.focusActionIds.includes(item.calmyId) ? 'normal' as const : 'minimum' as const,
        matterId,
        trajectory: matters.value.find(matter => matter.calmyId === matterId)?.trajectory,
        relationshipIds: matterId ? relationships.value.filter(relationship => relationship.blockedMatterIds?.includes(matterId) || relationship.allowedMatterIds?.includes(matterId)).map(relationship => relationship.calmyId) : [],
        sharedSpaceIds: matterId ? sharedSpaces.value.filter(space => space.blockedMatterIds?.includes(matterId) || space.allowedMatterIds?.includes(matterId)).map(space => space.calmyId) : []
      }
    })
  return evaluateConstraints({
    bodyState: bodyState.value,
    mentalState: mentalState.value,
    load: dailyState.value.load,
    availableMinutes: 120,
    protectedMinutes: plan.value.mustProtect.length * 15,
    preferredTrajectory: matters.value.find(item => item.calmyId === preferredMatter)?.trajectory,
    relationshipBoundaries: relationships.value.map(item => ({ boundaryId: item.calmyId, label: item.label, blockedMatterIds: item.blockedMatterIds, allowedMatterIds: item.allowedMatterIds })),
    sharedSpaceBoundaries: sharedSpaces.value.map(item => ({ boundaryId: item.calmyId, label: item.title, blockedMatterIds: item.blockedMatterIds, allowedMatterIds: item.allowedMatterIds })),
    actionCandidates: candidates
  })
})
</script>

<template>
  <div class="today-page">
    <header class="page-head"><div><p class="eyebrow">TODAY · {{ date }}</p><h1 class="font-title">今天先定向</h1><p>知道为什么做，也知道今天什么可以不做。</p></div><div class="today-status"><span v-if="loading" role="status" aria-live="polite">正在读取本机数据…</span><span v-else-if="saving" role="status" aria-live="polite">正在保存…</span><div class="load-pill" :class="plan.load || 'unset'">{{ plan.load ? ({ good: '很好', normal: '普通', tired: '疲惫', bad: '很差' } as Record<string, string>)[plan.load] : '还没设置承载' }}</div></div></header>

<section class="opening beryl-card"><div class="panel-head"><div><p class="eyebrow">MORNING OPENING</p><h2 class="font-title">今天的三问</h2></div><button @click="saveOpening">保存方向</button></div><label>为什么今天值得做？<textarea v-model="why" aria-label="为什么今天值得做" placeholder="它向上连接哪个 Matter 或长期方向？" /></label><div class="two-col"><label>必须守住<textarea v-model="mustProtect" aria-label="今天必须守住的事项" placeholder="吃饭&#10;睡眠&#10;工作责任" /></label><label>今天可以不做<textarea v-model="letGo" aria-label="今天可以不做的事项" placeholder="新教程&#10;算法&#10;额外整理" /></label></div><div class="load-row" role="group" aria-label="今日承载状态"><span>今日承载</span><button v-for="item in ([['good','很好'],['normal','普通'],['tired','疲惫'],['bad','很差']] as const)" :key="item[0]" :class="{ on: plan.load === item[0] }" :aria-pressed="plan.load === item[0]" @click="setLoad(item[0])">{{ item[1] }}</button></div></section>

    <section class="capacity-panel beryl-card"><div class="panel-head"><div><p class="eyebrow">CAPACITY CHECK</p><h2 class="font-title">先确认今天能承载什么</h2></div><span>{{ constraintEvaluation.reducedIntensity ? '已自动降低建议强度' : '按正常容量安排' }} · 已连接 {{ realityDocuments.length }} 条现实</span></div><div class="capacity-grid"><div><small>身体状态</small><div class="choice-row"><button v-for="item in ([['good','好'],['normal','普通'],['tired','疲惫'],['bad','很差']] as const)" :key="item[0]" :class="{ on: bodyState === item[0] }" @click="setBodyState(item[0])">{{ item[1] }}</button></div></div><div><small>心理负荷</small><div class="choice-row"><button v-for="item in ([['clear','清晰'],['normal','普通'],['heavy','沉重'],['overloaded','过载']] as const)" :key="item[0]" :class="{ on: mentalState === item[0] }" @click="setMentalState(item[0])">{{ item[1] }}</button></div></div></div><div v-if="constraintEvaluation.findings.length" class="constraint-note"><b>今天先保护容量</b><article v-for="finding in constraintEvaluation.findings" :key="finding.id" class="constraint-finding"><span>{{ finding.explanation }}</span><small>{{ finding.minimumAdjustment }}</small><em>{{ finding.evidence.join(' · ') }}</em></article><small v-if="constraintEvaluation.suggestedActionIds.length">建议先做：{{ actions.find(item => item.calmyId === constraintEvaluation.suggestedActionIds[0])?.title || '一个最小行动' }}</small></div></section>

<section class="action-create beryl-card"><div class="panel-head"><div><p class="eyebrow">MINIMUM ACTION</p><h2 class="font-title">添加今日行动</h2></div><span>核心行动最多 3 个</span></div><div class="create-row"><el-input v-model="actionTitle" aria-label="今日行动标题" placeholder="例如：完成 JwtService 最小实现" @keyup.enter="addAction" /><select v-model="selectedMatterId" aria-label="行动关联 Matter"><option value="">不关联 Matter</option><option v-for="item in matters" :key="item.calmyId" :value="item.calmyId">{{ item.title }}</option></select><button @click="addAction">添加</button></div></section>

    <div class="action-grid"><section class="action-section"><div class="section-head"><div><p class="eyebrow">FOCUS</p><h2 class="font-title">真正重要</h2></div><span>{{ focusActions.length }}/3</span></div><article v-for="item in focusActions" :key="item.calmyId" class="action-card beryl-card"><button class="check" :class="item.status" :aria-label="item.status === 'done' ? '重新打开行动' : '完成行动'" @click="complete(item.calmyId)">{{ item.status === 'done' ? '✓' : '' }}</button><div class="action-copy"><b>{{ item.title }}</b><small v-if="item.matterId" @click="router.push('/app/matters/' + item.matterId)">连接 Matter →</small><small v-else>未连接 Matter</small></div><button class="skip" @click="skip(item.calmyId)">{{ item.status === 'skipped' ? '恢复' : '跳过' }}</button></article><p v-if="!focusActions.length" class="empty-copy">先添加一个今天真正重要的行动。</p></section><section class="action-section"><div class="section-head"><div><p class="eyebrow">OPTIONAL</p><h2 class="font-title">有余力再做</h2></div><span>{{ optionalActions.length }}</span></div><article v-for="item in optionalActions" :key="item.calmyId" class="action-card optional beryl-card"><button class="check" :class="item.status" @click="complete(item.calmyId)">{{ item.status === 'done' ? '✓' : '' }}</button><div class="action-copy"><b>{{ item.title }}</b><small>候选行动</small></div><button class="skip" @click="toggleFocus(item.calmyId)">设为核心</button></article><p v-if="!optionalActions.length" class="empty-copy">超出 3 个核心行动的内容会显示在这里。</p></section></div>

<section class="record-panel beryl-card"><div class="panel-head"><div><p class="eyebrow">REALITY RECORD</p><h2 class="font-title">记录今天实际发生了什么</h2></div><span>先记录，不急着评价</span></div><div class="record-row"><el-input v-model="recordBody" aria-label="现实记录内容" type="textarea" :rows="2" placeholder="学习了多久、状态如何、哪里偏离了计划？" /><select v-model="recordType" aria-label="记录类型"><option value="fact">事实/观察</option><option value="negative">负向变化</option></select><select v-if="recordType === 'negative'" v-model="negativeImpact" aria-label="负向变化类型"><option value="waste">浪费</option><option value="escape">逃避</option><option value="retreat">退缩</option><option value="loss">损耗</option><option value="other">其他</option></select><select v-model="recordMatterId" aria-label="记录关联 Matter"><option value="">不关联 Matter</option><option v-for="item in matters" :key="item.calmyId" :value="item.calmyId">{{ item.title }}</option></select><button @click="addRecord">保存记录</button></div></section>

    <section class="review-panel beryl-card"><div class="panel-head"><div><p class="eyebrow">EVENING REVIEW</p><h2 class="font-title">观 → 察 → 调 → Seed</h2></div><button @click="saveReview">保存复盘</button></div><div class="review-grid"><label>观：事实<textarea v-model="observation" placeholder="今天实际完成了什么？时间流向哪里？" /></label><label>察：条件<textarea v-model="analysis" placeholder="哪些条件影响了行动？" /></label><label>调：明天怎么调整<textarea v-model="adjustment" placeholder="继续、减量、暂停还是换方法？" /></label><label>Seed：留下什么<textarea v-model="seed" placeholder="经验、问题、损耗或下一轮起点" /></label></div></section>
  </div>
</template>

<style scoped>
.page-head{display:flex;align-items:end;justify-content:space-between;margin:6px 0 28px}.eyebrow{font-size:10px;letter-spacing:.13em;color:var(--scene);font-weight:700;margin:0 0 8px}.page-head h1{font-size:clamp(34px,4vw,48px);line-height:1;margin:0;letter-spacing:-.035em}.page-head p:last-child{margin:11px 0 0;font-size:13px;color:var(--c-text-2)}.load-pill{font-size:11px;padding:8px 12px;border-radius:99px;background:var(--scene-soft);color:var(--scene)}.load-pill.unset{color:var(--c-text-3);background:var(--c-hover)}.opening,.action-create,.capacity-panel{padding:18px;margin-bottom:18px}.panel-head,.section-head{display:flex;align-items:start;justify-content:space-between;gap:12px}.panel-head h2,.section-head h2{font-size:23px;margin:0}.panel-head>span,.section-head>span{font-size:10px;color:var(--c-text-3)}.panel-head button,.record-footer button,.create-row button,.record-row button{border:1px solid var(--c-border);background:var(--c-card);border-radius:8px;padding:7px 11px;color:var(--c-text);cursor:pointer;font-size:12px}.panel-head button:hover,.create-row button:hover,.record-row button:hover{border-color:var(--scene);color:var(--scene)}label{display:grid;gap:6px;font-size:11px;color:var(--c-text-2);margin-top:14px}textarea{width:100%;min-height:54px;resize:vertical;border:1px solid var(--c-border);border-radius:9px;background:var(--c-bg);color:var(--c-text);padding:9px;font:inherit;font-size:12px;line-height:1.55;box-sizing:border-box}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px}.load-row{display:flex;align-items:center;gap:6px;margin-top:14px;font-size:11px;color:var(--c-text-2)}.load-row span{margin-right:5px}.load-row button{border:1px solid var(--c-border);background:transparent;color:var(--c-text-2);border-radius:99px;padding:5px 9px;font-size:11px;cursor:pointer}.load-row button.on{background:var(--scene-soft);border-color:var(--scene-border-strong);color:var(--scene);font-weight:700}.capacity-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}.capacity-grid>div>small{font-size:11px;color:var(--c-text-3)}.choice-row{display:flex;gap:6px;margin-top:7px;flex-wrap:wrap}.choice-row button{border:1px solid var(--c-border);background:transparent;color:var(--c-text-2);border-radius:99px;padding:5px 9px;font-size:11px;cursor:pointer}.choice-row button.on{background:var(--scene-soft);border-color:var(--scene-border-strong);color:var(--scene);font-weight:700}.constraint-note{display:grid;gap:7px;margin-top:14px;padding:10px 12px;border-radius:9px;background:var(--scene-soft);color:var(--c-text-2);font-size:11px}.constraint-note b{color:var(--scene)}.constraint-note small{color:var(--scene)}.constraint-finding{display:grid;gap:2px;padding-top:5px;border-top:1px solid var(--scene-border)}.constraint-finding em{font-size:9px;color:var(--c-text-3);font-style:normal}.create-row{display:flex;gap:8px;margin-top:14px}.create-row :deep(.el-input){flex:1}.create-row select{width:180px;border:1px solid var(--c-border);border-radius:8px;background:var(--c-bg);color:var(--c-text);padding:0 8px}.action-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.action-section{min-width:0}.section-head{align-items:end;margin:8px 0 11px}.action-card{display:grid;grid-template-columns:25px 1fr auto;align-items:center;gap:10px;padding:13px 14px;margin-bottom:8px}.action-card.optional{opacity:.82}.check{width:20px;height:20px;border:1.5px solid var(--c-border);border-radius:50%;background:transparent;color:white;cursor:pointer}.check.done{border-color:var(--scene);background:var(--scene)}.check.in_progress{border-color:var(--scene);box-shadow:inset 0 0 0 4px var(--c-card)}.action-copy{display:grid;gap:4px;min-width:0}.action-copy b{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.action-copy small{font-size:10px;color:var(--c-text-3);cursor:pointer}.skip{border:0;background:transparent;color:var(--c-text-3);font-size:10px;cursor:pointer}.skip:hover{color:var(--scene)}.empty-copy{font-size:12px;color:var(--c-text-3);padding:22px 4px}.record-panel,.review-panel{padding:18px;margin-top:18px}.record-row{display:grid;grid-template-columns:1fr 130px 150px 180px auto;gap:8px;margin-top:14px}.record-row select{border:1px solid var(--c-border);border-radius:8px;background:var(--c-bg);color:var(--c-text);padding:0 8px}.review-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}.review-grid textarea{min-height:75px}.review-grid label{margin-top:14px}@media(max-width:680px){.two-col,.action-grid,.review-grid,.capacity-grid{grid-template-columns:1fr}.create-row{flex-wrap:wrap}.create-row :deep(.el-input){width:100%;flex:none}.create-row select{flex:1;height:34px}.create-row button{height:34px}.record-row{grid-template-columns:1fr}.record-row select,.record-row button{height:34px}.page-head{display:block}.load-pill{display:inline-block;margin-top:14px}.load-row{flex-wrap:wrap}}
.today-status{display:grid;justify-items:end;gap:7px}.today-status>span{font-size:12px;color:var(--c-text-2)}.check{width:44px;height:44px;display:grid;place-items:center;padding:0}
</style>
