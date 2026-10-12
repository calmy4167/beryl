<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { withSaveState } from '@/core/save-state'
import { createAsyncCollectionRepository } from '@/core/repository'
import { nextId, todayKey } from '@/core/storage'
import { readServerSession } from '@/core/auth'
import { actionAsyncRepository } from '@/domain/action/repository'
import { useGoalStatusDictionary } from '@/vue/composables/useGoalStatusDictionary'
import type { GoalStatus } from '@/domain/goal/status-labels'
import { listRealityDocumentsAsync } from '@/domain/reality'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter } from '@/domain/matter/model'
import ContextRelationPicker from '@/vue/components/ContextRelationPicker.vue'
import DomainPicker from '@/vue/components/DomainPicker.vue'
import OwnershipEditor from '@/vue/components/OwnershipEditor.vue'
import { unifiedAsyncRepository, type Ownership, type Person, type Relation } from '@/domain/unified'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import LbPanel from '@/vue/liubai/LbPanel.vue'
import LbCollapsible from '@/vue/liubai/LbCollapsible.vue'
import LbStatGrid from '@/vue/liubai/LbStatGrid.vue'
import type { LbStat } from '@/vue/liubai/types'

// 页面自带头部（参考稿里 .slide-head 属于页面自身），外壳因此不再渲染第二行标题。
useOwnSlideHead()
type Status = GoalStatus; type Filter = 'all' | Status
interface GoalSnapshot { revision: number; operation: 'created' | 'updated'; occurredAt: number; actorUserId?: string; title: string; done: boolean; status: Status; progress: number; problem?: string; evidence?: string; nextAction?: string; matterId?: string; ownership?: Ownership }
interface Stored { id?: string; title?: string; done?: boolean; status?: Status; progress?: number; problem?: string; evidence?: string; nextAction?: string; matterId?: string; ownership?: Ownership; revision?: number; history?: GoalSnapshot[] }
interface Goal { id: string; title: string; status: Status; progress: number; problem?: string; evidence?: string; nextAction?: string; matterId?: string; ownership?: Ownership; revision: number }
const repo = createAsyncCollectionRepository<Stored>('goals', item => item.id); const router = useRouter(); const goals = ref<Goal[]>([]); const matters = ref<Matter[]>([]); const people = ref<Person[]>([]); const session = readServerSession(); const filter = ref<Filter>('all'); const query = ref(''); const title = ref(''); const problem = ref(''); const evidence = ref(''); const nextAction = ref(''); const matterId = ref(''); const drafts = ref<Record<string, number>>({}); const loading = ref(true); const saving = ref(false); const error = ref('')
const { statuses: orderedStatuses, labelFor: statusLabel } = useGoalStatusDictionary()
const toast = (message: string, kind: 'success' | 'warning' | 'error' = 'success') => window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0
function setFilter(value: Filter) { filter.value = value }
async function load(): Promise<Goal[]> { const stored = new Map((await repo.list()).filter(x => typeof x.id === 'string').map(x => [x.id!, x])); return (await listRealityDocumentsAsync({ types: ['goal'] })).map(doc => { const s = stored.get(doc.id); const done = s?.done ?? doc.done ?? ((s?.status === 'done') || doc.status === 'done'); const progress = clamp(typeof s?.progress === 'number' ? s.progress : done ? 100 : 0); return { id: doc.id, title: s?.title?.trim() || doc.title, status: done || progress === 100 ? 'done' : 'open', progress, problem: s?.problem?.trim() || doc.problem, evidence: s?.evidence?.trim() || doc.evidence, nextAction: s?.nextAction?.trim() || doc.nextAction, matterId: s?.matterId || doc.matterId, ownership: s?.ownership || doc.ownership, revision: s?.revision ?? 0 } }) }
async function refresh() { loading.value = true; try { const [g,m,p] = await Promise.all([load(), matterAsyncRepository.list(), unifiedAsyncRepository.list<Person>('person')]); goals.value=g; matters.value=m.filter(x=>x.status!=='archived'); people.value=p; drafts.value=Object.fromEntries(g.map(x=>[x.id,x.progress])); error.value='' } catch(e) { error.value=e instanceof Error?e.message:'目标读取失败' } finally { loading.value=false } }
onMounted(() => { void refresh() })
const visible = computed(() => goals.value.filter(g => (filter.value==='all'||g.status===filter.value) && (!query.value.trim() || [g.title,g.problem,g.evidence,g.nextAction].filter(Boolean).some(v=>v!.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())))))
const completed = computed(() => goals.value.filter(g=>g.status==='done').length)
/** 「留白」统计卡（HUD 第 3 档收起）。口径来自已有目标，不新造数据。 */
const stats = computed<LbStat[]>(() => [
  { label: '全部目标', value: goals.value.length, unit: ' 个' },
  { label: statusLabel('done'), value: completed.value, unit: ' 个' },
  { label: '未完成', value: goals.value.length - completed.value, unit: ' 个' },
  { label: '有下一步', value: goals.value.filter(goal => goal.nextAction).length, unit: ' 个' }
])
async function addGoal() { const value=title.value.trim(); if(!value){toast('请先写下目标名称','warning');return} saving.value=true; const action=nextAction.value.trim(); const userId=session?.user.id; const ownership: Ownership | undefined = userId ? { createdByUserId: userId, ownerRef: { type: 'user', id: userId }, stewardRefs: [], privacy: 'private' } : undefined; try { await withSaveState(async()=>{ const id=nextId(); const occurredAt=Date.now(); const snapshot: GoalSnapshot = { revision: 1, operation: 'created', occurredAt, actorUserId: userId, title:value, done:false, status:'open', progress:0, problem:problem.value.trim()||undefined, evidence:evidence.value.trim()||undefined, nextAction:action||undefined, matterId:matterId.value||undefined, ownership }; await repo.create({id,...snapshot,history:[snapshot]}); if(action) await actionAsyncRepository.create({title:action,date:todayKey(),matterId:matterId.value||undefined}) }); title.value='';problem.value='';evidence.value='';nextAction.value='';matterId.value='';await refresh();toast(action?'目标已添加，下一步行动已加入今天':'目标已添加 🥅') } catch(e){toast(e instanceof Error?e.message:'目标添加失败','error')} finally {saving.value=false} }
async function updateGoal(goal: Goal, patch: Partial<Stored>, feedback?: string) { saving.value=true; try { let saved: Stored | undefined; const actorUserId=session?.user.id; const persisted=await repo.update(goal.id,current=>{const revision=current.revision??0;if(revision!==goal.revision)throw new Error('目标版本冲突，请刷新后重试'); const next={...current,...patch,revision:revision+1}; const snapshot: GoalSnapshot={revision:next.revision!,operation:'updated',occurredAt:Date.now(),actorUserId,title:next.title||goal.title,done:!!next.done,status:next.status||goal.status,progress:clamp(next.progress??goal.progress),problem:next.problem,evidence:next.evidence,nextAction:next.nextAction,matterId:next.matterId,ownership:next.ownership}; saved={...next,history:[...(current.history||[]),snapshot]};return saved }); if(!persisted||!saved) throw new Error('目标保存失败'); const nextProgress = patch.progress === undefined ? goal.progress : clamp(patch.progress); const nextDone = patch.done === undefined ? goal.status === 'done' : patch.done; goals.value = goals.value.map(item => item.id === goal.id ? {...item, progress: nextProgress, status: nextDone || nextProgress === 100 ? 'done' : 'open', ownership: patch.ownership === undefined ? item.ownership : patch.ownership, revision:saved!.revision??goal.revision+1} : item); drafts.value = {...drafts.value, [goal.id]: nextProgress}; toast(feedback || (patch.progress !== undefined ? `自评进度已更新为 ${nextProgress}%` : patch.done ? '目标已完成':'目标已重新打开')) } catch(e){toast(e instanceof Error?e.message:'目标更新失败','error');await refresh()} finally{saving.value=false} }
async function saveProgress(goal: Goal) { const progress=clamp(drafts.value[goal.id] ?? goal.progress); drafts.value={...drafts.value,[goal.id]:progress}; if(progress===goal.progress)return; await updateGoal(goal,{progress,done:progress===100,status:progress===100?'done':'open'}) }
async function removeGoal(goal: Goal) { if(!window.confirm(`确认删除目标“${goal.title}”吗？删除后无法从目标列表恢复。`))return; saving.value=true; try{const relations=await unifiedAsyncRepository.list<Relation>('relation'); if(relations.some(item => item.from.entityType === 'goal' && item.from.calmyId === goal.id || item.to.entityType === 'goal' && item.to.calmyId === goal.id)) throw new Error('此目标仍被关系或历史记录引用。为保留稳定关系，请先移除上下文关系；仍有历史引用时不能物理删除。'); if(!await repo.remove(goal.id))throw new Error('目标删除失败');await refresh();toast('目标已删除')}catch(e){toast(e instanceof Error?e.message:'目标更新失败','error')}finally{saving.value=false} }
</script>
<template>
  <header class="slide-head">
    <div class="head-main">
      <p class="hint">目标 · Goals</p>
      <div class="head-title-row">
        <h2 v-if="loading">正在读取…</h2>
        <h2 v-else-if="!goals.length">还没有目标。</h2>
        <h2 v-else>把想要的结果写清楚。<em>{{ completed }}</em> / {{ goals.length }} 已完成。</h2>
        <span class="info" tabindex="0" data-tip="进度只是自选回看，不代替发生过的证据。H 收起辅助信息。" aria-label="目标说明">i</span>
      </div>
    </div>
    <div class="detail-chips head-actions">
      <button class="chip" type="button" @click="router.push('/app/flow')">带着问题进探索</button>
    </div>
  </header>

  <LbCollapsible block="goalsCreate" :rank="2">
    <LbPanel title="添加目标" :note="`${completed} / ${goals.length} ${statusLabel('done')}`">
      <form class="create-row" @submit.prevent="addGoal">
        <input aria-label="目标名称" v-model="title" placeholder="添加一个想在现实中看到的结果…" :disabled="saving">
        <button class="chip on" type="submit" :disabled="saving">{{ saving ? '保存中…' : '添加目标' }}</button>
      </form>
      <div class="goal-context-fields">
        <textarea aria-label="目标对应问题" v-model="problem" placeholder="它正在解决什么现实问题？（可选）" :disabled="saving" />
        <textarea aria-label="目标证据" v-model="evidence" placeholder="什么证据说明它正在发生变化？（可选）" :disabled="saving" />
        <textarea aria-label="目标下一步行动" v-model="nextAction" placeholder="下一步准备在现实中做什么？（可选）" :disabled="saving" />
        <select aria-label="目标关联处境" v-model="matterId" :disabled="saving">
          <option value="">不关联处境</option>
          <option v-for="matter in matters" :key="matter.calmyId" :value="matter.calmyId">{{ matter.title }}</option>
        </select>
      </div>
    </LbPanel>
  </LbCollapsible>

  <LbPanel title="目标列表" :note="loading ? '正在读取…' : `${visible.length} 个目标`">
    <div class="goals-toolbar">
      <input aria-label="搜索目标" v-model="query" placeholder="搜索目标">
      <div class="seg" role="tablist" aria-label="目标状态筛选">
        <button type="button" role="tab" :aria-selected="filter==='all'" :class="{on:filter==='all'}" @click="setFilter('all')">全部</button>
        <button v-for="status in orderedStatuses" :key="status" type="button" role="tab" :aria-selected="filter===status" :class="{on:filter===status}" @click="setFilter(status)">{{ statusLabel(status) }}</button>
      </div>
    </div>
    <section v-if="error" class="panel goals-error" role="alert">
      <b>目标数据暂时无法读取</b><p class="dim">{{ error }}</p><button class="chip" type="button" @click="refresh">重试</button>
    </section>
    <p v-if="loading" class="dim" role="status">正在读取目标…</p>
    <div v-else-if="visible.length" class="goals-list" aria-live="polite">
      <article v-for="goal in visible" :key="goal.id" class="goal-item panel" :class="{ done: goal.status === 'done' }">
        <button class="chk" :class="{ on: goal.status === 'done' }" type="button" :aria-label="goal.status === 'done' ? `标记目标为${statusLabel('open')}` : `标记目标为${statusLabel('done')}`" :disabled="saving" @click="updateGoal(goal, { done: goal.status !== 'done', status: goal.status === 'done' ? 'open' : 'done', progress: goal.status === 'done' ? Math.min(goal.progress, 99) : 100 }, goal.status === 'done' ? `目标已恢复为${statusLabel('open')}` : `目标已设为${statusLabel('done')}`)">{{ goal.status === 'done' ? '✓' : '' }}</button>
        <div class="goal-main">
          <div class="goal-head">
            <h3 :class="{ done: goal.status === 'done' }">{{ goal.title }}</h3>
            <span class="status-chip">{{ statusLabel(goal.status) }}</span>
          </div>
          <div v-if="goal.problem || goal.evidence || goal.nextAction || goal.matterId" class="goal-context-summary">
            <small v-if="goal.problem">问题：{{ goal.problem }}</small>
            <small v-if="goal.evidence">证据：{{ goal.evidence }}</small>
            <small v-if="goal.nextAction">下一步：{{ goal.nextAction }}</small>
            <small v-if="goal.matterId">处境：{{ matters.find(item => item.calmyId === goal.matterId)?.title || goal.matterId }}</small>
          </div>
          <DomainPicker :entity-ref="{ entityType: 'goal', calmyId: goal.id }" :disabled="saving" />
          <ContextRelationPicker :entity-ref="{ entityType: 'goal', calmyId: goal.id }" :disabled="saving" />
          <OwnershipEditor :ownership="goal.ownership" :people="people" :current-user-id="session?.user.id" :disabled="saving" label="目标归属与可见范围" @save="ownership => updateGoal(goal, { ownership }, '目标归属已保存')" />
          <div class="goal-progress">
            <input :aria-label="`${goal.title} 进度`" type="range" min="0" max="100" step="1" :value="drafts[goal.id] ?? goal.progress" :disabled="saving" @input="drafts[goal.id] = Number(($event.target as HTMLInputElement).value)" @blur="saveProgress(goal)">
            <input :aria-label="`${goal.title} 进度百分比`" type="number" min="0" max="100" step="1" :value="drafts[goal.id] ?? goal.progress" :disabled="saving" class="goal-progress-number" @input="drafts[goal.id] = Number(($event.target as HTMLInputElement).value)" @blur="saveProgress(goal)">
            <span class="dim">自评进度（可选）</span>
          </div>
        </div>
        <button class="chip danger" type="button" :aria-label="`删除目标 ${goal.title}`" :disabled="saving" @click="removeGoal(goal)">删除</button>
      </article>
    </div>
    <p v-else class="dim">{{ query ? '没有匹配的目标。' : '还没有目标，把一个想完成的结果写下来。' }}</p>
  </LbPanel>

  <LbCollapsible block="goalsStats" :rank="3">
    <LbPanel title="目标统计">
      <LbStatGrid :stats="stats" />
    </LbPanel>
  </LbCollapsible>
</template>

<style scoped>
/* 页面局部排版：颜色取「留白」令牌。.goal-item 是 parity 测试的钩子，类名保留。 */
.slide-head .head-actions { align-self: flex-end; margin-left: auto; }
.goals-error { border-color: color-mix(in srgb, var(--danger) 45%, transparent); }
.create-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.create-row input:not([type]) { flex: 1 1 220px; min-width: 0; }
.goal-context-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
.goal-context-fields textarea { min-height: 60px; }
.goals-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.goals-toolbar input { flex: 1 1 200px; min-width: 0; min-height: 34px; padding: 6px 10px; font: inherit; font-size: .8rem; }
.goals-toolbar .seg { width: min(360px, 100%); flex: none; }
.create-row input, .goal-context-fields textarea, .goal-context-fields select { min-height: 34px; padding: 6px 10px; font: inherit; font-size: .8rem; }
.goals-list { display: grid; gap: 10px; }
.goal-item { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: 12px; }
.goal-item.done { opacity: .75; }
.goal-main { display: grid; gap: 8px; min-width: 0; }
.goal-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.goal-head h3 { margin: 0; font-size: .95rem; font-weight: 600; color: var(--fg); }
.goal-head h3.done { text-decoration: line-through; opacity: .7; }
.status-chip { border: 1px solid var(--line); border-radius: 999px; padding: 2px 9px; color: var(--muted); font-size: .68rem; white-space: nowrap; }
.goal-context-summary { display: grid; gap: 3px; }
.goal-context-summary small { color: var(--muted); font-size: .72rem; }
.chk { width: 22px; height: 22px; min-height: 22px; padding: 0; border: 1px solid var(--line-strong); border-radius: 7px; background: none; color: var(--accent-fg); cursor: pointer; font-size: .8rem; line-height: 1; }
.chk.on { background: var(--accent); border-color: var(--accent); }
.goal-progress { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.goal-progress input[type='range'] { flex: 1 1 160px; min-width: 0; }
.goal-progress-number { width: 76px; }
</style>
