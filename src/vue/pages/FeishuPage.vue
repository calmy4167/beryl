<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { feishuWorkspace } from '@/domain/feishu/workspace-instance'
import { watchFeishuWorkspace, type WorkspaceSnapshot } from '@/core/feishu/workspace'
import type { FeishuRecord, FeishuTableKey } from '@/core/api/feishu'
import { boundField, fieldValue, relationIds, statusOptions, valueText, type FieldRole } from '@/core/feishu/model'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'

// 页面自带头部（参考稿里 .slide-head 属于页面自身），外壳因此不再渲染第二行标题。
useOwnSlideHead()

const workspace = feishuWorkspace
const snapshot = ref<WorkspaceSnapshot>(workspace.getSnapshot()); const table = ref<FeishuTableKey>('tasks'); const view = ref<'board'|'table'>('board'); const query = ref(''); const draft = ref(''); const projectId = ref(''); const message = ref(''); const detailId = ref(''); const dropTarget = ref(''); const expandedProjectId = ref(''); const relatedTaskErrors = ref<Record<string, string>>({})
let stopPolling: (() => void) | undefined; let unsubscribe: (() => void) | undefined
const tables: FeishuTableKey[] = ['tasks','projects','reviews','members']
const tableLabels: Record<FeishuTableKey,string> = { tasks:'任务',projects:'项目',reviews:'周报',members:'成员' }
function tableLabelSegments(key: FeishuTableKey): string[] { return [tableLabels[key], ' ', String(snapshot.value.tables[key].length)] }
const normalized = computed(() => query.value.trim().toLocaleLowerCase())
const records = computed(() => snapshot.value.tables[table.value].filter(item => !normalized.value || Object.values(item.fields).map(valueText).join(' ').toLocaleLowerCase().includes(normalized.value)))
const columns = computed(() => statusOptions(snapshot.value.fields.tasks || [],snapshot.value.bindings.tasks || {},records.value))
const selectedDetail = computed(() => snapshot.value.tables.tasks.find(item => item.record_id === detailId.value))
const titleField = computed(() => boundField(snapshot.value.fields.tasks || [],snapshot.value.bindings.tasks || {},'title'))
const projectField = computed(() => boundField(snapshot.value.fields.tasks || [],snapshot.value.bindings.tasks || {},'project'))
const projectOptions = computed(() => [{ value: '', label: '不关联项目' }, ...snapshot.value.tables.projects.map(record => ({ value: record.record_id, label: recordTitle(record, 'projects') }))])
const canCreate = computed(() => snapshot.value.ready && titleField.value?.type === 1)
const cacheTime = computed(() => snapshot.value.cacheUpdatedAt ? new Date(snapshot.value.cacheUpdatedAt).toLocaleString('zh-CN') : '')
function raw(record: FeishuRecord, key: FeishuTableKey, role: FieldRole): unknown { return fieldValue(record,snapshot.value.fields[key] || [],snapshot.value.bindings[key] || {},role) }
function text(record: FeishuRecord, key: FeishuTableKey, role: FieldRole): string { const value = raw(record,key,role); let target: FeishuTableKey | '' = role === 'project' ? 'projects' : key === 'tasks' && role === 'owner' ? 'members' : ''; if (target) { const names = relationIds(value).map(id => { const item = snapshot.value.tables[target].find(candidate => candidate.record_id === id); return item ? valueText(raw(item,target,'title')) || id : id }); if (names.length) return names.join('、') }; return valueText(value) }
function recordTitle(record: FeishuRecord,key: FeishuTableKey) { return text(record,key,'title') || '标题字段未识别' }
function taskStatusOptions(record: FeishuRecord) { const current = text(record, 'tasks', 'status') || '未设置'; const field = boundField(snapshot.value.fields.tasks || [], snapshot.value.bindings.tasks || {}, 'status'); const available = field?.type === 3 ? field.property?.options?.map(option => option.name) || [] : []; return [...new Set([current, ...available])].map(value => ({ value, label: value, disabled: !available.includes(value) })) }
function dateLabel(value: unknown) { if (value == null || value === '') return '无截止日期'; const rawValue = valueText(value); const date = new Date(/^\d+$/.test(rawValue) ? Number(rawValue) : rawValue); return Number.isNaN(date.getTime()) ? rawValue : date.toLocaleDateString('zh-CN') }
function toast(messageText: string,kind: 'success'|'warning'|'error'='success') { window.dispatchEvent(new CustomEvent('beryl-toast',{detail:{message:messageText,kind}})) }
function readState() { const s=snapshot.value; return s.saving?'正在写入飞书…':s.loading?cacheTime.value?`正在检查更新 · 当前显示 ${cacheTime.value} 的本机缓存`:'正在连接飞书并读取数据…':s.error?cacheTime.value?`飞书暂不可用 · 当前显示 ${cacheTime.value} 的本机缓存（只读）`:'飞书未连接，尚无本机缓存':s.usingCache&&cacheTime.value?`部分数据来自本机缓存 · ${cacheTime.value}`:s.lastRead?`上次读取 ${new Date(s.lastRead).toLocaleTimeString('zh-CN')}`:'尚未读取飞书数据' }
async function createTask() { if (!draft.value.trim() || !canCreate.value || snapshot.value.saving) return; message.value=''; try { await workspace.createTask(draft.value,projectId.value); draft.value='';projectId.value='';message.value='任务已保存到飞书。';toast(message.value) } catch(cause) { message.value=cause instanceof Error?cause.message:'任务保存未确认';toast('飞书保存未确认，输入已保留，请先检查飞书。','error') } }
async function changeStatus(record: FeishuRecord,status: string) { try { await workspace.changeStatus(record.record_id,status); toast(`已将任务移到「${status}」`) } catch(cause) { toast(cause instanceof Error?cause.message:'飞书保存未确认','error') } }
async function changeRelatedTaskStatus(record: FeishuRecord,status: string) { relatedTaskErrors.value[record.record_id]=''; try { await workspace.changeStatus(record.record_id,status) } catch(cause) { relatedTaskErrors.value[record.record_id]=cause instanceof Error?cause.message:'保存失败' } }
async function drop(event: DragEvent,status: string) { event.preventDefault(); const id=event.dataTransfer?.getData('text/plain') || detailId.value; const record=records.value.find(item=>item.record_id===id);dropTarget.value='';if(!record || text(record,'tasks','status')===status || snapshot.value.saving)return;await changeStatus(record,status) }
onMounted(() => { unsubscribe=workspace.subscribe(()=>{snapshot.value=workspace.getSnapshot()});stopPolling=watchFeishuWorkspace(workspace) })
onUnmounted(() => { stopPolling?.();unsubscribe?.() })
</script>
<template>
  <div class="feishu-page">
    <header class="slide-head"><div class="head-main"><p class="hint">飞书 · 工作区</p><div class="head-title-row"><h2>与记录、今天共用同一份飞书数据。</h2><span class="info" tabindex="0" data-tip="项目、周报和成员只读；任务可新增、修改状态。H 收起辅助信息。" aria-label="飞书说明">i</span></div></div></header>
    <section class="beryl-card workspace-source" aria-label="数据来源"><div><b>数据来源</b><div class="range-tabs" role="group" aria-label="选择数据来源"><button type="button" aria-pressed="false" disabled>本地</button><button type="button" class="on" aria-pressed="true" :disabled="snapshot.saving">飞书</button></div></div><small>任务直接保存在飞书；前台每 15 秒检查更新。 此工作台始终显示飞书。</small><RouterLink to="/app/admin">连接设置 →</RouterLink><RouterLink to="/app/feishu">飞书 →</RouterLink></section>
    <section class="feishu-read-state" aria-label="飞书连接状态"><span role="status">{{readState()}}</span><button class="chip" :disabled="snapshot.loading||snapshot.saving" @click="workspace.refresh()">刷新</button></section>
    <section v-if="snapshot.error" class="panel feishu-error" role="alert"><b>飞书连接暂不可用</b><p class="dim">{{snapshot.error}}</p><small class="dim">{{cacheTime?`下方内容来自本机缓存，更新时间：${cacheTime}。当前只能查看，不能修改飞书数据。`:'没有可显示的本机缓存；连接恢复后可重新读取飞书数据。'}}</small><p><RouterLink to="/app/admin">检查 Worker 地址与同步密码</RouterLink></p></section><p v-if="snapshot.writeError" class="panel feishu-message" role="alert">{{snapshot.writeError}}</p>
    <section class="panel feishu-overview"><div class="seg" role="tablist" aria-label="飞书数据表"><button v-for="key in tables" :key="key" type="button" role="tab" :aria-selected="key===table" :class="{on:key===table}" @click="table=key"><template v-for="(segment,index) in tableLabelSegments(key)" :key="index">{{segment}}</template></button></div></section><input class="feishu-search" aria-label="搜索飞书数据" placeholder="搜索…" v-model="query">
    <p v-if="snapshot.tableErrors[table]" role="alert">{{tableLabels[table]}}：{{snapshot.tableErrors[table]}}。已读数据仅供参考。</p>
    <template v-if="table==='tasks'"><section class="panel feishu-composer" aria-label="创建飞书任务"><label>任务标题<textarea aria-label="飞书任务标题" v-model="draft" :disabled="snapshot.saving" @keydown.ctrl.enter.prevent="createTask" @keydown.meta.enter.prevent="createTask" placeholder="只写一个可以去做的下一步…"/></label><div class="create-row"><label>项目（可选）<select id="feishu-project-picker" aria-label="飞书任务关联项目" v-model="projectId" :disabled="snapshot.saving||!!snapshot.tableErrors.projects||!projectField||![18,21].includes(projectField.type)"><option v-for="option in projectOptions" :key="option.value" :value="option.value">{{option.label}}</option></select></label><button class="chip on" :disabled="!draft.trim()||!canCreate||snapshot.saving" @click="createTask">{{snapshot.saving?'正在保存…':'保存到飞书'}}</button></div><p v-if="snapshot.ready&&!canCreate" role="alert">任务标题字段缺失或类型已变化，暂不能新增。</p><small>不要求日期或优先级；不会另建本地行动。Ctrl / ⌘ + Enter 保存。</small><p v-if="message" role="status">{{message}}</p></section>
      <div class="feishu-view-switch detail-chips" role="group" aria-label="任务视图"><button :class="['chip',{on:view==='board'}]" @click="view='board'">看板</button><button :class="['chip',{on:view==='table'}]" @click="view='table'">表格</button></div>
      <section v-if="view==='board'" class="task-board feishu-task-board" aria-label="飞书任务看板"><div v-for="status in columns" :key="status" class="task-board-column" :class="{'drop-active':dropTarget===status}" @dragover.prevent="dropTarget=status" @dragleave="dropTarget=''" @drop="drop($event,status)"><div class="task-board-column-head"><div><h2>{{status}}</h2><small>拖到这里即可更新飞书</small></div><span>{{records.filter(item=>text(item,'tasks','status')===status).length}}</span></div><div class="task-board-column-body"><article v-for="record in records.filter(item=>text(item,'tasks','status')===status)" :key="record.record_id" class="task-board-card panel" draggable="true" @dragstart="detailId=record.record_id;($event.dataTransfer as DataTransfer).setData('text/plain',record.record_id)"><div class="task-board-card-top"><span class="action-status">{{text(record,'tasks','status')||'未设置'}}</span><span>飞书</span></div><h3>{{recordTitle(record,'tasks')}}</h3><small>{{text(record,'tasks','project')||'未关联项目'}} · {{dateLabel(raw(record,'tasks','due'))}}</small><small v-if="text(record,'tasks','owner')">执行人：{{text(record,'tasks','owner')}}</small><details v-if="text(record,'tasks','body')"><summary>已有解决方案</summary><p>{{text(record,'tasks','body')}}</p></details><label>状态<select :aria-label="`${recordTitle(record, 'tasks')}状态`" :value="text(record, 'tasks', 'status')||'未设置'" :disabled="!snapshot.ready||snapshot.saving||!taskStatusOptions(record).some(option => !option.disabled)" @change="changeStatus(record, ($event.target as HTMLSelectElement).value)"><option v-for="option in taskStatusOptions(record)" :key="option.value" :value="option.value" :disabled="option.disabled">{{option.label}}</option></select></label><button class="feishu-detail-link" @click="detailId=record.record_id">打开详情 →</button></article><p v-if="!records.some(item=>text(item,'tasks','status')===status)" class="task-board-empty">拖拽任务到这里</p></div></div><p v-if="!columns.length">尚无任务或状态选项。</p></section>
      <div v-else class="feishu-table-wrap"><table class="feishu-table"><thead><tr><th>任务</th><th>状态</th><th>所属项目</th><th>截止时间</th><th>执行人</th></tr></thead><tbody><tr v-for="record in records" :key="record.record_id" @click="detailId=record.record_id"><td><b>{{recordTitle(record,'tasks')}}</b></td><td>{{text(record,'tasks','status')||'未设置'}}</td><td>{{text(record,'tasks','project')||'—'}}</td><td>{{dateLabel(raw(record,'tasks','due'))}}</td><td>{{text(record,'tasks','owner')||'—'}}</td></tr></tbody></table><p v-if="!records.length" class="task-board-empty">尚无匹配任务。</p></div>
    </template>
    <section v-else-if="table==='projects'" class="feishu-record-grid" aria-label="飞书项目列表"><article v-for="record in records" :key="record.record_id" class="feishu-record-card panel"><small>{{text(record,'projects','status')||'未设置状态'}}</small><h2>{{recordTitle(record,'projects')}}</h2><p>{{text(record,'projects','body')||'未填写目标'}}</p><small>截止：{{dateLabel(raw(record,'projects','due'))}}</small><p>飞书完成度：{{text(record,'projects','progress')||'—'}} · 已读取 {{snapshot.tables.tasks.filter(task=>relationIds(raw(task,'tasks','project')).includes(record.record_id)).length}} 项关联任务</p><button type="button" class="chip" :aria-expanded="expandedProjectId===record.record_id" @click="expandedProjectId=expandedProjectId===record.record_id?'':record.record_id">查看关联任务</button><div v-if="expandedProjectId===record.record_id" class="feishu-project-tasks"><article v-for="task in snapshot.tables.tasks.filter(item=>relationIds(raw(item,'tasks','project')).includes(record.record_id))" :key="task.record_id" class="task-board-card panel" draggable="true" @dragstart="($event.dataTransfer as DataTransfer).setData('text/plain',task.record_id)"><div class="task-board-card-top"><span class="action-status" :class="text(task,'tasks','status')==='已完成'?'done':text(task,'tasks','status')==='进行中'?'in_progress':'planned'">{{text(task,'tasks','status')||'未设置'}}</span><span>飞书</span></div><h3>{{recordTitle(task,'tasks')}}</h3><small>{{text(task,'tasks','project')||'未关联项目'}} · {{dateLabel(raw(task,'tasks','due'))}}</small><small v-if="text(task,'tasks','owner')">执行人：{{text(task,'tasks','owner')}}</small><details v-if="text(task,'tasks','body')"><summary>已有解决方案</summary><p>{{text(task,'tasks','body')}}</p></details><label>状态<select :aria-label="`${recordTitle(task, 'tasks')}状态`" :value="text(task, 'tasks', 'status')||'未设置'" :disabled="!snapshot.ready||snapshot.saving||!taskStatusOptions(task).some(option=>!option.disabled)" @change="changeRelatedTaskStatus(task, ($event.target as HTMLSelectElement).value)"><option v-for="option in taskStatusOptions(task)" :key="option.value" :value="option.value" :disabled="option.disabled">{{option.label}}</option></select></label><small v-if="relatedTaskErrors[task.record_id]" role="alert">{{relatedTaskErrors[task.record_id]}}</small></article><p v-if="!snapshot.tables.tasks.some(item=>relationIds(raw(item,'tasks','project')).includes(record.record_id))">当前视图没有关联任务。</p></div></article><p v-if="!records.length">尚无匹配项目。</p></section>
    <section v-else class="feishu-record-grid" :aria-label="`飞书${tableLabels[table]}列表`"><article v-for="record in records" :key="record.record_id" class="feishu-record-card panel"><h2>{{recordTitle(record,table)}}</h2><p>{{text(record,table,'body')||'暂无内容'}}</p><small>{{text(record,table,'owner')}}{{table==='reviews'?` · ${dateLabel(raw(record,table,'due'))}`:''}}</small></article><p v-if="!records.length">尚无匹配记录。</p></section>
    <aside v-if="selectedDetail" class="feishu-detail-panel" aria-label="飞书任务详情"><div class="feishu-detail-head"><div><small>任务详情 · 飞书原记录</small><h2>{{recordTitle(selectedDetail,'tasks')}}</h2></div><button type="button" aria-label="关闭详情" @click="detailId=''">×</button></div><div class="feishu-detail-fields"><div v-for="field in snapshot.fields.tasks||[]" :key="field.field_id"><small>{{field.field_name}}</small><p>{{valueText(selectedDetail.fields[field.field_name])||'未填写'}}</p></div></div><small class="feishu-detail-id">record_id：{{selectedDetail.record_id}}</small></aside>
  </div>
</template>

<style scoped>
/* 页面局部排版：颜色一律取「留白」令牌。
   注意：数据来源那一块（.workspace-source）是页内自带的副本，`vue-feishu-parity` 对它的
   `<small>` 文案做了**精确匹配**断言，所以那一行保持原样没动。 */
/* 页面保留了 .feishu-page 包装（数据来源块在它里面），因此自己补面板间距；
   并把旧 app.css 给 .feishu-page 的宽度上限与居中撤掉（外壳的 .inner 已经给了宽度）。 */
.feishu-page { display: flex; flex-direction: column; gap: clamp(8px, 1.2vh, 14px); width: 100%; max-width: none; margin: 0; }
/* 页内链接（设置入口、数据来源那两条）跟随强调色，避免浏览器默认蓝紫 */
.feishu-page a { color: var(--accent); }

.feishu-error { border-color: color-mix(in srgb, var(--danger) 45%, transparent); }
.feishu-message { color: var(--danger); font-size: .78rem; }
.feishu-read-state { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.feishu-read-state span { color: var(--muted); font-size: .74rem; }

.feishu-overview { padding: 10px; }
.feishu-overview .seg { max-width: 100%; }
.feishu-search { min-height: 34px; padding: 6px 10px; font: inherit; font-size: .8rem; }

.feishu-composer { gap: 10px; }
.feishu-composer label { display: grid; gap: 6px; color: var(--muted); font-size: .72rem; }
.feishu-composer textarea { min-height: 64px; padding: 8px 10px; font: inherit; font-size: .82rem; line-height: 1.7; resize: vertical; }
.feishu-composer select { min-height: 34px; padding: 6px 10px; font: inherit; font-size: .8rem; }
.feishu-composer small { color: var(--muted); font-size: .68rem; }

.feishu-task-board { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; align-items: start; }
.feishu-task-board .task-board-column { min-height: 160px; }
.feishu-view-switch { justify-content: flex-start; }
.feishu-table-wrap { overflow-x: auto; }
.feishu-table { width: 100%; border-collapse: collapse; font-size: .78rem; }
.feishu-table th, .feishu-table td { padding: 9px 10px; border-bottom: 1px solid var(--line); text-align: left; }
.feishu-table th { color: var(--muted); font-size: .7rem; font-weight: 500; }
.feishu-record-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; align-items: start; }
.feishu-record-card { gap: 8px; }
.feishu-record-card h2 { margin: 0; font-size: .95rem; font-weight: 600; }
.feishu-record-card p { margin: 0; color: var(--muted); font-size: .78rem; line-height: 1.7; }
.feishu-record-card small { color: var(--muted); font-size: .68rem; }
.feishu-project-tasks { display: grid; gap: 8px; margin-top: 8px; }
.feishu-detail-panel { position: fixed; z-index: 40; top: 0; right: 0; width: min(430px, 92vw); height: 100vh; overflow: auto; padding: 26px 24px; border-left: 1px solid var(--line); background: var(--panel); }
.feishu-detail-head { display: flex; justify-content: space-between; gap: 14px; padding-bottom: 16px; border-bottom: 1px solid var(--line); }
.feishu-detail-head h2 { margin: 6px 0 0; font-size: 1.2rem; }
.feishu-detail-head button { width: 30px; height: 30px; border: 1px solid var(--line); border-radius: 8px; background: none; color: var(--muted); font-size: 1rem; cursor: pointer; }
.feishu-detail-fields > div { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.feishu-detail-fields small { color: var(--muted); font-size: .7rem; }
.feishu-detail-fields p { margin: 0; color: var(--fg); font-size: .8rem; line-height: 1.7; overflow-wrap: anywhere; }
.feishu-detail-id { display: block; margin-top: 16px; color: var(--muted); font-size: .68rem; word-break: break-all; }
</style>
