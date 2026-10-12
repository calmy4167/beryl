<script setup lang="ts">
/**
 * 笔记（v11「留白」）—— section.slide[data-title="笔记"] 的等价实现。
 *
 * 数据映射：Calmy 的日记是 `DiaryEntry`（一日期一条，date + content），
 * 与参考稿「一天多条便签」不同，因此这里保留 .notes/.note-item/.note-body 的视觉，
 * 但只渲染当天一条可编辑正文 + 「最近」只读列表。
 * 参考稿的「知识卡」没有对应领域实体（不新建），故不提供该 tab。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useReferenceWorkspace } from '@/vue/composables/useReferenceWorkspace'
import { useOwnSlideHead } from '@/vue/liubai/slide-head'
import LbPanel from '@/vue/liubai/LbPanel.vue'
import LbCollapsible from '@/vue/liubai/LbCollapsible.vue'
import LbStatGrid from '@/vue/liubai/LbStatGrid.vue'
import type { LbStat } from '@/vue/liubai/types'
import LbDateNav from '@/vue/liubai/LbDateNav.vue'
import { useModuleDate } from '@/vue/liubai/date-state'
import SentencePicker from '@/vue/components/SentencePicker.vue'

useOwnSlideHead()

const { notes, loading, saving, error, saveNote, refresh } = useReferenceWorkspace()

const { value: date, isAll } = useModuleDate('diary')
const draft = ref('')
const editor = ref<HTMLTextAreaElement | null>(null)
const selection = ref<{ start: number; end: number } | null>(null)
let saveTimer: number | undefined
let dirty = false

/* 常用句插入（旧 DiaryPage 有、v11 迁移时漏掉）：选一句后插进"记住的选区"并恢复光标与焦点。 */
function rememberSelection() {
  const el = editor.value
  if (el) selection.value = { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 }
}
function insertSentence(label: string) {
  const from = selection.value?.start ?? draft.value.length
  const to = selection.value?.end ?? draft.value.length
  draft.value = draft.value.slice(0, from) + label + draft.value.slice(to)
  const caret = from + label.length
  dirty = true
  void nextTick(() => {
    const el = editor.value
    el?.focus()
    el?.setSelectionRange(caret, caret)
    selection.value = { start: caret, end: caret }
    autoGrow()
  })
}

const todayNote = computed(() => notes.value.find(note => note.date === date.value))
const recent = computed(() => isAll.value
  ? notes.value.slice(0, 12)
  : notes.value.filter(note => note.date !== date.value).slice(0, 8))
const journal = computed(() => notes.value)

const heading = computed(() => {
  const days = journal.value.length
  if (!days) return '想到什么，就写下来。'
  const words = journal.value.reduce((sum, note) => sum + note.content.length, 0)
  return `已经写下 ${days} 天 · ${words} 字。`
})

const stats = computed<LbStat[]>(() => {
  const words = journal.value.reduce((sum, note) => sum + note.content.length, 0)
  const week = journal.value.filter(note => Date.now() - new Date(`${note.date}T00:00:00`).getTime() < 7 * 86400000)
  const longest = journal.value.reduce((max, note) => Math.max(max, note.content.length), 0)
  return [
    { label: '记录天数', value: journal.value.length, unit: ' 天' },
    { label: '总字数', value: words, unit: ' 字', accent: words > 0 },
    { label: '近 7 天', value: week.length, unit: ' 天' },
    { label: '最长一条', value: longest, unit: ' 字' }
  ]
})

function autoGrow() {
  const el = editor.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.max(el.scrollHeight, 160)}px`
}

function flush() {
  if (!dirty) return
  dirty = false
  void saveNote(date.value, draft.value)
}

function onInput() {
  dirty = true
  autoGrow()
  if (saveTimer) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(flush, 1200)
}

// 首次读到当天正文后填充草稿；之后不再覆盖用户输入
watch(todayNote, note => {
  if (dirty) return
  const content = note?.content || ''
  if (content !== draft.value) draft.value = content
}, { immediate: true })

onMounted(() => { void nextTick(autoGrow) })
onBeforeUnmount(() => {
  if (saveTimer) window.clearTimeout(saveTimer)
  flush()
})
</script>

<template>
  <header class="slide-head">
    <div class="head-main">
      <p class="hint">笔记</p>
      <div class="head-title-row">
        <h2>{{ heading }}</h2>
        <span class="info" tabindex="0" data-tip="当天的正文自动保存（停笔约 1 秒后落库）。历史笔记在「最近」里只读回看。" aria-label="笔记说明">i</span>
      </div>
    </div>
    <LbDateNav module="diary" />
  </header>

  <p v-if="error" class="panel" role="alert" style="color:var(--danger)">
    {{ error }}
    <button class="act" type="button" @click="refresh">重试</button>
  </p>

  <LbPanel grow :title="isAll ? '全部笔记' : '这一天的笔记'" :note="isAll ? `${journal.length} 天` : (saving ? '保存中…' : '自动保存')">
    <ul class="notes">
      <li v-if="loading" class="empty">正在读取…</li>
      <li v-else-if="isAll" class="empty">全部模式下不编辑。选一天再写。</li>
      <li v-else class="note-item">
        <div class="note-head">
          <span class="note-time">{{ date }}</span>
        </div>
        <div class="add-row capture-composer-tools">
          <SentencePicker @insert="insertSentence" />
        </div>
        <textarea
          ref="editor"
          v-model="draft"
          class="note-body"
          maxlength="2000"
          :aria-label="`${date} 日记内容`"
          placeholder="想到什么，就写下来。"
          @input="onInput"
          @select="rememberSelection"
          @keyup="rememberSelection"
          @click="rememberSelection"
          @blur="flush"
        ></textarea>
      </li>
    </ul>
  </LbPanel>

  <LbCollapsible block="noteStats" :rank="3">
    <LbPanel title="笔记统计">
      <LbStatGrid :stats="stats" />
    </LbPanel>
  </LbCollapsible>

  <LbCollapsible block="noteHistory" :rank="3">
    <LbPanel title="最近" :note="recent.length ? `${recent.length} 天` : '—'">
      <ul class="ov-list">
        <li v-if="!recent.length" class="dim">还没有更早的笔记。</li>
        <li v-for="note in recent" :key="note.date">
          <b>{{ note.content.slice(0, 40) || '（空）' }}{{ note.content.length > 40 ? '…' : '' }}</b>
          <span class="right">{{ note.date.slice(5) }}</span>
        </li>
      </ul>
    </LbPanel>
  </LbCollapsible>
</template>

<style scoped>
/* 参考稿的 .notes 是"一天多张便签"的自动填充栅格；Calmy 一天只有一条正文，
 * 所以这里把栅格收成一列（并让卡片跨行），否则正文编辑区只占一个 260px 的格子（写不下）。 */
.notes {
  grid-template-columns: minmax(0, 1fr);
}
.notes .note-item {
  grid-column: 1 / -1;
}
/* 常用句选择器与编辑器上下排布；编辑器本来就有 width:100%。 */
.capture-composer-tools {
  margin-bottom: 8px;
}
</style>
