<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { readSession } from '@/core/auth'
import { logout as serverLogout } from '@/core/api/auth'
import { apiBaseUrl } from '@/core/api/base-url'
import { store } from '@/core/storage'
import { SCENES, currentSceneId } from '@/core/scenes'
import { listRealityDocumentsAsync, type RealityDocument } from '@/domain/reality'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import LbPanel from '@/vue/liubai/LbPanel.vue'

// 页面自带头部（参考稿里 .slide-head 属于页面自身），外壳因此不再渲染第二行标题。
useOwnSlideHead()

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
const people = ref<RealityDocument[]>([])
const linkedPersonId = ref(String(store.get<{ personId?: string }>('userPersonBinding', { personId: '' }).personId || ''))
const bindingStatus = ref('关联仅说明账号对应哪位现实人物，不会授权历史数据。')
const loading = ref(true)
const error = ref('')
const refreshDocuments = async (): Promise<void> => {
  loading.value = true
  error.value = ''
  try {
    documents.value = await listRealityDocumentsAsync()
    people.value = documents.value.filter(document => document.entityType === 'person' || document.entityType === 'char')
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '概览数据读取失败' }
  finally { loading.value = false }
}
const userName = session?.user?.displayName?.trim() || session?.u.trim() || '用户'
const userInitial = Array.from(userName)[0]?.toLocaleUpperCase() || 'C'
const matterCount = computed(() => documents.value.filter(document => document.entityType === 'case' || document.entityType === 'matter').length)
const focusMinutes = computed(() => documents.value.reduce((total, document) => total + (document.entityType === 'pomo' ? document.minutes ?? 0 : 0), 0))
const focusTime = computed(() => formatFocusTime(focusMinutes.value))
const habitDays = computed(() => new Set(documents.value.flatMap(document => document.entityType === 'habit' ? document.dates ?? [] : [])).size)
const latestDocument = computed(() => documents.value.reduce<RealityDocument | undefined>((latest, document) => !latest || document.updatedAt > latest.updatedAt ? document : latest, undefined))
function go(path: string): void { void router.push(path) }
function savePersonBinding() {
  const userId = session?.user?.id
  if (!userId) return
  const ok = store.set('userPersonBinding', { userId, personId: linkedPersonId.value || null, updatedAt: Date.now() })
  bindingStatus.value = ok ? '人物关联已保存；它不会自动共享或改变任何 Entity 权限。' : '人物关联未能保存，请检查本机存储状态。'
}
async function logout() {
  try { await serverLogout(apiBaseUrl()) } finally { window.location.hash = '#/login'; window.location.reload() }
}
onMounted(() => { void refreshDocuments() })
</script>

<template>
  <header class="slide-head">
    <div class="head-main">
      <p class="hint">我的 · Account</p>
      <div class="head-title-row">
        <h2>{{ userName }}</h2>
        <span class="info" tabindex="0" data-tip="账号由 Calmy 管理员创建，业务数据保存在你的独立 Vault 中。H 收起辅助信息。" aria-label="我的说明">i</span>
      </div>
    </div>
    <div class="detail-chips head-actions"><button class="chip" type="button" @click="go('/scene')">切换场景</button><button class="chip on" type="button" @click="go('/app/admin')">设置</button><button class="chip" type="button" @click="logout">退出登录</button></div>
  </header>
    <section v-if="error" class="panel profile-error" role="alert"><b>概览数据暂时无法读取</b><p class="dim">{{ error }}</p><button class="chip" type="button" @click="void refreshDocuments()">重试</button></section>
    <section class="profile-hero" aria-label="本地用户与当前场景">
      <article class="panel profile-identity-card"><div class="profile-avatar" aria-hidden="true">{{ userInitial }}</div><div class="profile-identity-copy"><p class="eyebrow">ACCOUNT · {{ session?.user?.role === 'admin' ? 'ADMIN' : 'USER' }}</p><h2>{{ userName }}</h2><p class="dim">账号 {{ session?.user?.username || session?.u }} · 此账号的数据与其他用户隔离</p></div><dl class="profile-identity-meta"><div><dt>会话验证</dt><dd>{{ formatTimestamp(session?.ts) }}</dd></div><div><dt>最近数据</dt><dd>{{ formatTimestamp(latestDocument?.updatedAt) }}</dd></div></dl><div class="detail-chips"><button class="chip" type="button" @click="go('/pass?mode=change')">修改登录密码</button></div></article>
      <article class="panel profile-scene-card"><div class="profile-scene-icon" aria-hidden="true" :style="{ backgroundColor: scene.color }">{{ scene.icon }}</div><div class="profile-scene-copy"><p class="eyebrow">CURRENT SCENE</p><h2>{{ scene.name }}</h2><p class="dim">{{ scene.desc }} · {{ scene.tagline }}</p></div><div class="profile-scene-summary" aria-label="当前场景模块数量"><b>{{ scene.mods.length }}</b><span>个原有模块</span></div><button class="chip" type="button" @click="go('/scene')">管理场景 →</button></article>
    </section>
    <LbPanel title="关联现实人物" note="账号 User 与现实 Person 是不同对象">
      <div class="profile-person-binding" aria-labelledby="profile-person-binding-title"><div><p class="eyebrow">USER ↔ PERSON</p><h2 id="profile-person-binding-title">关联现实人物</h2><p class="dim">关联不会自动授权此 Person 的历史记录、场景或 Space。</p></div><label>选择与此账号对应的人物<select v-model="linkedPersonId" aria-label="选择与此账号对应的人物"><option value="">暂不关联</option><option v-for="person in people" :key="person.id" :value="person.id">{{ person.title }}</option></select></label><button class="chip" type="button" @click="savePersonBinding">保存人物关联</button><small role="status">{{ bindingStatus }}</small></div>
    </LbPanel>
    <LbPanel title="现有数据概览" note="统计来自 Reality 文档视图">
      <div class="profile-stats-grid"><article class="profile-stat-card"><small>事项</small><b>{{ loading ? '…' : matterCount }}</b><span>个课题</span></article><article class="profile-stat-card"><small>专注时间</small><b>{{ loading ? '…' : focusTime.value }}</b><span>{{ focusTime.unit }}</span></article><article class="profile-stat-card"><small>习惯记录</small><b>{{ loading ? '…' : habitDays }}</b><span>天</span></article><article class="profile-stat-card"><small>本地事实</small><b>{{ loading ? '…' : documents.length }}</b><span>条数据</span></article></div>
    </LbPanel>
</template>

<style scoped>
/* 页面局部排版：颜色取「留白」令牌。.profile-* 类名沿用（页面语义钩子）。 */
.slide-head .head-actions { align-self: flex-end; margin-left: auto; }
.profile-error { border-color: color-mix(in srgb, var(--danger) 45%, transparent); }
.profile-hero { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: clamp(10px, 1.2vw, 14px); }
.profile-identity-card, .profile-scene-card { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 12px 14px; }
.profile-avatar, .profile-scene-icon { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 14px; background: var(--panel-2); font-size: 1.3rem; }
.profile-identity-copy h2, .profile-scene-copy h2 { margin: 0 0 2px; font-size: 1rem; font-weight: 600; }
.profile-identity-copy p, .profile-scene-copy p { margin: 0; font-size: .78rem; }
.profile-identity-meta { display: grid; gap: 4px; grid-column: 1 / -1; margin: 0; }
.profile-identity-meta div { display: flex; justify-content: space-between; gap: 10px; font-size: .72rem; }
.profile-identity-meta dt { color: var(--muted); }
.profile-identity-meta dd { margin: 0; color: var(--fg); }
.profile-identity-card .detail-chips { grid-column: 1 / -1; }
.profile-scene-card .chip { grid-column: 1 / -1; justify-self: start; }
.profile-scene-summary { display: grid; justify-items: end; text-align: right; }
.profile-scene-summary b { color: var(--accent); font-size: 1.2rem; }
.profile-scene-summary span { color: var(--muted); font-size: .68rem; }
.profile-person-binding { display: grid; gap: 10px; }
.profile-person-binding h2 { margin: 0 0 2px; font-size: 1rem; font-weight: 600; }
.profile-person-binding p { margin: 0; font-size: .78rem; }
.profile-person-binding label { display: grid; gap: 6px; color: var(--muted); font-size: .72rem; }
.profile-person-binding select { min-height: 34px; padding: 6px 10px; font: inherit; font-size: .8rem; }
.profile-person-binding small { color: var(--muted); font-size: .72rem; }
.profile-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: clamp(10px, 1.2vw, 14px); }
.profile-stat-card { display: grid; gap: 5px; padding: clamp(12px, 1.4vw, 16px); border: 1px solid var(--line); border-radius: 12px; background: var(--panel-2); }
.profile-stat-card small { color: var(--muted); font-size: .7rem; }
.profile-stat-card b { color: var(--fg); font-size: 1.5rem; font-weight: 700; }
.profile-stat-card span { color: var(--muted); font-size: .68rem; }
</style>
