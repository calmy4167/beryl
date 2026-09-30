<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { matterAsyncRepository } from '@/domain/matter/repository'
import type { Matter } from '@/domain/matter/model'
import { useMatterStatusDictionary } from '@/vue/composables/useMatterStatusDictionary'

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
  const id = route.params.id
  return Array.isArray(id) ? id[id.length - 1] || '' : id || ''
})
const matter = ref<Matter>()
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
    matter.value = id ? await matterAsyncRepository.find(id) : undefined
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '处境读取失败'
  } finally {
    loading.value = false
  }
}

function openExploration(): void {
  if (!matter.value) return
  void router.push(`/app/flow?matter=${encodeURIComponent(matter.value.calmyId)}`)
}

watch(routeMatterId, () => void refresh(), { immediate: true })
</script>

<template>
  <div v-if="loading" class="empty-state" role="status">正在读取处境…</div>
  <section v-else-if="error" class="empty-state" role="alert">
    <b>处境暂时无法读取</b>
    <p>{{ error }}</p>
    <button class="app-button" type="button" @click="refresh">重试</button>
  </section>
  <section v-else-if="!matter" class="empty-state" role="status">
    <b>找不到这个处境</b>
    <p>它可能已被归档或从当前设备移除。</p>
  </section>
  <div v-else class="matter-detail">
    <header class="page-head">
      <div>
        <p class="eyebrow">处境 · 详情</p>
        <h1 class="font-title">{{ matter.title }}</h1>
        <p>{{ matter.why || '这个处境还没有写下为什么重要。' }}</p>
      </div>
    </header>
    <section class="beryl-card admin-block">
      <p class="info"><template v-for="(segment, index) in statusSegments" :key="index">{{ segment }}</template></p>
      <p class="info"><template v-for="(segment, index) in contradictionSegments" :key="index">{{ segment }}</template></p>
      <p class="info">趋势是基于记录的可推翻判断；需要调整时，请在处境列表直接修改。</p>
      <button class="app-button" type="button" @click="openExploration">围绕这个处境进入探索</button>
    </section>
    <section v-if="matter.problem" class="beryl-card problem-driven-detail">
      <h2 class="font-title">问题驱动学习</h2>
      <p class="field-hint">学习只在解决当前问题时发生，并通过现实反馈决定继续、改法或停止。</p>
      <dl>
        <dt>现实问题</dt><dd>{{ matter.problem }}</dd>
        <template v-if="matter.desiredChange"><dt>期望变化</dt><dd>{{ matter.desiredChange }}</dd></template>
        <template v-if="matter.progressEvidence"><dt>进展证据</dt><dd>{{ matter.progressEvidence }}</dd></template>
        <template v-if="matter.currentGap"><dt>当前缺口</dt><dd>{{ matter.currentGap }}</dd></template>
        <template v-if="matter.nextTest"><dt>下一次验证</dt><dd>{{ matter.nextTest }}</dd></template>
        <template v-if="matter.stopCondition"><dt>停止条件</dt><dd>{{ matter.stopCondition }}</dd></template>
      </dl>
    </section>
  </div>
</template>
