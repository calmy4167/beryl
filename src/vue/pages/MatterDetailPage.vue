<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter } from '@/domain/matter/model'
import { readServerSession } from '@/core/auth'
import { useMatterStatusDictionary } from '@/vue/composables/useMatterStatusDictionary'
import DomainPicker from '@/vue/components/DomainPicker.vue'
import OwnershipEditor from '@/vue/components/OwnershipEditor.vue'
import ContextRelationPicker from '@/vue/components/ContextRelationPicker.vue'
import RealitySettlementPanel from '@/vue/components/RealitySettlementPanel.vue'
import { unifiedAsyncRepository, type Person, type Scene } from '@/domain/unified'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import LbPanel from '@/vue/liubai/LbPanel.vue'

const props = defineProps<{ matterId?: string }>()
const emit = defineEmits<{ close: [] }>()
const closeButton = ref<HTMLButtonElement | null>(null)

// Full-page route owns the shell heading. The contextual peek stays inside the list page.
if (!props.matterId) useOwnSlideHead()

const trajectoryLabels: Record<Matter['trajectory'], string> = {
  advancing: '推进',
  stable: '稳定',
  stalled: '停滞',
  retreating: '回退',
  diverging: '绕路',
  lost: '失去连接',
  recovering: '恢复',
  restarting: '重启',
  unknown: '未知',
}

const route = useRoute()
const router = useRouter()
const { labelFor: matterStatusLabel } = useMatterStatusDictionary()
const routeMatterId = computed(() => {
  if (props.matterId) return props.matterId
  const id = route.params.id
  return Array.isArray(id) ? id[id.length - 1] || '' : id || ''
})
const matter = ref<Matter>()
const scenes = ref<Scene[]>([])
const things = ref<Matter[]>([])
const people = ref<Person[]>([])
const currentUserId = readServerSession()?.user.id
const loading = ref(true)
const error = ref('')
const statusSegments = computed(() => {
  const current = matter.value
  return current
    ? ['状态：', matterStatusLabel(current.status), ' · 阶段：', current.currentStage, ' · 趋势：', trajectoryLabels[current.trajectory]]
    : []
})
const contradictionSegments = computed(() => {
  const current = matter.value
  return current ? ['主矛盾：', current.primaryContradiction || '尚未填写'] : []
})

async function refresh(): Promise<void> {
  const id = routeMatterId.value
  loading.value = true
  error.value = ''
  try {
    const [loadedMatter, allMatters, allScenes, loadedPeople] = await Promise.all([
      id ? matterAsyncRepository.find(id) : Promise.resolve(undefined), matterAsyncRepository.list(),
      unifiedAsyncRepository.list<Scene>('scene'), unifiedAsyncRepository.list<Person>('person')
    ])
    matter.value = loadedMatter
    things.value = allMatters
    people.value = loadedPeople
    scenes.value = allScenes.filter(scene => scene.thingId === id).sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || (a.startedAt ?? a.createdAt) - (b.startedAt ?? b.createdAt))
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '处境读取失败'
  } finally {
    loading.value = false
  }
}

async function saveOwnership(ownership: Matter['ownership']): Promise<void> {
  const current = matter.value
  if (!current) return
  try {
    matter.value = await matterAsyncRepository.update(current.calmyId, { ownership }, { expectedRevision: current.revision })
    error.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '归属设置保存失败'
  }
}

function openExploration(): void {
  if (!matter.value) return
  void router.push(`/app/flow?matter=${encodeURIComponent(matter.value.calmyId)}`)
}
function openFullDetail(): void {
  if (matter.value) void router.push(`/app/matters/${encodeURIComponent(matter.value.calmyId)}`)
}
function onPeekKeydown(event: KeyboardEvent): void {
  if (!props.matterId || event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  emit('close')
}

function sceneStatusLabel(status: Scene['status']): string {
  return ({ draft: '准备中', active: '进行中', paused: '已暂停', completed: '已完成', archived: '已归档' })[status]
}

watch(routeMatterId, () => void refresh(), { immediate: true })
onMounted(() => { if (props.matterId) nextTick(() => closeButton.value?.focus()) })
</script>

<template>
  <aside
    :class="{ 'matter-detail-peek': !!props.matterId }"
    :role="props.matterId ? 'dialog' : undefined"
    :aria-modal="props.matterId ? 'false' : undefined"
    :aria-label="props.matterId ? '处境详情' : undefined"
    @keydown="onPeekKeydown"
  >
    <div v-if="props.matterId" class="matter-peek-actions">
      <button ref="closeButton" class="chip" type="button" @click="emit('close')">关闭详情</button>
      <button class="chip" type="button" @click="openFullDetail">打开完整详情</button>
    </div>
  <header class="slide-head">
    <div class="head-main">
      <p class="hint">处境 · 详情</p>
      <div class="head-title-row">
        <h1 v-if="loading">正在读取处境…</h1>
        <h1 v-else-if="error">处境暂时无法读取。</h1>
        <h1 v-else-if="!matter">找不到这个处境。</h1>
        <h1 v-else>{{ matter.title }}</h1>
        <span class="info" tabindex="0" data-tip="同一件事可以经历多个阶段性情境；趋势是基于记录的可推翻判断。H 收起辅助信息。" aria-label="处境详情说明">i</span>
      </div>
    </div>
  </header>
  <p v-if="loading" class="panel dim" role="status">正在读取处境…</p>
  <section v-else-if="error" class="panel matter-error" role="alert">
    <b>处境暂时无法读取</b>
    <p class="dim">{{ error }}</p>
    <button class="chip" type="button" @click="refresh">重试</button>
  </section>
  <section v-else-if="!matter" class="panel dim" role="status">
    <b>找不到这个处境</b>
    <p>它可能已被归档或从当前设备移除。</p>
  </section>
  <template v-else>
    <p class="dim">{{ matter.why || '这个处境还没有写下为什么重要。' }}</p>
    <LbPanel class="admin-block" title="当前状态" note="趋势可推翻，需要调整时在处境列表修改">
      <p class="status-copy dim"><template v-for="(segment, index) in statusSegments" :key="index">{{ segment }}</template></p>
      <p class="status-copy dim"><template v-for="(segment, index) in contradictionSegments" :key="index">{{ segment }}</template></p>
      <DomainPicker :entity-ref="{ entityType: 'matter', calmyId: matter.calmyId }" />
      <ContextRelationPicker :entity-ref="{ entityType: 'matter', calmyId: matter.calmyId }" :target-types="['person', 'space']" />
      <OwnershipEditor :ownership="matter.ownership" :people="people" :current-user-id="currentUserId" :disabled="loading" @save="saveOwnership" />
      <div class="detail-chips"><button class="chip" type="button" @click="openExploration">围绕这个处境进入探索</button></div>
    </LbPanel>
    <section class="thing-scenes panel" aria-label="关联情境">
      <div><h2>这件事中的情境</h2><p class="dim">同一件事可以经历多个阶段性情境；每段情境只引用这件事，不复制资料。</p></div>
      <ul v-if="scenes.length"><li v-for="scene in scenes" :key="scene.calmyId"><span>{{ scene.title }}</span><small>{{ sceneStatusLabel(scene.status) }}</small></li></ul>
      <p v-else class="dim">还没有关联的情境。简单的事情可以一直不创建情境。</p>
      <div class="detail-chips"><RouterLink class="chip" :to="{ path: '/app/reality-scenes', query: { thing: matter.calmyId } }">围绕这件事记录一段情境</RouterLink></div>
    </section>
    <RealitySettlementPanel v-if="matter.status === 'archived'" :thing="matter" :scenes="scenes" :things="things" />
    <section v-if="matter.problem" class="problem-driven-detail panel">
      <h2>问题驱动学习</h2>
      <p class="dim">学习只在解决当前问题时发生，并通过现实反馈决定继续、改法或停止。</p>
      <dl>
        <dt>现实问题</dt><dd>{{ matter.problem }}</dd>
        <template v-if="matter.desiredChange"><dt>期望变化</dt><dd>{{ matter.desiredChange }}</dd></template>
        <template v-if="matter.progressEvidence"><dt>进展证据</dt><dd>{{ matter.progressEvidence }}</dd></template>
        <template v-if="matter.currentGap"><dt>当前缺口</dt><dd>{{ matter.currentGap }}</dd></template>
        <template v-if="matter.nextTest"><dt>下一次验证</dt><dd>{{ matter.nextTest }}</dd></template>
        <template v-if="matter.stopCondition"><dt>停止条件</dt><dd>{{ matter.stopCondition }}</dd></template>
      </dl>
    </section>
  </template>
  </aside>
</template>

<style scoped>
/* 页面局部排版：颜色取「留白」令牌。.thing-scenes / .problem-driven-detail 是 parity 测试的钩子。 */
.matter-error { border-color: color-mix(in srgb, var(--danger) 45%, transparent); }
.thing-scenes { gap: 8px; }
.thing-scenes h2, .problem-driven-detail h2 { margin: 0; font-size: 1rem; font-weight: 600; }
.thing-scenes p { margin: 0; font-size: .78rem; line-height: 1.7; }
.thing-scenes ul { display: grid; gap: 6px; list-style: none; margin: 0; padding: 0; }
.thing-scenes li { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: .82rem; }
.thing-scenes li:last-child { border-bottom: 0; }
.thing-scenes li small { color: var(--muted); font-size: .7rem; }
.problem-driven-detail dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 14px; margin: 0; }
.problem-driven-detail dt { color: var(--muted); font-size: .72rem; }
.problem-driven-detail dd { margin: 0; color: var(--fg); font-size: .82rem; line-height: 1.7; }
.matter-detail-peek {
  position: fixed;
  z-index: 96;
  inset: 24px 24px 24px auto;
  display: flex;
  width: min(440px, calc(100vw - 48px));
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding: 18px;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  background: rgba(255, 255, 255, .96);
  box-shadow: 0 16px 48px rgba(16, 24, 40, .18);
  backdrop-filter: blur(20px) saturate(145%);
}
.matter-detail-peek .matter-peek-actions { position: sticky; top: -18px; z-index: 1; display: flex; justify-content: flex-end; gap: 8px; margin: -18px -18px 0; padding: 12px 16px; border-bottom: 1px solid #edf0f4; background: rgba(255, 255, 255, .92); }
.matter-detail-peek .slide-head { padding: 4px 0 14px; }
.matter-detail-peek > :deep(.panel), .matter-detail-peek > :deep(section.panel) { margin: 0; }
@media (max-width: 760px) {
  .matter-detail-peek { inset: 8px; width: auto; border-radius: 14px; }
}
</style>
