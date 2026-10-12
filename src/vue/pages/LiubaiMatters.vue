<script setup lang="ts">
/**
 * 处境（v11「留白」）—— 取代旧 MattersPage。
 *
 * 结构沿用参考稿任务行的 .tasks / .task / .text / .tag / .acts（处境就是「更大的事」），
 * 状态与轨迹来自 Matter 自己的字段，不新增数据模型。
 * 状态流转走既有状态机：active ⇄ paused、→ archived（canTransitionMatter 校验，仓储拒绝非法转换）。
 */
import { computed, ref } from 'vue'
import { useReferenceWorkspace } from '@/vue/composables/useReferenceWorkspace'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import LbPanel from '@/vue/liubai/LbPanel.vue'
import LbCollapsible from '@/vue/liubai/LbCollapsible.vue'
import LbStatGrid from '@/vue/liubai/LbStatGrid.vue'
import type { LbStat } from '@/vue/liubai/types'
import { todayKey } from '@/core/storage'
import { withSaveState } from '@/core/save-state'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter, MatterStatus } from '@/domain/matter/model'

useOwnSlideHead()

const { actions, loading, saving, error, matters, addTask, setMatterStatus, refresh } = useReferenceWorkspace()

const date = todayKey()
const draft = ref('')
const draftWhy = ref('')
const showProblemFields = ref(false)
/** 旧页面的「问题驱动」六字段（Matter 自己的字段，不是新模型），v11 迁移时漏掉了 */
const problemFields = ref({ problem: '', desiredChange: '', progressEvidence: '', currentGap: '', nextTest: '', stopCondition: '' })
/** 生命周期筛选，与旧页面一致（进行中 / 已暂停 / 已归档） */
const lifecycle = ref<'active' | 'paused' | 'archived'>('active')

const active = computed(() => matters.value.filter(item => item.status === 'active'))
const paused = computed(() => matters.value.filter(item => item.status === 'paused'))
const drafts = computed(() => matters.value.filter(item => item.status === 'draft'))
const archived = computed(() => matters.value.filter(item => item.status === 'archived'))
const shown = computed(() => {
  if (lifecycle.value === 'paused') return paused.value
  if (lifecycle.value === 'archived') return archived.value
  return active.value
})

const heading = computed(() => {
  if (loading.value) return '正在读取…'
  if (!shown.value.length) return '还没有手上的处境。'
  return `手上还有 ${shown.value.length} 件。`
})

const STATUS_LABEL: Record<MatterStatus, string> = { draft: '草稿', active: '进行中', paused: '暂停', archived: '已归档' }
const TRAJECTORY_LABEL: Record<string, string> = {
  advancing: '推进', stable: '稳定', stalled: '停滞', retreating: '回退', diverging: '绕路',
  lost: '失去', recovering: '恢复', restarting: '重启', unknown: '未知'
}

function openCount(matterId: string) {
  return actions.value.filter(item => item.matterId === matterId && item.status !== 'done' && item.status !== 'cancelled' && item.status !== 'skipped').length
}

function metaOf(matter: Matter) {
  const parts = [STATUS_LABEL[matter.status], TRAJECTORY_LABEL[matter.trajectory] || matter.trajectory]
  const open = openCount(matter.calmyId)
  if (open) parts.push(`今天 ${open} 件`)
  const next = (matter.nextTest || matter.currentGap || '').trim()
  if (next) parts.push(next.slice(0, 18))
  return parts.join(' · ')
}

const stats = computed<LbStat[]>(() => [
  { label: '进行中', value: active.value.length, unit: ' 件', accent: active.value.length > 0 },
  { label: '暂停', value: paused.value.length, unit: ' 件' },
  { label: '草稿', value: drafts.value.length, unit: ' 件' },
  { label: '已归档', value: archived.value.length, unit: ' 件' }
])

function notify(message: string, kind: 'success' | 'warning' | 'error' = 'success') {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

async function submit() {
  const title = draft.value.trim()
  if (!title) { notify('先写下处境名称', 'warning'); return }
  const fields = problemFields.value
  try {
    await withSaveState(() => matterAsyncRepository.create({
      title, why: draftWhy.value, ...fields
    }))
    draft.value = ''
    draftWhy.value = ''
    problemFields.value = { problem: '', desiredChange: '', progressEvidence: '', currentGap: '', nextTest: '', stopCondition: '' }
    showProblemFields.value = false
    notify('处境已创建')
    await refresh()
  } catch (cause) {
    notify(cause instanceof Error ? cause.message : '处境创建失败，请重试', 'error')
  }
}

/** 趋势与状态相互独立（旧页面的语义）：单独走 repository.update + revision 校验 */
async function changeTrajectory(matter: Matter, trajectory: Matter['trajectory']) {
  if (trajectory === matter.trajectory) return
  try {
    await withSaveState(() => matterAsyncRepository.update(matter.calmyId, { trajectory }, { expectedRevision: matter.revision }))
    await refresh()
  } catch (cause) {
    notify(cause instanceof Error ? cause.message : '趋势保存失败，请重试', 'error')
    await refresh()
  }
}

/** 把处境的一件事放进今天（新建 Action 并关联稳定 ID） */
async function toToday(matter: Matter) {
  const title = (matter.nextTest || '').trim() || matter.title
  await addTask(title.slice(0, 80), date, matter.calmyId)
}

async function setStatus(matter: Matter, status: 'active' | 'paused' | 'archived') {
  await setMatterStatus(matter, status)
}
</script>

<template>
  <header class="slide-head">
    <div class="head-main">
      <p class="hint">处境</p>
      <div class="head-title-row">
        <h2>{{ heading }}</h2>
        <span class="info" tabindex="0" data-tip="处境是还在进行、可能跨多天的事。「放进今天」会把它的下一步变成一件今天的行动并保持关联。" aria-label="处境说明">i</span>
      </div>
    </div>
  </header>

  <p v-if="error" class="panel" role="alert" style="color:var(--danger)">
    {{ error }}
    <button class="act" type="button" @click="refresh">重试</button>
  </p>

  <LbPanel grow title="手上的处境" :note="saving ? '保存中…' : `${shown.length} 件`">
    <div class="matter-filter">
      <label>筛选
        <select v-model="lifecycle" aria-label="处境筛选">
          <option value="active">进行中</option>
          <option value="paused">已暂停</option>
          <option value="archived">已归档</option>
        </select>
      </label>
    </div>
    <ul class="tasks">
      <li v-if="loading" class="empty">正在读取…</li>
      <li v-else-if="!shown.length" class="empty">{{ matters.length ? '还没有匹配的处境。' : '还没有处境。写下你正在面对的事。' }}</li>
      <li v-for="matter in shown" :key="matter.calmyId" class="task" :class="{ 'is-focus': openCount(matter.calmyId) > 0 }">
        <span class="focus-flag" aria-hidden="true"></span>
        <span class="text" :title="matter.title">{{ matter.title }}</span>
        <span class="tag">{{ metaOf(matter) }}</span>
        <div class="acts">
          <select
            class="act trajectory"
            :value="matter.trajectory"
            aria-label="建立工作节奏趋势"
            :title="`趋势：${TRAJECTORY_LABEL[matter.trajectory] || matter.trajectory}`"
            @change="changeTrajectory(matter, ($event.target as HTMLSelectElement).value as Matter['trajectory'])"
          >
            <option v-for="(label, value) in TRAJECTORY_LABEL" :key="value" :value="value">{{ label }}</option>
          </select>
          <button class="act" title="放进今天" @click="toToday(matter)">今天</button>
          <button
            v-if="matter.status === 'active'"
            class="act"
            title="暂停"
            @click="setStatus(matter, 'paused')"
          >暂停</button>
          <button
            v-else
            class="act"
            title="恢复"
            @click="setStatus(matter, 'active')"
          >恢复</button>
          <button class="act del" title="归档" aria-label="归档" @click="setStatus(matter, 'archived')">✕</button>
        </div>
      </li>
    </ul>
    <form class="matter-create" @submit.prevent="submit">
      <div class="add-row">
        <input v-model="draft" class="add-input" maxlength="60" aria-label="新处境名称" placeholder="新增处境，回车确认…">
        <input v-model="draftWhy" class="add-input" maxlength="120" aria-label="处境为什么重要" placeholder="为什么重要（可选）…">
        <button class="chip on" type="submit">新增处境</button>
      </div>
      <details :open="showProblemFields" @toggle="showProblemFields = ($event.currentTarget as HTMLDetailsElement).open">
        <summary>问题驱动字段（可选）</summary>
        <div class="problem-fields">
          <label>现实问题<input v-model="problemFields.problem" aria-label="现实问题" maxlength="120"></label>
          <label>期望变化<input v-model="problemFields.desiredChange" aria-label="期望变化" maxlength="120"></label>
          <label>进展证据<input v-model="problemFields.progressEvidence" aria-label="进展证据" maxlength="120"></label>
          <label>当前缺口<input v-model="problemFields.currentGap" aria-label="当前缺口" maxlength="120"></label>
          <label>下一次验证<input v-model="problemFields.nextTest" aria-label="下一次验证" maxlength="120"></label>
          <label>停止条件<input v-model="problemFields.stopCondition" aria-label="停止条件" maxlength="120"></label>
        </div>
      </details>
    </form>
  </LbPanel>

  <LbCollapsible block="matterStats" :rank="3">
    <LbPanel title="处境统计">
      <LbStatGrid :stats="stats" />
    </LbPanel>
  </LbCollapsible>

  <LbCollapsible block="matterArchive" :rank="3">
    <LbPanel title="已归档" :note="archived.length ? `${archived.length} 件` : '—'">
      <ul class="ov-list">
        <li v-if="!archived.length" class="dim">还没有归档的处境。</li>
        <li v-for="matter in archived.slice(0, 8)" :key="matter.calmyId">
          <b>{{ matter.title }}</b>
          <span class="right" role="button" tabindex="0" title="恢复到暂停" @click="setStatus(matter, 'paused')" @keydown.enter="setStatus(matter, 'paused')">恢复</span>
        </li>
      </ul>
    </LbPanel>
  </LbCollapsible>
</template>

<style scoped>
/* 处境行没有勾选框（它不是一天内的行动），去掉 .box 的占位后让文字从左起排 */
.task .text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task .tag {
  flex: none;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 生命周期筛选（旧页面的「处境筛选」）与「问题驱动」字段区 */
.matter-filter {
  margin-bottom: 8px;
}
.matter-filter label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 0.72rem;
}
.matter-filter select {
  min-height: 30px;
  padding: 4px 8px;
  font-size: 0.75rem;
}
.trajectory {
  width: auto;
  min-width: 4.5em;
  height: 26px;
  padding: 0 4px;
  font-size: 0.68rem;
}
.matter-create .add-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.matter-create .add-input {
  flex: 1;
  min-width: 0;
}
.matter-create details {
  margin-top: 8px;
}
.matter-create summary {
  cursor: pointer;
  color: var(--muted);
  font-size: 0.7rem;
}
.problem-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.problem-fields label {
  display: grid;
  gap: 5px;
  color: var(--muted);
  font-size: 0.7rem;
}
.problem-fields input {
  padding: 6px 8px;
  font: inherit;
  font-size: 0.78rem;
}
</style>
