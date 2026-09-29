<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { searchAllAsync, type SearchResult } from '@/domain/search'
import { setThemeMode } from '@/ui/theme-preferences'
import { featureNavigationGroups, primaryNavigation } from '@/router/navigation'
import { closeWorkspaceTab, moveWorkspaceTab, readWorkspaceTabs, visitWorkspaceTab, writeWorkspaceTabs } from '@/router/workspace-tabs'
import { vuePageRegistry } from '@/vue/page-registry'
import PrimaryNav from './PrimaryNav.vue'
import WorkspaceTabs from './WorkspaceTabs.vue'
import ContextRail from './ContextRail.vue'

const route = useRoute()
const router = useRouter()
const currentPage = computed(() => vuePageRegistry.find(page => page.id === route.meta.pageId) ?? vuePageRegistry.find(page => route.path === page.path) ?? null)
const currentTitle = computed(() => currentPage.value?.title ?? String(route.meta.title ?? '模块入口'))
const activePath = computed(() => route.path)
const activeNav = computed(() => currentPage.value?.navigation?.kind === 'primary' ? currentPage.value.navigation.key : currentPage.value?.id ?? 'today')
const compact = ref(window.innerWidth <= 900)
const desktopWide = ref(window.innerWidth > 1360)
const compactSearch = ref(window.innerWidth <= 1100)
const collapsed = ref(localStorage.getItem('calmy_sidebar_collapsed') === '1')
const rightCollapsed = ref(localStorage.getItem('calmy_right_sidebar_collapsed') !== '0')
const sidebarWidth = ref(readWidth())
const contextWidth = ref(readContextWidth())
const tabs = ref(readWorkspaceTabs())
const saveLabel = ref('本地优先 · 离线可用')
const saveState = ref('idle')
const toastText = ref('')
const directoryOpen = ref(false)
const directoryPresentation = computed(() => compact.value ? 'drawer' : 'popover')
const directoryItemSegments = (icon: string, label: string) => [icon, ' ', label]
const directoryAnchor = ref({ left: 252, top: 12, maxHeight: 480 })
const directoryReturn = ref<HTMLElement | null>(null)
const immersive = ref(false)
const dark = ref(document.documentElement.classList.contains('dark'))
const searchOpen = ref(false)
const searchQuery = ref('')
const searchResults = ref<SearchResult[]>([])
const searchReturn = ref<HTMLElement | null>(null)
const resizing = ref(false)
let directoryFocusFrame = 0
let searchFocusFrame = 0
let searchRequestId = 0
const FOCUSABLE_SELECTOR = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

function readWidth(): number {
  const value = Number(localStorage.getItem('calmy_sidebar_width'))
  return Number.isFinite(value) && value > 0 ? Math.min(320, Math.max(196, Math.round(value))) : 232
}
function readContextWidth(): number {
  const value = Number(localStorage.getItem('calmy_context_width'))
  return Number.isFinite(value) && value > 0 ? Math.min(480, Math.max(280, Math.round(value))) : 356
}
const quickActions = computed(() => ({
  today: [{ label: '记录', hint: '先留下原话', path: '/app/capture' }],
  capture: [{ label: '处境', hint: '找到相关内容', path: '/app/matters' }],
  matters: [{ label: '回顾', hint: '记录现实反馈', path: '/app/review' }],
  review: [{ label: '今天', hint: '查看当前行动', path: '/app/today' }],
} as Record<string, Array<{ label: string; hint: string; path: string }>>)[activeNav.value] ?? [])
function trapFocus(event: KeyboardEvent, root: HTMLElement | null): void {
  if (!root || event.key !== 'Tab') return
  const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(item => item.offsetParent !== null)
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
function go(path: string): void { directoryOpen.value = false; void router.push(path) }
function toggleSidebar(): void {
  if (compact.value) return
  collapsed.value = !collapsed.value
  localStorage.setItem('calmy_sidebar_collapsed', collapsed.value ? '1' : '0')
}
function toggleRightSidebar(): void {
  if (!desktopWide.value) { openDirectory(); return }
  rightCollapsed.value = !rightCollapsed.value
  localStorage.setItem('calmy_right_sidebar_collapsed', rightCollapsed.value ? '1' : '0')
}
function resizeContextStart(event: PointerEvent): void {
  if (rightCollapsed.value || event.button !== 0) return
  resizing.value = true
  const startX = event.clientX
  const startWidth = contextWidth.value
  document.documentElement.classList.add('shell-is-resizing')
  const move = (next: PointerEvent) => {
    contextWidth.value = Math.min(480, Math.max(280, Math.round(startWidth + startX - next.clientX)))
    localStorage.setItem('calmy_context_width', String(contextWidth.value))
  }
  const finish = () => {
    resizing.value = false
    document.documentElement.classList.remove('shell-is-resizing')
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', finish, { once: true })
  window.addEventListener('pointercancel', finish, { once: true })
  event.preventDefault()
}
function resizeContextKey(event: KeyboardEvent): void {
  if (rightCollapsed.value) return
  if (event.key === 'Home') contextWidth.value = 280
  else if (event.key === 'End') contextWidth.value = 480
  else if (event.key === 'ArrowLeft') contextWidth.value = Math.min(480, contextWidth.value + (event.shiftKey ? 24 : 8))
  else if (event.key === 'ArrowRight') contextWidth.value = Math.max(280, contextWidth.value - (event.shiftKey ? 24 : 8))
  else return
  localStorage.setItem('calmy_context_width', String(contextWidth.value))
  event.preventDefault()
}
function openDirectory(trigger?: HTMLButtonElement, focusReturn?: HTMLElement): void {
  directoryReturn.value = focusReturn ?? trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
  if (!compact.value && trigger) {
    const rect = trigger.getBoundingClientRect()
    const top = Math.min(Math.max(12, Math.round(rect.top)), Math.max(12, window.innerHeight - 252))
    directoryAnchor.value = { left: Math.min(Math.max(12, Math.round(rect.right + 12)), Math.max(12, window.innerWidth - 372)), top, maxHeight: Math.max(240, window.innerHeight - top - 12) }
  }
  directoryOpen.value = true
}
function closeDirectory(restoreFocus = true): void {
  const returnTarget = directoryReturn.value
  directoryOpen.value = false
  if (restoreFocus) {
    const restore = () => {
      const target = returnTarget?.isConnected
        ? returnTarget
        : document.querySelector<HTMLElement>('.mobile-header .menu[aria-controls="more-drawer"]')
      target?.focus({ preventScroll: true })
    }
    restore()
    void nextTick().then(() => requestAnimationFrame(() => {
      restore()
      requestAnimationFrame(() => {
        restore()
        window.setTimeout(restore, 50)
      })
    }))
  }
}
function openSearch(focusReturn?: HTMLElement): void {
  searchReturn.value = focusReturn ?? (directoryOpen.value ? directoryReturn.value : document.activeElement instanceof HTMLElement ? document.activeElement : null)
  directoryOpen.value = false
  searchQuery.value = ''
  searchResults.value = []
  searchOpen.value = true
  void refreshSearch('')
}
function closeSearch(): void { searchOpen.value = false; searchQuery.value = ''; searchResults.value = []; searchRequestId++; requestAnimationFrame(() => searchReturn.value?.focus()) }
async function refreshSearch(query: string): Promise<void> {
  const requestId = ++searchRequestId
  const results = await searchAllAsync(query, 8)
  if (requestId === searchRequestId) searchResults.value = results
}
function enterImmersive(): void { directoryOpen.value = false; searchOpen.value = false; immersive.value = true }
function exitImmersive(): void { immersive.value = false; requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-label="进入沉浸模式"]')?.focus()) }
function toggleTheme(): void { dark.value = !dark.value; setThemeMode(dark.value ? 'dark' : 'light') }
function resizeStart(event: PointerEvent): void {
  if (collapsed.value || event.button !== 0) return
  resizing.value = true
  const startX = event.clientX
  const startWidth = sidebarWidth.value
  document.documentElement.classList.add('shell-is-resizing')
  const move = (next: PointerEvent) => {
    sidebarWidth.value = Math.min(320, Math.max(196, Math.round(startWidth + next.clientX - startX)))
    localStorage.setItem('calmy_sidebar_width', String(sidebarWidth.value))
  }
  const finish = () => {
    resizing.value = false
    document.documentElement.classList.remove('shell-is-resizing')
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', finish, { once: true })
  window.addEventListener('pointercancel', finish, { once: true })
  event.preventDefault()
}
function resizeKey(event: KeyboardEvent): void {
  if (collapsed.value) return
  const step = event.shiftKey ? 24 : 8
  if (event.key === 'Home') sidebarWidth.value = 196
  else if (event.key === 'End') sidebarWidth.value = 320
  else if (event.key === 'ArrowLeft') sidebarWidth.value = Math.max(196, sidebarWidth.value - step)
  else if (event.key === 'ArrowRight') sidebarWidth.value = Math.min(320, sidebarWidth.value + step)
  else return
  localStorage.setItem('calmy_sidebar_width', String(sidebarWidth.value))
  event.preventDefault()
}
function closeTab(path: string): void {
  const result = closeWorkspaceTab(tabs.value, path, activePath.value)
  tabs.value = result.tabs
  writeWorkspaceTabs(sessionStorage, tabs.value)
  if (result.nextPath) go(result.nextPath)
}
function reorderTab(path: string, target: string): void {
  tabs.value = moveWorkspaceTab(tabs.value, path, target)
  writeWorkspaceTabs(sessionStorage, tabs.value)
}
function onResize(): void { compact.value = window.innerWidth <= 900; desktopWide.value = window.innerWidth > 1360; compactSearch.value = window.innerWidth <= 1100 }
function onKey(event: KeyboardEvent): void {
  const target = event.target instanceof HTMLElement ? event.target : null
  const typing = !!target?.closest('input,textarea,select,[contenteditable="true"]')
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !typing) { event.preventDefault(); openSearch(); return }
  if (event.key === 'Escape') {
    if (searchOpen.value) closeSearch()
    else if (directoryOpen.value) closeDirectory()
    else if (immersive.value) exitImmersive()
  }
  if (event.key === 'Tab' && directoryOpen.value && compact.value) {
    trapFocus(event, document.querySelector<HTMLElement>('#more-drawer'))
  }
  if (searchOpen.value) trapFocus(event, document.querySelector<HTMLElement>('.search-panel'))
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b' && !typing && !compact.value && !event.shiftKey) { event.preventDefault(); toggleSidebar() }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b' && !typing && !compact.value && event.shiftKey && desktopWide.value) { event.preventDefault(); toggleRightSidebar() }
}
function onSave(event: Event): void {
  const state = (event as CustomEvent<{ state?: string }>).detail?.state
  if (!state) return
  saveState.value = state
  saveLabel.value = ({ saving: '正在保存…', saved: '已保存到本地', pending: '已保存，等待持久化', conflict: '保存冲突，需要确认', failed: '保存失败' } as Record<string, string>)[state] || '本地优先 · 离线可用'
}
function onToast(event: Event): void {
  toastText.value = (event as CustomEvent<{ message?: string }>).detail?.message || ''
  window.setTimeout(() => { toastText.value = '' }, 2600)
}

watch(() => [activePath.value, compact.value] as const, ([path]) => {
  if (!currentPage.value || currentPage.value.shell !== 'app' || compact.value) return
  tabs.value = visitWorkspaceTab(tabs.value, { path, title: currentPage.value.title, pinned: path === '/app/today' })
  writeWorkspaceTabs(sessionStorage, tabs.value)
  directoryOpen.value = false
}, { immediate: true })
watch(directoryOpen, async isOpen => {
  if (directoryFocusFrame) window.cancelAnimationFrame(directoryFocusFrame)
  directoryFocusFrame = 0
  if (!isOpen || !compact.value) return
  await nextTick()
  directoryFocusFrame = window.requestAnimationFrame(() => {
    document.querySelector<HTMLElement>('#more-drawer [data-directory-first]')?.focus()
    directoryFocusFrame = 0
  })
})
watch(searchOpen, async isOpen => {
  if (searchFocusFrame) window.cancelAnimationFrame(searchFocusFrame)
  searchFocusFrame = 0
  if (!isOpen) return
  await nextTick()
  searchFocusFrame = window.requestAnimationFrame(() => {
    document.querySelector<HTMLElement>('.search-panel .global-search')?.focus()
    searchFocusFrame = 0
  })
})
watch(searchQuery, query => { if (searchOpen.value) void refreshSearch(query) })
onMounted(() => {
  window.addEventListener('resize', onResize)
  window.addEventListener('keydown', onKey)
  window.addEventListener('beryl-save-state', onSave)
  window.addEventListener('beryl-toast', onToast)
})
onUnmounted(() => {
  if (directoryFocusFrame) window.cancelAnimationFrame(directoryFocusFrame)
  if (searchFocusFrame) window.cancelAnimationFrame(searchFocusFrame)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('beryl-save-state', onSave)
  window.removeEventListener('beryl-toast', onToast)
})
</script>

<template>
  <div class="app-shell" :class="{ 'sidebar-collapsed': collapsed, 'right-sidebar-collapsed': rightCollapsed, 'right-sidebar-expanded': !rightCollapsed }" :data-sidebar-state="collapsed ? 'collapsed' : 'expanded'" :data-context-state="rightCollapsed ? 'collapsed' : 'expanded'" :data-directory-open="directoryOpen" :data-compact="compact" :data-immersive="immersive" :style="{ '--t-sidebar-width': `${sidebarWidth}px`, '--t-context-width': `${contextWidth}px` }">
    <PrimaryNav v-if="!compact" :active-path="activePath" :collapsed="collapsed" :directory-open="directoryOpen" @navigate="go" @toggle="toggleSidebar" @search="openSearch" @directory="openDirectory" @immersive="enterImmersive" />
    <div v-if="!compact" class="shell-resize-handle shell-resize-left" role="separator" aria-orientation="vertical" aria-label="调整主导航宽度" :aria-valuemin="196" :aria-valuemax="320" :aria-valuenow="sidebarWidth" :aria-disabled="collapsed" :tabindex="collapsed ? -1 : 0" @pointerdown="resizeStart" @keydown="resizeKey"><span /></div>
    <div class="workspace-shell">
      <header v-if="!compact" class="desktop-topbar" :class="{ 'is-compact-search': compactSearch }">
        <div class="breadcrumb"><b>{{ currentTitle }}</b><span v-if="currentPage?.description">/</span><span v-if="currentPage?.description">{{ currentPage.description }}</span></div>
      <div class="topbar-actions"><button class="react-btn topbar-search" aria-label="搜索内容" @click="openSearch()"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg><span>搜索记录、处境或想法…</span><kbd>Ctrl K</kbd></button><span class="save-state" :class="`save-${saveState}`" role="status" aria-live="polite"><i />{{ saveLabel }}</span></div>
      </header>
      <header v-else class="mobile-header"><button class="brand compact" type="button" aria-label="返回今天" @click="go('/app/today')"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false"><path d="M15.9 25.9c-5.8-1.4-9.1-5.6-9.1-11.3 5.8.1 9.4 2.6 10.4 7.4 1.2-6.3 5.1-10.1 11.4-11.3.5 8.7-3.8 14.1-11.1 15.4v2h-1.6z" fill="currentColor"/><path d="M8.3 7.4c4.7.2 7.8 2.8 8.7 7.2-5.3-.3-8.1-2.6-8.7-7.2z" fill="currentColor" opacity=".58"/></svg></span><b>Calmy</b></button><div><button class="immersive-toggle" type="button" aria-label="进入沉浸模式" title="进入沉浸模式" @click="enterImmersive"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H5a1 1 0 0 0-1 1v3m12-4h3a1 1 0 0 1 1 1v3M4 16v3a1 1 0 0 0 1 1h3m12-4v3a1 1 0 0 1-1 1h-3"/></svg></button><button class="search-btn" type="button" aria-label="搜索内容" @click="openSearch()"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg></button><button class="menu" type="button" aria-label="打开功能目录" aria-haspopup="dialog" aria-controls="more-drawer" :aria-expanded="directoryOpen" @click="openDirectory($event.currentTarget as HTMLButtonElement)">功能</button></div></header>
      <WorkspaceTabs v-if="!compact" :tabs="tabs" :active-path="activePath" :save-state="saveState" @activate="go" @close="closeTab" @reorder="reorderTab" />
      <main class="page-container" :data-page-id="currentPage?.id" :data-page-archetype="currentPage?.archetype"><div :key="activePath" class="route-motion"><RouterView /></div></main>
      <div v-if="desktopWide" class="shell-resize-handle shell-resize-right" role="separator" aria-orientation="vertical" aria-label="调整情境栏宽度" :aria-valuemin="280" :aria-valuemax="480" :aria-valuenow="contextWidth" :aria-disabled="rightCollapsed" :tabindex="rightCollapsed ? -1 : 0" @pointerdown="resizeContextStart" @keydown="resizeContextKey"><span /></div>
      <ContextRail v-if="desktopWide" :collapsed="rightCollapsed" :expanded="!rightCollapsed" :actions="quickActions" @navigate="go" @toggle="toggleRightSidebar" />
    </div>
    <nav v-if="compact" class="bottom-nav mobile-only" aria-label="移动端主导航"><button v-for="item in primaryNavigation" :key="item.key" type="button" :class="['app-button', { on: activeNav === item.key }]" :aria-current="activeNav === item.key ? 'page' : undefined" :title="item.label" @click="go(item.path)"><svg viewBox="0 0 24 24" aria-hidden="true"><template v-if="item.key === 'capture'"><path d="M7 3.5h7l3 3V20H7z"/><path d="M14 3.5V7h3M10 11h4M10 15h4"/></template><template v-else-if="item.key === 'matters'"><circle cx="12" cy="12" r="8"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></template><template v-else-if="item.key === 'review'"><path d="M5 5v4h4M5.8 9a7 7 0 1 1-.4 5"/><path d="M12 8v4l2.5 1.5"/></template><template v-else><path d="m4 10 8-6 8 6v9H5v-9"/><path d="M9 19v-6h6v6"/></template></svg><span>{{item.label}}</span></button></nav>
    <div class="el-drawer-overlay" :class="directoryOpen ? 'is-open' : 'is-closed'" :data-presentation="directoryPresentation" :aria-hidden="!directoryOpen" @click="closeDirectory(false)"><div id="more-drawer" class="el-drawer" :class="directoryOpen ? 'is-open' : 'is-closed'" :data-presentation="directoryPresentation" :role="compact ? 'dialog' : 'menu'" :aria-modal="compact || undefined" aria-label="功能目录" :style="!compact ? { left: `${directoryAnchor.left}px`, top: `${directoryAnchor.top}px`, maxHeight: `${directoryAnchor.maxHeight}px` } : undefined" @click.stop><div class="drawer"><div v-if="!compact" class="directory-popover-head"><strong>全部功能</strong></div><button v-else class="drawer-close" type="button" aria-label="关闭功能目录" @click="closeDirectory()">×</button><button v-if="compact" class="brand" type="button" aria-label="返回今天" @click="go('/app/today')"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false"><path d="M15.9 25.9c-5.8-1.4-9.1-5.6-9.1-11.3 5.8.1 9.4 2.6 10.4 7.4 1.2-6.3 5.1-10.1 11.4-11.3.5 8.7-3.8 14.1-11.1 15.4v2h-1.6z" fill="currentColor"/><path d="M8.3 7.4c4.7.2 7.8 2.8 8.7 7.2-5.3-.3-8.1-2.6-8.7-7.2z" fill="currentColor" opacity=".58"/></svg></span><span><b>Calmy</b><small>现实行动系统</small></span></button><nav class="drawer-links" aria-label="按用途浏览功能"><button data-directory-first :role="compact ? undefined : 'menuitem'" @click="openSearch()">⌕ 搜索处境、行动、记录或人物</button><section v-for="group in featureNavigationGroups" :key="group.id"><p>{{ group.label }}</p><button v-for="item in group.items" :key="item.path" :role="compact ? undefined : 'menuitem'" :class="{ on: activePath === item.path }" :aria-current="activePath === item.path ? 'page' : undefined" @click="go(item.path)"><template v-for="(segment,index) in directoryItemSegments(item.icon,item.label)" :key="index">{{segment}}</template></button></section><button :role="compact ? undefined : 'menuitem'" @click="toggleTheme"><template v-for="(segment,index) in [dark ? '☀' : '◐', ' 切换外观']" :key="index">{{segment}}</template></button></nav></div></div></div>
    <div v-if="searchOpen" class="search-overlay" role="dialog" aria-modal="true" aria-label="搜索内容" @click.self="closeSearch"><div class="search-panel beryl-card"><div class="search-head">⌕ <input v-model="searchQuery" class="global-search" aria-label="搜索内容" placeholder="搜索处境、行动、记录或人物…" @keydown.esc="closeSearch" /><button type="button" aria-label="关闭搜索" @click="closeSearch">Esc</button></div><div class="search-results"><button v-for="item in searchResults" :key="`${item.type}-${item.id}`" type="button" @click="go(item.route)">◎ <span><b>{{ item.title }}</b><small>{{ item.typeLabel }} · {{ item.summary || '现实记录' }}</small></span>→</button><p v-if="!searchResults.length" class="no-results">没有匹配的内容</p></div></div></div>
    <button v-if="immersive" class="immersive-exit" type="button" aria-label="退出沉浸模式" title="退出沉浸模式（Esc）" @click="exitImmersive"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H5a1 1 0 0 0-1 1v3m12-4h3a1 1 0 0 1 1 1v3M4 16v3a1 1 0 0 0 1 1h3m12-4v3a1 1 0 0 1-1 1h-3" /></svg></button>
    <div v-if="toastText" class="toast" role="status">{{ toastText }}</div>
  </div>
</template>
