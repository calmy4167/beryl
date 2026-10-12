<script setup lang="ts">
/**
 * LiubaiShell —— 「留白 · 个人管理」（参考稿 v11）的统一外壳。
 *
 * 取代原先的双壳并存（ReferenceAppShell / LegacyAppShell）与侧边栏结构：
 * 固定 UI（brand / progress / counter / tip / dots / gear / HUD / mode / zen / toast / tooltip）
 * + main.stage > section.slide > .inner（唯一可滚动区）+ 三个弹层（设置 / 命令面板）。
 *
 * 设计层来自 src/styles/liubai/liubai-v11.css；本组件只负责行为与结构，不另写视觉。
 * body 上的 data-theme / data-nav / mode-simple / zen-mode 由 main.ts 初始化，本组件负责运行期切换。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { vuePageRegistry } from '@/vue/page-registry'
import { featureNavigationGroupMeta } from '@/router/route-manifest'
import { pageOwnsHead } from '@/vue/liubai/slide-head'
import { SAVE_STATE_EVENT, type SaveStateDetail } from '@/core/save-state'

interface Theme { id: string; name: string; bg: string; accent: string }

const THEMES: Theme[] = [
  { id: 'night', name: '深夜', bg: '#0a0a0b', accent: '#c8ff4d' },
  { id: 'ink', name: '墨蓝', bg: '#0d0f14', accent: '#7dd3fc' },
  { id: 'forest', name: '森林', bg: '#0c1411', accent: '#4ade80' },
  { id: 'sunset', name: '暮色', bg: '#171014', accent: '#ff8a5b' },
  { id: 'paper', name: '纸白', bg: '#f6f5f2', accent: '#2555d4' },
  { id: 'sand', name: '沙色', bg: '#f4efe6', accent: '#9a3412' },
]
const THEME_KEY = 'liubai-theme'
const NAV_KEY = 'liubai-nav'
const ZEN_KEY = 'liubai-zen'
const MODE_KEY = 'liubai-mode'
const HUD_KEY = 'liubai-hud'
const VISIBLE_MODULES_KEY = 'liubai-visible-modules'

/** 路由清单是应用模块导航的唯一来源；只展示工作台内可访问的页面。 */
const allModules = vuePageRegistry.flatMap(page => {
  const navigation = page.navigation
  if (!navigation || page.shell !== 'app') return []
  return [{
    label: navigation.label,
    path: page.path,
    groupId: navigation.kind === 'primary' ? 'primary' : navigation.groupId,
    order: navigation.order,
  }]
}).sort((a, b) => {
  const groupOrder = (id: string) => id === 'primary' ? -1 : featureNavigationGroupMeta.findIndex(group => group.id === id)
  return groupOrder(a.groupId) - groupOrder(b.groupId) || a.order - b.order
})
const moduleGroups = [
  { id: 'primary', label: '常用入口' },
  ...featureNavigationGroupMeta,
].map(group => ({
  ...group,
  items: allModules.map((item, index) => ({ ...item, index })).filter(item => item.groupId === group.id),
})).filter(group => group.items.length > 0)

const route = useRoute()
const router = useRouter()
const isDeskHome = computed(() => route.meta.pageId === 'desk' || route.path === '/app/desk')

const theme = ref('night')
const navPos = ref<'left' | 'right'>('left')
const simple = ref(false)
const zen = ref(false)
const hudLevel = ref(0)
const settingsOpen = ref(false)
const paletteOpen = ref(false)
const moduleManagerOpen = ref(false)
const navOpen = ref(false)
const visibleModulePaths = ref(allModules.map(item => item.path))
const paletteQuery = ref('')
const paletteIndex = ref(0)
const toast = ref('')
const live = ref('')

const paletteInput = ref<HTMLInputElement | null>(null)
const moduleManagerTrigger = ref<HTMLButtonElement | null>(null)
const moduleManagerPanel = ref<HTMLElement | null>(null)
const moduleNavHandle = ref<HTMLButtonElement | null>(null)
const tooltipEl = ref<HTMLElement | null>(null)
const dotsEl = ref<HTMLElement | null>(null)

let toastTimer: number | undefined
let themeTimer: number | undefined

// 返回 string 而不是字面量：兜底值若推断为 'left'/'full' 这类字面量，
// 后面的 === 'right' / === 'simple' 会被 TS 判为「无重叠比较」。
function read(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* 忽略隐私模式失败 */ }
}
function loadVisibleModules(): string[] {
  const fallback = allModules.map(item => item.path)
  const stored = read(VISIBLE_MODULES_KEY, '')
  if (!stored) return fallback
  try {
    const paths: unknown = JSON.parse(stored)
    if (!Array.isArray(paths)) return fallback
    return allModules.filter(item => paths.includes(item.path)).map(item => item.path)
  } catch {
    return fallback
  }
}
const modules = computed(() => allModules.filter(item => visibleModulePaths.value.includes(item.path)))
const navigationGroups = computed(() => moduleGroups.map(group => ({
  ...group,
  items: modules.value.map((item, index) => ({ ...item, index })).filter(item => item.groupId === group.id),
})).filter(group => group.items.length > 0))
const visibleModuleCount = computed(() => visibleModulePaths.value.length)
function announce(message: string) {
  live.value = message
  toast.value = message
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toast.value = '' }, 2400)
}

/* ── 主题 / 导航 / 模式 / 禅模式 ───────────────────────── */

function applyTheme(id: string, animate = true) {
  if (animate) {
    document.documentElement.classList.add('theme-fade')
    if (themeTimer) window.clearTimeout(themeTimer)
    themeTimer = window.setTimeout(() => document.documentElement.classList.remove('theme-fade'), 430)
  }
  theme.value = id
  document.body.dataset.theme = id
  write(THEME_KEY, id)
}
function applyNav(pos: 'left' | 'right') {
  navPos.value = pos
  document.body.dataset.nav = pos
  write(NAV_KEY, pos)
}
function applyMode(next: boolean, silent = false) {
  simple.value = next
  document.body.classList.toggle('mode-simple', next)
  write(MODE_KEY, next ? 'simple' : 'full')
  if (!silent) announce(next ? '简洁模式：只保留核心内容' : '全量模式：显示全部信息')
}
function applyZen(on: boolean) {
  zen.value = on
  document.body.classList.toggle('zen-mode', on)
  write(ZEN_KEY, on ? '1' : '0')
  if (on) announce('禅模式 · 按 Esc 退出')
}

/* ── HUD 分层：按 data-hud-rank 收起辅助块 ─────────────── */

const HUD_LABEL = ['切换信息分层', '切换到核心视图', '切换到全部视图']
const HUD_ANNOUNCE = ['全部信息已显示', '已隐藏部分辅助信息', '仅显示核心内容']

function hudKey() { return `${HUD_KEY}:${route.path}` }
function applyHud(level: number) {
  hudLevel.value = level
  write(hudKey(), String(level))
  document.querySelectorAll('[data-hud-rank]').forEach(node => {
    const rank = Number((node as HTMLElement).dataset.hudRank || '1')
    // rank 1 常显；rank 2 在级别 ≥2 收起；rank 3 在级别 ≥1 收起
    const hidden = (rank === 3 && level >= 1) || (rank === 2 && level >= 2)
    node.classList.toggle('hud-hidden', hidden)
  })
}
function cycleHud(broadcast = false) {
  applyHud((hudLevel.value + 1) % 3)
  if (broadcast) document.querySelectorAll<HTMLElement>('section.slide').forEach(s => s.dataset.hud = String(hudLevel.value))
  else announce(HUD_ANNOUNCE[hudLevel.value])
}

/* ── 模块导航：显式打开，明确关闭 ─────────────────────── */

function setNavOpen(open: boolean) {
  const restoreComposer = !open && isDeskHome.value && !!dotsEl.value?.contains(document.activeElement)
  const restoreHandle = !open && !isDeskHome.value && !!dotsEl.value?.contains(document.activeElement)
  navOpen.value = open
  document.body.classList.toggle('desk-nav-open', open)
  document.body.classList.toggle('nav-show', open)
  if (restoreComposer) nextTick(() => document.getElementById('desk-composer-input')?.focus())
  else if (restoreHandle) nextTick(() => moduleNavHandle.value?.focus())
}
function openNavigation() {
  setNavOpen(true)
  nextTick(() => dotsEl.value?.querySelector<HTMLButtonElement>('.dot.active, .dot')?.focus())
}

/* ── 模块切换：显式导航和快捷键 ─────────────────────────── */

const activeIndex = computed(() => modules.value.findIndex(item => route.path === item.path))
const total = computed(() => modules.value.length)
const counterLabel = computed(() => activeIndex.value < 0 ? '00' : String(activeIndex.value + 1).padStart(2, '0'))
const progress = computed(() => `${(activeIndex.value < 0 || total.value === 0 ? 0.16 : (activeIndex.value + 1) / total.value).toFixed(3)}`)

function gotoModule(index: number) {
  if (modules.value.length === 0) return
  const target = (index + modules.value.length) % modules.value.length
  void router.push(modules.value[target].path)
}

function toggleModuleVisibility(path: string) {
  const visible = new Set(visibleModulePaths.value)
  if (visible.has(path)) visible.delete(path)
  else visible.add(path)
  visibleModulePaths.value = allModules.filter(item => visible.has(item.path)).map(item => item.path)
  write(VISIBLE_MODULES_KEY, JSON.stringify(visibleModulePaths.value))
}

function openModulePath(path: string) {
  moduleManagerOpen.value = false
  void router.push(path)
  nextTick(() => moduleManagerTrigger.value?.focus())
}

function setAllModulesVisible(visible: boolean) {
  visibleModulePaths.value = visible ? allModules.map(item => item.path) : []
  write(VISIBLE_MODULES_KEY, JSON.stringify(visibleModulePaths.value))
}

function openModuleManager() {
  moduleManagerOpen.value = true
  nextTick(() => moduleManagerPanel.value?.querySelector<HTMLElement>('button, input')?.focus())
}

function closeModuleManager() {
  moduleManagerOpen.value = false
  setNavOpen(true)
  nextTick(() => moduleManagerTrigger.value?.focus())
}

function onModuleManagerKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeModuleManager()
    return
  }
  if (event.key !== 'Tab' || !moduleManagerPanel.value) return
  const focusable = [...moduleManagerPanel.value.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')]
  if (focusable.length === 0) { event.preventDefault(); return }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

/* ── 命令面板 ─────────────────────────────────────────── */

interface Command { id: string; label: string; hint: string; run: () => void }

const commands = computed<Command[]>(() => {
  const list: Command[] = modules.value.map((item, index) => ({
    id: `go:${item.path}`,
    label: `跳到 ${item.label}`,
    hint: index < 9 ? `${index + 1}` : '',
    run: () => void router.push(item.path),
  }))
  list.push(
    { id: 'mode', label: '切换简洁 / 全量模式', hint: 'M', run: () => applyMode(!simple.value) },
    { id: 'zen', label: '进入禅模式', hint: '⇧Z', run: () => applyZen(true) },
    { id: 'hud', label: '切换信息分层', hint: 'H', run: () => cycleHud() },
    { id: 'settings', label: '打开设置', hint: '', run: () => { settingsOpen.value = true } },
  )
  for (const page of vuePageRegistry) {
    if (page.shell === 'standalone' || allModules.some(item => item.path === page.path)) continue
    list.push({
      id: `page:${page.path}`,
      label: page.title,
      hint: page.archetype || '',
      run: () => void router.push(page.path),
    })
  }
  return list
})
const paletteResults = computed(() => {
  const query = paletteQuery.value.trim().toLowerCase()
  const base = commands.value
  if (!query) return base.slice(0, 40)
  return base.filter(item => `${item.label} ${item.hint}`.toLowerCase().includes(query)).slice(0, 40)
})

function openPalette() {
  paletteOpen.value = true
  paletteQuery.value = ''
  paletteIndex.value = 0
  window.setTimeout(() => paletteInput.value?.focus(), 30)
}
function runCommand(command: Command | undefined) {
  if (!command) return
  paletteOpen.value = false
  command.run()
}
function onPaletteKey(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') { event.preventDefault(); paletteIndex.value = (paletteIndex.value + 1) % Math.max(paletteResults.value.length, 1) }
  else if (event.key === 'ArrowUp') { event.preventDefault(); paletteIndex.value = (paletteIndex.value - 1 + paletteResults.value.length) % Math.max(paletteResults.value.length, 1) }
  else if (event.key === 'Enter') { event.preventDefault(); runCommand(paletteResults.value[paletteIndex.value]) }
  else paletteIndex.value = 0
}

/* ── Tooltip（.info[data-tip]） ────────────────────────── */

function placeTooltip(target: HTMLElement) {
  const tip = target.dataset.tip
  const el = tooltipEl.value
  if (!tip || !el) return
  el.textContent = tip
  const rect = target.getBoundingClientRect()
  el.classList.add('show')
  const width = el.offsetWidth
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8)
  el.style.left = `${left}px`
  el.style.top = `${rect.bottom + 8}px`
}
function hideTooltip() { tooltipEl.value?.classList.remove('show') }
function onPointerOver(event: Event) {
  const target = (event.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null
  if (target) placeTooltip(target)
}
function onPointerOut(event: Event) {
  const target = (event.target as HTMLElement | null)?.closest?.('[data-tip]')
  if (target) hideTooltip()
}

/* ── 承接旧壳的全局反馈通道 ──────────────────────────────
   旧壳（AppShell/LegacyAppShell）监听 beryl-toast 与 beryl-save-state；
   换成「留白」外壳后如果不接，全站的提示与保存失败都会静默消失。
   成功保存按参考稿的克制风格不打扰，只在冲突 / 失败时提示。 */
function onToastEvent(event: Event) {
  const detail = (event as CustomEvent<{ message?: string; kind?: string }>).detail
  if (detail?.message) announce(detail.message)
}
function onSaveStateEvent(event: Event) {
  const detail = (event as CustomEvent<SaveStateDetail>).detail
  if (detail?.state === 'conflict') announce('这条内容在别处被改过，请刷新后再试')
  else if (detail?.state === 'failed') announce('保存失败，请重试')
}

/* ── 键盘 ─────────────────────────────────────────────── */

function onKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    if (paletteOpen.value) paletteOpen.value = false
    else setNavOpen(!navOpen.value)
    return
  }
  if (event.key === 'Escape') {
    if (paletteOpen.value) { paletteOpen.value = false; return }
    if (settingsOpen.value) { settingsOpen.value = false; return }
    if (moduleManagerOpen.value) { closeModuleManager(); return }
    if (zen.value) { applyZen(false); return }
    hideTooltip()
    return
  }
  if (typing) return
  if (event.shiftKey && event.key.toLowerCase() === 'z') { event.preventDefault(); applyZen(!zen.value); return }
  if (event.shiftKey && event.key.toLowerCase() === 'h') { event.preventDefault(); cycleHud(true); return }
  if (event.key === 'h' || event.key === 'H') { cycleHud(); return }
  if (event.key === 'm' || event.key === 'M') { applyMode(!simple.value); return }
  const digit = Number(event.key)
  if (digit >= 1 && digit <= Math.min(modules.value.length, 9)) { gotoModule(digit - 1); return }
}

/* ── 生命周期 ─────────────────────────────────────────── */

// 页面标题：从路由 meta 取，兜底用页面注册表
const pageTitle = computed(() => {
  const meta = route.meta as { title?: string; description?: string; archetype?: string }
  const page = vuePageRegistry.find(item => item.path === route.path)
  return meta.title || page?.title || 'Calmy'
})
const pageDescription = computed(() => {
  const meta = route.meta as { description?: string }
  const page = vuePageRegistry.find(item => item.path === route.path)
  return meta.description || page?.description || ''
})
const pageArchetype = computed(() => {
  const meta = route.meta as { archetype?: string }
  const page = vuePageRegistry.find(item => item.path === route.path)
  return meta.archetype || page?.archetype || 'content'
})
const groupLabel = computed(() => {
  const page = vuePageRegistry.find(item => item.path === route.path)
  return page?.archetype || (activeIndex.value >= 0 ? '模块' : '扩展')
})
/** 未登录（登录页）不显示模块导航 */
const showDots = computed(() => !route.path.startsWith('/login'))

/**
 * 外壳的标题栏只在页面自己没提供时才渲染。
 * 参考稿里每个 .slide 的头部都是页面自己的；所以页面只要调用 useOwnSlideHead()
 * 声明"我有自己的头"，外壳就让位（否则会出现两个标题）。
 *
 * 迁移期这里还有一个 `.page-head` 的 DOM 探针给旧页面兜底；30 个路由页与飞书分支
 * （FeishuTaskBoard）都改成 `.slide-head` 后，探针已在第 25 轮删除。
 */
const showShellHead = computed(() => !pageOwnsHead.value)

watch(() => route.path, () => {
  applyHud(Number(read(hudKey(), '0')))
  paletteOpen.value = false
  settingsOpen.value = false
  document.body.classList.toggle('desk-home', isDeskHome.value)
})

onMounted(() => {
  document.documentElement.classList.add('liubai-active')
  document.body.classList.toggle('desk-home', isDeskHome.value)
  document.body.classList.remove('desk-nav-open', 'nav-show')
  visibleModulePaths.value = loadVisibleModules()
  applyTheme(read(THEME_KEY, 'night'), false)
  applyNav(read(NAV_KEY, 'left') === 'right' ? 'right' : 'left')
  applyMode(read(MODE_KEY, 'full') === 'simple', true)
  applyZen(read(ZEN_KEY, '0') === '1')
  applyHud(Number(read(hudKey(), '0')))
  window.addEventListener('keydown', onKey)
  document.addEventListener('mouseover', onPointerOver)
  document.addEventListener('mouseout', onPointerOut)
  window.addEventListener('focusin', onPointerOver)
  window.addEventListener('focusout', onPointerOut)
  window.addEventListener('beryl-toast', onToastEvent)
  window.addEventListener(SAVE_STATE_EVENT, onSaveStateEvent)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('mouseover', onPointerOver)
  document.removeEventListener('mouseout', onPointerOut)
  window.removeEventListener('focusin', onPointerOver)
  window.removeEventListener('focusout', onPointerOut)
  window.removeEventListener('beryl-toast', onToastEvent)
  window.removeEventListener(SAVE_STATE_EVENT, onSaveStateEvent)
  if (toastTimer) window.clearTimeout(toastTimer)
  if (themeTimer) window.clearTimeout(themeTimer)
  document.body.classList.remove('mode-simple', 'zen-mode', 'nav-show', 'desk-home', 'desk-nav-open')
  document.documentElement.classList.remove('liubai-active')
})

defineExpose({ announce, applyMode, applyZen })
</script>

<template>
  <div class="liubai-shell">
    <div class="progress" :style="{ transform: `scaleX(${progress})` }" />
    <div class="brand">◆ Calmy</div>
    <div class="nav-hint" aria-hidden="true" />
    <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ live }}</div>
    <div ref="tooltipEl" class="tooltip" />

    <div class="zen-bar" role="status">
      <span>禅模式</span>
      <span>按 <kbd>Esc</kbd> 或 <kbd>Shift</kbd><kbd>Z</kbd> 退出</span>
    </div>

    <button
      class="hud-toggle"
      :data-level="hudLevel"
      :aria-label="HUD_LABEL[hudLevel]"
      :aria-pressed="hudLevel !== 0 ? 'true' : 'false'"
      @click="cycleHud()"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <rect class="hud-1" x="3" y="4" width="18" height="4.5" rx="1.2" />
        <rect class="hud-2" x="3" y="11.5" width="14" height="3" rx="1" />
        <rect class="hud-3" x="3" y="17" width="9" height="3" rx="1" />
      </svg>
    </button>

    <button
      class="mode-toggle"
      :aria-pressed="simple ? 'true' : 'false'"
      aria-label="切换简洁模式"
      title="简洁模式 / 全量模式 (M)"
      @click="applyMode(!simple)"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
        <rect x="3.5" y="4" width="17" height="16" rx="2" />
        <line class="m-line" x1="7" y1="9" x2="17" y2="9" />
        <line class="m-line" x1="7" y1="13" x2="17" y2="13" />
        <line class="m-line" x1="7" y1="17" x2="13" y2="17" />
      </svg>
    </button>

    <button class="gear" aria-label="打开设置" :aria-expanded="settingsOpen ? 'true' : 'false'" @click="settingsOpen = true">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.2 5.2l1.8 1.8M17 17l1.8 1.8M18.8 5.2L17 7M7 17l-1.8 1.8" />
      </svg>
    </button>

    <div class="toast" :class="{ show: !!toast }" role="status" aria-live="polite">{{ toast }}</div>

    <!-- 设置 -->
    <div class="settings" :class="{ open: settingsOpen }" role="dialog" aria-modal="true" aria-label="设置">
      <div class="settings-backdrop" @click="settingsOpen = false" />
      <div class="settings-panel">
        <div class="set-title">背景主题</div>
        <div class="swatches" role="radiogroup" aria-label="主题">
          <button
            v-for="item in THEMES"
            :key="item.id"
            class="swatch"
            :class="{ on: theme === item.id }"
            role="radio"
            :aria-checked="theme === item.id ? 'true' : 'false'"
            :aria-label="`主题：${item.name}`"
            :title="item.name"
            :style="{ background: item.bg }"
            @click="applyTheme(item.id)"
          ><span class="sw-dot" :style="{ background: item.accent }" /></button>
        </div>

        <div class="set-title">导航位置</div>
        <div class="seg" role="radiogroup" aria-label="导航位置">
          <button role="radio" :class="{ on: navPos === 'left' }" :aria-checked="navPos === 'left' ? 'true' : 'false'" @click="applyNav('left')">左侧</button>
          <button role="radio" :class="{ on: navPos === 'right' }" :aria-checked="navPos === 'right' ? 'true' : 'false'" @click="applyNav('right')">右侧</button>
        </div>

        <div class="set-title">显示模式</div>
        <div class="seg" role="radiogroup" aria-label="显示模式">
          <button role="radio" :class="{ on: !simple }" :aria-checked="!simple ? 'true' : 'false'" @click="applyMode(false)">全量模式</button>
          <button role="radio" :class="{ on: simple }" :aria-checked="simple ? 'true' : 'false'" @click="applyMode(true)">简洁模式</button>
        </div>
        <div class="set-hint">
          简洁模式只保留每个模块的<strong style="color:var(--fg)">核心内容</strong>——统计卡、辅助面板、标题注释等全部收起。<br>
          快捷键 <kbd>M</kbd> 一键切换。
        </div>

        <div class="set-title">使用提示</div>
        <div class="set-hint" style="margin-top:0">
          <kbd>H</kbd> 切换当前模块信息密度（0 / 1 / 2）<br>
          <kbd>⇧H</kbd> 批量切换所有模块<br>
          <kbd>M</kbd> 简洁 / 全量模式<br>
          <kbd>⇧Z</kbd> 禅模式 · <kbd>Esc</kbd> 退出<br>
          <kbd>Ctrl/⌘ K</kbd> 切换模块导航 · <kbd>1–9</kbd> 跳转模块<br>
          滚轮只滚动当前页面内容。
        </div>

        <div class="set-title">数据</div>
        <div class="set-actions">
          <button class="set-btn" @click="router.push('/app/admin')">备份与同步</button>
          <button class="set-btn" @click="router.push('/app/admin')">导入 / 导出</button>
          <button class="set-btn" style="grid-column:span 2" @click="router.push('/app/admin')">全部设置与清空数据</button>
        </div>
        <div class="set-hint">数据仍由原有 Repository 与云端同步负责，本外壳不改变存储边界。</div>
      </div>
    </div>

    <!-- 命令面板 -->
    <div class="palette" :class="{ open: paletteOpen }" role="dialog" aria-modal="true" aria-label="命令面板">
      <div class="palette-backdrop" @click="paletteOpen = false" />
      <div class="palette-box">
        <input
          ref="paletteInput"
          v-model="paletteQuery"
          class="palette-input"
          type="text"
          placeholder="输入命令或跳转到…"
          aria-label="命令搜索"
          autocomplete="off"
          @keydown="onPaletteKey"
        >
        <ul class="palette-list" role="listbox">
          <li v-if="!paletteResults.length" class="palette-empty">没有匹配的命令</li>
          <li
            v-for="(item, index) in paletteResults"
            :key="item.id"
            class="palette-item"
            :class="{ active: index === paletteIndex }"
            role="option"
            :aria-selected="index === paletteIndex ? 'true' : 'false'"
            @click="runCommand(item)"
          >
            <span>{{ item.label }}</span>
            <span v-if="item.hint" class="palette-hint">{{ item.hint }}</span>
          </li>
        </ul>
        <div class="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
          <span><kbd>↵</kbd> 执行</span>
          <span><kbd>esc</kbd> 关闭</span>
        </div>
      </div>
    </div>

    <!-- 舞台 -->
    <main class="stage">
      <section class="slide active" data-title="" :data-hud="hudLevel" :data-archetype="pageArchetype">
        <div class="inner">
          <header v-if="showShellHead" class="slide-head">
            <div class="head-main">
              <p class="hint">{{ groupLabel }}</p>
              <div class="head-title-row">
                <h2>{{ pageTitle }}</h2>
                <span v-if="pageDescription" class="info" tabindex="0" :data-tip="pageDescription">i</span>
              </div>
            </div>
            <slot name="head" />
          </header>
          <slot>
            <RouterView />
          </slot>
        </div>
      </section>
    </main>

    <button v-if="showDots && !navOpen" ref="moduleNavHandle" class="module-nav-handle" aria-label="打开模块导航" title="打开模块导航" @click="openNavigation()">模块</button>
    <nav v-if="showDots" id="module-navigation" ref="dotsEl" class="dots" aria-label="显示中的模块">
      <header class="desk-nav-head">
        <span>Calmy</span>
        <button type="button" class="desk-nav-close" aria-label="关闭模块导航" title="关闭模块导航 (Ctrl/⌘ K)" @click="setNavOpen(false)">×</button>
      </header>
      <p v-if="modules.length === 0" class="dot-empty">尚未选择显示模块</p>
      <section v-for="group in navigationGroups" :key="group.id" class="dot-group" :aria-label="group.label">
        <h2 class="dot-group-title">{{ group.label }}</h2>
        <button
          v-for="item in group.items"
          :key="item.path"
          class="dot"
          :class="{ active: activeIndex === item.index }"
          :aria-current="activeIndex === item.index ? 'page' : undefined"
          @click="gotoModule(item.index)"
        >{{ item.label }}</button>
      </section>
      <div class="desk-nav-actions">
        <button type="button" @click="openPalette()">搜索或跳转…</button>
        <button type="button" @click="settingsOpen = true">外观与显示</button>
        <button ref="moduleManagerTrigger" type="button" aria-controls="module-manager" :aria-expanded="moduleManagerOpen" @click="openModuleManager()">管理模块 <span>{{ visibleModuleCount }}/{{ allModules.length }}</span></button>
      </div>
    </nav>

    <div v-if="moduleManagerOpen" class="module-manager-backdrop" @click.self="closeModuleManager()">
      <section id="module-manager" ref="moduleManagerPanel" class="module-manager" role="dialog" aria-modal="true" aria-labelledby="module-manager-title" @keydown="onModuleManagerKeydown">
        <header class="module-manager-header">
          <div>
            <h2 id="module-manager-title">显示哪些模块</h2>
            <p>勾选的模块会出现在导航中；取消勾选后仍可在这里恢复。</p>
          </div>
          <button class="module-manager-close" aria-label="关闭模块管理" @click="closeModuleManager()">×</button>
        </header>
        <div class="module-manager-actions">
          <span>已显示 {{ visibleModuleCount }} / {{ allModules.length }}</span>
          <div>
            <button @click="setAllModulesVisible(true)">全部显示</button>
            <button @click="setAllModulesVisible(false)">全部隐藏</button>
          </div>
        </div>
        <div class="module-manager-list">
          <section v-for="group in moduleGroups" :key="group.id" class="module-manager-group">
            <h3>{{ group.label }}</h3>
            <div v-for="item in group.items" :key="item.path" class="module-manager-row">
              <label :for="`module-visible-${item.index}`">
                <input :id="`module-visible-${item.index}`" type="checkbox" :checked="visibleModulePaths.includes(item.path)" @change="toggleModuleVisibility(item.path)">
                <span>{{ item.label }}</span>
              </label>
              <button class="module-manager-open" :aria-label="`打开${item.label}`" @click="openModulePath(item.path)">打开</button>
            </div>
          </section>
        </div>
      </section>
    </div>

    <div class="counter"><span>{{ counterLabel }}</span> <em>/ {{ String(total).padStart(2, '0') }}</em></div>
    <p class="tip">滚轮滚动内容 · <kbd>H</kbd> 分层 · <kbd>M</kbd> 模式 · <kbd>Ctrl/⌘ K</kbd> 导航</p>
  </div>
</template>

