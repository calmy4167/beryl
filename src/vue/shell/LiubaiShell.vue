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
const QUICK_ENTRIES_KEY = 'liubai-quick-entry-paths'
const DEFAULT_QUICK_ENTRY_PATHS = ['/app/today', '/app/capture', '/app/matters', '/app/review']

/** 路由清单是应用模块导航的唯一来源；只展示工作台内可访问的页面。 */
const allModules = vuePageRegistry.flatMap(page => {
  const navigation = page.navigation
  if (!navigation || page.shell !== 'app') return []
  return [{
    label: navigation.label,
    icon: navigation.icon || '',
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
const navigationGroupIconPaths: Record<string, string> = {
  primary: 'M12 3.5 14 9l5.5 2-5.5 2-2 5.5-2-5.5-5.5-2L10 9l2-5.5Zm7 12.5.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z',
  work: 'M3.5 8.5h17v11h-17zM8 8.5V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2.5M3.5 12h17M10 12v2h4v-2',
  records: 'M5 4.5h12a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2v-13Zm0 13a2 2 0 0 0 2 2M9 9h6M9 12.5h6M9 16h4',
  understanding: 'M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.5 19a6 6 0 0 1 12 0v1h-12v-1Zm11 1v-1a5.5 5.5 0 0 1 8-4.9',
  'daily-tools': 'M4 6h16M7 6v4m10-4v8M4 14h16M7 14v4m10-4v4M4 20h16',
  experiments: 'M9 3.5h6M10 3.5v6L4.5 19a1.7 1.7 0 0 0 1.5 2.5h12a1.7 1.7 0 0 0 1.5-2.5L14 9.5v-6M7 16h10',
  personal: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 8a8 8 0 0 1 16 0H4Z',
  data: 'M4 6c0-1.4 3.6-2.5 8-2.5S20 4.6 20 6s-3.6 2.5-8 2.5S4 7.4 4 6Zm0 0v12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V6M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5',
  system: 'M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-5 2v4',
}
const navigationItemIconPaths: Record<string, string> = {
  '▱': 'M4 5h16v14H4zM8 8h8M8 11h8',
  '⌂': 'm3.5 11 8.5-7 8.5 7M6 9.5V20h12V9.5M10 20v-6h4v6',
  '↓': 'M12 4v11m-4-4 4 4 4-4M5 18v2h14v-2',
  '☷': 'M5 6h14M5 12h14M5 18h14M3 6h.01M3 12h.01M3 18h.01',
  '◴': 'M12 3.5a8.5 8.5 0 1 0 8.5 8.5M12 7v5l3.5 2M17.5 4.5v4h4',
  '◌': 'M12 4a8 8 0 1 0 8 8M12 8a4 4 0 1 0 4 4M20 4v4h-4',
  '○': 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7.5 8a7.5 7.5 0 0 1 15 0',
  '✦': 'm12 3 2.1 6.9L21 12l-6.9 2.1L12 21l-2.1-6.9L3 12l6.9-2.1L12 3Z',
  '⚙': 'M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-5 2v4',
  '□': 'M5 4.5h14v15H5zM8 3v3M16 3v3M5 9h14M8 12h3M13 12h3M8 15h3',
  '✎': 'm5 16-.8 4 4-.8L20 7.4 16.6 4 5 16Zm9.8-9.8 3.4 3.4',
  '♙': 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0H5Z',
  '◉': 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm0 5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
  '◈': 'm12 3 8.5 9-8.5 9L3.5 12 12 3Zm0 5.5 3.5 3.5-3.5 3.5L8.5 12 12 8.5Z',
  '▦': 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  '⚿': 'M12 3 20 6v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-3Zm-3 9 2 2 4-4',
  '♧': 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.5 19a4.5 4.5 0 0 1 9 0m-1 0a4.5 4.5 0 0 1 9 0',
  '◷': 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 7v5l3 2',
  '≡': 'M5 6h14M5 12h14M5 18h14',
  '▤': 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h6',
  '⌁': 'M4 7h7a3 3 0 1 1-3 3m12 7h-7a3 3 0 1 1 3-3',
  '▧': 'M4 5h16v14H4zM8 5v14M8 9h12M8 15h12',
  '✓': 'm5 12 4.5 4.5L19 7',
  '🍅': 'M12 7a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM9 4c1-1 2-1 3 0 1-1 2-1 3 0M12 7V4m-2 7v4l3 2',
  '¥': 'M7 4l5 6 5-6M12 10v10M7 10h10M8 14h8',
  '↗': 'M7 17 17 7M8 7h9v9',
}

const route = useRoute()
const router = useRouter()
const isDeskHome = computed(() => route.meta.pageId === 'desk' || route.path === '/app/desk')

const theme = ref('paper')
const navPos = ref<'left' | 'right'>('left')
const simple = ref(false)
const zen = ref(false)
const hudLevel = ref(0)
const settingsOpen = ref(false)
const paletteOpen = ref(false)
const moduleManagerOpen = ref(false)
/* 普通模块默认显示侧栏；Desk 维持沉浸式默认收起。 */
const navOpen = ref(!isDeskHome.value)
const navHidden = ref(false)
// 一级菜单默认全部收起；同一时刻只展开一个分组。
const expandedNavigationGroup = ref<string | null>(null)
const submenuFlyout = ref<HTMLElement | null>(null)
const submenuAnchor = ref<HTMLElement | null>(null)
const submenuFlyoutTop = ref(86)
const visibleModulePaths = ref(allModules.map(item => item.path))
const quickEntryPaths = ref([...DEFAULT_QUICK_ENTRY_PATHS])
const paletteQuery = ref('')
const paletteIndex = ref(0)
const toast = ref('')
const live = ref('')

const paletteInput = ref<HTMLInputElement | null>(null)
const palettePanel = ref<HTMLElement | null>(null)
const settingsPanel = ref<HTMLElement | null>(null)
const settingsTrigger = ref<HTMLElement | null>(null)
const settingsReturnFocus = ref<HTMLElement | null>(null)
const paletteTrigger = ref<HTMLElement | null>(null)
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
function loadQuickEntries(): string[] {
  const stored = read(QUICK_ENTRIES_KEY, '')
  const fallback = allModules.filter(item => DEFAULT_QUICK_ENTRY_PATHS.includes(item.path)).map(item => item.path)
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
const quickNavigationItems = computed(() => allModules.filter(item => quickEntryPaths.value.includes(item.path)))
const allNavigationGroups = computed(() => navigationGroups.value.map(group => ({
  ...group,
  items: group.id === 'primary' ? group.items.filter(item => item.path === '/app/desk') : group.items,
})).filter(group => group.items.length > 0))
const allModulesOpen = computed(() => expandedNavigationGroup.value === 'all')
const visibleModuleCount = computed(() => visibleModulePaths.value.length)
function positionNavigationFlyout() {
  const anchor = submenuAnchor.value
  if (!anchor || window.matchMedia('(max-width: 1100px)').matches) return
  const anchorTop = anchor.getBoundingClientRect().top
  const panelHeight = submenuFlyout.value?.offsetHeight || 340
  submenuFlyoutTop.value = Math.max(12, Math.min(anchorTop, window.innerHeight - panelHeight - 12))
}
function toggleAllModules(event: MouseEvent) {
  if (allModulesOpen.value) {
    expandedNavigationGroup.value = null
    submenuAnchor.value = null
    return
  }
  expandedNavigationGroup.value = 'all'
  submenuAnchor.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  nextTick(() => {
    positionNavigationFlyout()
    submenuFlyout.value?.querySelector<HTMLButtonElement>('.dot-submenu-item')?.focus()
  })
}
function closeNavigationSubmenu(restoreFocus = false) {
  const wasOpen = expandedNavigationGroup.value === 'all'
  expandedNavigationGroup.value = null
  submenuAnchor.value = null
  if (restoreFocus && wasOpen) nextTick(() => dotsEl.value?.querySelector<HTMLButtonElement>('.all-modules-trigger')?.focus())
}
function onNavigationOutsidePointerDown(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof Node)) return
  if (dotsEl.value?.contains(target) || submenuFlyout.value?.contains(target)) return
  closeNavigationSubmenu()
}
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
  if (!open) closeNavigationSubmenu()
  const focusWasInNavigation = !!dotsEl.value?.contains(document.activeElement)
  const restoreComposer = !open && isDeskHome.value && focusWasInNavigation
  const restoreHandle = !open && !isDeskHome.value && focusWasInNavigation
  navOpen.value = open
  document.body.classList.toggle('desk-nav-open', isDeskHome.value && open)
  document.body.classList.toggle('nav-show', open)
  document.body.classList.toggle('nav-collapsed', !isDeskHome.value && !open)
  if (restoreComposer) nextTick(() => document.getElementById('desk-composer-input')?.focus())
  else if (restoreHandle) nextTick(() => moduleNavHandle.value?.focus())
}
function setNavHidden(hidden: boolean) {
  navHidden.value = hidden
  document.body.classList.toggle('nav-hidden', hidden)
  if (hidden && navOpen.value) setNavOpen(false)
  nextTick(() => {
    if (hidden) moduleNavHandle.value?.focus()
    else dotsEl.value?.querySelector<HTMLButtonElement>('.desk-nav-close')?.focus()
  })
}
function openNavigation() {
  if (navHidden.value) setNavHidden(false)
  setNavOpen(true)
  nextTick(() => (dotsEl.value?.querySelector<HTMLButtonElement>('[data-quick-entry]')
    || dotsEl.value?.querySelector<HTMLButtonElement>('.all-modules-trigger'))?.focus())
}
/* 边缘把手显式展开一级侧栏；Ctrl/⌘ K 保留给命令面板。 */
function openNavigationFromHandle() {
  openNavigation()
}
function hideNavigation() {
  /* Desk 页侧栏展开 ⇄ 收起。 */
  setNavOpen(!navOpen.value)
}

function syncNavigationForRoute() {
  const desk = isDeskHome.value
  document.body.classList.toggle('nav-persistent', !desk)
  if (desk) setNavOpen(false)
  else setNavOpen(navOpen.value)
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
  /* 窄屏是浮层：选完就收起（桌面常驻，保持打开方便连续切换） */
  if (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1100px)').matches) setNavOpen(false)
}

function gotoQuickEntry(path: string) {
  void router.push(path)
  if (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1100px)').matches) setNavOpen(false)
}

function toggleModuleVisibility(path: string) {
  const visible = new Set(visibleModulePaths.value)
  if (visible.has(path)) visible.delete(path)
  else visible.add(path)
  visibleModulePaths.value = allModules.filter(item => visible.has(item.path)).map(item => item.path)
  write(VISIBLE_MODULES_KEY, JSON.stringify(visibleModulePaths.value))
}

function toggleQuickEntry(path: string) {
  const selected = new Set(quickEntryPaths.value)
  if (selected.has(path)) selected.delete(path)
  else selected.add(path)
  quickEntryPaths.value = allModules.filter(item => selected.has(item.path)).map(item => item.path)
  write(QUICK_ENTRIES_KEY, JSON.stringify(quickEntryPaths.value))
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

function focusableWithin(panel: HTMLElement | null): HTMLElement[] {
  return panel ? [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
    .filter(element => !element.closest('[hidden]') && element.getAttribute('aria-hidden') !== 'true') : []
}

function trapDialogFocus(event: KeyboardEvent, panel: HTMLElement | null) {
  if (event.key !== 'Tab') return
  const focusable = focusableWithin(panel)
  if (!focusable.length) { event.preventDefault(); return }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && (document.activeElement === first || !panel?.contains(document.activeElement))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (document.activeElement === last || !panel?.contains(document.activeElement))) {
    event.preventDefault()
    first.focus()
  }
}

function openSettings() {
  settingsReturnFocus.value = document.activeElement instanceof HTMLElement && !document.activeElement.closest('.palette')
    ? document.activeElement
    : settingsTrigger.value
  settingsOpen.value = true
  nextTick(() => focusableWithin(settingsPanel.value)[0]?.focus())
}
function closeSettings(restoreFocus = true) {
  settingsOpen.value = false
  if (restoreFocus) nextTick(() => settingsReturnFocus.value?.focus())
}
function onSettingsKeydown(event: KeyboardEvent) { trapDialogFocus(event, settingsPanel.value) }
function onPaletteKeydown(event: KeyboardEvent) { trapDialogFocus(event, palettePanel.value) }
function closePalette(restoreFocus = true) {
  paletteOpen.value = false
  if (restoreFocus) nextTick(() => paletteTrigger.value?.focus())
}

function closeModuleManager(restoreFocus = true) {
  moduleManagerOpen.value = false
  setNavOpen(true)
  if (restoreFocus) nextTick(() => moduleManagerTrigger.value?.focus())
}

function onModuleManagerKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeModuleManager()
    return
  }
  trapDialogFocus(event, moduleManagerPanel.value)
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
    { id: 'settings', label: '打开设置', hint: '', run: () => openSettings() },
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

function openPalette(returnFocus: HTMLElement | null = document.activeElement instanceof HTMLElement ? document.activeElement : null) {
  paletteTrigger.value = returnFocus
  paletteOpen.value = true
  paletteQuery.value = ''
  paletteIndex.value = 0
  nextTick(() => paletteInput.value?.focus())
}
function runCommand(command: Command | undefined) {
  if (!command) return
  closePalette(false)
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
  const height = el.offsetHeight
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8)
  const below = rect.bottom + 8
  const above = rect.top - height - 8
  const preferAbove = target.closest('.panel-head') && above >= 8
  const overflowsBottom = below + height > window.innerHeight - 8
  el.style.left = `${left}px`
  el.style.top = `${preferAbove || overflowsBottom ? Math.max(8, above) : below}px`
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
  const target = event.target instanceof Element ? event.target : null
  const composing = event.isComposing || event.keyCode === 229
  if (composing) return
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    if (paletteOpen.value) closePalette()
    else {
      const returnFocus = moduleManagerOpen.value
        ? moduleManagerTrigger.value
        : expandedNavigationGroup.value
          ? submenuAnchor.value
          : settingsOpen.value ? settingsTrigger.value
          : target instanceof HTMLElement ? target : null
      if (settingsOpen.value) closeSettings(false)
      if (moduleManagerOpen.value) closeModuleManager(false)
      if (expandedNavigationGroup.value) closeNavigationSubmenu()
      openPalette(returnFocus)
    }
    return
  }
  if (event.key === 'Escape') {
    if (paletteOpen.value) { closePalette(); return }
    if (settingsOpen.value) { closeSettings(); return }
    if (moduleManagerOpen.value) { closeModuleManager(); return }
    if (expandedNavigationGroup.value) { closeNavigationSubmenu(true); return }
    if (navOpen.value) { setNavOpen(false); return }
    if (zen.value) { applyZen(false); return }
    hideTooltip()
    return
  }
  if (target?.closest('input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false"]), [role]')) return
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
  syncNavigationForRoute()
})
watch(expandedNavigationGroup, groupId => {
  document.body.classList.toggle('nav-submenu-open', !!groupId)
}, { flush: 'sync' })

onMounted(() => {
  document.documentElement.classList.add('liubai-active')
  document.body.classList.toggle('desk-home', isDeskHome.value)
  document.body.classList.remove('desk-nav-open', 'nav-show', 'nav-hidden', 'nav-persistent', 'nav-collapsed', 'nav-submenu-open')
  syncNavigationForRoute()
  visibleModulePaths.value = loadVisibleModules()
  quickEntryPaths.value = loadQuickEntries()
  applyTheme(read(THEME_KEY, 'paper'), false)
  applyNav(read(NAV_KEY, 'left') === 'right' ? 'right' : 'left')
  applyMode(read(MODE_KEY, 'full') === 'simple', true)
  applyZen(read(ZEN_KEY, '0') === '1')
  applyHud(Number(read(hudKey(), '0')))
  window.addEventListener('keydown', onKey)
  document.addEventListener('pointerdown', onNavigationOutsidePointerDown)
  window.addEventListener('resize', positionNavigationFlyout)
  dotsEl.value?.addEventListener('scroll', positionNavigationFlyout)
  document.addEventListener('mouseover', onPointerOver)
  document.addEventListener('mouseout', onPointerOut)
  window.addEventListener('focusin', onPointerOver)
  window.addEventListener('focusout', onPointerOut)
  window.addEventListener('beryl-toast', onToastEvent)
  window.addEventListener(SAVE_STATE_EVENT, onSaveStateEvent)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('pointerdown', onNavigationOutsidePointerDown)
  window.removeEventListener('resize', positionNavigationFlyout)
  dotsEl.value?.removeEventListener('scroll', positionNavigationFlyout)
  document.removeEventListener('mouseover', onPointerOver)
  document.removeEventListener('mouseout', onPointerOut)
  window.removeEventListener('focusin', onPointerOver)
  window.removeEventListener('focusout', onPointerOut)
  window.removeEventListener('beryl-toast', onToastEvent)
  window.removeEventListener(SAVE_STATE_EVENT, onSaveStateEvent)
  if (toastTimer) window.clearTimeout(toastTimer)
  if (themeTimer) window.clearTimeout(themeTimer)
  document.body.classList.remove('mode-simple', 'zen-mode', 'nav-show', 'nav-hidden', 'nav-persistent', 'nav-collapsed', 'nav-submenu-open', 'desk-home', 'desk-nav-open')
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

    <button ref="settingsTrigger" class="gear" aria-label="打开设置" :aria-expanded="settingsOpen ? 'true' : 'false'" @click="openSettings()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.2 5.2l1.8 1.8M17 17l1.8 1.8M18.8 5.2L17 7M7 17l-1.8 1.8" />
      </svg>
    </button>

    <div class="toast" :class="{ show: !!toast }" role="status" aria-live="polite">{{ toast }}</div>

    <!-- 设置 -->
    <div class="settings" :class="{ open: settingsOpen }" role="dialog" aria-modal="true" aria-label="设置" @keydown="onSettingsKeydown">
      <div class="settings-backdrop" @click="closeSettings()" />
      <div ref="settingsPanel" class="settings-panel" tabindex="-1">
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
          <kbd>Ctrl/⌘ K</kbd> 打开命令面板 · <kbd>1–9</kbd> 跳转模块<br>
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
      <div class="palette-backdrop" @click="closePalette()" />
      <div ref="palettePanel" class="palette-box" tabindex="-1" @keydown="onPaletteKeydown">
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
      <section class="slide active" data-title="" :data-page-path="route.path" :data-hud="hudLevel" :data-archetype="pageArchetype">
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

    <button v-if="showDots && (!navOpen || navHidden)" ref="moduleNavHandle" class="module-nav-handle" aria-label="显示模块导航" title="显示模块导航" @click="openNavigationFromHandle()">模块</button>
    <button
      v-if="showDots && isDeskHome"
      type="button"
      class="nav-scrim"
      tabindex="-1"
      aria-label="关闭模块导航"
      @click="setNavOpen(false)"
    ></button>
    <nav v-if="showDots && !navHidden" id="module-navigation" ref="dotsEl" class="dots is-compact" aria-label="显示中的模块">
      <header class="desk-nav-head">
        <span class="desk-nav-brand">
          <span class="desk-nav-brand-mark" aria-hidden="true">◆</span>
          <span class="desk-nav-brand-name">Calmy</span>
        </span>
        <button type="button" class="desk-nav-close" aria-label="隐藏模块导航" title="隐藏模块导航" @click="hideNavigation()">
          <svg v-if="navPos === 'right'" viewBox="0 0 24 24" aria-hidden="true"><path d="m10 5 7 7-7 7" /></svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7" /></svg>
        </button>
      </header>
      <p v-if="modules.length === 0 && quickNavigationItems.length === 0" class="dot-empty">尚未选择显示模块</p>
      <section class="dot-group dot-daily-group" aria-label="常用入口">
        <button
          v-for="item in quickNavigationItems"
          :key="item.path"
          type="button"
          class="dot"
          :data-quick-entry="item.path"
          :class="{ active: route.path === item.path }"
          :aria-current="route.path === item.path ? 'page' : undefined"
          :aria-label="item.label"
          :title="item.label"
          @click="gotoQuickEntry(item.path)"
        >
          <svg class="dot-icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="navigationItemIconPaths[item.icon] || navigationItemIconPaths['≡']" /></svg>
          <span class="dot-label">{{ item.label }}</span>
        </button>
      </section>
      <button
        class="dot all-modules-trigger"
        type="button"
        aria-controls="module-submenu-flyout"
        :aria-expanded="allModulesOpen ? 'true' : 'false'"
        :class="{ active: allNavigationGroups.some(group => group.items.some(item => item.index === activeIndex)) && !quickNavigationItems.some(item => item.path === route.path) }"
        :title="`全部模块，${visibleModuleCount} 个可用`"
        @click="toggleAllModules($event)"
      >
        <svg class="dot-icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="navigationGroupIconPaths.primary" /></svg>
        <span class="dot-label">全部模块</span>
        <svg class="dot-group-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </button>
      <div class="desk-nav-actions">
        <button type="button" aria-label="搜索或跳转" title="搜索或跳转" @click="openPalette()">
          <svg class="desk-nav-action-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3" /><path d="m15.5 15.5 4.3 4.3" /></svg>
          <span class="desk-nav-action-label">搜索</span>
        </button>
        <button type="button" aria-label="外观与显示" title="外观与显示" @click="openSettings()">
          <svg class="desk-nav-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-5 2v4" /></svg>
          <span class="desk-nav-action-label">外观</span>
        </button>
        <button ref="moduleManagerTrigger" type="button" aria-label="管理模块" :title="`管理模块：${visibleModuleCount}/${allModules.length}`" aria-controls="module-manager" :aria-expanded="moduleManagerOpen" @click="openModuleManager()">
          <svg class="desk-nav-action-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>
          <span class="desk-nav-action-label">模块</span><span class="desk-nav-action-count">{{ visibleModuleCount }}/{{ allModules.length }}</span>
        </button>
      </div>
    </nav>

    <aside
      v-if="allModulesOpen"
      id="module-submenu-flyout"
      ref="submenuFlyout"
      class="dot-submenu-flyout"
      :style="{ top: `${submenuFlyoutTop}px` }"
      role="region"
      aria-label="全部模块"
    >
      <header class="dot-submenu-head">
        <div>
          <h2>全部模块</h2>
          <p>{{ visibleModuleCount }} 个可用模块</p>
        </div>
        <button type="button" class="dot-submenu-close" aria-label="收起二级菜单" title="收起菜单（Esc）" @click="closeNavigationSubmenu(true)">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 3-5 5 5 5" /></svg>
        </button>
      </header>
      <div class="dot-submenu-items">
        <section v-for="group in allNavigationGroups" :key="group.id" class="dot-submenu-group" :aria-label="group.label">
          <h3>{{ group.label }}</h3>
          <button
            v-for="item in group.items"
            :key="item.path"
            class="dot-submenu-item"
            :class="{ active: activeIndex === item.index }"
            :aria-current="activeIndex === item.index ? 'page' : undefined"
            :title="item.label"
            @click="gotoModule(item.index); closeNavigationSubmenu()"
          >
            <svg class="dot-submenu-icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="navigationItemIconPaths[item.icon] || navigationItemIconPaths['≡']" /></svg>
            <span>{{ item.label }}</span>
          </button>
        </section>
      </div>
    </aside>

    <div v-if="moduleManagerOpen" class="module-manager-backdrop" @click.self="closeModuleManager()">
      <section id="module-manager" ref="moduleManagerPanel" class="module-manager" role="dialog" aria-modal="true" aria-labelledby="module-manager-title" @keydown="onModuleManagerKeydown">
        <header class="module-manager-header">
          <div>
            <h2 id="module-manager-title">显示哪些模块</h2>
            <p>勾选可将模块加入全部模块；星标可将它固定到侧边栏快速入口。</p>
          </div>
          <button class="module-manager-close" aria-label="关闭模块管理" @click="closeModuleManager()">×</button>
        </header>
        <div class="module-manager-actions">
          <span>已显示 {{ visibleModuleCount }} / {{ allModules.length }} · 快捷入口 {{ quickEntryPaths.length }}</span>
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
              <button
                class="module-manager-shortcut"
                type="button"
                :data-quick-entry-toggle="item.path"
                :aria-label="`${quickEntryPaths.includes(item.path) ? '从快捷入口移除' : '添加到快捷入口'}：${item.label}`"
                :aria-pressed="quickEntryPaths.includes(item.path)"
                :title="quickEntryPaths.includes(item.path) ? '从侧边栏快捷入口移除' : '添加到侧边栏快捷入口'"
                @click="toggleQuickEntry(item.path)"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m8 1.6 1.9 3.9 4.3.6-3.1 3.1.7 4.4L8 11.5l-3.8 2.1.7-4.4-3.1-3.1 4.3-.6L8 1.6Z" /></svg>
                <span>快捷</span>
              </button>
              <button class="module-manager-open" :aria-label="`打开${item.label}`" @click="openModulePath(item.path)">打开</button>
            </div>
          </section>
        </div>
      </section>
    </div>

    <div class="counter"><span>{{ counterLabel }}</span> <em>/ {{ String(total).padStart(2, '0') }}</em></div>
    <p class="tip">滚轮滚动内容 · <kbd>H</kbd> 分层 · <kbd>M</kbd> 模式 · <kbd>Ctrl/⌘ K</kbd> 命令</p>
  </div>
</template>
