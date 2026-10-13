<script setup lang="ts">
/**
 * 记录（v11「留白」）—— 取代旧 CapturePage。
 *
 * 结构借用参考稿「注意力收件箱」的 .inbox / .inbox-item / .inbox-time / .inbox-src / .inbox-text
 * 与 .add-row / .add-input（参考稿本身没有「记录」模块，这是v11 词汇内的等价组合）。
 *
 * 业务不变量（D-002）保持不变：记录**不自动**升级为处境；采纳/放下只是 Capture 自己的固定状态机
 * （captureAsyncRepository.resolve → accepted / archived）。「进今天」是唯一会新建 Action 的动作，
 * 同时把这条记录标为已采纳，等价于旧页面的「接受并转行动」，不新建其他实体。
 */
import { computed, nextTick, ref } from 'vue'
import { decideCapture, type CaptureDecision } from '@/application'
import { useReferenceWorkspace } from '@/vue/composables/useReferenceWorkspace'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import LbPanel from '@/vue/liubai/LbPanel.vue'
import LbCollapsible from '@/vue/liubai/LbCollapsible.vue'
import LbStatGrid from '@/vue/liubai/LbStatGrid.vue'
import type { LbStat } from '@/vue/liubai/types'
import type { CaptureItem } from '@/domain/capture/model'
import SentencePicker from '@/vue/components/SentencePicker.vue'

useOwnSlideHead()

const { inbox, loading, saving, error, capture, refresh } = useReferenceWorkspace()

const draft = ref('')
const busyId = ref('')

/* 常用句插入（旧页面有、v11 迁移时漏掉的能力；`vue-master-data-parity` 也在跨页验证它）：
 * 选择器负责"选一句"，这里负责把它插进"记住的选区"并恢复光标与焦点。 */
const editorRef = ref<HTMLInputElement | null>(null)
const selection = ref<{ start: number; end: number } | null>(null)
function rememberSelection() {
  const el = editorRef.value
  if (el) selection.value = { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 }
}
function insertSentence(label: string) {
  const from = selection.value?.start ?? draft.value.length
  const to = selection.value?.end ?? draft.value.length
  draft.value = draft.value.slice(0, from) + label + draft.value.slice(to)
  const caret = from + label.length
  void nextTick(() => {
    const el = editorRef.value
    el?.focus()
    el?.setSelectionRange(caret, caret)
    selection.value = { start: caret, end: caret }
  })
}

/** 注意门五路，顺序与旧页面一致（业务语义由 decideCapture 决定，UI 只是入口） */
const DECISIONS: Array<{ value: CaptureDecision; label: string }> = [
  { value: 'action', label: '现在行动' },
  { value: 'matter', label: '形成事项' },
  { value: 'record', label: '保留记录' },
  { value: 'seed', label: '稍后再看' },
  { value: 'let_go', label: '放下' }
]

function notify(message: string, kind: 'success' | 'warning' | 'error' = 'success') {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

const isPending = (item: CaptureItem) => item.status === 'inbox' || item.status === 'suggested'
const pending = computed(() => inbox.value.filter(isPending))
const handled = computed(() => inbox.value.filter(item => !isPending(item)).slice(0, 8))
const todayCount = computed(() => inbox.value.filter(item => new Date(item.createdAt).toDateString() === new Date().toDateString()).length)
const accepted = computed(() => inbox.value.filter(item => item.status === 'accepted').length)
const dropped = computed(() => inbox.value.filter(item => item.status === 'archived' || item.status === 'rejected').length)

const heading = computed(() => {
  if (loading.value) return '正在读取…'
  if (!pending.value.length) return incomingToday()
  return `还有 ${pending.value.length} 条没有处理。`
})
function incomingToday() {
  return todayCount.value ? `今天记下 ${todayCount.value} 条，都处理完了。` : '记下来，不用现在决定。'
}

const stats = computed<LbStat[]>(() => [
  { label: '待处理', value: pending.value.length, unit: ' 条', accent: pending.value.length > 0 },
  { label: '今天记下', value: todayCount.value, unit: ' 条' },
  { label: '已采纳', value: accepted.value, unit: ' 条' },
  { label: '已放下', value: dropped.value, unit: ' 条' }
])

const STATUS_LABEL: Record<string, string> = { accepted: '已采纳', rejected: '已放下', archived: '已归档' }

function timeOf(at: number) {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function submit() {
  const body = draft.value.trim()
  if (!body) return
  draft.value = ''
  await capture(body)
}
function onCaptureComposerKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  void submit()
}

/** 注意门：五路决定都走 decideCapture（内含幂等 commandId、revision 兜底与跨实体创建） */
async function gate(item: CaptureItem, decision: CaptureDecision) {
  if (busyId.value) return
  busyId.value = item.calmyId
  try {
    await decideCapture({ captureId: item.calmyId, decision })
    await refresh()
    const label = DECISIONS.find(entry => entry.value === decision)?.label || decision
    notify(decision === 'let_go' ? '已放下，不再进入主列表' : `已${label}`)
  } catch (cause) {
    notify(cause instanceof Error ? cause.message : '处理失败，请重试', 'error')
    await refresh()
  } finally {
    busyId.value = ''
  }
}
</script>

<template>
  <header class="slide-head">
    <div class="head-main">
      <p class="hint">记录</p>
      <div class="head-title-row">
        <h2>{{ heading }}</h2>
        <span class="info" tabindex="0" data-tip="原文先落库，不自动升级成处境。「进今天」会把它变成一件今天的行动并标为已采纳。" aria-label="记录说明">i</span>
      </div>
    </div>
  </header>

  <p v-if="error" class="panel" role="alert" style="color:var(--danger)">
    {{ error }}
    <button class="act" type="button" @click="refresh">重试</button>
  </p>

  <LbPanel grow title="待处理" :note="saving ? '保存中…' : (pending.length ? `${pending.length} 条` : '')">
    <ul class="inbox">
      <li v-if="loading" class="inbox-empty">正在读取…</li>
      <li v-else-if="!pending.length" class="inbox-empty">暂无记录。</li>
      <li v-for="item in pending" :key="item.calmyId" class="inbox-item">
        <span class="inbox-time">{{ timeOf(item.createdAt) }}</span>
        <span class="inbox-src">原文</span>
        <span class="inbox-text">{{ item.body }}</span>
        <div class="acts">
          <button
            v-for="option in DECISIONS"
            :key="option.value"
            class="act"
            :class="{ 'let-go-choice': option.value === 'let_go' }"
            :disabled="busyId === item.calmyId"
            :title="option.label"
            @click="gate(item, option.value)"
          >{{ option.label }}</button>
        </div>
      </li>
    </ul>
    <div class="add-row capture-composer-tools">
      <SentencePicker @insert="insertSentence" />
      <input
        ref="editorRef"
        v-model="draft"
        class="add-input"
        maxlength="200"
        aria-label="记录原文"
        placeholder="记一句，回车确认…"
        @select="rememberSelection"
        @keyup="rememberSelection"
        @click="rememberSelection"
        @keydown.enter="onCaptureComposerKeydown"
      >
      <button class="chip on capture-submit" type="button" :disabled="saving || !draft.trim()" @click="submit">记录</button>
    </div>
  </LbPanel>

  <LbCollapsible v-if="inbox.length" block="captureStats" :rank="3">
    <LbPanel title="记录统计">
      <LbStatGrid :stats="stats" />
    </LbPanel>
  </LbCollapsible>

  <LbCollapsible v-if="handled.length" block="captureHistory" :rank="3">
    <LbPanel title="已处理" :note="handled.length ? `${handled.length} 条` : '—'">
      <ul class="ov-list">
        <li v-if="!handled.length" class="dim">还没有处理过的记录。</li>
        <li v-for="item in handled" :key="item.calmyId">
          <b>{{ item.body.slice(0, 40) }}{{ item.body.length > 40 ? '…' : '' }}</b>
          <span class="right">{{ STATUS_LABEL[item.status] || item.status }}</span>
        </li>
      </ul>
    </LbPanel>
  </LbCollapsible>
</template>

<style scoped>
/* .inbox-item 原是三段文字（时间 / 来源 / 正文），这里追加行内动作；
   让正文占据剩余宽度，动作贴右。 */
.inbox-item .inbox-text {
  flex: 1;
  min-width: 0;
}
.inbox-item .acts {
  flex: none;
  margin-left: auto;
  gap: 4px;
}
.inbox-item .acts .act {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: auto;
  min-width: max-content;
  height: auto;
  min-height: 30px;
  padding: 0 8px;
  line-height: 1.25;
  white-space: nowrap;
}

@media (max-width: 680px) {
  .inbox-item {
    flex-wrap: wrap;
  }
  .inbox-item .acts {
    flex: 1 1 100%;
    justify-content: flex-end;
    margin-left: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
}

/* 常用句选择器：复用共享组件 SentencePicker（外观与下拉定位都在组件里），
   这里只保证这一行里「编辑器占满剩余宽度」。 */
.capture-composer-tools .add-input {
  flex: 1;
  min-width: 0;
}
</style>
