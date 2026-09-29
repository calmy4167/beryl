<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { fmtDate } from '@/core/storage'
import { createAsyncCollectionRepository, createEntityId } from '@/core/repository'
import { registerUndo } from '@/core/undo'
import { withSaveState } from '@/core/save-state'
import { listRealityDocumentsAsync } from '@/domain/reality'

interface StoredPost { id?: string; title?: string; content?: string; date?: string; archivedAt?: number }
interface PostItem { id: string; title: string; content: string; date: string; archivedAt?: number }
type PostFilter = 'active' | 'archived' | 'all'
const postRepository = createAsyncCollectionRepository<StoredPost>('posts')
const posts = ref<PostItem[]>([]), title = ref(''), content = ref(''), query = ref(''), error = ref('')
const filter = ref<PostFilter>('active')
const editingId = ref<string>(), reading = ref<PostItem>()
const saving = ref(false), loading = ref(true)
const filters: Array<{ value: PostFilter; label: string }> = [{ value: 'active', label: '在库' }, { value: 'archived', label: '已归档' }, { value: 'all', label: '全部' }]
const activeCount = computed(() => posts.value.filter(post => !post.archivedAt).length)
const visiblePosts = computed(() => { const term = query.value.trim().toLocaleLowerCase(); return posts.value.filter(post => (filter.value === 'all' || (filter.value === 'archived' ? !!post.archivedAt : !post.archivedAt)) && (!term || `${post.title} ${post.content}`.toLocaleLowerCase().includes(term))) })
function toast(message: string, kind: 'success' | 'warning' | 'error' = 'success') { window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } })) }
async function readStoredPosts(): Promise<StoredPost[]> { const value = await postRepository.list(); return Array.isArray(value) ? value.filter(item => !!item && typeof item === 'object') : [] }
async function loadPosts(): Promise<PostItem[]> {
  const storedById = new Map((await readStoredPosts()).filter(item => typeof item.id === 'string').map(item => [item.id!, item]))
  return (await listRealityDocumentsAsync({ types: ['post'] })).map(document => { const stored = storedById.get(document.id); return { id: document.id, title: stored?.title?.trim() || document.title, content: stored?.content || document.body || document.summary || '文章暂无正文', date: stored?.date || document.date || '', archivedAt: stored?.archivedAt } }).sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0))
}
function formatDate(value: string): string { if (!value) return '未记录日期'; const timestamp = Date.parse(value); return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString('zh-CN') : value }
async function refresh(): Promise<void> { try { posts.value = await loadPosts(); error.value = '' } catch (cause) { error.value = cause instanceof Error ? cause.message : '文章读取失败' } finally { loading.value = false } }
function onDataSynced() { void refresh() }
onMounted(() => { void refresh(); window.addEventListener('beryl-data-synced', onDataSynced) })
onUnmounted(() => window.removeEventListener('beryl-data-synced', onDataSynced))
function resetEditor() { editingId.value = undefined; title.value = ''; content.value = '' }
function beginEdit(post: PostItem) { editingId.value = post.id; title.value = post.title; content.value = post.content; window.scrollTo({ top: 0, behavior: 'smooth' }) }
async function savePost() {
  const nextTitle = title.value.trim(), nextContent = content.value.trim(), currentEditingId = editingId.value
  if (!nextTitle || !nextContent) { toast('标题和内容都要填写哦', 'warning'); return }
  saving.value = true
  try {
    await withSaveState(async () => { if (currentEditingId) { const updated = await postRepository.update(currentEditingId, current => ({ ...current, title: nextTitle, content: nextContent, date: current.date || fmtDate(Date.now()) })); if (!updated) throw new Error('文章不存在，可能已被其他设备删除') } else { await postRepository.create({ id: createEntityId(), title: nextTitle, content: nextContent, date: fmtDate(Date.now()) }) } })
    resetEditor(); await refresh(); toast(currentEditingId ? '文章已更新' : '文章已发布 ✍️')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '文章保存失败', 'error') } finally { saving.value = false }
}
async function toggleArchive(post: PostItem) {
  saving.value = true
  try {
    await withSaveState(async () => { const updated = await postRepository.update(post.id, current => { const next = { ...current }; if (post.archivedAt) delete next.archivedAt; else next.archivedAt = Date.now(); return next }); if (!updated) throw new Error('文章不存在，可能已被其他设备删除') })
    if (reading.value?.id === post.id) reading.value = undefined
    await refresh(); toast(post.archivedAt ? '文章已恢复' : '文章已归档')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '文章归档失败', 'error') } finally { saving.value = false }
}
async function removePost(post: PostItem) {
  if (!window.confirm(`确认永久删除文章“${post.title}”吗？归档文章也可以保留在归档列表中。`)) return
  saving.value = true
  try {
    await withSaveState(async () => { const raw = await readStoredPosts(); const index = raw.findIndex(item => item.id === post.id); const removed = index >= 0 ? raw[index] : undefined; if (!removed) throw new Error('文章不存在，可能已被其他设备删除'); if (!await postRepository.remove(post.id)) throw new Error('文章删除失败'); registerUndo('posts', removed, index, post.id) })
    if (reading.value?.id === post.id) reading.value = undefined
    if (editingId.value === post.id) resetEditor()
    await refresh(); toast('文章已删除，可在提示消失前撤销')
  } catch (cause) { toast(cause instanceof Error ? cause.message : '文章删除失败', 'error') } finally { saving.value = false }
}
</script>

<template>
  <div class="posts-page">
    <header class="page-head"><div><p class="eyebrow">文章 · 知识</p><h1 class="font-title">文章</h1><p>把值得留下的经验写成文章，按需检索并持续整理。</p></div><span class="load-pill"><span class="posts-active-count" style="display: contents">{{ activeCount }}</span> 篇在库</span></header>
    <section class="beryl-card matter-create"><form @submit.prevent="savePost"><div class="panel-head"><div><p class="eyebrow">{{ editingId ? 'EDIT POST' : 'NEW POST' }}</p><h2 class="font-title">{{ editingId ? '编辑文章' : '写一篇文章' }}</h2></div><button v-if="editingId" type="button" class="app-button" :disabled="saving" @click="resetEditor">取消编辑</button></div><input v-model="title" aria-label="文章标题" placeholder="文章标题" :disabled="saving" /><textarea v-model="content" aria-label="文章内容" placeholder="写下你的文章……支持 Markdown 文本" rows="8" :disabled="saving" /><div style="display:flex;justify-content:flex-end;gap:8px"><button class="primary" type="submit" :disabled="saving">{{ saving ? '保存中…' : editingId ? '保存修改' : '发布文章' }}</button></div></form></section>
    <section class="beryl-card admin-block"><div class="panel-head"><div><p class="eyebrow">ARTICLE INDEX</p><h2 class="font-title">文章列表</h2></div><span>{{ loading ? '正在读取…' : `${visiblePosts.length} 篇` }}</span></div><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:16px 0"><input v-model="query" aria-label="搜索文章" placeholder="搜索标题或正文" /><div class="range-tabs" role="tablist" aria-label="文章状态筛选"><button v-for="option in filters" :key="option.value" type="button" :class="filter === option.value ? 'on' : ''" role="tab" :aria-selected="filter === option.value" @click="filter = option.value">{{ option.label }}</button></div></div>
      <section v-if="error" class="beryl-card empty-state" role="alert"><b>文章数据暂时无法读取</b><p>{{ error }}</p><button class="app-button" type="button" @click="refresh">重试</button></section>
      <div v-if="loading" class="empty-state" role="status">正在读取文章…</div>
      <div v-else-if="visiblePosts.length" class="history-list" aria-live="polite"><article v-for="post in visiblePosts" :key="post.id" class="beryl-card history-card"><div class="panel-head"><button type="button" style="flex:1;min-width:0;border:0;padding:0;background:transparent;color:inherit;text-align:left;cursor:pointer" @click="reading = post"><h3 style="margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ post.title }}</h3></button><small>{{ formatDate(post.date) }}</small></div><p style="margin:8px 0 0;color:var(--c-text-2);line-height:1.6;white-space:pre-wrap;overflow:hidden;max-height:4.8em">{{ post.content }}</p><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px"><button type="button" class="app-button" :disabled="saving" @click="reading = post">阅读全文</button><button type="button" class="app-button" :disabled="saving" @click="beginEdit(post)">编辑</button><button type="button" class="app-button" :disabled="saving" @click="toggleArchive(post)">{{ post.archivedAt ? '恢复' : '归档' }}</button><button type="button" class="app-button danger" :disabled="saving" @click="removePost(post)">删除</button></div></article></div>
      <div v-else class="empty-state">{{ query ? '没有匹配的文章。' : filter === 'archived' ? '还没有归档文章。' : '还没有文章，把值得留下的经验写下来。' }}</div>
    </section>
    <div v-if="reading" class="el-drawer-overlay" role="presentation" @click="reading = undefined"><aside class="el-drawer" role="dialog" aria-modal="true" :aria-label="reading.title" @click.stop><div class="drawer"><button type="button" class="drawer-close" aria-label="关闭文章阅读" @click="reading = undefined">×</button><p class="eyebrow">ARTICLE</p><h1 class="font-title" style="font-size:clamp(28px, 5vw, 42px);line-height:1.15">{{ reading.title }}</h1><p class="muted">{{ formatDate(reading.date) }}{{ reading.archivedAt ? ' · 已归档' : '' }}</p><hr style="border:0;border-top:1px solid var(--c-border-soft);margin:20px 0" /><div style="max-width:720px;margin:0 auto;line-height:1.9;white-space:pre-wrap;overflow-wrap:anywhere">{{ reading.content }}</div></div></aside></div>
  </div>
</template>
