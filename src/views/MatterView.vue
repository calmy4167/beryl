<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { todayKey } from '@/core/storage'
import { actionRepository } from '@/domain/action/repository'
import type { ActionItem } from '@/domain/action/model'
import { matterRepository } from '@/domain/matter/repository'
import { recordRepository } from '@/domain/record/repository'
import type { RealityRecord } from '@/domain/record/model'
import { MatterDomainError } from '@/domain/matter/model'
import { canTransitionCycle, canTransitionStage, unifiedRepository, type Cycle, type CycleStatus, type Outcome, type Practice, type Stage, type StageStatus } from '@/domain/unified'
import { listRealityDocuments } from '@/domain/reality'
import { listSharedBoundariesForMatter, type SharedMatterAccess } from '@/domain/social/shared-context'
import { createSharedAction, createSharedRecord, currentCollaboratorId, sharedWriteAccess, updateSharedMatter } from '@/domain/social/collaboration'

const route = useRoute(); const router = useRouter(); const tick = ref(0)
const recordBody = ref(''); const contradiction = ref(''); const why = ref('')
const cycleTitle = ref(''); const cycleTheme = ref(''); const selectedCycleId = ref('')
const stageTitle = ref(''); const stageElement = ref<Stage['element']>('wood'); const recordStageId = ref('')
const actionTitle = ref(''); const actionDate = ref(todayKey()); const actionStageId = ref('')
const outcomeActionId = ref(''); const outcomeSummary = ref(''); const outcomeResult = ref(''); const practiceOutcomeId = ref(''); const practiceTitle = ref(''); const practiceDescription = ref('')
const matter = computed(() => { void tick.value; return matterRepository.find(String(route.params.id)) })
const history = computed(() => { void tick.value; return matter.value ? matterRepository.mutations(matter.value.calmyId) : [] })
const records = computed(() => {
  void tick.value
  const matterId = matter.value?.calmyId
  if (!matterId) return []
  return recordRepository.listForMatter(matterId)
})
const cycles = computed(() => { void tick.value; return matter.value ? unifiedRepository.listCyclesForMatter(matter.value.calmyId) : [] })
const selectedCycle = computed(() => cycles.value.find(item => item.calmyId === selectedCycleId.value) || cycles.value.find(item => item.calmyId === matter.value?.currentCycleId) || cycles.value[0])
const stages = computed(() => selectedCycle.value ? unifiedRepository.listStagesForCycle(selectedCycle.value.calmyId) : [])
const matterActions = computed(() => {
  void tick.value
  const matterId = matter.value?.calmyId
  if (!matterId) return []
  const actionIds = new Set(listRealityDocuments({ types: ['action'] }).filter(item => item.matterId === matterId).map(item => item.id))
  return actionRepository.listForMatter(matterId).filter(item => actionIds.has(item.calmyId))
})
const actions = computed(() => {
  void tick.value
  const cycleId = selectedCycle.value?.calmyId
  const cycleActionIds = cycleId ? new Set(actionRepository.listForCycle(cycleId).map(item => item.calmyId)) : new Set<string>()
  return matterActions.value.filter(item => cycleActionIds.has(item.calmyId))
})
const outcomes = computed(() => { void tick.value; const matterId = matter.value?.calmyId; const actionIds = new Set(actions.value.map(item => item.calmyId)); return unifiedRepository.list<Outcome>('outcome').filter(item => actionIds.has(item.actionId) || item.matterId === matterId) })
const practices = computed(() => { void tick.value; const matterId = matter.value?.calmyId; const outcomeIds = new Set(outcomes.value.map(item => item.calmyId)); return unifiedRepository.list<Practice>('practice').filter(item => item.matterIds.includes(matterId || '') || item.outcomeIds.some(id => outcomeIds.has(id))) })
const sharedBoundaries = computed(() => { void tick.value; return matter.value ? listSharedBoundariesForMatter(matter.value.calmyId) : [] })
const sharedWriteTargets = computed(() => {
  const actorId = currentCollaboratorId()
  return sharedBoundaries.value.filter(boundary => sharedWriteAccess(boundary.owner, boundary.ownerId, actorId, matter.value?.calmyId).allowed)
})
const outcomeAction = computed(() => actions.value.find(item => item.calmyId === outcomeActionId.value && item.status === 'done'))
const cycleStatusNames: Record<CycleStatus, string> = { planned: '计划中', active: '进行中', paused: '暂停', completed: '完成', archived: '归档' }
const stageStatusNames: Record<StageStatus, string> = { planned: '计划中', active: '进行中', paused: '暂停', completed: '完成', skipped: '跳过' }
const elementNames: Record<Stage['element'], string> = { wood: '木 · 发起', fire: '火 · 推进', earth: '土 · 承载', metal: '金 · 收束', water: '水 · 沉淀' }

function refresh() { tick.value++ }
function saveContext() {
  if (!matter.value) return
  try {
    const target = sharedWriteTargets.value[0]
    if (target) updateSharedMatter(target.owner, target.ownerId, matter.value.calmyId, { why: why.value, primaryContradiction: contradiction.value }, matter.value.revision, currentCollaboratorId())
    else matterRepository.update(matter.value.calmyId, { why: why.value, primaryContradiction: contradiction.value }, { expectedRevision: matter.value.revision })
    ElMessage.success(target ? '已保存，并记录到共享审计' : '已保存'); refresh()
  }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : '保存失败') }
}
function transition(status: 'active' | 'paused' | 'archived') {
  if (!matter.value) return
  try { matterRepository.transition(matter.value.calmyId, status, { expectedRevision: matter.value.revision }); refresh() }
  catch (error) { ElMessage.error(error instanceof MatterDomainError ? error.message : '状态更新失败') }
}
function addRecord() {
  if (!matter.value || !recordBody.value.trim()) { ElMessage.warning('先写下一条真实记录'); return }
  try {
    const input = { body: recordBody.value, matterId: matter.value.calmyId, cycleId: selectedCycle.value?.calmyId, stageId: recordStageId.value || undefined }
    const target = sharedWriteTargets.value[0]
    if (target) createSharedRecord(target.owner, target.ownerId, input, currentCollaboratorId())
    else recordRepository.create(input)
    recordBody.value = ''; refresh(); ElMessage.success(recordStageId.value ? '已记录现实，并归入 Stage' : '已记录现实')
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '记录失败') }
}
function selectCycle(cycle: Cycle): void { selectedCycleId.value = cycle.calmyId; actionStageId.value = ''; recordStageId.value = '' }
function selectStage(stage: Stage): void { actionStageId.value = stage.calmyId; recordStageId.value = stage.calmyId }
function createCycle(): void {
  if (!matter.value || !cycleTitle.value.trim()) { ElMessage.warning('先写下周期标题'); return }
  try {
    const cycle = unifiedRepository.createCycleForMatter({ matterId: matter.value.calmyId, title: cycleTitle.value, theme: cycleTheme.value || cycleTitle.value, currentStage: 'wood', status: 'planned', trajectory: 'stable', stageIds: [] })
    matterRepository.bindCycle(matter.value.calmyId, cycle.calmyId, { expectedRevision: matter.value.revision })
    cycleTitle.value = ''; cycleTheme.value = ''; selectedCycleId.value = cycle.calmyId; refresh(); ElMessage.success('Cycle 已绑定到 Matter')
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '创建 Cycle 失败') }
}
function createStage(): void {
  if (!selectedCycle.value || !stageTitle.value.trim()) { ElMessage.warning('先选择 Cycle 并写下阶段标题'); return }
  try {
    const stage = unifiedRepository.createStageForCycle({ cycleId: selectedCycle.value.calmyId, title: stageTitle.value, element: stageElement.value, status: 'planned', actionIds: [], recordIds: [], order: stages.value.length + 1 })
    stageTitle.value = ''; actionStageId.value = stage.calmyId; recordStageId.value = stage.calmyId; refresh(); ElMessage.success('Stage 已加入 Cycle')
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '创建 Stage 失败') }
}
function transitionCycle(cycle: Cycle, status: CycleStatus): void {
  try { unifiedRepository.transitionCycle(cycle.calmyId, status, { expectedRevision: cycle.revision }); refresh() }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : 'Cycle 状态更新失败') }
}
function transitionStage(stage: Stage, status: StageStatus): void {
  try { unifiedRepository.transitionStage(stage.calmyId, status, { expectedRevision: stage.revision }); refresh() }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : 'Stage 状态更新失败') }
}
function createAction(): void {
  if (!matter.value || !selectedCycle.value || !actionTitle.value.trim() || !actionDate.value.trim()) { ElMessage.warning('先选择 Cycle 并填写行动和日期'); return }
  try {
    const target = sharedWriteTargets.value[0]
    const action = target
      ? createSharedAction(target.owner, target.ownerId, { title: actionTitle.value, date: actionDate.value, cycleId: selectedCycle.value.calmyId }, matter.value.calmyId, currentCollaboratorId())
      : actionRepository.create({ title: actionTitle.value, date: actionDate.value, matterId: matter.value.calmyId, cycleId: selectedCycle.value.calmyId })
    const stage = stages.value.find(item => item.calmyId === actionStageId.value)
    if (stage && !stage.actionIds.includes(action.calmyId)) unifiedRepository.update<Stage>('stage', stage.calmyId, { actionIds: [...stage.actionIds, action.calmyId] }, { expectedRevision: stage.revision })
    actionTitle.value = ''; refresh(); ElMessage.success('Action 已绑定到 Matter / Cycle')
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '创建 Action 失败') }
}
function stageForAction(action: ActionItem): Stage | undefined { return stages.value.find(item => item.actionIds.includes(action.calmyId)) }
function stageForRecord(record: RealityRecord): Stage | undefined { return record.stageId ? unifiedRepository.find<Stage>('stage', record.stageId) : undefined }
function recordHistory(record: RealityRecord) { return recordRepository.history(record.calmyId) }
function openOutcome(action: ActionItem): void {
  if (action.status !== 'done') { ElMessage.info('先完成 Action，再沉淀 Outcome'); return }
  outcomeActionId.value = action.calmyId; outcomeSummary.value = action.resultNote || ''; outcomeResult.value = ''; practiceOutcomeId.value = ''
}
function outcomesForAction(actionId: string): Outcome[] { return outcomes.value.filter(item => item.actionId === actionId) }
function practicesForOutcome(outcomeId: string): Practice[] { return practices.value.filter(item => item.outcomeIds.includes(outcomeId)) }
function createOutcome(): void {
  if (!outcomeAction.value || !matter.value || !outcomeSummary.value.trim()) { ElMessage.warning('先选择已完成的 Action，并写下它产生的结果'); return }
  try {
    const outcome = unifiedRepository.createOutcomeForAction({ actionId: outcomeAction.value.calmyId, matterId: matter.value.calmyId, summary: outcomeSummary.value, result: outcomeResult.value || undefined, status: 'observed', evidenceRecordIds: [] })
    outcomeSummary.value = ''; outcomeResult.value = ''; practiceOutcomeId.value = outcome.calmyId; refresh(); ElMessage.success('Outcome 已沉淀，可以继续提炼 Practice')
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '创建 Outcome 失败') }
}
function createPractice(): void {
  if (!matter.value || !practiceOutcomeId.value || !practiceTitle.value.trim() || !practiceDescription.value.trim()) { ElMessage.warning('先选择 Outcome，并填写可重复的做法与说明'); return }
  try {
    unifiedRepository.createPracticeFromOutcome({ title: practiceTitle.value, description: practiceDescription.value, status: 'candidate', matterIds: [matter.value.calmyId], outcomeIds: [practiceOutcomeId.value], evidenceIds: [] })
    practiceTitle.value = ''; practiceDescription.value = ''; refresh(); ElMessage.success('Practice 已保存为候选做法')
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '创建 Practice 失败') }
}
function acceptOutcome(outcome: Outcome): void {
  try { unifiedRepository.update<Outcome>('outcome', outcome.calmyId, { status: 'accepted' }, { expectedRevision: outcome.revision }); refresh() }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : '更新 Outcome 失败') }
}
function activatePractice(practice: Practice): void {
  try { unifiedRepository.update<Practice>('practice', practice.calmyId, { status: 'active' }, { expectedRevision: practice.revision }); refresh() }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : '启用 Practice 失败') }
}
function cycleTargets(status: CycleStatus): CycleStatus[] { return (['planned', 'active', 'paused', 'completed', 'archived'] as CycleStatus[]).filter(target => target !== status && canTransitionCycle(status, target)) }
function stageTargets(status: StageStatus): StageStatus[] { return (['planned', 'active', 'paused', 'completed', 'skipped'] as StageStatus[]).filter(target => target !== status && canTransitionStage(status, target)) }
</script>

<template>
  <div v-if="matter" class="matter-page">
    <button class="back" @click="router.push('/app/matters')">← 返回 Matters</button>
    <header class="matter-head"><div><p class="eyebrow">MATTER · REVISION {{ matter.revision }}</p><h1 class="font-title">{{ matter.title }}</h1><p>{{ matter.why || '还没有写下为什么值得处理。' }}</p></div><span class="status">{{ matter.status }}</span></header>
    <section class="actions"><button v-if="matter.status === 'active'" @click="transition('paused')">暂停</button><button v-if="matter.status === 'paused'" @click="transition('active')">恢复</button><button v-if="matter.status !== 'archived'" @click="transition('archived')">归档</button><button v-if="matter.status === 'archived'" @click="transition('paused')">恢复为暂停</button></section>
    <section class="process-panel beryl-card">
      <div class="panel-head"><div><p class="eyebrow">PROCESS MAP</p><h2 class="font-title">Cycle / Stage</h2></div><span>一条 Matter 可以有多个并行 Cycle</span></div>
      <div v-if="cycles.length" class="cycle-list">
        <article v-for="cycle in cycles" :key="cycle.calmyId" class="cycle-card" :class="{ selected: selectedCycle?.calmyId === cycle.calmyId }">
          <button class="cycle-select" @click="selectCycle(cycle)"><span class="cycle-title">{{ cycle.title }}</span><span class="cycle-meta">{{ cycleStatusNames[cycle.status] }} · {{ cycle.trajectory }}</span><small>{{ cycle.theme }}</small></button>
          <div class="cycle-controls"><button v-for="target in cycleTargets(cycle.status)" :key="target" @click="transitionCycle(cycle, target)">{{ cycleStatusNames[target] }}</button></div>
        </article>
      </div>
      <div v-else class="process-empty">还没有 Cycle。先创建一个承载这次现实推进的周期。</div>
      <div class="inline-create cycle-create"><input v-model="cycleTitle" placeholder="新 Cycle 标题，例如：恢复作息" @keyup.enter="createCycle"><input v-model="cycleTheme" placeholder="主题 / 承载重点（可选）"><button @click="createCycle">创建 Cycle</button></div>

      <div v-if="selectedCycle" class="stage-area">
        <div class="sub-head"><div><b>{{ selectedCycle.title }}</b><span>当前阶段：{{ elementNames[selectedCycle.currentStage] }}</span></div><small>revision {{ selectedCycle.revision }}</small></div>
        <div v-if="stages.length" class="stage-list">
          <article v-for="stage in stages" :key="stage.calmyId" class="stage-row" :class="{ selected: actionStageId === stage.calmyId }">
            <button class="stage-select" @click="selectStage(stage)"><span class="stage-element">{{ elementNames[stage.element] }}</span><span>{{ stage.title }}</span><small>{{ stageStatusNames[stage.status] }} · {{ stage.actionIds.length }} 个 Action · {{ stage.recordIds.length }} 个 Record</small></button>
            <div class="stage-controls"><button v-for="target in stageTargets(stage.status)" :key="target" @click="transitionStage(stage, target)">{{ stageStatusNames[target] }}</button></div>
          </article>
        </div>
        <div v-else class="process-empty">这个 Cycle 还没有 Stage，可以先从观察现实开始。</div>
        <div class="inline-create stage-create"><input v-model="stageTitle" placeholder="新 Stage 标题，例如：观察现实" @keyup.enter="createStage"><select v-model="stageElement"><option v-for="(label, value) in elementNames" :key="value" :value="value">{{ label }}</option></select><button @click="createStage">添加 Stage</button></div>

        <div class="action-bind"><div class="sub-head"><div><b>绑定 Action</b><span>行动属于 Matter，也可以进一步落到 Cycle / Stage</span></div></div><div class="inline-create"><input v-model="actionTitle" placeholder="行动标题"><input v-model="actionDate" type="date"><select v-model="actionStageId"><option value="">不指定 Stage</option><option v-for="stage in stages" :key="stage.calmyId" :value="stage.calmyId">{{ stage.title }}</option></select><button @click="createAction">创建 Action</button></div></div>
        <div v-if="actions.length" class="bound-actions"><article v-for="action in actions" :key="action.calmyId"><span class="action-dot" :class="action.status"></span><div class="bound-action-copy"><b>{{ action.title }}</b><small>{{ action.date }} · {{ action.status }}<template v-if="action.cycleId === selectedCycle.calmyId"> · {{ stageForAction(action)?.title || '未指定 Stage' }}</template></small></div><button v-if="action.status === 'done'" class="outcome-button" @click="openOutcome(action)">{{ outcomesForAction(action.calmyId).length ? '继续沉淀' : '记录 Outcome' }}</button><small v-else class="outcome-hint">完成后可沉淀 Outcome</small></article></div>
        <section v-if="outcomeAction" class="outcome-capture">
          <div class="sub-head"><div><b>沉淀 Outcome</b><span>{{ outcomeAction.title }} 已完成</span></div><button class="quiet-button" @click="outcomeActionId = ''">关闭</button></div>
          <label>这次行动产生了什么结果？<textarea v-model="outcomeSummary" placeholder="结果与行动不同，写下现实中发生了什么。" /></label>
          <label>结果补充（可选）<textarea v-model="outcomeResult" placeholder="证据、影响、仍未解决的部分" /></label>
          <button class="primary-small" @click="createOutcome">保存 Outcome</button>
        </section>
        <section v-if="outcomes.length" class="outcome-list"><div class="sub-head"><div><b>Outcome / Practice</b><span>结果先被观察，再决定是否成为可重复做法</span></div></div><article v-for="outcome in outcomes" :key="outcome.calmyId" class="outcome-card"><div><b>{{ outcome.summary }}</b><small>{{ outcome.status }} · {{ new Date(outcome.createdAt).toLocaleString('zh-CN') }}<template v-if="outcome.result"> · {{ outcome.result }}</template></small></div><div class="outcome-actions"><button v-if="outcome.status === 'observed'" class="quiet-button" @click="acceptOutcome(outcome)">标记已采纳</button><button class="quiet-button" @click="practiceOutcomeId = outcome.calmyId">提炼 Practice</button></div><div v-if="practiceOutcomeId === outcome.calmyId" class="practice-form"><input v-model="practiceTitle" placeholder="可重复的做法，例如：先做最小验证"><textarea v-model="practiceDescription" placeholder="什么时候使用、如何重复、何时停止"></textarea><button class="primary-small" @click="createPractice">保存 Practice</button></div><div v-if="practicesForOutcome(outcome.calmyId).length" class="practice-list"><div v-for="practice in practicesForOutcome(outcome.calmyId)" :key="practice.calmyId"><span>◆</span><b>{{ practice.title }}</b><small>{{ practice.status }} · {{ practice.description }}</small><button v-if="practice.status === 'candidate'" class="quiet-button" @click="activatePractice(practice)">启用</button></div></div></article></section>
      </div>
    </section>
    <div class="detail-grid"><main>
      <section class="panel beryl-card"><div class="panel-head"><div><p class="eyebrow">CONTEXT</p><h2 class="font-title">当前上下文</h2></div><button @click="saveContext">保存</button></div><p v-if="sharedWriteTargets.length" class="shared-write-note">共享写入：{{ sharedWriteTargets[0].title }} · 当前操作者有编辑权限，变更会进入共享审计。</p><label>为什么现在值得处理？<textarea v-model="why" :placeholder="matter.why || '写下一句话即可'" @focus="why = matter?.why || ''" /></label><label>当前主要矛盾<textarea v-model="contradiction" :placeholder="matter.primaryContradiction || '还可以在实践后补充'" @focus="contradiction = matter?.primaryContradiction || ''" /></label></section>
      <section class="panel beryl-card"><div class="panel-head"><div><p class="eyebrow">REALITY RECORD</p><h2 class="font-title">记录真实</h2></div><span>事实先于解释</span></div><textarea v-model="recordBody" placeholder="今天实际发生了什么？不要急着评价。" /><div v-if="selectedCycle" class="record-source"><label>归入来源 Stage<select v-model="recordStageId"><option value="">不指定 Stage</option><option v-for="stage in stages" :key="stage.calmyId" :value="stage.calmyId">{{ stage.title }}</option></select></label><small>保存后会同时写入 Record 的 cycleId/stageId 和 Stage.recordIds。</small></div><div class="record-footer"><small>Record 会保留发生时间、来源和共享审计</small><button @click="addRecord">保存记录</button></div><div v-if="records.length" class="record-list"><article v-for="record in records" :key="record.calmyId"><time>{{ new Date(record.occurredAt).toLocaleString('zh-CN') }}</time><p>{{ record.body }}</p><small>revision {{ record.revision }} · {{ record.source }}<template v-if="stageForRecord(record)"> · Stage：{{ stageForRecord(record)?.title }}</template></small><details><summary>历史回放（{{ recordHistory(record).length }}）</summary><div v-for="revision in recordHistory(record)" :key="revision.id"><small>v{{ revision.revision }} · {{ revision.actorId || 'local-user' }} · {{ revision.reason }} · {{ new Date(revision.changedAt).toLocaleString('zh-CN') }}</small><p>{{ revision.body }}</p></div></details></article></div></section>
    </main><aside>
      <section class="panel beryl-card"><p class="eyebrow">MODEL</p><dl><dt>状态</dt><dd>{{ matter.status }}</dd><dt>阶段</dt><dd>{{ matter.currentStage }}</dd><dt>趋势</dt><dd>{{ matter.trajectory }}</dd><dt>身份</dt><dd>{{ matter.calmyId }}</dd></dl></section>
      <section v-if="sharedBoundaries.length" class="panel beryl-card"><p class="eyebrow">SHARED BOUNDARY</p><div class="shared-boundary-list"><article v-for="boundary in sharedBoundaries" :key="boundary.owner + boundary.ownerId"><div><b>{{ boundary.title }}</b><small>{{ boundary.owner === 'relationship' ? 'Relationship' : 'Shared Space' }}</small></div><span :class="'access-' + boundary.access">{{ ({ shared: '共同上下文', allowed: '边界允许', blocked: '已阻止' } as Record<SharedMatterAccess, string>)[boundary.access] }}</span><p v-if="boundary.boundary">{{ boundary.boundary }}</p></article></div></section>
      <section class="panel beryl-card"><p class="eyebrow">MUTATION LOG</p><div class="mutation-list"><article v-for="item in history" :key="item.id"><b>{{ item.operation }}</b><span>{{ item.fromRevision }} → {{ item.toRevision }}</span><small>{{ item.actorId || 'local-user' }} · {{ new Date(item.occurredAt).toLocaleString('zh-CN') }}</small></article></div></section>
    </aside></div>
  </div>
  <div v-else class="empty beryl-card"><h2 class="font-title">Matter 不存在</h2><button @click="router.push('/app/matters')">返回 Matters</button></div>
</template>

<style scoped>
.back{border:0;background:transparent;color:var(--c-text-2);padding:0;margin:4px 0 24px;cursor:pointer}.matter-head{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:16px}.eyebrow{font-size:10px;letter-spacing:.13em;color:var(--scene);font-weight:700;margin:0 0 8px}.matter-head h1{font-size:clamp(30px,4vw,48px);line-height:1.05;margin:0;letter-spacing:-.035em}.matter-head p:last-child{color:var(--c-text-2);font-size:13px;margin:12px 0 0}.status{font-size:11px;padding:7px 10px;border-radius:99px;background:var(--scene-soft);color:var(--scene)}.actions{display:flex;gap:8px;margin-bottom:24px}.actions button,.panel-head button,.record-footer button,.empty button{border:1px solid var(--c-border);background:var(--c-card);border-radius:8px;padding:8px 12px;color:var(--c-text);cursor:pointer;font-size:12px}.actions button:hover,.panel-head button:hover,.record-footer button:hover{border-color:var(--scene);color:var(--scene)}.detail-grid{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:16px}.detail-grid main,.detail-grid aside{display:grid;align-content:start;gap:16px}.panel{padding:18px}.panel-head{display:flex;justify-content:space-between;align-items:start;gap:12px;margin-bottom:16px}.panel-head h2{font-size:23px;margin:0}.panel-head>span{font-size:10px;color:var(--c-text-3)}label{display:grid;gap:6px;font-size:11px;color:var(--c-text-2);margin-top:14px}textarea{width:100%;min-height:82px;resize:vertical;border:1px solid var(--c-border);border-radius:9px;background:var(--c-bg);color:var(--c-text);padding:10px;font:inherit;font-size:13px;line-height:1.6;box-sizing:border-box}label:first-of-type textarea{min-height:60px}.record-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px}.record-footer small{font-size:10px;color:var(--c-text-3)}.record-list{border-top:1px solid var(--c-border-soft);margin-top:16px}.record-list article{padding:13px 0;border-bottom:1px solid var(--c-border-soft)}.record-list time,.record-list small{display:block;font-size:10px;color:var(--c-text-3)}.record-list p{font-size:13px;line-height:1.6;margin:6px 0}.panel dl{display:grid;grid-template-columns:72px 1fr;gap:10px;margin:14px 0 0;font-size:12px}.panel dt{color:var(--c-text-3)}.panel dd{margin:0;color:var(--c-text-2);overflow-wrap:anywhere}.mutation-list{display:grid;gap:12px;margin-top:16px}.mutation-list article{display:grid;grid-template-columns:1fr auto;gap:4px;border-left:2px solid var(--scene-border-strong);padding-left:9px}.mutation-list b{font-size:11px;color:var(--scene)}.mutation-list span,.mutation-list small{font-size:10px;color:var(--c-text-3)}.mutation-list small{grid-column:1/-1}.empty{text-align:center;padding:70px;color:var(--c-text-2)}.empty h2{font-size:26px;margin:0 0 18px}@media(max-width:760px){.matter-head{display:block}.status{display:inline-block;margin-top:14px}.detail-grid{grid-template-columns:1fr}.detail-grid aside{grid-template-columns:1fr 1fr}.panel{padding:15px}}@media(max-width:540px){.detail-grid aside{grid-template-columns:1fr}.record-footer{align-items:start;flex-direction:column}.actions{flex-wrap:wrap}}
.process-panel{padding:18px;margin-bottom:18px}.cycle-list,.stage-list{display:grid;gap:8px;margin-top:14px}.cycle-card,.stage-row{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--c-border-soft);border-radius:10px;padding:10px 12px}.cycle-card.selected,.stage-row.selected{border-color:var(--scene-border-strong);background:var(--scene-soft)}.cycle-select,.stage-select{display:grid;gap:4px;min-width:0;text-align:left;border:0;background:transparent;color:var(--c-text);cursor:pointer}.cycle-title{font-size:13px;font-weight:700}.cycle-meta,.cycle-select small,.stage-select small{font-size:10px;color:var(--c-text-3)}.stage-select{grid-template-columns:auto 1fr;align-items:center;column-gap:8px}.stage-select small{grid-column:2}.stage-element{font-size:10px;color:var(--scene);font-weight:700;white-space:nowrap}.cycle-controls,.stage-controls{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.cycle-controls button,.stage-controls button{border:1px solid var(--c-border);background:transparent;color:var(--c-text-2);border-radius:6px;padding:5px 7px;font-size:10px;cursor:pointer;white-space:nowrap}.cycle-controls button:hover,.stage-controls button:hover{border-color:var(--scene);color:var(--scene)}.process-empty{font-size:12px;color:var(--c-text-3);padding:14px 0}.inline-create{display:flex;gap:7px;margin-top:12px}.inline-create input,.inline-create select{min-width:0;border:1px solid var(--c-border);border-radius:8px;background:var(--c-bg);color:var(--c-text);padding:8px 9px;font:inherit;font-size:12px}.inline-create input:first-child{flex:1}.inline-create button{border:1px solid var(--c-border);background:var(--c-card);color:var(--c-text);border-radius:8px;padding:7px 10px;font-size:11px;cursor:pointer;white-space:nowrap}.inline-create button:hover{border-color:var(--scene);color:var(--scene)}.stage-area{border-top:1px solid var(--c-border-soft);margin-top:18px;padding-top:16px}.sub-head{display:flex;align-items:start;justify-content:space-between;gap:10px}.sub-head div{display:grid;gap:4px}.sub-head b{font-size:12px}.sub-head span,.sub-head small{font-size:10px;color:var(--c-text-3)}.stage-create select{width:190px}.action-bind{border-top:1px solid var(--c-border-soft);margin-top:16px;padding-top:14px}.action-bind .inline-create select{width:180px}.bound-actions{display:grid;gap:7px;margin-top:14px}.bound-actions article{display:flex;align-items:center;gap:9px;padding:9px 10px;border-top:1px solid var(--c-border-soft)}.bound-actions article>div{display:grid;gap:3px;min-width:0}.bound-actions b{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bound-actions small{font-size:10px;color:var(--c-text-3)}.action-dot{width:8px;height:8px;border-radius:50%;background:var(--c-border);flex:none}.action-dot.done{background:var(--scene)}.action-dot.in_progress{background:var(--scene);box-shadow:0 0 0 3px var(--scene-soft)}@media(max-width:680px){.cycle-card,.stage-row{display:block}.cycle-controls,.stage-controls{justify-content:flex-start;margin-top:9px}.inline-create{flex-wrap:wrap}.inline-create input,.inline-create select,.stage-create select,.action-bind .inline-create select{flex:1;width:auto;min-width:130px}.inline-create button{margin-left:auto}}
.bound-action-copy{flex:1;min-width:0}.outcome-button,.quiet-button,.primary-small{border:1px solid var(--c-border);background:transparent;color:var(--c-text-2);border-radius:7px;padding:5px 8px;font-size:10px;cursor:pointer;white-space:nowrap}.outcome-button:hover,.quiet-button:hover{border-color:var(--scene);color:var(--scene)}.outcome-hint{margin-left:auto;white-space:nowrap}.outcome-capture,.outcome-list{border-top:1px solid var(--c-border-soft);margin-top:16px;padding-top:14px}.outcome-capture label{margin-top:10px}.outcome-capture textarea{min-height:54px}.primary-small{display:block;margin-top:10px;background:var(--scene-soft);border-color:var(--scene-border-strong);color:var(--scene)}.outcome-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:start;border-top:1px solid var(--c-border-soft);padding:12px 0}.outcome-card>div:first-child{display:grid;gap:4px;min-width:0}.outcome-card b{font-size:12px;line-height:1.45}.outcome-card small{font-size:10px;color:var(--c-text-3);line-height:1.5}.outcome-actions{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.practice-form{grid-column:1/-1;display:grid;gap:7px;padding:10px;border-radius:8px;background:var(--scene-soft)}.practice-form input,.practice-form textarea{border:1px solid var(--c-border);border-radius:7px;background:var(--c-bg);color:var(--c-text);padding:8px;font:inherit;font-size:11px}.practice-form textarea{min-height:50px;resize:vertical}.practice-form .primary-small{margin-top:0}.practice-list{grid-column:1/-1;display:grid;gap:6px}.practice-list>div{display:flex;align-items:center;gap:7px;padding:7px 8px;border-left:2px solid var(--scene-border-strong);background:var(--c-hover)}.practice-list b{font-size:11px}.practice-list small{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.practice-list span{color:var(--scene);font-size:10px}@media(max-width:680px){.bound-actions article{align-items:start;flex-wrap:wrap}.outcome-button,.outcome-hint{margin-left:auto}.outcome-card{grid-template-columns:1fr}.outcome-actions{justify-content:flex-start}}
.bound-action-copy{flex:1;min-width:0}.outcome-button,.quiet-button,.primary-small{border:1px solid var(--c-border);background:transparent;color:var(--c-text-2);border-radius:7px;padding:5px 8px;font-size:10px;cursor:pointer;white-space:nowrap}.outcome-button:hover,.quiet-button:hover{border-color:var(--scene);color:var(--scene)}.outcome-hint{margin-left:auto;white-space:nowrap}.outcome-capture,.outcome-list{border-top:1px solid var(--c-border-soft);margin-top:16px;padding-top:14px}.outcome-capture label{margin-top:10px}.outcome-capture textarea{min-height:54px}.primary-small{display:block;margin-top:10px;background:var(--scene-soft);border-color:var(--scene-border-strong);color:var(--scene)}.outcome-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:start;border-top:1px solid var(--c-border-soft);padding:12px 0}.outcome-card>div:first-child{display:grid;gap:4px;min-width:0}.outcome-card b{font-size:12px;line-height:1.45}.outcome-card small{font-size:10px;color:var(--c-text-3);line-height:1.5}.outcome-actions{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.practice-form{grid-column:1/-1;display:grid;gap:7px;padding:10px;border-radius:8px;background:var(--scene-soft)}.practice-form input,.practice-form textarea{border:1px solid var(--c-border);border-radius:7px;background:var(--c-bg);color:var(--c-text);padding:8px;font:inherit;font-size:11px}.practice-form textarea{min-height:50px;resize:vertical}.practice-form .primary-small{margin-top:0}.practice-list{grid-column:1/-1;display:grid;gap:6px}.practice-list>div{display:flex;align-items:center;gap:7px;padding:7px 8px;border-left:2px solid var(--scene-border-strong);background:var(--c-hover)}.practice-list b{font-size:11px}.practice-list small{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.practice-list span{color:var(--scene);font-size:10px}.shared-boundary-list{display:grid;gap:10px;margin-top:14px}.shared-boundary-list article{display:grid;grid-template-columns:1fr auto;gap:5px;padding-top:10px;border-top:1px solid var(--c-border-soft)}.shared-boundary-list article>div{display:grid;gap:3px}.shared-boundary-list b{font-size:11px}.shared-boundary-list small,.shared-boundary-list p{font-size:10px;color:var(--c-text-3)}.shared-boundary-list p{grid-column:1/-1;margin:2px 0 0;line-height:1.5}.shared-boundary-list span{align-self:start;font-size:10px;padding:3px 6px;border-radius:99px;background:var(--scene-soft);color:var(--scene)}.shared-boundary-list .access-blocked{background:var(--c-hover);color:var(--c-text-3)}@media(max-width:680px){.bound-actions article{align-items:start;flex-wrap:wrap}.outcome-button,.outcome-hint{margin-left:auto}.outcome-card{grid-template-columns:1fr}.outcome-actions{justify-content:flex-start}}
.shared-write-note{font-size:11px;line-height:1.5;color:var(--scene);background:var(--scene-soft);border-radius:8px;padding:8px 10px;margin:0 0 10px}
</style>
