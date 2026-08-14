<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { store } from '@/core/storage'

const mode = ref<'focus' | 'rest'>('focus')
const total = ref(25 * 60)
const remain = ref(25 * 60)
const running = ref(false)
const minutes = ref(Number(store.get('pomoTotal', 0)) || 0)
const count = ref(Number(store.get('pomoCount', 0)) || 0)
let timer: number | undefined

const RING_C = 2 * Math.PI * 88
const mm = () => String(Math.floor(remain.value / 60)).padStart(2, '0')
const ss = () => String(remain.value % 60).padStart(2, '0')
const timeText = () => `${mm()}:${ss()}`

function paint() {
  const ring = document.getElementById('pomo-ring') as SVGCircleElement | null
  if (ring) {
    ring.style.strokeDashoffset = String(RING_C * (1 - remain.value / total.value))
    ring.setAttribute('stroke', mode.value === 'focus' ? '#F59E0B' : '#34D399')
  }
  document.title = running.value ? `${timeText()} ${mode.value === 'focus' ? '专注' : '休息'} — Beryl` : 'Beryl — 个人管理体系'
}
function stopTimer() {
  if (timer) { clearInterval(timer); timer = undefined }
  running.value = false
}
function switchMode(m: 'focus' | 'rest', autostart = false) {
  stopTimer()
  mode.value = m
  total.value = m === 'focus' ? 25 * 60 : 5 * 60
  remain.value = total.value
  if (autostart) { running.value = true; startTimer() }
  paint()
}
function startTimer() {
  if (timer) clearInterval(timer)
  timer = window.setInterval(() => {
    remain.value--
    if (remain.value <= 0) {
      stopTimer()
      if (mode.value === 'focus') {
        store.set('pomoTotal', (Number(store.get('pomoTotal', 0)) || 0) + 25)
        store.set('pomoCount', (Number(store.get('pomoCount', 0)) || 0) + 1)
        minutes.value = Number(store.get('pomoTotal', 0)) || 0
        count.value = Number(store.get('pomoCount', 0)) || 0
        switchMode('rest')
      } else {
        switchMode('focus')
      }
      return
    }
    paint()
  }, 1000)
}
function toggle() {
  if (running.value) stopTimer()
  else { running.value = true; startTimer() }
  paint()
}

onUnmounted(stopTimer)
</script>

<template>
  <div class="beryl-card hoverable box">
    <div class="pills">
      <button class="pill" :class="mode === 'focus' ? 'on-focus' : ''" @click="switchMode('focus')">🍅 专注 25′</button>
      <button class="pill" :class="mode === 'rest' ? 'on-rest' : ''" @click="switchMode('rest')">☕ 休息 5′</button>
    </div>

    <div class="ring-wrap">
      <svg viewBox="0 0 200 200" class="ring">
        <circle cx="100" cy="100" r="88" stroke="rgba(255,255,255,0.08)" stroke-width="9" fill="none" />
        <circle id="pomo-ring" cx="100" cy="100" r="88" stroke="#F59E0B" stroke-width="9" fill="none" stroke-linecap="round"
          :stroke-dasharray="RING_C" stroke-dashoffset="0" transform="rotate(-90 100 100)" />
      </svg>
      <div class="center">
        <p class="mode-label" :style="{ color: mode === 'focus' ? '#FBBF24' : '#6EE7B7' }">{{ mode === 'focus' ? '专 注' : '休 息' }}</p>
        <p class="font-title time">{{ timeText() }}</p>
      </div>
    </div>

    <el-button type="primary" size="large" class="mt-5 px-10" @click="toggle">{{ running ? '暂停' : (remain === total ? '开始' : '继续') }}</el-button>
    <div class="stat-line">
      <span>总专注 <b class="font-title amber">{{ minutes }}</b> 分钟</span>
      <span>番茄 <b class="font-title amber">{{ count }}</b> 个</span>
    </div>
  </div>
</template>

<style scoped>
.box { padding: 24px; text-align: center; }
.pills { display: flex; justify-content: center; gap: 8px; margin-bottom: 24px; }
.pill { padding: 6px 18px; border-radius: 999px; font-size: 13px; border: 1px solid rgba(255,255,255,0.1); color: #a1a1aa; background: transparent; cursor: pointer; }
.pill.on-focus { background: rgba(245,158,11,0.15); border-color: rgba(245,158,11,0.5); color: #FBBF24; }
.pill.on-rest { background: rgba(52,211,153,0.15); border-color: rgba(52,211,153,0.5); color: #6EE7B7; }
.ring-wrap { position: relative; display: inline-block; }
.ring { width: 224px; height: 224px; }
@media (min-width: 640px) { .ring { width: 256px; height: 256px; } }
.center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.mode-label { font-size: 10px; letter-spacing: 0.3em; color: #71717a; margin-bottom: 4px; }
.time { font-size: 2.25rem; font-weight: 700; }
.stat-line { margin-top: 20px; display: flex; justify-content: center; gap: 24px; font-size: 12px; color: #71717a; }
.amber { color: var(--amber); }
</style>
