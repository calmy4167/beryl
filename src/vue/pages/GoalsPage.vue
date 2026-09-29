<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { withSaveState } from '@/core/save-state'
import { createAsyncCollectionRepository } from '@/core/repository'
import { nextId, todayKey } from '@/core/storage'
import { actionAsyncRepository } from '@/domain/action/repository'
import { listRealityDocumentsAsync } from '@/domain/reality'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter } from '@/domain/matter/model'
type Status = 'open' | 'done'; type Filter = 'all' | Status
interface Stored { id?: string; title?: string; done?: boolean; status?: Status; progress?: number; problem?: string; evidence?: string; nextAction?: string; matterId?: string }
interface Goal { id: string; title: string; status: Status; progress: number; problem?: string; evidence?: string; nextAction?: string; matterId?: string }
const repo = createAsyncCollectionRepository<Stored>('goals', item => item.id); const router = useRouter(); const goals = ref<Goal[]>([]); const matters = ref<Matter[]>([]); const filter = ref<Filter>('all'); const query = ref(''); const title = ref(''); const problem = ref(''); const evidence = ref(''); const nextAction = ref(''); const matterId = ref(''); const drafts = ref<Record<string, number>>({}); const loading = ref(true); const saving = ref(false); const error = ref('')
const toast = (message: string, kind: 'success' | 'warning' | 'error' = 'success') => window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0
function setFilter(value: Filter) { filter.value = value }
async function load(): Promise<Goal[]> { const stored = new Map((await repo.list()).filter(x => typeof x.id === 'string').map(x => [x.id!, x])); return (await listRealityDocumentsAsync({ types: ['goal'] })).map(doc => { const s = stored.get(doc.id); const done = s?.done ?? doc.done ?? ((s?.status === 'done') || doc.status === 'done'); const progress = clamp(typeof s?.progress === 'number' ? s.progress : done ? 100 : 0); return { id: doc.id, title: s?.title?.trim() || doc.title, status: done || progress === 100 ? 'done' : 'open', progress, problem: s?.problem?.trim() || doc.problem, evidence: s?.evidence?.trim() || doc.evidence, nextAction: s?.nextAction?.trim() || doc.nextAction, matterId: s?.matterId || doc.matterId } }) }
async function refresh() { loading.value = true; try { const [g,m] = await Promise.all([load(), matterAsyncRepository.list()]); goals.value=g; matters.value=m.filter(x=>x.status!=='archived'); drafts.value=Object.fromEntries(g.map(x=>[x.id,x.progress])); error.value='' } catch(e) { error.value=e instanceof Error?e.message:'目标读取失败' } finally { loading.value=false } }
onMounted(() => { void refresh() })
const visible = computed(() => goals.value.filter(g => (filter.value==='all'||g.status===filter.value) && (!query.value.trim() || [g.title,g.problem,g.evidence,g.nextAction].filter(Boolean).some(v=>v!.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())))))
const completed = computed(() => goals.value.filter(g=>g.status==='done').length)
const CompletedCount = { setup: () => () => h('span', { class: 'load-pill' }, [String(completed.value), ' / ', String(goals.value.length), ' 已完成']) }
async function addGoal() { const value=title.value.trim(); if(!value){toast('请先写下目标名称','warning');return} saving.value=true; const action=nextAction.value.trim(); try { await withSaveState(async()=>{ await repo.create({id:nextId(),title:value,done:false,status:'open',progress:0,problem:problem.value.trim()||undefined,evidence:evidence.value.trim()||undefined,nextAction:action||undefined,matterId:matterId.value||undefined}); if(action) await actionAsyncRepository.create({title:action,date:todayKey(),matterId:matterId.value||undefined}) }); title.value='';problem.value='';evidence.value='';nextAction.value='';matterId.value='';await refresh();toast(action?'目标已添加，下一步行动已加入今天':'目标已添加 🥅') } catch(e){toast(e instanceof Error?e.message:'目标添加失败','error')} finally {saving.value=false} }
async function updateGoal(goal: Goal, patch: Partial<Stored>, feedback?: string) { saving.value=true; try { const current=await repo.find(goal.id); if(!current || !await repo.update(goal.id,()=>({...current,...patch}))) throw new Error('目标保存失败'); const nextProgress = patch.progress === undefined ? goal.progress : clamp(patch.progress); const nextDone = patch.done === undefined ? goal.status === 'done' : patch.done; goals.value = goals.value.map(item => item.id === goal.id ? {...item, progress: nextProgress, status: nextDone || nextProgress === 100 ? 'done' : 'open'} : item); drafts.value = {...drafts.value, [goal.id]: nextProgress}; toast(feedback || (patch.progress !== undefined ? `自评进度已更新为 ${nextProgress}%` : patch.done ? '目标已完成':'目标已重新打开')) } catch(e){toast(e instanceof Error?e.message:'目标更新失败','error');await refresh()} finally{saving.value=false} }
async function saveProgress(goal: Goal) { const progress=clamp(drafts.value[goal.id] ?? goal.progress); drafts.value={...drafts.value,[goal.id]:progress}; if(progress===goal.progress)return; await updateGoal(goal,{progress,done:progress===100,status:progress===100?'done':'open'}) }
async function removeGoal(goal: Goal) { if(!window.confirm(`确认删除目标“${goal.title}”吗？删除后无法从目标列表恢复。`))return; saving.value=true; try{if(!await repo.remove(goal.id))throw new Error('目标删除失败');await refresh();toast('目标已删除')}catch(e){toast(e instanceof Error?e.message:'目标删除失败','error')}finally{saving.value=false} }
</script>
<template>
  <div class="goals-page">
    <header class="page-head">
      <div>
        <p class="eyebrow">目标 · 方向</p>
        <h1 class="font-title">目标</h1>
        <p>把想要完成的现实结果写清楚；进度只是自选回看，不代替发生过的证据。</p>
      </div>
      <div class="goals-head-actions">
        <CompletedCount />
        <button class="app-button" type="button" @click="router.push('/app/flow')">带着问题进探索</button>
      </div>
    </header>

    <section class="beryl-card matter-create">
      <form class="create-row" @submit.prevent="addGoal">
        <input aria-label="目标名称" v-model="title" placeholder="添加一个想在现实中看到的结果…" :disabled="saving">
        <button class="primary" type="submit" :disabled="saving">{{ saving ? '保存中…' : '添加目标' }}</button>
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
    </section>

    <section class="beryl-card admin-block">
      <div class="panel-head">
        <div><p class="eyebrow">GOAL INDEX</p><h2 class="font-title">目标列表</h2></div>
        <span>{{ loading ? '正在读取…' : `${visible.length} 个目标` }}</span>
      </div>
      <div class="goals-toolbar" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:16px 0">
        <input aria-label="搜索目标" v-model="query" placeholder="搜索目标">
        <div class="range-tabs" role="tablist" aria-label="目标状态筛选">
          <button v-for="[v,l] in [['all','全部'],['open','进行中'],['done','已完成']]" :key="v" type="button" role="tab" :aria-selected="filter===v" :class="{on:filter===v}" @click="setFilter(v as Filter)">{{ l }}</button>
        </div>
      </div>
      <section v-if="error" class="empty-state" role="alert">
        <b>目标数据暂时无法读取</b><p>{{ error }}</p><button class="app-button" type="button" @click="refresh">重试</button>
      </section>
      <div v-if="loading" class="empty-state" role="status">正在读取目标…</div>
      <div v-else-if="visible.length" class="goals-list" aria-live="polite">
        <article v-for="goal in visible" :key="goal.id" class="beryl-card goal-item" :class="{ done: goal.status === 'done' }">
          <button class="chk" :class="{ on: goal.status === 'done' }" type="button" :aria-label="goal.status === 'done' ? '标记目标为进行中' : '标记目标为已完成'" :disabled="saving" @click="updateGoal(goal, { done: goal.status !== 'done', status: goal.status === 'done' ? 'open' : 'done', progress: goal.status === 'done' ? Math.min(goal.progress, 99) : 100 }, goal.status === 'done' ? '目标已重新打开' : '目标已完成')">{{ goal.status === 'done' ? '✓' : '' }}</button>
          <div style="flex:1;min-width:0">
            <div class="panel-head" style="margin-bottom:6px">
              <h3 :class="{ done: goal.status === 'done' }">{{ goal.title }}</h3>
              <span class="load-pill">{{ goal.status === 'done' ? '已完成' : '进行中' }}</span>
            </div>
            <div v-if="goal.problem || goal.evidence || goal.nextAction || goal.matterId" class="goal-context-summary">
              <small v-if="goal.problem">问题：{{ goal.problem }}</small>
              <small v-if="goal.evidence">证据：{{ goal.evidence }}</small>
              <small v-if="goal.nextAction">下一步：{{ goal.nextAction }}</small>
              <small v-if="goal.matterId">处境：{{ matters.find(item => item.calmyId === goal.matterId)?.title || goal.matterId }}</small>
            </div>
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <input :aria-label="`${goal.title} 进度`" type="range" min="0" max="100" step="1" :value="drafts[goal.id] ?? goal.progress" :disabled="saving" @input="drafts[goal.id] = Number(($event.target as HTMLInputElement).value)" @blur="saveProgress(goal)">
              <input :aria-label="`${goal.title} 进度百分比`" type="number" min="0" max="100" step="1" :value="drafts[goal.id] ?? goal.progress" :disabled="saving" style="width:76px" @input="drafts[goal.id] = Number(($event.target as HTMLInputElement).value)" @blur="saveProgress(goal)">
              <span class="muted">自评进度（可选）</span>
            </div>
          </div>
          <button type="button" class="danger" :aria-label="`删除目标 ${goal.title}`" :disabled="saving" @click="removeGoal(goal)">删除</button>
        </article>
      </div>
      <div v-else class="empty-state">{{ query ? '没有匹配的目标。' : '还没有目标，把一个想完成的结果写下来。' }}</div>
    </section>
  </div>
</template>
