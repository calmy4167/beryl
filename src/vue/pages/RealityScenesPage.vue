<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { readServerSession } from '@/core/auth'
import { withSaveState } from '@/core/save-state'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter } from '@/domain/matter/model'
import {
  unifiedAsyncRepository, unifiedFactories,
  type Ownership, type Person, type Scene, type SceneParticipant, type SceneStatus, type Space
} from '@/domain/unified'
import RealitySettlementPanel from '@/vue/components/RealitySettlementPanel.vue'
import OwnershipEditor from '@/vue/components/OwnershipEditor.vue'
import DomainPicker from '@/vue/components/DomainPicker.vue'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import LbPanel from '@/vue/liubai/LbPanel.vue'
import LbCollapsible from '@/vue/liubai/LbCollapsible.vue'

// 页面自带头部（参考稿里 .slide-head 属于页面自身），外壳因此不再渲染第二行标题。
useOwnSlideHead()

const scenes = ref<Scene[]>([])
const things = ref<Matter[]>([])
const people = ref<Person[]>([])
const allPeople = ref<Person[]>([])
const spaces = ref<Space[]>([])
const participants = ref<SceneParticipant[]>([])
const route = useRoute()
const currentUserId = readServerSession()?.user.id
const title = ref('')
const spaceTitle = ref('')
const spacePurpose = ref('')
const spaceBoundary = ref('')
const spaceMemberIds = ref<string[]>([])
const thingId = ref('')
const spaceId = ref('')
const participantPersonId = ref<Record<string, string>>({})
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const info = ref('')
const activeSpaces = computed(() => spaces.value.filter(space => space.status === 'active' && !space.archivedAt))

async function refresh(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [sceneRows, thingRows, peopleRows, spaceRows, participantRows] = await Promise.all([
      unifiedAsyncRepository.list<Scene>('scene'), matterAsyncRepository.list(),
      unifiedAsyncRepository.list<Person>('person'), unifiedAsyncRepository.list<Space>('space'),
      unifiedAsyncRepository.list<SceneParticipant>('scene_participant')
    ])
    scenes.value = sceneRows.sort((a, b) => (a.thingId || '').localeCompare(b.thingId || '') || (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || b.updatedAt - a.updatedAt)
    things.value = thingRows
    allPeople.value = peopleRows
    people.value = peopleRows.filter(person => person.status === 'active')
    spaces.value = spaceRows
    participants.value = participantRows
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '情境读取失败'
  } finally {
    loading.value = false
  }
}

async function createScene(): Promise<void> {
  if (!title.value.trim() || saving.value) return
  saving.value = true
  error.value = ''
  info.value = ''
  try {
    const selectedThingId = thingId.value || undefined
    const existingOrders = scenes.value.filter(item => item.thingId === selectedThingId).map(item => item.order ?? 0)
    const scene = unifiedFactories.scene({ title: title.value.trim(), thingId: selectedThingId, spaceId: spaceId.value || undefined, startedAt: Date.now(), order: existingOrders.length ? Math.max(...existingOrders) + 1 : 0 })
    await unifiedAsyncRepository.create(scene)
    title.value = ''
    thingId.value = ''
    spaceId.value = ''
    info.value = '情境已创建。参与者记录本身不会授予账号访问权。'
    await refresh()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '情境创建失败'
  } finally {
    saving.value = false
  }
}

async function transition(scene: Scene, status: SceneStatus): Promise<void> {
  if (saving.value) return
  saving.value = true
  error.value = ''
  try {
    await unifiedAsyncRepository.transitionScene(scene.calmyId, status, {
      expectedRevision: scene.revision,
      commandId: `scene:status:${scene.calmyId}:${scene.revision + 1}`,
      actor: 'user', actorId: currentUserId || 'local-user', sourceIds: ['reality-scenes:scene-status']
    })
    info.value = status === 'completed' ? '情境已完成，相关资料和历史仍会保留。' : '情境状态已更新。'
    await refresh()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '情境状态更新失败'
  } finally {
    saving.value = false
  }
}

async function closeSpace(space: Space, status: Space['status']): Promise<void> {
  if (saving.value || space.status === 'archived') return
  saving.value = true
  error.value = ''
  try {
    await withSaveState(() => unifiedAsyncRepository.transitionSpace(space.calmyId, status, {
      expectedRevision: space.revision, commandId: `space:status:${space.calmyId}:${space.revision + 1}`,
      actor: 'user', actorId: currentUserId || 'local-user', sourceIds: ['reality-scenes:space-status']
    }))
    info.value = '空间状态已更新；关联情境、资料和历史仍被保留。'
    await refresh()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '空间状态更新失败'
  } finally {
    saving.value = false
  }
}

async function createSpace(): Promise<void> {
  if (!spaceTitle.value.trim() || saving.value) return
  saving.value = true
  error.value = ''
  info.value = ''
  try {
    const space = unifiedFactories.space({
      title: spaceTitle.value.trim(), purpose: spacePurpose.value.trim() || undefined,
      boundary: spaceBoundary.value.trim() || undefined,
      memberPersonIds: [...new Set(spaceMemberIds.value)], relationshipIds: [], thingIds: [], sceneIds: [],
      ownerRef: currentUserId ? { type: 'user', id: currentUserId } : undefined, status: 'active'
    })
    await withSaveState(() => unifiedAsyncRepository.create(space, {
      commandId: `space:create:${space.calmyId}`, actor: 'user', actorId: currentUserId || 'local-user', sourceIds: ['reality-scenes:space-form']
    }))
    spaceTitle.value = ''; spacePurpose.value = ''; spaceBoundary.value = ''; spaceMemberIds.value = []
    info.value = '长期空间已创建。成员记录现实关系，不会自动获得资料访问权。'
    await refresh()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '空间创建失败' }
  finally { saving.value = false }
}

async function updateSpace(space: Space, patch: Partial<Space>, command: string): Promise<void> {
  if (saving.value || space.status === 'archived') return
  saving.value = true
  error.value = ''
  try {
    await withSaveState(() => unifiedAsyncRepository.update<Space>('space', space.calmyId, patch, {
      expectedRevision: space.revision, commandId: `space:${command}:${space.calmyId}:${space.revision + 1}`
    }))
    info.value = '空间资料已更新；成员关系不会授予访问权限。'
    await refresh()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '空间更新失败' }
  finally { saving.value = false }
}

async function updateSpaceMembers(space: Space, event: Event): Promise<void> {
  const select = event.currentTarget as HTMLSelectElement
  const selectedIds = [...select.selectedOptions].map(option => option.value)
  const knownIds = new Set(allPeople.value.map(person => person.calmyId))
  const activeIds = new Set(people.value.map(person => person.calmyId))
  const currentIds = new Set(space.memberPersonIds || [])
  const invalidNew = selectedIds.filter(id => !currentIds.has(id) && (!knownIds.has(id) || !activeIds.has(id)))
  if (invalidNew.length) { error.value = '只能添加仍有效的人物作为空间成员。'; return }
  const unknownLegacyIds = (space.memberPersonIds || []).filter(id => !knownIds.has(id))
  await updateSpace(space, { memberPersonIds: [...new Set([...selectedIds, ...unknownLegacyIds])] }, 'members')
}

async function saveOwnership(entityType: 'scene' | 'space', item: Scene | Space, ownership: Ownership | undefined): Promise<void> {
  if (saving.value) return
  saving.value = true
  error.value = ''
  try {
    await unifiedAsyncRepository.update(entityType, item.calmyId, { ownership }, { expectedRevision: item.revision })
    info.value = '归属与可见范围已保存。'
    await refresh()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '归属设置保存失败'
  } finally { saving.value = false }
}

async function addParticipant(scene: Scene): Promise<void> {
  const personId = participantPersonId.value[scene.calmyId]
  if (!personId || saving.value) return
  const alreadyActive = participants.value.some(item => item.sceneId === scene.calmyId && item.personId === personId && item.leftAt === undefined)
  if (alreadyActive) { error.value = '这位参与者已经在情境中'; return }
  saving.value = true
  error.value = ''
  try {
    await unifiedAsyncRepository.create(unifiedFactories.sceneParticipant({ sceneId: scene.calmyId, personId, joinedAt: Date.now() }))
    participantPersonId.value[scene.calmyId] = ''
    await refresh()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '参与者添加失败'
  } finally {
    saving.value = false
  }
}

async function leaveParticipant(participant: SceneParticipant): Promise<void> {
  if (saving.value) return
  saving.value = true
  error.value = ''
  try {
    await unifiedAsyncRepository.update<SceneParticipant>('scene_participant', participant.calmyId, { leftAt: Date.now() }, { expectedRevision: participant.revision })
    await refresh()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '参与者状态更新失败'
  } finally {
    saving.value = false
  }
}

function participantsFor(sceneId: string): SceneParticipant[] {
  return participants.value.filter(participant => participant.sceneId === sceneId)
}
function orderedScenesForThing(thingId?: string): Scene[] {
  return scenes.value.filter(scene => scene.thingId === thingId).slice().sort((a, b) =>
    (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
    || (a.startedAt ?? a.createdAt) - (b.startedAt ?? b.createdAt)
  )
}
async function moveScene(scene: Scene, direction: -1 | 1): Promise<void> {
  if (!scene.thingId || saving.value) return
  const ordered = orderedScenesForThing(scene.thingId)
  const index = ordered.findIndex(item => item.calmyId === scene.calmyId)
  const target = ordered[index + direction]
  if (!target) return
  const originalSceneOrder = scene.order ?? index
  const originalTargetOrder = target.order ?? index + direction
  saving.value = true
  error.value = ''
  try {
    const reordered = await unifiedAsyncRepository.update<Scene>('scene', scene.calmyId, { order: originalTargetOrder }, {
      expectedRevision: scene.revision, commandId: `scene:order:${scene.calmyId}:${scene.revision + 1}`,
      actor: 'user', actorId: currentUserId || 'local-user', sourceIds: ['reality-scenes:scene-order']
    })
    try {
      await unifiedAsyncRepository.update<Scene>('scene', target.calmyId, { order: originalSceneOrder }, {
        expectedRevision: target.revision, commandId: `scene:order:${target.calmyId}:${target.revision + 1}`,
        actor: 'user', actorId: currentUserId || 'local-user', sourceIds: ['reality-scenes:scene-order']
      })
    } catch (cause) {
      try {
        await unifiedAsyncRepository.update<Scene>('scene', scene.calmyId, { order: originalSceneOrder }, {
          expectedRevision: reordered.revision, commandId: `scene:order:rollback:${scene.calmyId}:${reordered.revision + 1}`,
          actor: 'user', actorId: currentUserId || 'local-user', sourceIds: ['reality-scenes:scene-order-rollback']
        })
      } catch (rollbackCause) {
        const originalError = cause instanceof Error ? cause.message : '情境顺序更新失败'
        const rollbackError = rollbackCause instanceof Error ? rollbackCause.message : '顺序回滚失败'
        throw new Error(`${originalError}；恢复第一段情境顺序也失败：${rollbackError}`)
      }
      throw cause
    }
    info.value = '情境顺序已更新。'
    await refresh()
  } catch (cause) {
    const actionError = cause instanceof Error ? cause.message : '情境顺序更新失败'
    await refresh()
    error.value = error.value ? `${actionError}（重新读取也失败：${error.value}）` : actionError
  } finally {
    saving.value = false
  }
}
function personName(personId: string): string { return people.value.find(person => person.calmyId === personId)?.displayName || '已归档人物' }
function statusText(status: SceneStatus): string { return ({ draft: '准备中', active: '进行中', paused: '已暂停', completed: '已完成', archived: '已归档' })[status] }

onMounted(() => {
  const linkedThing = route.query.thing
  thingId.value = Array.isArray(linkedThing) ? linkedThing[0] || '' : linkedThing || ''
  void refresh()
})
</script>

<template>
  <header class="slide-head">
    <div class="head-main">
      <p class="hint">现实情境 · Scenes</p>
      <div class="head-title-row">
        <h2 v-if="loading">正在读取…</h2>
        <h2 v-else-if="!scenes.length">还没有共同经历。</h2>
        <h2 v-else>记下 <em>{{ scenes.length }}</em> 段共同经历。</h2>
        <span class="info" tabindex="0" data-tip="情境记录一段经历及其参与者；主题设置仍在「场景」页单独管理。H 收起辅助信息。" aria-label="现实情境说明">i</span>
      </div>
    </div>
    <span class="panel-note">{{ activeSpaces.length ? `${activeSpaces.length} 个长期空间` : '' }}</span>
  </header>

  <LbCollapsible block="scenesCreate" :rank="2">
    <LbPanel title="开始一段情境">
      <div class="create-scene">
      <label>情境名称<input v-model="title" aria-label="情境名称" maxlength="120" placeholder="例如：爸爸住院治疗" /></label>
      <label>关联的事情（可选）<select v-model="thingId" aria-label="关联的事情（可选）"><option value="">暂不关联</option><option v-for="thing in things" :key="thing.calmyId" :value="thing.calmyId">{{ thing.title }}</option></select></label>
      <label>长期空间（可选）<select v-model="spaceId" aria-label="长期空间（可选）"><option value="">暂不建立空间</option><option v-for="space in activeSpaces" :key="space.calmyId" :value="space.calmyId">{{ space.title }}</option></select></label>
      <button class="chip on" type="button" aria-label="创建情境" :disabled="saving || !title.trim()" @click="createScene">{{ saving ? '保存中…' : '创建情境' }}</button>
      </div>
    </LbPanel>
  </LbCollapsible>
    <p v-if="error" role="alert" class="panel scenes-error">{{ error }}</p><p v-if="info" role="status" class="panel dim">{{ info }}</p>
    <LbCollapsible block="scenesSpaces" :rank="2">
      <LbPanel title="长期空间" note="关闭空间不会删除其中的情境和资料；成员身份本身不授予资料访问权">
      <form class="space-create" @submit.prevent="void createSpace()">
        <label>空间名称<input v-model="spaceTitle" aria-label="空间名称" maxlength="120" placeholder="例如：家庭、照护或项目组" /></label>
        <label>用途（可选）<input v-model="spacePurpose" aria-label="空间用途" placeholder="空间长期承载的关系或协作" /></label>
        <label>边界说明（可选）<input v-model="spaceBoundary" aria-label="空间边界说明" placeholder="说明空间范围，不作为访问授权" /></label>
        <label>现实成员（可选）<select v-model="spaceMemberIds" aria-label="新空间成员" multiple><option v-for="person in people" :key="person.calmyId" :value="person.calmyId">{{ person.displayName }}</option></select></label>
        <button class="chip on" type="submit" :disabled="saving || !spaceTitle.trim()">{{ saving ? '保存中…' : '创建空间' }}</button>
      </form>
      <article v-for="space in spaces" :key="space.calmyId" class="space-row panel">
        <div class="space-heading"><strong>{{ space.title }}</strong><small>{{ space.status === 'active' ? '使用中' : space.status === 'closed' ? '已关闭' : '已归档' }}</small></div>
        <label>空间名称<input :value="space.title" :disabled="saving || space.status === 'archived'" @change="updateSpace(space, { title: ($event.target as HTMLInputElement).value.trim() }, 'title')" /></label>
        <label>用途<input :value="space.purpose || ''" :disabled="saving || space.status === 'archived'" @change="updateSpace(space, { purpose: ($event.target as HTMLInputElement).value.trim() || undefined }, 'purpose')" /></label>
        <label>边界说明<input :value="space.boundary || ''" :disabled="saving || space.status === 'archived'" @change="updateSpace(space, { boundary: ($event.target as HTMLInputElement).value.trim() || undefined }, 'boundary')" /></label>
        <label>现实成员<select :value="space.memberPersonIds || []" :disabled="saving || space.status === 'archived'" multiple :aria-label="`管理空间成员 ${space.title}`" @change="updateSpaceMembers(space, $event)"><option v-for="person in allPeople" :key="person.calmyId" :value="person.calmyId" :disabled="person.status !== 'active' && !(space.memberPersonIds || []).includes(person.calmyId)">{{ person.displayName }}{{ person.status === 'archived' ? ' · 已归档' : '' }}</option><option v-for="legacyId in (space.memberPersonIds || []).filter(id => !allPeople.some(person => person.calmyId === id))" :key="legacyId" :value="legacyId">未知旧成员（保留） · {{ legacyId }}</option></select></label>
        <DomainPicker :entity-ref="{ entityType: 'space', calmyId: space.calmyId }" />
        <OwnershipEditor :ownership="space.ownership" :people="people" :current-user-id="currentUserId" :disabled="saving" @save="saveOwnership('space', space, $event)" />
        <div v-if="space.status !== 'archived'" class="scene-actions"><button v-if="space.status === 'active'" class="chip" type="button" :disabled="saving" :aria-label="`关闭空间${space.title}`" @click="closeSpace(space, 'closed')">关闭空间</button><button v-else class="chip" type="button" :disabled="saving" :aria-label="`恢复空间${space.title}`" @click="closeSpace(space, 'active')">恢复空间</button><button class="chip" type="button" :disabled="saving" @click="closeSpace(space, 'archived')">归档空间</button></div>
      </article>
      </LbPanel>
    </LbCollapsible>
    <p v-if="loading" role="status" class="dim">正在读取情境…</p>
    <section v-else class="scene-list" aria-label="现实情境列表">
      <article v-for="scene in scenes" :key="scene.calmyId" class="scene-card panel">
        <div class="scene-heading"><div><p class="eyebrow">{{ statusText(scene.status) }}{{ scene.thingId ? ` · 第 ${scene.order !== undefined ? scene.order + 1 : '—'} 段` : '' }}</p><h2>{{ scene.title }}</h2></div><small>{{ scene.thingId ? things.find(item => item.calmyId === scene.thingId)?.title || '关联的事情暂不可用' : '尚未关联事情' }}</small></div>
        <p class="dim">结束情境会保留资料和历史。情境参与者仅记录现实参与，不代表获得数字账号访问权。</p>
        <DomainPicker :entity-ref="{ entityType: 'scene', calmyId: scene.calmyId }" />
        <OwnershipEditor :ownership="scene.ownership" :people="people" :current-user-id="currentUserId" :disabled="saving" label="情境归属与可见范围" @save="saveOwnership('scene', scene, $event)" />
        <RealitySettlementPanel :scene="scene" :scenes="scenes" :things="things" />
        <ul v-if="participantsFor(scene.calmyId).length" class="participant-list"><li v-for="participant in participantsFor(scene.calmyId)" :key="participant.calmyId"><span>{{ personName(participant.personId) }} · {{ participant.leftAt ? '已离开' : '参与中' }}</span><button v-if="!participant.leftAt" class="chip" type="button" :disabled="saving" @click="leaveParticipant(participant)">记录离开</button></li></ul>
        <div v-if="scene.status !== 'archived'" class="scene-actions">
          <button v-if="scene.thingId" class="chip" type="button" :disabled="saving || orderedScenesForThing(scene.thingId).findIndex(item => item.calmyId === scene.calmyId) === 0" :aria-label="`上移${scene.title}`" @click="moveScene(scene, -1)">上移</button>
          <button v-if="scene.thingId" class="chip" type="button" :disabled="saving || orderedScenesForThing(scene.thingId).findIndex(item => item.calmyId === scene.calmyId) === orderedScenesForThing(scene.thingId).length - 1" :aria-label="`下移${scene.title}`" @click="moveScene(scene, 1)">下移</button>
          <template v-if="scene.status !== 'completed'">
            <select v-model="participantPersonId[scene.calmyId]" :aria-label="`为${scene.title}选择参与者`"><option value="">选择现实参与者</option><option v-for="person in people" :key="person.calmyId" :value="person.calmyId">{{ person.displayName }}</option></select>
            <button class="chip" type="button" :disabled="saving || !participantPersonId[scene.calmyId]" @click="addParticipant(scene)">添加参与者</button>
            <button v-if="scene.status === 'draft' || scene.status === 'paused'" class="chip" type="button" :disabled="saving" @click="transition(scene, 'active')">开始</button>
            <button v-if="scene.status === 'active'" class="chip" type="button" :disabled="saving" @click="transition(scene, 'paused')">暂停</button>
            <button class="chip" type="button" :aria-label="`完成${scene.title}`" :disabled="saving" @click="transition(scene, 'completed')">完成情境</button>
          </template>
          <button class="chip" type="button" :disabled="saving" @click="transition(scene, 'archived')">归档</button>
        </div>
      </article>
      <p v-if="!scenes.length" class="dim">还没有现实情境。你也可以只记录一件事，不必创建情境。</p>
    </section>
</template>

<style scoped>
/* 页面局部排版：颜色取「留白」令牌；.space-create / .space-row / .scene-card 是 parity 测试的钩子，类名保留。 */
.scenes-error { border-color: color-mix(in srgb, var(--danger) 45%, transparent); }
.create-scene { display: grid; gap: 10px; }
.create-scene label, .space-create label, .space-row label { display: grid; gap: 6px; color: var(--muted); font-size: .72rem; }
.create-scene input, .create-scene select, .space-create input, .space-create select, .space-row input, .space-row select, .scene-actions select { min-height: 34px; padding: 6px 10px; font: inherit; font-size: .8rem; }
.create-scene .chip { justify-self: start; }
.space-create { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); align-items: end; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 10px; }
.space-create .chip { justify-self: start; }
/* 多选成员框比单行控件高，放在一行里会把同排其它控件的基线拉歪；让它独占一整行 */
.space-create label:has(select[multiple]), .space-row label:has(select[multiple]) { grid-column: 1 / -1; }
.space-create select[multiple], .space-row select[multiple] { min-height: 76px; }
.space-row.panel { background: var(--panel-2); gap: 8px; padding: 12px; }
.space-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); align-items: end; gap: 10px; }
.space-heading { display: grid; gap: 4px; }
.space-heading strong { color: var(--fg); font-size: .9rem; }
.space-row small { color: var(--muted); font-size: .7rem; }
.scene-list { display: grid; gap: 10px; }
.scene-card.panel { gap: 10px; }
.scene-heading { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.scene-heading h2 { margin: 0; font-size: 1rem; font-weight: 600; }
.scene-heading small { color: var(--muted); font-size: .7rem; }
.participant-list { display: grid; gap: 6px; list-style: none; padding: 0; }
.participant-list li { display: flex; justify-content: space-between; align-items: center; gap: 10px; color: var(--muted); font-size: .78rem; }
.scene-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.scene-actions button:disabled, .participant-list button:disabled { opacity: .5; cursor: not-allowed; }
</style>
