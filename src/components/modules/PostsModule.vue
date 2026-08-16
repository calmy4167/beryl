<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { fmtDate } from '@/core/storage'
import { createCollectionRepository, createEntityId } from '@/core/repository'
import ContentEditor from '@/components/content/ContentEditor.vue'
import ContentRenderer from '@/components/content/ContentRenderer.vue'

interface Post { id: string; title: string; content: string; date: string }
const postRepository = createCollectionRepository<Post>('posts')
const title = ref('')
const content = ref('')
const items = ref<Post[]>(postRepository.list())
const reading = ref<Post | null>(null)

function refresh() { items.value = postRepository.list() }
function add() {
  const t = title.value.trim()
  const c = content.value.trim()
  if (!t || !c) { ElMessage.warning('标题和内容都要填写哦'); return }
  postRepository.create({ id: createEntityId(), title: t, content: c, date: fmtDate(Date.now()) })
  title.value = ''; content.value = ''
  refresh()
  ElMessage.success('文章已发布 ✍️')
}
function del(id: string) {
  postRepository.remove(id)
  refresh()
}
</script>

<template>
  <form class="beryl-card hoverable form" @submit.prevent="add">
    <el-input v-model="title" placeholder="文章标题" />
    <ContentEditor v-model="content" :rows="6" placeholder="写下你的文章…（支持 Markdown）" />
    <div class="right"><el-button type="primary" native-type="submit">发布</el-button></div>
  </form>

  <div class="list">
    <div v-if="!items.length" class="empty">空空如也，写一篇吧 ✍️</div>
    <div v-for="p in items" :key="p.id" class="beryl-card hoverable item" @click="reading = p">
      <div class="row">
        <p class="t">{{ p.title }}</p>
        <span class="date">{{ p.date }}</span>
        <el-button circle text size="small" @click.stop="del(p.id)">✕</el-button>
      </div>
      <p class="summary">{{ p.content.replace(/\n/g, ' ').slice(0, 80) }}</p>
      <p class="read-hint">点击阅读全文 →</p>
    </div>
  </div>

  <el-drawer v-model="reading" size="92%" :with-header="false">
    <template v-if="reading">
      <h1 class="font-title draw-title">{{ reading.title }}</h1>
      <p class="draw-date">{{ reading.date }}</p>
      <hr class="draw-hr">
      <ContentRenderer class="draw-body" :content="reading.content" />
    </template>
  </el-drawer>
</template>

<style scoped>
.form { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.right { text-align: right; }
.list { margin-top: 20px; display: flex; flex-direction: column; gap: 8px; }
.item { padding: 14px 16px; cursor: pointer; }
.row { display: flex; align-items: center; gap: 10px; }
.t { flex: 1; font-weight: 700; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.date { font-size: 10px; color: var(--c-text-2); flex-shrink: 0; }
.summary { font-size: 12px; color: var(--c-text-2); margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.read-hint { font-size: 10px; color: var(--scene); margin-top: 6px; }
.empty { text-align: center; color: var(--c-text-3); font-size: 14px; padding: 40px 0; }
.draw-title { font-size: 1.5rem; font-weight: 700; margin: 0; }
.draw-date { font-size: 10px; color: var(--c-text-2); margin-top: 8px; }
.draw-hr { border: none; border-top: 1px solid var(--c-border-soft); margin: 20px 0; }
.draw-body { font-size: 15px; color: var(--c-text); max-width: 720px; margin: 0 auto; }
</style>
