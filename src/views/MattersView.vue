<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter, MatterStatus } from '@/domain/matter/model'
import { applyOpenAssets, applyOpenEntities, currentOpenAssets, currentOpenEntities, currentOpenOrphanAssets, exportCurrentOpenWorkspace, removeOpenAssets, type OpenConflictDecision } from '@/core/content/open-workspace'
import { compareOpenAssets, compareOpenEntities, compareOpenEntityFields, importOpenWorkspace, type OpenEntityComparison, type OpenFieldConflict, type OpenFieldDecision, type OpenImportResult } from '@/core/content/open-format'

const router = useRouter()
const title = ref('')
const why = ref('')
const status = ref<'all' | MatterStatus>('active')
const tick = ref(0)
const loading = ref(true)
const matterItems = ref<Matter[]>([])
const vaultInput = ref<HTMLInputElement>()
const pendingImport = ref<OpenImportResult>()
const pendingComparison = ref<OpenEntityComparison>()
const conflictDecisions = ref<Record<string, OpenConflictDecision>>({})
const manualConflictId = ref<string>()
const manualFields = ref<OpenFieldConflict[]>([])
const manualDecisions = ref<Record<string, OpenFieldDecision>>({})
const all = computed(() => { void tick.value; return matterItems.value })
const orphanAssets = computed(() => { void tick.value; return currentOpenOrphanAssets() })
const items = computed(() => all.value.filter(item => status.value === 'all' || item.status === status.value))
const counts = computed(() => ({
  all: all.value.length,
  active: all.value.filter(item => item.status === 'active').length,
  paused: all.value.filter(item => item.status === 'paused').length,
  archived: all.value.filter(item => item.status === 'archived').length
}))

async function refreshMatters(): Promise<void> {
  loading.value = true
  try { matterItems.value = await matterAsyncRepository.list(); tick.value++ }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : '课题读取失败') }
  finally { loading.value = false }
}
async function create(): Promise<void> {
  if (!title.value.trim()) { ElMessage.warning('先写下一个现实事项'); return }
  const matter = await matterAsyncRepository.create({ title: title.value, why: why.value })
  title.value = ''; why.value = ''; await refreshMatters()
  router.push('/app/matters/' + matter.calmyId)
}
function onDataSynced(): void { void refreshMatters() }
onMounted(() => { void refreshMatters(); window.addEventListener('beryl-data-synced', onDataSynced) })
onUnmounted(() => window.removeEventListener('beryl-data-synced', onDataSynced))

interface DirectoryHandleLike {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandleLike>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{ createWritable(): Promise<{ write(value: string | Uint8Array): Promise<void>; close(): Promise<void> }> }>
}

async function writeWorkspaceToDirectory(root: DirectoryHandleLike, files: Record<string, string>, assets: { path: string; data: Uint8Array }[] = []): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const segments = path.split('/')
    const filename = segments.pop()
    if (!filename) continue
    let directory = root
    for (const segment of segments) directory = await directory.getDirectoryHandle(segment, { create: true })
    const writable = await (await directory.getFileHandle(filename, { create: true })).createWritable()
    await writable.write(content)
    await writable.close()
  }
  for (const asset of assets) {
    const segments = asset.path.split('/')
    const filename = segments.pop()
    if (!filename) continue
    let directory = root
    for (const segment of segments) directory = await directory.getDirectoryHandle(segment, { create: true })
    const writable = await (await directory.getFileHandle(filename, { create: true })).createWritable()
    await writable.write(asset.data)
    await writable.close()
  }
}

function downloadWorkspaceFiles(files: Record<string, string>, assets: { path: string; data: Uint8Array }[] = []): void {
  for (const [path, content] of Object.entries(files)) {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([content], { type: path.endsWith('.json') ? 'application/json' : 'text/markdown' }))
    link.download = path.split('/').join('__')
    link.click()
    URL.revokeObjectURL(link.href)
  }
  for (const asset of assets) {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([asset.data], { type: 'application/octet-stream' }))
    link.download = asset.path.split('/').join('__')
    link.click()
    URL.revokeObjectURL(link.href)
  }
}

async function exportVault(): Promise<void> {
  const workspace = exportCurrentOpenWorkspace()
  const picker = (window as Window & { showDirectoryPicker?: () => Promise<DirectoryHandleLike> }).showDirectoryPicker
  if (picker) {
    const root = await picker()
    await writeWorkspaceToDirectory(root, workspace.files, workspace.assets)
    ElMessage.success('已写入 Open Vault：' + (Object.keys(workspace.files).length + workspace.assets.length) + ' 个文件')
    return
  }
  downloadWorkspaceFiles(workspace.files, workspace.assets)
  ElMessage.success('浏览器不支持目录写入，已开始逐文件下载')
}

function clearPendingImport(): void {
  pendingImport.value = undefined
  pendingComparison.value = undefined
  conflictDecisions.value = {}
  manualConflictId.value = undefined
  manualFields.value = []
  manualDecisions.value = {}
}

function setConflictDecision(calmyId: string, decision: 'keep-local' | 'use-incoming'): void {
  conflictDecisions.value[calmyId] = decision
}

function formatOpenValue(value: unknown): string {
  if (typeof value === 'string') return value || '（空）'
  return JSON.stringify(value, null, 2) || '（空）'
}

function openManualMerge(conflict: OpenEntityComparison['conflicts'][number]): void {
  manualConflictId.value = conflict.calmyId
  manualFields.value = compareOpenEntityFields(conflict.local, conflict.incoming)
  manualDecisions.value = Object.fromEntries(manualFields.value.map(field => [field.key, 'keep-local' as OpenFieldDecision]))
}

function setManualDecision(key: string, decision: OpenFieldDecision): void {
  manualDecisions.value[key] = decision
}

function confirmManualMerge(): void {
  if (!manualConflictId.value) return
  conflictDecisions.value[manualConflictId.value] = { mode: 'merge', fields: { ...manualDecisions.value } }
  manualConflictId.value = undefined
  manualFields.value = []
  manualDecisions.value = {}
}

async function commitImport(result: OpenImportResult, comparison: OpenEntityComparison, decisions: Record<string, OpenConflictDecision> = {}): Promise<void> {
  try {
    const incomingChoices = comparison.conflicts.filter(item => decisions[item.calmyId] === 'use-incoming' || typeof decisions[item.calmyId] === 'object').length
    const assetCount = result.assets.length
    await ElMessageBox.confirm('将新增 ' + comparison.added.length + ' 个实体和 ' + assetCount + ' 个附件，跳过 ' + comparison.unchanged.length + ' 个未变化实体，处理 ' + incomingChoices + ' 个本地冲突。是否继续？', '确认导入 Open Vault', { type: 'warning' })
    const appliedAssets = applyOpenAssets(result.assets)
    const applied = applyOpenEntities(result.entities, decisions)
    tick.value++
    clearPendingImport()
    if (applied.conflicts.length || applied.errors.length || appliedAssets.conflicts.length) {
      ElMessage.warning('已新增 ' + applied.created + ' 个实体、' + appliedAssets.created + ' 个附件，替换 ' + applied.replaced + ' 个，合并 ' + applied.merged + ' 个，保留本地 ' + applied.keptLocal + ' 个；另有 ' + (applied.conflicts.length + applied.errors.length + appliedAssets.conflicts.length) + ' 个未写入。')
    } else {
      ElMessage.success('导入完成：新增 ' + applied.created + ' 个实体、' + appliedAssets.created + ' 个附件，替换 ' + applied.replaced + ' 个，合并 ' + applied.merged + ' 个，保留本地 ' + applied.keptLocal + ' 个')
    }
  } catch {
    ElMessage.info('已取消导入')
  }
}

async function applyConflictChoices(): Promise<void> {
  const result = pendingImport.value
  const comparison = pendingComparison.value
  if (!result || !comparison) return
  const missing = comparison.conflicts.filter(item => !conflictDecisions.value[item.calmyId])
  if (missing.length) {
    ElMessage.warning('请先为每个冲突选择处理方式')
    return
  }
  await commitImport(result, comparison, conflictDecisions.value)
}

function normalizeVaultPath(path: string, allPaths: string[]): string {
  const manifestPath = allPaths.find(item => item.endsWith('/_calmy/manifest.json') || item === '_calmy/manifest.json')
  const root = manifestPath ? manifestPath.slice(0, -'_calmy/manifest.json'.length) : ''
  return root && path.startsWith(root) ? path.slice(root.length) : path
}

async function importVault(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (!files.length) return
  const rawPaths = files.map(file => file.webkitRelativePath || file.name)
  const textEntries: Array<readonly [string, string]> = []
  const assets: { path: string; data: Uint8Array; mimeType: string }[] = []
  for (const file of files) {
    const rawPath = file.webkitRelativePath || file.name
    const path = normalizeVaultPath(rawPath, rawPaths)
    if (path.toLowerCase().endsWith('.md') || path === '_calmy/manifest.json') {
      textEntries.push([path, await file.text()])
    } else {
      assets.push({ path, data: new Uint8Array(await file.arrayBuffer()), mimeType: file.type || 'application/octet-stream' })
    }
  }
  const result = importOpenWorkspace(Object.fromEntries(textEntries), assets)
  if (result.issues.length || result.conflicts.length) {
    ElMessage.error('导入已停止：' + result.issues.length + ' 个文件问题，' + result.conflicts.length + ' 个冲突。未写入本地数据。')
    return
  }
  const assetComparison = compareOpenAssets(currentOpenAssets(), result.assets)
  if (assetComparison.conflicts.length) {
    ElMessage.error('导入已停止：发现 ' + assetComparison.conflicts.length + ' 个本地附件冲突，未写入本地数据。')
    return
  }
  if (result.orphanAssets.length) {
    ElMessage.warning('发现 ' + result.orphanAssets.length + ' 个未被 Markdown 引用的附件，本次保留，不会自动删除。')
  }
  const comparison = compareOpenEntities(currentOpenEntities(), result.entities)
  if (comparison.conflicts.length) {
    pendingImport.value = result
    pendingComparison.value = comparison
    conflictDecisions.value = {}
    ElMessage.warning('发现 ' + comparison.conflicts.length + ' 个本地修改，请逐条选择处理方式')
    return
  }
  await commitImport(result, comparison)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

async function cleanupOrphans(): Promise<void> {
  const targets = orphanAssets.value
  if (!targets.length) return
  try {
    await ElMessageBox.confirm('将删除 ' + targets.length + ' 个未被 Markdown 引用的附件。删除后不会自动恢复，是否继续？', '确认清理孤儿附件', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' })
    const removed = removeOpenAssets(targets.map(asset => asset.path))
    tick.value++
    ElMessage.success('已清理 ' + removed + ' 个孤儿附件')
  } catch {
    ElMessage.info('已取消清理')
  }
}
</script>

<template>
  <div class="matters-page">
    <header class="page-head">
      <div><p class="eyebrow">MVP MATTERS</p><h1 class="font-title">现实事项</h1><p>围绕一个现实问题，决定今天最小必要行动。</p></div>
<div class="head-actions"><input ref="vaultInput" aria-label="选择 Open Vault 文件夹或文件" type="file" multiple accept=".md,.json" webkitdirectory directory hidden @change="importVault"><el-button plain size="small" @click="exportVault">导出 Open Vault</el-button><el-button plain size="small" @click="vaultInput?.click()">导入 Vault</el-button></div>
      <div class="head-number"><b>{{ counts.active }}</b><span>{{ loading ? '读取中' : '进行中' }}</span></div>
    </header>

    <form class="new-matter beryl-card" @submit.prevent="create">
      <span class="matter-mark">◈</span>
<div class="new-fields"><el-input v-model="title" aria-label="Matter 标题" size="large" placeholder="现在正在面对什么现实事项？" /><el-input v-model="why" aria-label="Matter 为什么值得处理" placeholder="为什么现在值得处理？（可选）" /></div>
      <el-button type="primary" native-type="submit">新建 Matter</el-button>
    </form>

    <section v-if="pendingImport && pendingComparison" class="import-review beryl-card">
      <div class="review-head"><div><p class="eyebrow">IMPORT REVIEW</p><h2 class="font-title">逐条处理本地冲突</h2><p>只有明确选择“采用 Vault”才会替换本地对象；保留本地的条目不会写入。</p></div><button class="review-cancel" @click="clearPendingImport">取消</button></div>
      <div class="conflict-list">
        <div v-for="conflict in pendingComparison.conflicts" :key="conflict.calmyId" class="conflict-row">
          <div class="conflict-copy"><b>{{ conflict.calmyId }}</b><span>{{ conflict.calmyType }} · 本地 revision {{ conflict.localRevision }} · Vault revision {{ conflict.incomingRevision }}</span></div>
<div class="decision-row"><label><input :checked="conflictDecisions[conflict.calmyId] === 'keep-local'" aria-label="冲突保留本地" type="radio" :name="'open-conflict-' + conflict.calmyId" @change="setConflictDecision(conflict.calmyId, 'keep-local')">保留本地</label><label><input :checked="conflictDecisions[conflict.calmyId] === 'use-incoming'" aria-label="冲突采用 Vault" type="radio" :name="'open-conflict-' + conflict.calmyId" @change="setConflictDecision(conflict.calmyId, 'use-incoming')">采用 Vault</label><button class="manual-button" type="button" @click="openManualMerge(conflict)">手工合并</button></div>
        </div>
      </div>
      <div v-if="manualConflictId" class="manual-merge">
        <div class="manual-head"><h3>字段级合并：{{ manualConflictId }}</h3><span>每个字段选择保留本地或采用 Vault</span></div>
        <div v-for="field in manualFields" :key="field.key" class="field-conflict">
          <div class="field-name">{{ field.key }}</div>
          <div class="field-value"><b>本地</b><pre>{{ formatOpenValue(field.localValue) }}</pre></div>
          <div class="field-value"><b>Vault</b><pre>{{ formatOpenValue(field.incomingValue) }}</pre></div>
<div class="field-choice"><label><input :checked="manualDecisions[field.key] === 'keep-local'" aria-label="字段保留本地" type="radio" :name="'field-' + field.key" @change="setManualDecision(field.key, 'keep-local')">本地</label><label><input :checked="manualDecisions[field.key] === 'use-incoming'" aria-label="字段采用 Vault" type="radio" :name="'field-' + field.key" @change="setManualDecision(field.key, 'use-incoming')">Vault</label></div>
        </div>
        <div class="manual-actions"><el-button plain @click="manualConflictId = undefined">取消手工合并</el-button><el-button type="primary" @click="confirmManualMerge">完成字段选择</el-button></div>
      </div>
      <div class="review-actions"><el-button plain @click="clearPendingImport">取消</el-button><el-button type="primary" @click="applyConflictChoices">按选择导入</el-button></div>
    </section>

    <section v-if="orphanAssets.length" class="asset-review beryl-card">
      <div class="review-head"><div><p class="eyebrow">ASSET HYGIENE</p><h2 class="font-title">孤儿附件</h2><p>这些附件目前没有被任何 Markdown 引用，只提供清理预览，不会自动删除。</p></div><el-button type="danger" plain size="small" @click="cleanupOrphans">清理全部</el-button></div>
      <div class="asset-list"><div v-for="asset in orphanAssets" :key="asset.path" class="asset-row"><span class="asset-icon">◇</span><div><b>{{ asset.path }}</b><small>{{ asset.mimeType }} · {{ formatBytes(asset.data.byteLength) }}</small></div></div></div>
    </section>

    <div class="toolbar"><div class="filters"><button v-for="item in ([['active','进行中'],['paused','暂停'],['archived','已归档'],['all','全部']] as const)" :key="item[0]" :class="{ on: status === item[0] }" @click="status = item[0]">{{ item[1] }} <small>{{ counts[item[0]] }}</small></button></div></div>
    <div v-if="items.length" class="matter-list"><button v-for="item in items" :key="item.calmyId" class="matter-card beryl-card hoverable" @click="router.push('/app/matters/' + item.calmyId)"><div class="card-top"><span class="stage">{{ item.currentStage }} · {{ item.trajectory }}</span><span class="state">{{ item.status }}</span></div><h2 class="font-title">{{ item.title }}</h2><p>{{ item.why || '还没有写下原因。' }}</p><div class="card-bottom"><span>revision {{ item.revision }}</span><b>打开 →</b></div></button></div>
    <div v-else class="empty beryl-card"><span>◈</span><h2 class="font-title">还没有 Matter</h2><p>先创建一个值得被理解、推进或复盘的现实事项。</p></div>
  </div>
</template>

<style scoped>
.page-head{display:flex;align-items:end;justify-content:space-between;gap:18px;margin:6px 0 28px}.eyebrow{font-size:10px;letter-spacing:.13em;color:var(--scene);font-weight:700;margin:0 0 8px}.page-head h1{font-size:42px;line-height:1;margin:0;letter-spacing:-.035em}.page-head p:last-child{margin:11px 0 0;font-size:13px;color:var(--c-text-2)}.head-actions{display:flex;gap:7px;margin-left:auto;align-self:start;white-space:nowrap}.head-number{border-left:1px solid var(--c-border);padding:4px 0 4px 20px;display:grid}.head-number b{font:600 36px/1 var(--font-title);color:var(--scene)}.head-number span{font-size:10px;color:var(--c-text-3);margin-top:5px}.new-matter{display:flex;align-items:center;gap:12px;padding:14px 16px}.matter-mark{font-size:24px;color:var(--scene)}.new-fields{flex:1;display:grid;gap:7px}.new-fields :deep(.el-input__wrapper){box-shadow:none;background:transparent;padding-left:0}.import-review{padding:18px;margin-top:18px}.review-head{display:flex;justify-content:space-between;gap:14px;align-items:start}.review-head h2{font-size:23px;margin:0}.review-head p:last-child{font-size:12px;color:var(--c-text-2);margin:8px 0 0}.review-cancel{border:0;background:transparent;color:var(--c-text-3);cursor:pointer}.conflict-list{border-top:1px solid var(--c-border-soft);margin-top:16px}.conflict-row{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:13px 0;border-bottom:1px solid var(--c-border-soft)}.conflict-copy{display:grid;gap:4px;min-width:0}.conflict-copy b{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.conflict-copy span{font-size:10px;color:var(--c-text-3)}.decision-row{display:flex;gap:12px;white-space:nowrap;font-size:11px;color:var(--c-text-2)}.decision-row label{display:flex;align-items:center;gap:5px;cursor:pointer}.review-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.toolbar{margin:28px 0 18px}.filters{display:flex;gap:5px;overflow:auto}.filters button{white-space:nowrap;border:0;background:transparent;color:var(--c-text-2);padding:8px 10px;border-radius:8px;font-size:12px;cursor:pointer}.filters button.on{background:var(--scene-soft);color:var(--scene);font-weight:700}.filters small{font-size:10px;opacity:.7}.matter-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.matter-card{min-height:205px;padding:17px;text-align:left;color:var(--c-text);cursor:pointer;display:flex;flex-direction:column}.card-top,.card-bottom{display:flex;align-items:center;justify-content:space-between;gap:8px}.stage{font-size:10px;color:var(--scene);font-weight:700}.state{font-size:10px;color:var(--c-text-3)}.matter-card h2{font-size:22px;line-height:1.15;letter-spacing:-.02em;margin:28px 0 8px}.matter-card p{font-size:12px;color:var(--c-text-2);line-height:1.65;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.card-bottom{margin-top:auto;padding-top:18px;color:var(--c-text-3);font-size:10px}.card-bottom b{color:var(--scene);font-weight:500}.empty{text-align:center;padding:80px 10px;color:var(--c-text-2)}.empty span{font-size:32px;color:var(--scene)}.empty h2{font-size:26px;margin:14px 0 6px}.empty p{font-size:12px;color:var(--c-text-3)}@media(max-width:900px){.matter-list{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.page-head{align-items:start;flex-wrap:wrap}.page-head h1{font-size:34px}.head-actions{order:3;width:100%;margin-left:0}.head-number{display:none}.new-matter{align-items:stretch;flex-wrap:wrap}.matter-mark{padding-top:8px}.new-fields{width:calc(100% - 42px);flex:none}.new-matter .el-button{margin-left:auto}.conflict-row{display:block}.decision-row{margin-top:10px}.matter-list{grid-template-columns:1fr}.matter-card{min-height:180px}}
.manual-button{border:1px solid var(--c-border);background:transparent;color:var(--scene);border-radius:7px;padding:4px 8px;font-size:10px;cursor:pointer}.manual-merge{border:1px solid var(--scene-border-strong);background:var(--scene-soft);border-radius:10px;padding:14px;margin-top:14px}.manual-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.manual-head h3{font-size:15px;margin:0}.manual-head span{font-size:10px;color:var(--c-text-3)}.field-conflict{display:grid;grid-template-columns:150px 1fr 1fr auto;gap:10px;align-items:start;border-top:1px solid var(--scene-border-strong);padding:12px 0}.field-name{font:600 11px var(--font-mono,monospace);overflow-wrap:anywhere}.field-value{min-width:0}.field-value b{font-size:10px;color:var(--c-text-3)}.field-value pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:100px;overflow:auto;margin:5px 0 0;padding:7px;border-radius:6px;background:var(--c-card);font:11px/1.45 var(--font-mono,monospace)}.field-choice{display:grid;gap:6px;font-size:10px;color:var(--c-text-2);white-space:nowrap}.field-choice label{display:flex;align-items:center;gap:4px;cursor:pointer}.manual-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}.asset-review{padding:18px;margin-top:18px}.asset-list{border-top:1px solid var(--c-border-soft);margin-top:16px}.asset-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--c-border-soft)}.asset-icon{width:25px;height:25px;display:grid;place-items:center;border-radius:7px;background:var(--scene-soft);color:var(--scene)}.asset-row div{display:grid;gap:3px;min-width:0}.asset-row b{font-size:12px;overflow-wrap:anywhere}.asset-row small{font-size:10px;color:var(--c-text-3)}@media(max-width:760px){.field-conflict{grid-template-columns:1fr 1fr}.field-name{grid-column:1/-1}.field-choice{grid-column:1/-1;display:flex}.manual-head{display:block}.manual-head span{display:block;margin-top:4px}}@media(max-width:620px){.decision-row{flex-wrap:wrap}.manual-button{margin-left:auto}}
</style>
