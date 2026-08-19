<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { matterRepository } from '@/domain/matter/repository'
import { recordRepository } from '@/domain/record/repository'
import { MatterDomainError } from '@/domain/matter/model'

const route = useRoute(); const router = useRouter(); const tick = ref(0)
const recordBody = ref(''); const contradiction = ref(''); const why = ref('')
const matter = computed(() => { void tick.value; return matterRepository.find(String(route.params.id)) })
const history = computed(() => { void tick.value; return matter.value ? matterRepository.mutations(matter.value.calmyId) : [] })
const records = computed(() => { void tick.value; return matter.value ? recordRepository.list().filter(item => item.matterId === matter.value?.calmyId) : [] })

function refresh() { tick.value++ }
function saveContext() {
  if (!matter.value) return
  try { matterRepository.update(matter.value.calmyId, { why: why.value, primaryContradiction: contradiction.value }, { expectedRevision: matter.value.revision }); ElMessage.success('已保存'); refresh() }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : '保存失败') }
}
function transition(status: 'active' | 'paused' | 'archived') {
  if (!matter.value) return
  try { matterRepository.transition(matter.value.calmyId, status, { expectedRevision: matter.value.revision }); refresh() }
  catch (error) { ElMessage.error(error instanceof MatterDomainError ? error.message : '状态更新失败') }
}
function addRecord() {
  if (!matter.value || !recordBody.value.trim()) { ElMessage.warning('先写下一条真实记录'); return }
  recordRepository.create({ body: recordBody.value, matterId: matter.value.calmyId }); recordBody.value = ''; refresh(); ElMessage.success('已记录现实')
}
</script>

<template>
  <div v-if="matter" class="matter-page">
    <button class="back" @click="router.push('/app/matters')">← 返回 Matters</button>
    <header class="matter-head"><div><p class="eyebrow">MATTER · REVISION {{ matter.revision }}</p><h1 class="font-title">{{ matter.title }}</h1><p>{{ matter.why || '还没有写下为什么值得处理。' }}</p></div><span class="status">{{ matter.status }}</span></header>
    <section class="actions"><button v-if="matter.status === 'active'" @click="transition('paused')">暂停</button><button v-if="matter.status === 'paused'" @click="transition('active')">恢复</button><button v-if="matter.status !== 'archived'" @click="transition('archived')">归档</button><button v-if="matter.status === 'archived'" @click="transition('paused')">恢复为暂停</button></section>
    <div class="detail-grid"><main>
      <section class="panel beryl-card"><div class="panel-head"><div><p class="eyebrow">CONTEXT</p><h2 class="font-title">当前上下文</h2></div><button @click="saveContext">保存</button></div><label>为什么现在值得处理？<textarea v-model="why" :placeholder="matter.why || '写下一句话即可'" @focus="why = matter?.why || ''" /></label><label>当前主要矛盾<textarea v-model="contradiction" :placeholder="matter.primaryContradiction || '还可以在实践后补充'" @focus="contradiction = matter?.primaryContradiction || ''" /></label></section>
      <section class="panel beryl-card"><div class="panel-head"><div><p class="eyebrow">REALITY RECORD</p><h2 class="font-title">记录真实</h2></div><span>事实先于解释</span></div><textarea v-model="recordBody" placeholder="今天实际发生了什么？不要急着评价。" /><div class="record-footer"><small>Record 会保留发生时间与修订历史</small><button @click="addRecord">保存记录</button></div><div v-if="records.length" class="record-list"><article v-for="record in records" :key="record.calmyId"><time>{{ new Date(record.occurredAt).toLocaleString('zh-CN') }}</time><p>{{ record.body }}</p><small>revision {{ record.revision }} · {{ record.source }}</small></article></div></section>
    </main><aside>
      <section class="panel beryl-card"><p class="eyebrow">MODEL</p><dl><dt>状态</dt><dd>{{ matter.status }}</dd><dt>阶段</dt><dd>{{ matter.currentStage }}</dd><dt>趋势</dt><dd>{{ matter.trajectory }}</dd><dt>身份</dt><dd>{{ matter.calmyId }}</dd></dl></section>
      <section class="panel beryl-card"><p class="eyebrow">MUTATION LOG</p><div class="mutation-list"><article v-for="item in history" :key="item.id"><b>{{ item.operation }}</b><span>{{ item.fromRevision }} → {{ item.toRevision }}</span><small>{{ new Date(item.occurredAt).toLocaleString('zh-CN') }}</small></article></div></section>
    </aside></div>
  </div>
  <div v-else class="empty beryl-card"><h2 class="font-title">Matter 不存在</h2><button @click="router.push('/app/matters')">返回 Matters</button></div>
</template>

<style scoped>
.back{border:0;background:transparent;color:var(--c-text-2);padding:0;margin:4px 0 24px;cursor:pointer}.matter-head{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:16px}.eyebrow{font-size:10px;letter-spacing:.13em;color:var(--scene);font-weight:700;margin:0 0 8px}.matter-head h1{font-size:clamp(30px,4vw,48px);line-height:1.05;margin:0;letter-spacing:-.035em}.matter-head p:last-child{color:var(--c-text-2);font-size:13px;margin:12px 0 0}.status{font-size:11px;padding:7px 10px;border-radius:99px;background:var(--scene-soft);color:var(--scene)}.actions{display:flex;gap:8px;margin-bottom:24px}.actions button,.panel-head button,.record-footer button,.empty button{border:1px solid var(--c-border);background:var(--c-card);border-radius:8px;padding:8px 12px;color:var(--c-text);cursor:pointer;font-size:12px}.actions button:hover,.panel-head button:hover,.record-footer button:hover{border-color:var(--scene);color:var(--scene)}.detail-grid{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:16px}.detail-grid main,.detail-grid aside{display:grid;align-content:start;gap:16px}.panel{padding:18px}.panel-head{display:flex;justify-content:space-between;align-items:start;gap:12px;margin-bottom:16px}.panel-head h2{font-size:23px;margin:0}.panel-head>span{font-size:10px;color:var(--c-text-3)}label{display:grid;gap:6px;font-size:11px;color:var(--c-text-2);margin-top:14px}textarea{width:100%;min-height:82px;resize:vertical;border:1px solid var(--c-border);border-radius:9px;background:var(--c-bg);color:var(--c-text);padding:10px;font:inherit;font-size:13px;line-height:1.6;box-sizing:border-box}label:first-of-type textarea{min-height:60px}.record-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px}.record-footer small{font-size:10px;color:var(--c-text-3)}.record-list{border-top:1px solid var(--c-border-soft);margin-top:16px}.record-list article{padding:13px 0;border-bottom:1px solid var(--c-border-soft)}.record-list time,.record-list small{display:block;font-size:10px;color:var(--c-text-3)}.record-list p{font-size:13px;line-height:1.6;margin:6px 0}.panel dl{display:grid;grid-template-columns:72px 1fr;gap:10px;margin:14px 0 0;font-size:12px}.panel dt{color:var(--c-text-3)}.panel dd{margin:0;color:var(--c-text-2);overflow-wrap:anywhere}.mutation-list{display:grid;gap:12px;margin-top:16px}.mutation-list article{display:grid;grid-template-columns:1fr auto;gap:4px;border-left:2px solid var(--scene-border-strong);padding-left:9px}.mutation-list b{font-size:11px;color:var(--scene)}.mutation-list span,.mutation-list small{font-size:10px;color:var(--c-text-3)}.mutation-list small{grid-column:1/-1}.empty{text-align:center;padding:70px;color:var(--c-text-2)}.empty h2{font-size:26px;margin:0 0 18px}@media(max-width:760px){.matter-head{display:block}.status{display:inline-block;margin-top:14px}.detail-grid{grid-template-columns:1fr}.detail-grid aside{grid-template-columns:1fr 1fr}.panel{padding:15px}}@media(max-width:540px){.detail-grid aside{grid-template-columns:1fr}.record-footer{align-items:start;flex-direction:column}.actions{flex-wrap:wrap}}
</style>
