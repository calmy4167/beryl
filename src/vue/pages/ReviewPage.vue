<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { completeReview } from '@/application'
import { withSaveState } from '@/core/save-state'
import { todayKey } from '@/core/storage'
import { listActionRecordDocumentsAsync, type RealityDocument } from '@/domain/reality'
import { todayAsyncRepository } from '@/domain/today/repository'
import type { TodayPlan, TodayReview } from '@/domain/today/model'

type ReviewRange = 7 | 30 | 90

const date = todayKey()
const DAY_MS = 24 * 60 * 60 * 1000
const review = ref<TodayReview>({ observation: '', analysis: '', adjustment: '', seed: '' })
const letGo = ref('')
const plan = ref<TodayPlan>()
const dirty = ref(false)
const range = ref<ReviewRange>(7)
const docs = ref<RealityDocument[]>([])
const loading = ref(true)
const error = ref('')
const saving = ref(false)

function inDateRange(document: RealityDocument, days: ReviewRange): boolean {
  const end = new Date(date + 'T23:59:59').getTime()
  const start = end - ((days - 1) * DAY_MS)
  const timestamp = new Date(document.occurredAt ?? document.updatedAt).getTime()
  return timestamp >= start && timestamp <= end
}

function notify(message: string, kind: 'success' | 'warning' | 'error' = 'success'): void {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

function splitLines(value: string): string[] {
  return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
}

async function refresh(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [current, nextDocs] = await Promise.all([
      todayAsyncRepository.get(date),
      listActionRecordDocumentsAsync({ types: ['action', 'record'] }),
    ])
    plan.value = current
    review.value = { ...current.review }
    letGo.value = current.letGo.join('\n')
    docs.value = nextDocs
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '复盘数据读取失败'
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  if (!plan.value || saving.value) return
  saving.value = true
  try {
    const result = await withSaveState(() => completeReview({
      date,
      review: review.value,
      letGo: splitLines(letGo.value),
      expectedRevision: plan.value!.revision,
    }))
    plan.value = result.plan
    review.value = { ...result.plan.review }
    letGo.value = result.plan.letGo.join('\n')
    dirty.value = false
    notify('今日复盘已保存')
  } catch (cause) {
    notify(cause instanceof Error ? cause.message : '复盘保存失败', 'error')
  } finally {
    saving.value = false
  }
}

function updateReview(key: keyof TodayReview, value: string): void {
  review.value = { ...review.value, [key]: value }
  dirty.value = true
}

const scopedDocs = computed(() => docs.value.filter(document => inDateRange(document, range.value)))
const done = computed(() => scopedDocs.value.filter(item => item.entityType === 'action' && item.status === 'done').length)
const records = computed(() => scopedDocs.value.filter(item => item.entityType === 'record').length)

onMounted(() => { void refresh() })
</script>

<template>
  <div class="review-page">
    <header class="page-head">
      <div>
        <p class="eyebrow">CROSS-DOMAIN REVIEW</p>
        <h1 class="font-title">复盘，不只看完成率</h1>
        <p>把身体、心理、行动和现实记录放回同一段时间里观察。</p>
      </div>
      <div class="range-tabs">
        <button
          v-for="item in ([7, 30, 90] as const)"
          :key="item"
          type="button"
          class="app-button"
          :class="{ on: range === item }"
          :aria-pressed="range === item"
          @click="range = item"
        >近 {{ item }} 天</button>
      </div>
    </header>

    <section v-if="error" class="beryl-card empty-state" role="alert">
      <b>复盘数据暂时无法读取</b>
      <p>{{ error }}</p>
      <button class="app-button" type="button" @click="void refresh()">重试</button>
    </section>
    <div v-if="loading" class="empty-state" role="status">正在读取复盘数据…</div>

    <section class="today-review beryl-card">
      <div class="panel-head">
        <div>
          <p class="eyebrow">TODAY REVIEW · <span style="display: contents">{{ date }}</span></p>
          <h2 class="font-title">今天的复盘</h2>
          <p class="review-intro">把事实、条件和明天的调整写下来。</p>
        </div>
        <span v-if="dirty" class="review-dirty">尚未保存</span>
      </div>
      <div class="today-review-grid">
        <label>观：今天实际发生了什么？<textarea
          :value="review.observation"
          :disabled="loading || !plan || saving"
          aria-label="今日复盘：观，今天实际发生了什么"
          @input="updateReview('observation', ($event.target as HTMLTextAreaElement).value)"
        /></label>
        <label>察：哪些条件影响了今天？<textarea
          :value="review.analysis"
          :disabled="loading || !plan || saving"
          aria-label="今日复盘：察，哪些条件影响了今天"
          @input="updateReview('analysis', ($event.target as HTMLTextAreaElement).value)"
        /></label>
        <label>调：明天如何调整？<textarea
          :value="review.adjustment"
          :disabled="loading || !plan || saving"
          aria-label="今日复盘：调，明天如何调整"
          @input="updateReview('adjustment', ($event.target as HTMLTextAreaElement).value)"
        /></label>
        <label>下一轮线索<small><textarea
          :value="review.seed"
          :disabled="loading || !plan || saving"
          aria-label="今日复盘：下一轮线索"
          @input="updateReview('seed', ($event.target as HTMLTextAreaElement).value)"
        /></small></label>
      </div>
      <div class="today-review-footer">
        <small>本地优先保存 · 冲突时不会覆盖正在编辑的内容</small>
        <button class="app-button primary" type="button" :disabled="loading || !plan || saving" @click="void save()">
          {{ saving ? '保存中…' : '保存今日复盘' }}
        </button>
      </div>
    </section>

    <section class="review-let-go beryl-card">
      <div>
        <p class="eyebrow">LET GO · 结束能力</p>
        <h2 class="font-title">无需继续 / 主动放下</h2>
        <p>写下这轮不再继续的事，不会被系统记作失败。</p>
      </div>
      <textarea
        :value="letGo"
        :disabled="loading || !plan || saving"
        aria-label="复盘中无需继续或主动放下的事项"
        placeholder="例如：这周不再追这个方向；暂时不展开新的学习线索"
        @input="letGo = ($event.target as HTMLTextAreaElement).value; dirty = true"
      />
    </section>

    <section class="stats-grid">
      <article class="stat-card beryl-card"><small>复盘范围</small><b>{{ range }}</b><span>天</span></article>
      <article class="stat-card beryl-card"><small>现实完成</small><b>{{ loading ? '…' : done }}</b><span>条</span></article>
      <article class="stat-card beryl-card"><small>Reality Record</small><b>{{ loading ? '…' : records }}</b><span>条</span></article>
      <article class="stat-card beryl-card"><small>本地优先</small><b>✓</b><span>可离线</span></article>
    </section>

    <section class="review-evidence beryl-card">
      <div class="panel-head">
        <h2 class="font-title">最近证据</h2>
        <span>近 {{ range }} 天 · 先看发生了什么</span>
      </div>
      <div v-for="item in scopedDocs.slice(0, 12)" :key="item.entityType + '-' + item.id" class="evidence-row">
        <i class="dot" :class="item.entityType" />
        <b>{{ item.title || item.body || '未命名' }}</b>
        <span>{{ item.status || item.entityType }}</span>
      </div>
      <p v-if="!loading && !scopedDocs.length" class="muted">近 {{ range }} 天还没有行动或记录。</p>
    </section>
  </div>
</template>
