<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { matterRepository } from '@/domain/matter/repository'
import type { MatterStatus } from '@/domain/matter/model'
import { applyOpenEntities, exportCurrentOpenWorkspace } from '@/core/content/open-workspace'
import { importOpenWorkspace } from '@/core/content/open-format'

const router = useRouter()
const title = ref('')
const why = ref('')
const status = ref<'all' | MatterStatus>('active')
const tick = ref(0)
const vaultInput = ref<HTMLInputElement>()
const all = computed(() => { void tick.value; return matterRepository.list() })
const items = computed(() => all.value.filter(item => status.value === 'all' || item.status === status.value))
const counts = computed(() => ({
  all: all.value.length,
  active: all.value.filter(item => item.status === 'active').length,
  paused: all.value.filter(item => item.status === 'paused').length,
  archived: all.value.filter(item => item.status === 'archived').length
}))

function create() {
  if (!title.value.trim()) { ElMessage.warning('先写下一个现实事项'); return }
  const matter = matterRepository.create({ title: title.value, why: why.value })
  title.value = ''; why.value = ''; tick.value++
  router.push('/app/matters/' + matter.calmyId)
}

interface DirectoryHandleLike {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandleLike>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{ createWritable(): Promise<{ write(value: string): Promise<void>; close(): Promise<void> }> }>
}

async function writeWorkspaceToDirectory(root: DirectoryHandleLike, files: Record<string, string>): Promise<void> {
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
}

function downloadWorkspaceFiles(files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([content], { type: path.endsWith('.json') ? 'application/json' : 'text/markdown' }))
    link.download = path.split('/').join('__')
    link.click()
    URL.revokeObjectURL(link.href)
  }
}

async function exportVault(): Promise<void> {
  const workspace = exportCurrentOpenWorkspace()
  const picker = (window as Window & { showDirectoryPicker?: () => Promise<DirectoryHandleLike> }).showDirectoryPicker
  if (picker) {
    const root = await picker()
    await writeWorkspaceToDirectory(root, workspace.files)
    ElMessage.success('已写入 Open Vault：' + Object.keys(workspace.files).length + ' 个文件')
    return
  }
  downloadWorkspaceFiles(workspace.files)
  ElMessage.success('浏览器不支持目录写入，已开始逐文件下载')
}

async function importVault(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (!files.length) return
  const fileEntries = await Promise.all(files.map(async file => [file.webkitRelativePath || file.name, await file.text()] as const))
  const result = importOpenWorkspace(Object.fromEntries(fileEntries))
  if (result.issues.length || result.conflicts.length) {
    ElMessage.error('导入已停止：' + result.issues.length + ' 个文件问题，' + result.conflicts.length + ' 个冲突。未写入本地数据。')
    return
  }
  try {
    await ElMessageBox.confirm('将导入 ' + result.entities.length + ' 个实体，已有且完全相同的实体会跳过。是否继续？', '确认导入 Open Vault', { type: 'warning' })
    const applied = applyOpenEntities(result.entities)
    tick.value++
    if (applied.conflicts.length || applied.errors.length) {
      ElMessage.warning('已导入 ' + applied.created + ' 个，跳过 ' + applied.unchanged + ' 个；仍有 ' + (applied.conflicts.length + applied.errors.length) + ' 个未写入。')
    } else {
      ElMessage.success('导入完成：新增 ' + applied.created + ' 个，未变化 ' + applied.unchanged + ' 个')
    }
  } catch {
    ElMessage.info('已取消导入')
  }
}
</script>

<template>
  <div class="matters-page">
    <header class="page-head">
      <div><p class="eyebrow">MVP MATTERS</p><h1 class="font-title">现实事项</h1><p>围绕一个现实问题，决定今天最小必要行动。</p></div>
      <div class="head-actions"><input ref="vaultInput" type="file" multiple accept=".md,.json" webkitdirectory directory hidden @change="importVault"><el-button plain size="small" @click="exportVault">导出 Open Vault</el-button><el-button plain size="small" @click="vaultInput?.click()">导入 Vault</el-button></div>
      <div class="head-number"><b>{{ counts.active }}</b><span>进行中</span></div>
    </header>

    <form class="new-matter beryl-card" @submit.prevent="create">
      <span class="matter-mark">◈</span>
      <div class="new-fields"><el-input v-model="title" size="large" placeholder="现在正在面对什么现实事项？" /><el-input v-model="why" placeholder="为什么现在值得处理？（可选）" /></div>
      <el-button type="primary" native-type="submit">新建 Matter</el-button>
    </form>

    <div class="toolbar"><div class="filters"><button v-for="item in ([['active','进行中'],['paused','暂停'],['archived','已归档'],['all','全部']] as const)" :key="item[0]" :class="{ on: status === item[0] }" @click="status = item[0]">{{ item[1] }} <small>{{ counts[item[0]] }}</small></button></div></div>
    <div v-if="items.length" class="matter-list"><button v-for="item in items" :key="item.calmyId" class="matter-card beryl-card hoverable" @click="router.push('/app/matters/' + item.calmyId)"><div class="card-top"><span class="stage">{{ item.currentStage }} · {{ item.trajectory }}</span><span class="state">{{ item.status }}</span></div><h2 class="font-title">{{ item.title }}</h2><p>{{ item.why || '还没有写下原因。' }}</p><div class="card-bottom"><span>revision {{ item.revision }}</span><b>打开 →</b></div></button></div>
    <div v-else class="empty beryl-card"><span>◈</span><h2 class="font-title">还没有 Matter</h2><p>先创建一个值得被理解、推进或复盘的现实事项。</p></div>
  </div>
</template>

<style scoped>
.page-head{display:flex;align-items:end;justify-content:space-between;gap:18px;margin:6px 0 28px}.eyebrow{font-size:10px;letter-spacing:.13em;color:var(--scene);font-weight:700;margin:0 0 8px}.page-head h1{font-size:42px;line-height:1;margin:0;letter-spacing:-.035em}.page-head p:last-child{margin:11px 0 0;font-size:13px;color:var(--c-text-2)}.head-actions{display:flex;gap:7px;margin-left:auto;align-self:start;white-space:nowrap}.head-number{border-left:1px solid var(--c-border);padding:4px 0 4px 20px;display:grid}.head-number b{font:600 36px/1 var(--font-title);color:var(--scene)}.head-number span{font-size:10px;color:var(--c-text-3);margin-top:5px}.new-matter{display:flex;align-items:center;gap:12px;padding:14px 16px}.matter-mark{font-size:24px;color:var(--scene)}.new-fields{flex:1;display:grid;gap:7px}.new-fields :deep(.el-input__wrapper){box-shadow:none;background:transparent;padding-left:0}.toolbar{margin:28px 0 18px}.filters{display:flex;gap:5px;overflow:auto}.filters button{white-space:nowrap;border:0;background:transparent;color:var(--c-text-2);padding:8px 10px;border-radius:8px;font-size:12px;cursor:pointer}.filters button.on{background:var(--scene-soft);color:var(--scene);font-weight:700}.filters small{font-size:10px;opacity:.7}.matter-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.matter-card{min-height:205px;padding:17px;text-align:left;color:var(--c-text);cursor:pointer;display:flex;flex-direction:column}.card-top,.card-bottom{display:flex;align-items:center;justify-content:space-between;gap:8px}.stage{font-size:10px;color:var(--scene);font-weight:700}.state{font-size:10px;color:var(--c-text-3)}.matter-card h2{font-size:22px;line-height:1.15;letter-spacing:-.02em;margin:28px 0 8px}.matter-card p{font-size:12px;color:var(--c-text-2);line-height:1.65;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.card-bottom{margin-top:auto;padding-top:18px;color:var(--c-text-3);font-size:10px}.card-bottom b{color:var(--scene);font-weight:500}.empty{text-align:center;padding:80px 10px;color:var(--c-text-2)}.empty span{font-size:32px;color:var(--scene)}.empty h2{font-size:26px;margin:14px 0 6px}.empty p{font-size:12px;color:var(--c-text-3)}@media(max-width:900px){.matter-list{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.page-head{align-items:start;flex-wrap:wrap}.page-head h1{font-size:34px}.head-actions{order:3;width:100%;margin-left:0}.head-number{display:none}.new-matter{align-items:stretch;flex-wrap:wrap}.matter-mark{padding-top:8px}.new-fields{width:calc(100% - 42px);flex:none}.new-matter .el-button{margin-left:auto}.matter-list{grid-template-columns:1fr}.matter-card{min-height:180px}}
</style>
