<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import EmptyState from '@/components/EmptyState.vue'
import { currentAuthor, socialRepository } from '@/domain/social/repository'
import { VISIBILITY_LABEL, type SocialPost, type SocialVisibility } from '@/domain/social/model'

const content = ref('')
const visibility = ref<SocialVisibility>('private')
const posts = ref<SocialPost[]>(socialRepository.list())
const commentDrafts = ref<Record<string, string>>({})
const replyTargets = ref<Record<string, string | undefined>>({})
const authorId = computed(() => currentAuthor().id)

function refresh() { posts.value = socialRepository.list() }
function publish() {
  if (!content.value.trim()) { ElMessage.warning('写点内容再发布吧'); return }
  socialRepository.create(content.value, visibility.value)
  content.value = ''; refresh(); ElMessage.success('动态已发布')
}
function toggleLike(post: SocialPost) { socialRepository.toggleLike(post.id, authorId.value); refresh() }
function setReply(postId: string, commentId: string) { replyTargets.value[postId] = commentId }
function cancelReply(postId: string) { delete replyTargets.value[postId] }
function addComment(post: SocialPost) {
  const draft = commentDrafts.value[post.id] || ''
  const comment = socialRepository.addComment(post.id, draft, replyTargets.value[post.id])
  if (!comment) { ElMessage.warning('评论不能为空'); return }
  commentDrafts.value[post.id] = ''; cancelReply(post.id); refresh()
}
async function removePost(post: SocialPost) {
  try {
    await ElMessageBox.confirm('删除这条动态及其评论？', '删除动态', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
    socialRepository.remove(post.id); refresh()
  } catch { /* cancelled */ }
}
function removeComment(post: SocialPost, commentId: string) { socialRepository.removeComment(post.id, commentId); refresh() }
function commentLabel(postId: string): string { return replyTargets.value[postId] ? '回复评论…' : '说点什么…' }
function isMine(post: SocialPost): boolean { return post.author.id === authorId.value }
function isCommentMine(comment: SocialPost['comments'][number]): boolean { return comment.author.id === authorId.value }
function onDataSynced() { refresh() }
onMounted(() => window.addEventListener('beryl-data-synced', onDataSynced))
onUnmounted(() => window.removeEventListener('beryl-data-synced', onDataSynced))
</script>

<template>
  <div class="moments-intro"><p class="eyebrow">MOMENTS</p><h3 class="font-title">记录，也让彼此看见。</h3><p>现在只有你自己，未来可以自然扩展为家庭、情侣或小圈子的动态流。</p></div>
  <form class="beryl-card composer" @submit.prevent="publish">
    <el-input v-model="content" type="textarea" :rows="4" maxlength="2000" show-word-limit placeholder="分享此刻的想法、照片说明或一件小事…" />
    <div class="composer-foot"><el-select v-model="visibility" aria-label="动态可见范围"><el-option v-for="(label, key) in VISIBILITY_LABEL" :key="key" :label="label" :value="key" /></el-select><el-button type="primary" native-type="submit">发布动态</el-button></div>
  </form>

  <div class="feed">
    <EmptyState v-if="!posts.length" icon="♡" title="还没有动态" description="发布第一条动态，给未来的自己留个入口。" />
    <article v-for="post in posts" :key="post.id" class="beryl-card post-card">
      <header class="post-head"><div class="avatar">{{ post.author.name.slice(0, 1).toUpperCase() }}</div><div class="author"><b>{{ post.author.name }}</b><small>{{ new Date(post.createdAt).toLocaleString('zh-CN') }} · {{ VISIBILITY_LABEL[post.visibility] }}</small></div><el-button v-if="isMine(post)" text circle aria-label="删除动态" @click="removePost(post)">✕</el-button></header>
      <p class="post-content">{{ post.content }}</p>
      <div class="post-actions"><el-button text size="small" :class="{ liked: post.likedBy.includes(authorId) }" @click="toggleLike(post)">♡ {{ post.likedBy.length || '赞' }}</el-button><span>{{ post.comments.length }} 条评论</span></div>
      <div v-if="post.comments.length" class="comments"><div v-for="comment in post.comments" :key="comment.id" class="comment" :class="{ reply: comment.parentId }"><div class="comment-main"><b>{{ comment.author.name }}</b><span>{{ comment.content }}</span></div><div class="comment-tools"><small>{{ new Date(comment.createdAt).toLocaleString('zh-CN') }}</small><button type="button" @click="setReply(post.id, comment.id)">回复</button><button v-if="isCommentMine(comment)" type="button" aria-label="删除评论" @click="removeComment(post, comment.id)">删除</button></div></div></div>
      <div class="comment-box"><p v-if="replyTargets[post.id]" class="replying">正在回复一条评论 <button type="button" @click="cancelReply(post.id)">取消</button></p><el-input v-model="commentDrafts[post.id]" :placeholder="commentLabel(post.id)" @keyup.enter="addComment(post)" /><el-button @click="addComment(post)">评论</el-button></div>
    </article>
  </div>
</template>

<style scoped>
.moments-intro{margin:2px 0 22px}.eyebrow{font-size:10px;letter-spacing:.13em;color:var(--scene);font-weight:700;margin:0 0 7px}.moments-intro h3{font-size:27px;margin:0}.moments-intro p:last-child{font-size:12px;color:var(--c-text-2);margin:8px 0 0}.composer{padding:16px}.composer-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px}.composer-foot :deep(.el-select){width:130px}.feed{display:flex;flex-direction:column;gap:14px;margin-top:20px}.post-card{padding:16px}.post-head{display:flex;align-items:center;gap:10px}.avatar{width:36px;height:36px;display:grid;place-items:center;border-radius:50%;background:var(--scene-soft);color:var(--scene);font-weight:700}.author{display:grid;gap:3px;flex:1}.author small,.comment-tools small{font-size:10px;color:var(--c-text-3)}.post-content{white-space:pre-wrap;line-height:1.7;font-size:14px;margin:16px 0}.post-actions{display:flex;align-items:center;gap:12px;border-top:1px solid var(--c-border-soft);padding-top:8px;color:var(--c-text-3);font-size:11px}.liked{color:var(--scene)!important}.comments{border-top:1px solid var(--c-border-soft);margin-top:8px;padding-top:6px}.comment{padding:8px 0;border-bottom:1px solid var(--c-border-soft)}.comment.reply{padding-left:22px;background:var(--c-bg-soft)}.comment-main{display:flex;gap:7px;font-size:12px;line-height:1.5}.comment-main b{color:var(--scene);white-space:nowrap}.comment-tools{display:flex;gap:9px;margin-top:4px}.comment-tools button,.replying button{border:0;background:transparent;color:var(--scene);font-size:10px;cursor:pointer;padding:0}.comment-box{display:flex;gap:8px;margin-top:10px;align-items:flex-start}.comment-box :deep(.el-input){flex:1}.replying{font-size:10px;color:var(--c-text-3);margin:0 0 4px;position:absolute;transform:translateY(-18px)}@media(max-width:600px){.composer-foot{align-items:stretch}.composer-foot :deep(.el-select){flex:1}.comment-box{align-items:stretch}.comment-box .el-button{padding:0 12px}}
</style>
