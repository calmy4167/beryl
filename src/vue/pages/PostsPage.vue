<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { fmtDate } from '@/core/storage'
import { createAsyncCollectionRepository, createEntityId } from '@/core/repository'
import { registerUndo } from '@/core/undo'
import { withSaveState } from '@/core/save-state'
import { readServerSession } from '@/core/auth'
import { listRealityDocumentsAsync } from '@/domain/reality'
import { unifiedAsyncRepository, type Ownership, type Person } from '@/domain/unified'
import DomainPicker from '@/vue/components/DomainPicker.vue'
import ContextRelationPicker from '@/vue/components/ContextRelationPicker.vue'
import OwnershipEditor from '@/vue/components/OwnershipEditor.vue'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import LbPanel from '@/vue/liubai/LbPanel.vue'

// 页面自带头部（参考稿里 .slide-head 属于页面自身），外壳因此不再渲染第二行标题。
useOwnSlideHead()

interface PostSnapshot { revision: number; operation: 'created' | 'updated'; occurredAt: number; actorUserId?: string; title: string; content: string; date: string; archivedAt?: number; ownership?: Ownership }
interface StoredPost { id?: string; title?: string; content?: string; date?: string; archivedAt?: number; revision?: number; ownership?: Ownership; history?: PostSnapshot[] }
interface PostItem { id: string; title: string; content: string; date: string; archivedAt?: number; revision: number; ownership?: Ownership }
type PostFilter = 'active' | 'archived' | 'all'
const postRepository = createAsyncCollectionRepository<StoredPost>('posts')
const posts = ref<PostItem[]>([]), title = ref(''), content = ref(''), query = ref(''), error = ref('')
const people = ref<Person[]>([])
const session = readServerSession()
const filter = ref<PostFilter>('active')
const editingId = ref<string>(), reading = ref<PostItem>()
const drawerCloseButton = ref<HTMLButtonElement | null>(null)
const drawerDialog = ref<HTMLElement | null>(null)
let readingReturnFocus: HTMLElement | null = null
const saving = ref(false), loading = ref(true)
const filters: Array<{ value: PostFilter; label: string }> = [{ value: 'active', label: '在库' }, { value: 'archived', label: '已归档' }, { value: 'all', label: '全部' }]
const activeCount = computed(() => posts.value.filter(post => !post.archivedAt).length)
const visiblePosts = computed(() => { const term = query.value.trim().toLocaleLowerCase(); return posts.value.filter(post => (filter.value === 'all' || (filter.value === 'archived' ? !!post.archivedAt : !post.archivedAt)) && (!term || `${post.title} ${post.content}`.toLocaleLowerCase().includes(term))) })
function toast(message: string, kind: 'success' | 'warning' | 'error' = 'success') { window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } })) }
async function readStoredPosts(): Promise<StoredPost[]> { const value = await postRepository.list(); return Array.isArray(value) ? value.filter(item => !!item && typeof item === 'object') : [] }
async function loadPosts(): Promise<PostItem[]> {
  const storedById = new Map((await readStoredPosts()).filter(item => typeof item.id === 'string').map(item => [item.id!, item]))
  return (await listRealityDocumentsAsync({ types: ['post'] })).map(document => { const stored = storedById.get(document.id); return { id: document.id, title: stored?.title?.trim() || document.title, content: stored?.content || document.body || document.summary || '文章暂无正文', date: stored?.date || document.date || '', archivedAt: stored?.archivedAt, revision: stored?.revision || 0, ownership: stored?.ownership } }).sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0))
}
function formatDate(value: string): string { if (!value) return '未记录日期'; const timestamp = Date.parse(value); return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString('zh-CN') : value }
async function refresh(): Promise<void> { try { const [loaded, storedPeople] = await Promise.all([loadPosts(), unifiedAsyncRepository.list<Person>('person')]); posts.value = loaded; people.value = storedPeople; error.value = '' } catch (cause) { error.value = cause instanceof Error ? cause.message : '文章读取失败' } finally { loading.value = false } }
function onDataSynced() { void refresh() }
onMounted(() => { void refresh(); window.addEventListener('beryl-data-synced', onDataSynced) })
onUnmounted(() => window.removeEventListener('beryl-data-synced', onDataSynced))
function resetEditor() { editingId.value = undefined; title.value = ''; content.value = '' }
function beginEdit(post: PostItem) {
  editingId.value = post.id
  title.value = post.title
  content.value = post.content
  const scrollRoot = document.querySelector<HTMLElement>('.stage-scroll')
  if (scrollRoot) scrollRoot.scrollTo({ top: 0, behavior: 'smooth' })
  else window.scrollTo({ top: 0, behavior: 'smooth' })
}
async function openReader(post: PostItem, event: Event): Promise<void> {
  readingReturnFocus = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  reading.value = post
  await nextTick()
  drawerCloseButton.value?.focus()
}
function closeReader(): void {
  reading.value = undefined
  const returnFocus = readingReturnFocus
  readingReturnFocus = null
  requestAnimationFrame(() => { if (returnFocus?.isConnected) returnFocus.focus() })
}
function onReaderKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') { event.preventDefault(); closeReader(); return }
  if (event.key !== 'Tab') return
  const focusables = drawerDialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')
  const list = focusables ? [...focusables].filter(item => item.offsetParent !== null) : []
  if (!list.length) { event.preventDefault(); return }
  const first = list[0], last = list[list.length - 1]
  if (event.shiftKey && (document.activeElement === first || !drawerDialog.value?.contains(document.activeElement))) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && (document.activeElement === last || !drawerDialog.value?.contains(document.activeElement))) { event.preventDefault(); first.focus() }
}
function postSnapshot(post: StoredPost, revision: number, operation: PostSnapshot['operation'], actorUserId?: string): PostSnapshot {
  return { revision, operation, occurredAt: Date.now(), actorUserId, title: post.title || '', content: post.content || '', date: post.date || '', ...(post.archivedAt ? { archivedAt: post.archivedAt } : {}), ...(post.ownership ? { ownership: post.ownership } : {}) }
}
async function updatePost(post: PostItem, patch: Partial<Pick<StoredPost, 'title' | 'content' | 'date' | 'archivedAt' | 'ownership'>>): Promise<void> {
  const actorUserId = session?.user.id
  const updated = await postRepository.update(post.id, current => {
    const revision = current.revision || 0
    if (revision !== post.revision) throw new Error('文章版本冲突，请刷新后重试')
    const next: StoredPost = { ...current, ...patch, revision: revision + 1 }
    const snapshot = postSnapshot(next, revision + 1, 'updated', actorUserId)
    next.history = [...(current.history || []), snapshot]
    return next
  })
  if (!updated) throw new Error('文章不存在，可能已被其他设备删除')
}
async function savePost() {
  const nextTitle = title.value.trim(), nextContent = content.value.trim(), currentEditingId = editingId.value
  if (!nextTitle || !nextContent) { toast('标题和内容都要填写哦', 'warning'); return }
  saving.value = true
  try {
    await withSaveState(async () => { if (currentEditingId) { const current = posts.value.find(item => item.id === currentEditingId); if (!current) throw new Error('文章不存在，可能已被其他设备删除'); await updatePost(current, { title: nextTitle, content: nextContent, date: current.date || fmtDate(Date.now()) }) } else { const id = createEntityId(), date = fmtDate(Date.now()), ownership: Ownership | undefined = session?.user.id ? { createdByUserId: session.user.id, ownerRef: { type: 'user', id: session.user.id }, stewardRefs: [], privacy: 'private' } : undefined; const initial: StoredPost = { id, title: nextTitle, content: nextContent, date, revision: 1, ...(ownership ? { ownership } : {}) }; initial.history = [postSnapshot(initial, 1, 'created', session?.user.id)]; await postRepository.create(initial) } })
    resetEditor(); await refresh(); toast(currentEditingId ? '文章已更新' : '文章已发布 ✍️')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '文章保存失败', 'error') } finally { saving.value = false }
}
async function toggleArchive(post: PostItem) {
  saving.value = true
  try {
    await withSaveState(async () => { const patch = post.archivedAt ? { archivedAt: undefined } : { archivedAt: Date.now() }; await updatePost(post, patch) })
    if (reading.value?.id === post.id) closeReader()
    await refresh(); toast(post.archivedAt ? '文章已恢复' : '文章已归档')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '文章归档失败', 'error') } finally { saving.value = false }
}
async function saveOwnership(post: PostItem, ownership: Ownership | undefined): Promise<void> {
  saving.value = true
  try { await withSaveState(() => updatePost(post, { ownership })); await refresh(); toast('文章归属已保存') }
  catch (cause) { toast(cause instanceof Error ? cause.message : '文章归属保存失败', 'error') }
  finally { saving.value = false }
}
async function removePost(post: PostItem) {
  if (!window.confirm(`确认永久删除文章“${post.title}”吗？归档文章也可以保留在归档列表中。`)) return
  saving.value = true
  try {
    await withSaveState(async () => { const raw = await readStoredPosts(); const index = raw.findIndex(item => item.id === post.id); const removed = index >= 0 ? raw[index] : undefined; if (!removed) throw new Error('文章不存在，可能已被其他设备删除'); if (!await postRepository.remove(post.id)) throw new Error('文章删除失败'); registerUndo('posts', removed, index, post.id) })
    if (reading.value?.id === post.id) closeReader()
    if (editingId.value === post.id) resetEditor()
    await refresh(); toast('文章已删除，可在提示消失前撤销')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '文章删除失败', 'error') } finally { saving.value = false }
}
</script>

<template>
  <header class="slide-head">
    <div class="head-main">
      <p class="hint">文章 · Posts</p>
      <div class="head-title-row">
        <h2 v-if="loading">正在读取…</h2>
        <h2 v-else-if="!visiblePosts.length">还没有文章。</h2>
        <h2 v-else><em>{{ visiblePosts.length }}</em> 篇文章。</h2>
        <span class="info" tabindex="0" data-tip="把值得留下的经验写成文章，按需检索并持续整理。H 收起辅助信息。" aria-label="文章说明">i</span>
      </div>
    </div>
    <!-- parity 测试按「数字与静态文案是两个文本节点」断言，所以保留 .posts-active-count 的 display:contents 结构 -->
    <span class="load-pill"><span class="posts-active-count" style="display: contents">{{ activeCount }}</span> 篇在库</span>
  </header>
    <LbPanel :title="editingId ? '编辑文章' : '写一篇文章'" note-tip="支持 Markdown 文本。">
      <form class="post-editor" @submit.prevent="savePost">
        <div v-if="editingId" class="detail-chips post-editor-actions"><button type="button" class="chip" :disabled="saving" @click="resetEditor">取消编辑</button></div>
        <input v-model="title" aria-label="文章标题" placeholder="文章标题" :disabled="saving" />
        <textarea v-model="content" aria-label="文章内容" placeholder="写下你的文章……支持 Markdown 文本" rows="8" :disabled="saving" />
        <div class="detail-chips post-editor-actions"><button class="chip on" type="submit" :disabled="saving">{{ saving ? '保存中…' : editingId ? '保存修改' : '发布文章' }}</button></div>
      </form>
    </LbPanel>
    <LbPanel title="文章列表" :note="loading ? '正在读取…' : `${visiblePosts.length} 篇`">
      <div class="posts-toolbar"><input v-model="query" aria-label="搜索文章" placeholder="搜索标题或正文" /><div class="seg" role="tablist" aria-label="文章状态筛选"><button v-for="option in filters" :key="option.value" type="button" :class="filter === option.value ? 'on' : ''" role="tab" :aria-selected="filter === option.value" @click="filter = option.value">{{ option.label }}</button></div></div>
      <section v-if="error" class="panel posts-error" role="alert"><b>文章数据暂时无法读取</b><p class="dim">{{ error }}</p><button class="chip" type="button" @click="refresh">重试</button></section>
      <p v-if="loading" class="dim" role="status">正在读取文章…</p>
      <div v-if="!loading && visiblePosts.length" class="history-list" aria-live="polite"><article v-for="post in visiblePosts" :key="post.id" class="history-card panel"><div class="panel-head"><button type="button" class="post-title-button" @click="openReader(post, $event)"><h3>{{ post.title }}</h3></button><small>{{ formatDate(post.date) }}</small></div><p class="post-excerpt">{{ post.content }}</p><div class="detail-chips"><button type="button" class="chip" :disabled="saving" @click="openReader(post, $event)">阅读全文</button><button type="button" class="chip" :disabled="saving" @click="beginEdit(post)">编辑</button><button type="button" class="chip" :disabled="saving" @click="toggleArchive(post)">{{ post.archivedAt ? '恢复' : '归档' }}</button><button type="button" class="chip danger" :disabled="saving" @click="removePost(post)">删除</button></div><DomainPicker :entity-ref="{ entityType: 'post', calmyId: post.id }" :disabled="saving" /><ContextRelationPicker :entity-ref="{ entityType: 'post', calmyId: post.id }" :disabled="saving" /><OwnershipEditor :ownership="post.ownership" :people="people" :current-user-id="session?.user.id" :disabled="saving" label="文章归属与可见范围" @save="ownership => saveOwnership(post, ownership)" /></article></div>
      <p v-if="!loading && !error && !visiblePosts.length" class="dim">{{ query ? '没有匹配的文章。' : filter === 'archived' ? '还没有归档文章。' : '还没有文章，把值得留下的经验写下来。' }}</p>
    </LbPanel>
    <div v-if="reading" class="el-drawer-overlay" role="presentation" @click.self="closeReader"><aside ref="drawerDialog" class="el-drawer" role="dialog" aria-modal="true" :aria-labelledby="`post-reader-title-${reading.id}`" @keydown="onReaderKeydown"><div class="drawer"><button ref="drawerCloseButton" type="button" class="drawer-close" aria-label="关闭文章阅读" @click="closeReader">×</button><p class="eyebrow">ARTICLE</p><h1 :id="`post-reader-title-${reading.id}`" class="drawer-title">{{ reading.title }}</h1><p class="dim">{{ formatDate(reading.date) }}{{ reading.archivedAt ? ' · 已归档' : '' }}</p><hr class="drawer-rule" /><div class="drawer-body">{{ reading.content }}</div></div></aside></div>
</template>

<style scoped>
/* 页面局部排版：颜色取「留白」令牌。.load-pill / .posts-active-count / .history-card / .el-drawer-* 是 parity 测试的钩子。 */
.load-pill { color: var(--muted); font-size: .74rem; white-space: nowrap; }
.posts-error { border-color: color-mix(in srgb, var(--danger) 45%, transparent); }
.post-editor { display: grid; gap: 10px; }
.post-editor input, .post-editor textarea { padding: 8px 10px; font: inherit; font-size: .84rem; }
.post-editor textarea { min-height: 140px; line-height: 1.7; resize: vertical; }
.post-editor-actions { justify-content: flex-end; }
.posts-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.posts-toolbar input { flex: 1 1 200px; min-width: 0; min-height: 34px; padding: 6px 10px; font: inherit; font-size: .8rem; }
.posts-toolbar .seg { width: min(320px, 100%); flex: none; }
.history-list { display: grid; gap: 10px; }
.history-card { display: grid; gap: 8px; }
.post-title-button { flex: 1; min-width: 0; padding: 0; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.post-title-button h3 { margin: 0; font-size: .95rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.post-excerpt { margin: 0; color: var(--muted); font-size: .8rem; line-height: 1.7; white-space: pre-wrap; overflow: hidden; max-height: 4.8em; }

/* 阅读抽屉：沿用 .el-drawer-overlay / .el-drawer 钩子，外观改成 v11 令牌 */
.el-drawer-overlay { position: fixed; inset: 0; z-index: 60; background: color-mix(in srgb, #000 46%, transparent); display: flex; justify-content: flex-end; }
.el-drawer { width: min(680px, 100%); height: 100%; overflow-y: auto; background: var(--panel); border-left: 1px solid var(--line); }
.drawer { padding: clamp(20px, 3vw, 36px); }
.drawer-close { float: right; width: 30px; height: 30px; border: 1px solid var(--line); border-radius: 8px; background: none; color: var(--muted); font-size: 1rem; line-height: 1; cursor: pointer; }
.drawer-close:hover { color: var(--fg); border-color: var(--line-strong); }
.drawer-title { font-size: clamp(1.5rem, 3.6vw, 2.4rem); line-height: 1.15; margin: 6px 0 8px; }
.drawer-rule { border: 0; border-top: 1px solid var(--line); margin: 20px 0; }
.drawer-body { max-width: 720px; margin: 0 auto; line-height: 1.9; white-space: pre-wrap; overflow-wrap: anywhere; font-size: .88rem; }
</style>
