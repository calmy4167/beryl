<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { readSession } from '@/core/auth'
import { SCENES, currentSceneId } from '@/core/scenes'
import { listRealityDocumentsAsync, type RealityDocument } from '@/domain/reality'

function formatTimestamp(timestamp: number | undefined): string {
  if (!timestamp || timestamp <= 0) return '暂无记录'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(timestamp)
}
function formatFocusTime(minutes: number): { value: string; unit: string } {
  if (minutes < 60) return { value: String(minutes), unit: '分钟' }
  const hours = minutes / 60
  return { value: Number.isInteger(hours) ? String(hours) : hours.toFixed(1), unit: '小时' }
}

const router = useRouter()
const session = readSession()
const scene = SCENES[currentSceneId()] ?? SCENES.personal
const documents = ref<RealityDocument[]>([])
const loading = ref(true)
const error = ref('')
const refreshDocuments = async (): Promise<void> => {
  loading.value = true
  error.value = ''
  try { documents.value = await listRealityDocumentsAsync() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '概览数据读取失败' }
  finally { loading.value = false }
}
const userName = session?.u.trim() || '本地用户'
const userInitial = Array.from(userName)[0]?.toLocaleUpperCase() || 'C'
const matterCount = computed(() => documents.value.filter(document => document.entityType === 'case' || document.entityType === 'matter').length)
const focusMinutes = computed(() => documents.value.reduce((total, document) => total + (document.entityType === 'pomo' ? document.minutes ?? 0 : 0), 0))
const focusTime = computed(() => formatFocusTime(focusMinutes.value))
const habitDays = computed(() => new Set(documents.value.flatMap(document => document.entityType === 'habit' ? document.dates ?? [] : [])).size)
const latestDocument = computed(() => documents.value.reduce<RealityDocument | undefined>((latest, document) => !latest || document.updatedAt > latest.updatedAt ? document : latest, undefined))
function go(path: string): void { void router.push(path) }
onMounted(() => { void refreshDocuments() })
</script>

<template>
  <div class="profile-page">
    <header class="page-head profile-page-head"><div><p class="eyebrow">MY · LOCAL PROFILE</p><h1 class="font-title">我的</h1><p>聚合当前设备上的会话、场景和已有模块数据，不创建额外账户资料。</p></div><div class="profile-head-actions"><button class="app-button" type="button" @click="go('/scene')">切换场景</button><button class="app-button primary" type="button" @click="go('/app/admin')">设置</button></div></header>
    <section v-if="error" class="beryl-card empty-state" role="alert"><b>概览数据暂时无法读取</b><p>{{ error }}</p><button class="app-button" type="button" @click="void refreshDocuments()">重试</button></section>
    <section class="profile-hero" aria-label="本地用户与当前场景">
      <article class="beryl-card profile-identity-card"><div class="profile-avatar" aria-hidden="true">{{ userInitial }}</div><div class="profile-identity-copy"><p class="eyebrow">LOCAL USER</p><h2 class="font-title">{{ userName }}</h2><p>本地会话 · 数据保存在当前设备并沿用现有同步设置</p></div><dl class="profile-identity-meta"><div><dt>会话更新</dt><dd>{{ formatTimestamp(session?.ts) }}</dd></div><div><dt>最近数据</dt><dd>{{ formatTimestamp(latestDocument?.updatedAt) }}</dd></div></dl><div class="profile-identity-actions"><button class="app-button" type="button" @click="go('/pass?mode=change')">修改访问密码</button></div></article>
      <article class="beryl-card profile-scene-card"><div class="profile-scene-icon" aria-hidden="true" :style="{ backgroundColor: scene.color }">{{ scene.icon }}</div><div class="profile-scene-copy"><p class="eyebrow">CURRENT SCENE</p><h2 class="font-title">{{ scene.name }}</h2><p>{{ scene.desc }} · {{ scene.tagline }}</p></div><div class="profile-scene-summary" aria-label="当前场景模块数量"><b>{{ scene.mods.length }}</b><span>个原有模块</span></div><button class="app-button" type="button" @click="go('/scene')">管理场景 →</button></article>
    </section>
    <section class="profile-overview" aria-labelledby="profile-overview-title"><div class="profile-section-head"><div><p class="eyebrow">OVERVIEW</p><h2 id="profile-overview-title" class="font-title">现有数据概览</h2></div><span>统计来自 Reality 文档视图</span></div><div class="profile-stats-grid"><article class="beryl-card profile-stat-card"><small>事项</small><b>{{ loading ? '…' : matterCount }}</b><span>个课题</span></article><article class="beryl-card profile-stat-card"><small>专注时间</small><b>{{ loading ? '…' : focusTime.value }}</b><span>{{ focusTime.unit }}</span></article><article class="beryl-card profile-stat-card"><small>习惯记录</small><b>{{ loading ? '…' : habitDays }}</b><span>天</span></article><article class="beryl-card profile-stat-card"><small>本地事实</small><b>{{ loading ? '…' : documents.length }}</b><span>条数据</span></article></div></section>
  </div>
</template>
