<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { readAsyncStorageValue, writeAsyncStorageValue } from '@/core/repository'
import { recordAsyncRepository } from '@/domain/record/repository'
import type { RealityRecord } from '@/domain/record/model'
import { fmtDate } from '@/core/storage'
import { withSaveState } from '@/core/save-state'

type Mode = 'focus' | 'rest'
const defaults: Record<Mode, number> = { focus: 25, rest: 5 }
const prefix = '[番茄钟] 完成专注'
const circumference = 2 * Math.PI * 88
const mode = ref<Mode>('focus'); const minutes = ref({ ...defaults }); const remaining = ref(defaults.focus * 60); const running = ref(false); const stats = ref({ minutes: 0, count: 0 }); const history = ref<RealityRecord[]>([]); const historyLoading = ref(true); const saving = ref(false); const error = ref('')
let timer: number | undefined; let completing = false
const totalSeconds = computed(() => minutes.value[mode.value] * 60)
const progress = computed(() => totalSeconds.value > 0 ? (totalSeconds.value - remaining.value) / totalSeconds.value : 0)
const ringOffset = computed(() => circumference * Math.min(1, Math.max(0, progress.value)))
const recentHistory = computed(() => history.value.slice(0, 8))
const modeLabel = computed(() => mode.value === 'focus' ? '专注' : '休息')
function timeText(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` }
function toast(message: string, kind: 'success' | 'warning' | 'error' = 'success') { window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } })) }
async function refreshHistory() { try { historyLoading.value = true; history.value = (await recordAsyncRepository.list()).filter(record => record.body.startsWith(prefix)).sort((a,b) => b.occurredAt-a.occurredAt); error.value = '' } catch(cause) { error.value = cause instanceof Error ? cause.message : '完成记录读取失败' } finally { historyLoading.value = false } }
async function refreshStats() { try { const [total,count] = await Promise.all([readAsyncStorageValue('pomoTotal',0),readAsyncStorageValue('pomoCount',0)]); stats.value = { minutes:Number(total)||0,count:Number(count)||0 } } catch(cause) { error.value = cause instanceof Error ? cause.message : '专注统计读取失败' } }
function retry() { void Promise.all([refreshHistory(),refreshStats()]) }
function clearTimer() { if (timer !== undefined) window.clearInterval(timer); timer = undefined }
async function finishSession() { const completedMode = mode.value; const completedMinutes = minutes.value[completedMode]; if (completedMode === 'focus') { saving.value = true; try { await withSaveState(async () => { const current = await Promise.all([readAsyncStorageValue('pomoTotal',0),readAsyncStorageValue('pomoCount',0)]); const nextMinutes = Number(current[0]) + completedMinutes; const nextCount = Number(current[1]) + 1; if (!await writeAsyncStorageValue('pomoTotal',nextMinutes) || !await writeAsyncStorageValue('pomoCount',nextCount)) throw new Error('专注累计数据保存失败，请检查本地存储状态'); await recordAsyncRepository.create({ type:'fact', body:`${prefix} ${completedMinutes} 分钟`, occurredAt:Date.now(), source:'user' }) }); await refreshStats(); await refreshHistory(); toast(`专注完成，已记录 ${completedMinutes} 分钟`) } catch(cause) { toast(cause instanceof Error ? cause.message : '专注记录保存失败','error') } finally { saving.value = false } } else toast('休息完成，准备开始下一轮专注'); mode.value = 'rest'; remaining.value = minutes.value.rest * 60; completing = false }
function tick() { if (remaining.value <= 1) { remaining.value = 0; running.value = false; clearTimer(); if (!completing) { completing = true; void finishSession() }; return }; remaining.value -= 1 }
function toggleTimer() { if (running.value) { clearTimer(); running.value = false; toast('计时已暂停','warning'); return }; if (remaining.value <= 0) remaining.value = totalSeconds.value; completing = false; running.value = true; document.title = `${timeText(remaining.value)} ${modeLabel.value} — Calmy` }
function resetTimer() { clearTimer(); completing = false; running.value = false; remaining.value = totalSeconds.value }
function changeMode(next: Mode) { clearTimer(); completing = false; running.value = false; mode.value = next; remaining.value = minutes.value[next] * 60 }
function changeMinutes(nextValue: string, selected: Mode) { const next = Math.min(120,Math.max(1,Number(nextValue)||1)); minutes.value = { ...minutes.value,[selected]:next }; if (mode.value === selected && !running.value) remaining.value = next * 60 }
watch([running,remaining,mode], () => { document.title = running.value ? `${timeText(remaining.value)} ${modeLabel.value} — Calmy` : 'Calmy — 专注' })
const onSync = () => { void refreshStats(); void refreshHistory() }
onMounted(() => { void Promise.all([refreshHistory(),refreshStats()]); window.addEventListener('beryl-data-synced',onSync) })
onUnmounted(() => { clearTimer(); window.removeEventListener('beryl-data-synced',onSync); document.title = 'Calmy — 个人现实行动系统' })
watch(running, value => { clearTimer(); if (value) timer = window.setInterval(tick,1000) })
</script>
<template>
  <div class="pomo-page"><header class="page-head"><div><p class="eyebrow">POMO · FOCUSED RHYTHM</p><h1 class="font-title">专注</h1><p>用可调整的专注与休息节奏，把一轮时间落成可追溯的完成记录。</p></div><span class="load-pill">已完成 {{stats.count}} 个专注段 · {{stats.minutes}} 分钟（可选记录）</span></header>
    <section class="beryl-card pomo-panel" style="padding:24px;text-align:center"><div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-bottom:24px"><button class="app-button" :class="{primary:mode==='focus'}" type="button" aria-label="切换到专注模式" :aria-pressed="mode==='focus'" @click="changeMode('focus')" :disabled="saving">专注</button><button class="app-button" :class="{primary:mode==='rest'}" type="button" aria-label="切换到休息模式" :aria-pressed="mode==='rest'" @click="changeMode('rest')" :disabled="saving">休息</button></div>
      <div style="position:relative;display:inline-block"><svg viewBox="0 0 200 200" width="min(70vw, 256px)" height="min(70vw, 256px)" role="img" :aria-label="`${modeLabel}剩余 ${timeText(remaining)}`"><circle cx="100" cy="100" r="88" stroke="var(--c-border-soft)" stroke-width="9" fill="none"/><circle cx="100" cy="100" r="88" :stroke="mode==='focus'?'var(--scene)':'var(--c-success)'" stroke-width="9" fill="none" stroke-linecap="round" :stroke-dasharray="circumference" :stroke-dashoffset="ringOffset" transform="rotate(-90 100 100)"/></svg><div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><span class="eyebrow" :style="{color:mode==='focus'?'var(--scene)':'var(--c-success)'}">{{modeLabel}}</span><strong class="font-title" style="font-size:clamp(2.25rem, 8vw, 3.25rem);line-height:1.1">{{timeText(remaining)}}</strong><span class="muted">{{running?'进行中':remaining===totalSeconds?'准备开始':'已暂停'}}</span></div></div>
      <div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:20px"><button class="app-button primary" type="button" :aria-label="running?'暂停专注':'开始专注'" @click="toggleTimer" :disabled="saving">{{running?'暂停':remaining===totalSeconds?'开始':'继续'}}</button><button class="app-button" type="button" aria-label="重置专注" @click="resetTimer" :disabled="saving">重置</button></div>
      <div class="create-row" style="max-width:520px;margin:22px auto 0;grid-template-columns:1fr 1fr"><label class="pomo-duration" style="display:grid;gap:6px;text-align:left;font-size:11px;color:var(--c-text-2)">专注分钟<input aria-label="专注分钟" type="number" min="1" max="120" :value="minutes.focus" @input="changeMinutes(($event.target as HTMLInputElement).value,'focus')" :disabled="running||saving"></label><label class="pomo-duration" style="display:grid;gap:6px;text-align:left;font-size:11px;color:var(--c-text-2)">休息分钟<input aria-label="休息分钟" type="number" min="1" max="120" :value="minutes.rest" @input="changeMinutes(($event.target as HTMLInputElement).value,'rest')" :disabled="running||saving"></label></div>
      <div class="stat-line" style="display:flex;justify-content:center;gap:24px;flex-wrap:wrap;margin-top:20px;color:var(--c-text-2);font-size:12px"><span>专注段 <b style="color:var(--amber)">{{stats.count}}</b> 个</span><span>时间记录 <b style="color:var(--amber)">{{stats.minutes}}</b> 分钟（可选）</span></div></section>
    <section class="beryl-card history-list" aria-labelledby="pomo-history-title" style="padding:18px"><div class="section-title"><div><p class="eyebrow">COMPLETION LOG</p><h2 id="pomo-history-title" class="font-title">完成记录</h2></div><span class="muted">最近 {{recentHistory.length}} 条</span></div><section v-if="error" class="beryl-card empty-state" role="alert" style="margin-top:12px"><b>专注数据暂时无法读取</b><p>{{error}}</p><button class="app-button" type="button" @click="retry">重试</button></section><div v-if="historyLoading" class="empty-state" role="status">正在读取完成记录…</div><div v-else-if="recentHistory.length" aria-live="polite"><article v-for="record in recentHistory" :key="record.calmyId" class="history-card"><p>{{record.body}}</p><small>{{fmtDate(record.occurredAt)}} · 已保存到记录库</small></article></div><div v-else class="empty-state">完成一轮专注后，历史记录会显示在这里。</div></section>
  </div>
</template>
