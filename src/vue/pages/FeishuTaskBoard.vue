<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { feishuWorkspace } from '@/domain/feishu/workspace-instance'
import { watchFeishuWorkspace, type WorkspaceSnapshot } from '@/core/feishu/workspace'
import { boundField, fieldValue, statusOptions, valueText } from '@/core/feishu/model'
import type { FeishuRecord } from '@/core/api/feishu'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'

// 飞书分支的页面头（旧壳时期这里渲染 .page-head，靠外壳的 DOM 探针兜底；现已统一成 .slide-head）
useOwnSlideHead()

const snapshot=ref<WorkspaceSnapshot>(feishuWorkspace.getSnapshot());const query=ref('');const over=ref('');const selected=ref('');const table=ref<'tasks'|'projects'>('tasks');const view=ref<'board'|'table'>('board');const draft=ref('');const projectId=ref('');const message=ref('');let stop:(()=>void)|undefined
const records=computed(()=>{const term=query.value.trim().toLowerCase();return snapshot.value.tables.tasks.filter(record=>!term||Object.values(record.fields).map(valueText).join(' ').toLowerCase().includes(term))})
const projectRecords=computed(()=>{const term=query.value.trim().toLowerCase();return snapshot.value.tables.projects.filter(record=>!term||Object.values(record.fields).map(valueText).join(' ').toLowerCase().includes(term))})
const columns=computed(()=>statusOptions(snapshot.value.fields.tasks||[],snapshot.value.bindings.tasks||{},records.value))
const projectOptions=computed(()=>[{value:'',label:'不关联项目'},...snapshot.value.tables.projects.map(record=>({value:record.record_id,label:projectTitle(record)}))])
const selectedRecord=computed(()=>snapshot.value.tables.tasks.find(record=>record.record_id===selected.value))
function title(record:FeishuRecord){return valueText(fieldValue(record,snapshot.value.fields.tasks||[],snapshot.value.bindings.tasks||{},'title'))||'标题字段未识别'}
function projectTitle(record:FeishuRecord){return valueText(fieldValue(record,snapshot.value.fields.projects||[],snapshot.value.bindings.projects||{},'title'))||'标题字段未识别'}
function status(record:FeishuRecord){return valueText(fieldValue(record,snapshot.value.fields.tasks||[],snapshot.value.bindings.tasks||{},'status'))||'未设置'}
function taskStatusOptions(record:FeishuRecord){const current=status(record);const field=boundField(snapshot.value.fields.tasks||[],snapshot.value.bindings.tasks||{},'status');const available=field?.type===3?field.property?.options?.map(option=>option.name)||[]:[];return [...new Set([current,...available])].map(value=>({value,label:value,disabled:!available.includes(value)}))}
function text(record:FeishuRecord,role:'project'|'due'|'owner'|'body'){const raw=fieldValue(record,snapshot.value.fields.tasks||[],snapshot.value.bindings.tasks||{},role);return valueText(raw)}
async function move(recordId:string,next:string){const record=records.value.find(item=>item.record_id===recordId);if(!record||status(record)===next||snapshot.value.saving)return;try{await feishuWorkspace.changeStatus(recordId,next);window.dispatchEvent(new CustomEvent('beryl-toast',{detail:{message:`已将任务移到「${next}」`,kind:'success'}}))}catch(cause){window.dispatchEvent(new CustomEvent('beryl-toast',{detail:{message:cause instanceof Error?cause.message:'拖拽保存未确认',kind:'error'}}))}finally{over.value=''}}
function drop(event:DragEvent,target:string){event.preventDefault();const id=event.dataTransfer?.getData('text/plain')||selected.value;if(id)void move(id,target)}
function date(raw:string){if(!raw)return '无截止日期';const d=new Date(/^\d+$/.test(raw)?Number(raw):raw);return Number.isNaN(d.getTime())?raw:d.toLocaleDateString('zh-CN')}
function titleTypeMissing(){const field=boundField(snapshot.value.fields.tasks||[],snapshot.value.bindings.tasks||{},'title');return snapshot.value.ready&&!field}
async function create(){if(!draft.value.trim()||!snapshot.value.ready||snapshot.value.saving||titleTypeMissing())return;message.value='';try{await feishuWorkspace.createTask(draft.value,projectId.value);draft.value='';projectId.value='';message.value='任务已保存到飞书。'}catch(cause){message.value=cause instanceof Error?cause.message:'任务保存未确认'}}
onMounted(()=>{snapshot.value=feishuWorkspace.getSnapshot();stop=watchFeishuWorkspace(feishuWorkspace)})
onUnmounted(()=>stop?.())
</script>
<template>
  <div class="feishu-page"><header class="slide-head"><div class="head-main"><p class="hint">看板 · 飞书</p><div class="head-title-row"><h2>任务看板</h2><span class="info" tabindex="0" data-tip="拖到其他状态列即可更新飞书；也可以用卡片里的状态选择。H 收起辅助信息。" aria-label="看板说明">i</span></div></div></header><slot name="toolbar" /><section class="feishu-read-state" aria-label="飞书连接状态"><span role="status">{{snapshot.error?'飞书连接暂不可用':snapshot.loading?'正在连接飞书并读取数据…':snapshot.lastRead?`上次读取 ${new Date(snapshot.lastRead).toLocaleTimeString('zh-CN')}`:'尚未读取飞书数据'}}</span><button class="chip" :disabled="snapshot.loading||snapshot.saving" @click="feishuWorkspace.refresh()">刷新</button></section><p v-if="snapshot.error" class="panel" role="alert">{{snapshot.error}}</p><p v-if="snapshot.tableErrors[table]" role="alert">{{table==='tasks'?'任务':'项目'}}：{{snapshot.tableErrors[table]}}。已读数据仅供参考。</p>
    <section class="feishu-overview panel"><div class="seg" role="tablist" aria-label="飞书数据表"><button role="tab" :aria-selected="table==='tasks'" :class="{on:table==='tasks'}" @click="table='tasks'">任务 {{snapshot.tables.tasks.length}}</button><button role="tab" :aria-selected="table==='projects'" :class="{on:table==='projects'}" @click="table='projects'">项目 {{snapshot.tables.projects.length}}</button></div></section><input class="feishu-search" aria-label="搜索飞书数据" placeholder="搜索…" v-model="query"/>
    <template v-if="table==='tasks'"><section class="feishu-composer panel" aria-label="创建飞书任务"><label>任务标题<textarea aria-label="飞书任务标题" v-model="draft" :disabled="snapshot.saving" @keydown.ctrl.enter.prevent="create" @keydown.meta.enter.prevent="create" placeholder="只写一个可以去做的下一步…"/></label><div class="add-row"><label>项目（可选）<select id="feishu-board-project" aria-label="飞书任务关联项目" v-model="projectId" :disabled="snapshot.saving||!!snapshot.tableErrors.projects"><option v-for="option in projectOptions" :key="option.value" :value="option.value">{{option.label}}</option></select></label><button class="chip on" :disabled="!draft.trim()||!snapshot.ready||titleTypeMissing()||snapshot.saving" @click="create">保存到飞书</button></div><p v-if="message" role="status">{{message}}</p><p v-if="titleTypeMissing()" role="alert">任务标题字段缺失或类型已变化，暂不能新增。</p><small>不要求日期或优先级；不会另建本地行动。</small></section><div class="feishu-view-switch detail-chips" role="group" aria-label="任务视图"><button :class="['chip',{on:view==='board'}]" @click="view='board'">看板</button><button :class="['chip',{on:view==='table'}]" @click="view='table'">表格</button></div>
    <section v-if="view==='board'" class="task-board feishu-task-board" aria-label="飞书任务看板"><div v-for="column in columns" :key="column" class="task-board-column" :class="{'drop-active':over===column}" @dragover.prevent="over=column" @dragleave="over=''" @drop="drop($event,column)"><div class="task-board-column-head"><div><h2>{{column}}</h2><small>拖到这里即可更新飞书</small></div><span>{{records.filter(item=>status(item)===column).length}}</span></div><div class="task-board-column-body"><article v-for="record in records.filter(item=>status(item)===column)" :key="record.record_id" class="task-board-card panel" draggable="true" @dragstart="selected=record.record_id;($event.dataTransfer as DataTransfer).setData('text/plain',record.record_id)"><div class="task-board-card-top"><span class="action-status">{{status(record)}}</span><span>飞书</span></div><h3>{{title(record)}}</h3><small>{{text(record,'project')||'未关联项目'}} · {{date(text(record,'due'))}}</small><small v-if="text(record,'owner')">执行人：{{text(record,'owner')}}</small><details v-if="text(record,'body')"><summary>已有解决方案</summary><p>{{text(record,'body')}}</p></details><label>状态<select :aria-label="`${title(record)}状态`" :value="status(record)" :disabled="!snapshot.ready||snapshot.saving||!taskStatusOptions(record).some(option=>!option.disabled)" @change="move(record.record_id, ($event.target as HTMLSelectElement).value)"><option v-for="option in taskStatusOptions(record)" :key="option.value" :value="option.value" :disabled="option.disabled">{{option.label}}</option></select></label><button class="feishu-detail-link" @click="selected=record.record_id">打开详情 →</button></article><p v-if="!records.some(item=>status(item)===column)" class="task-board-empty">拖拽任务到这里</p></div></div><p v-if="!columns.length">尚无任务或状态选项。</p></section>
    <div v-else class="feishu-table-wrap"><table class="feishu-table"><thead><tr><th>任务</th><th>状态</th><th>所属项目</th><th>截止时间</th><th>执行人</th></tr></thead><tbody><tr v-for="record in records" :key="record.record_id" @click="selected=record.record_id"><td><b>{{title(record)}}</b></td><td>{{status(record)}}</td><td>{{text(record,'project')||'—'}}</td><td>{{date(text(record,'due'))}}</td><td>{{text(record,'owner')||'—'}}</td></tr></tbody></table><p v-if="!records.length" class="task-board-empty">尚无匹配任务。</p></div></template>
    <section v-else class="feishu-record-grid" aria-label="飞书项目列表"><article v-for="record in projectRecords" :key="record.record_id" class="feishu-record-card panel"><small>{{valueText(fieldValue(record,snapshot.fields.projects||[],snapshot.bindings.projects||{},'status'))||'未设置状态'}}</small><h2>{{projectTitle(record)}}</h2><p>{{valueText(fieldValue(record,snapshot.fields.projects||[],snapshot.bindings.projects||{},'body'))||'未填写目标'}}</p><small>截止：{{date(valueText(fieldValue(record,snapshot.fields.projects||[],snapshot.bindings.projects||{},'due')))}} · 飞书完成度：{{valueText(fieldValue(record,snapshot.fields.projects||[],snapshot.bindings.projects||{},'progress'))||'—'}}</small></article><p v-if="!projectRecords.length">尚无匹配项目。</p></section>
    <aside v-if="selectedRecord" class="feishu-detail-panel" aria-label="飞书任务详情"><div class="feishu-detail-head"><div><small>任务详情 · 飞书原记录</small><h2>{{title(selectedRecord)}}</h2></div><button type="button" aria-label="关闭详情" @click="selected=''">×</button></div><div class="feishu-detail-fields"><div v-for="field in snapshot.fields.tasks||[]" :key="field.field_id"><small>{{field.field_name}}</small><p>{{valueText(selectedRecord.fields[field.field_name])||'未填写'}}</p></div></div><small class="feishu-detail-id">record_id：{{selectedRecord.record_id}}</small></aside>
  </div>
</template>

<style scoped>
/* 这个分支是「看板」页的子组件，但它自带 `.feishu-page` 包装（旧 app.css 给它设了宽度上限并居中）。
 * 放进外壳的 .inner 后必须显式铺满，否则整块内容被挤成中间一窄列（第 25 轮截图发现）。
 * 类名 .feishu-page / .feishu-search / .feishu-view-switch 等保持不动（parity 测试钩子）。 */
.feishu-page {
  display: flex;
  flex-direction: column;
  gap: clamp(8px, 1.2vh, 14px);
  width: 100%;
  max-width: none;
  margin: 0;
}
</style>
