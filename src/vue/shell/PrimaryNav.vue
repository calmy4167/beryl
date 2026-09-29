<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { desktopNavigationGroups, type DesktopNavigationGroupId } from '@/router/navigation'
import NavigationPageIcon from './NavigationPageIcon.vue'

const props = defineProps<{ activePath: string; collapsed: boolean; directoryOpen?: boolean }>()
const emit = defineEmits<{
  navigate: [path: string]
  toggle: []
  search: [focusReturn?: HTMLElement]
  directory: [trigger: HTMLButtonElement, focusReturn?: HTMLElement]
  immersive: []
}>()

function groupForPath(path: string): DesktopNavigationGroupId {
  return desktopNavigationGroups.find(group => group.items.some(item => path === item.path || path.startsWith(`${item.path}/`)))?.id ?? 'daily'
}

const selectedGroupId = ref<DesktopNavigationGroupId>(groupForPath(props.activePath))
const openGroupId = ref<DesktopNavigationGroupId | null>(null)
const navRoot = ref<HTMLElement>()
const anchor = ref({ left: 242, top: 12, maxHeight: 480 })
const selectedGroup = computed(() => desktopNavigationGroups.find(group => group.id === selectedGroupId.value) ?? desktopNavigationGroups[0])
const panelOpen = computed(() => openGroupId.value === selectedGroupId.value)

watch(() => props.activePath, path => {
  selectedGroupId.value = groupForPath(path)
  openGroupId.value = null
})

function onPointerDown(event: PointerEvent): void {
  if (!openGroupId.value || props.directoryOpen) return
  const target = event.target
  if (!(target instanceof Element) || !target.closest('#secondary-navigation, #navigation-group-rail')) openGroupId.value = null
}
function onKeyDown(event: KeyboardEvent): void {
  const groupId = openGroupId.value
  if (!groupId || event.key !== 'Escape') return
  event.preventDefault()
  openGroupId.value = null
  navRoot.value?.querySelector<HTMLButtonElement>(`#navigation-group-rail [data-group-id="${groupId}"]`)?.focus()
}
onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('keydown', onKeyDown)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onKeyDown)
})

function toggleGroup(groupId: DesktopNavigationGroupId, event: MouseEvent): void {
  if (openGroupId.value === groupId) {
    openGroupId.value = null
    return
  }
  selectedGroupId.value = groupId
  const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect()
  const group = desktopNavigationGroups.find(item => item.id === groupId) ?? desktopNavigationGroups[0]
  const estimatedHeight = Math.min(Math.max(240, group.items.length * 44 + 118), Math.max(240, window.innerHeight - 24))
  const top = Math.min(Math.max(12, Math.round(rect.top)), Math.max(12, window.innerHeight - estimatedHeight - 12))
  anchor.value = { left: Math.round(rect.right + 10), top, maxHeight: Math.max(240, window.innerHeight - top - 12) }
  openGroupId.value = groupId
}

function closeAfterNavigate(path: string): void {
  openGroupId.value = null
  emit('navigate', path)
}

function openSearch(): void {
  openGroupId.value = null
  emit('search', document.activeElement instanceof HTMLElement ? document.activeElement : undefined)
}
</script>

<template>
  <aside ref="navRoot" id="app-sidebar" class="sidebar" :data-active-route="groupForPath(activePath)" :data-selected-group="selectedGroupId" :aria-label="collapsed ? '已收起的主导航' : '主导航侧边栏'">
    <section class="primary-rail" aria-label="功能分组">
      <div class="primary-rail-header">
        <button class="rail-brand" type="button" aria-label="返回今天" title="返回今天" @click="emit('navigate', '/app/today')">
          <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false"><path d="M15.9 25.9c-5.8-1.4-9.1-5.6-9.1-11.3 5.8.1 9.4 2.6 10.4 7.4 1.2-6.3 5.1-10.1 11.4-11.3.5 8.7-3.8 14.1-11.1 15.4v2h-1.6z" fill="currentColor"/><path d="M8.3 7.4c4.7.2 7.8 2.8 8.7 7.2-5.3-.3-8.1-2.6-8.7-7.2z" fill="currentColor" opacity=".58"/></svg></span><span class="rail-brand-label">CALMY</span>
        </button>
        <button class="sidebar-toggle" type="button" :aria-label="collapsed ? '展开左侧菜单' : '收起左侧菜单'" :title="collapsed ? '展开左侧菜单' : '收起左侧菜单'" :aria-expanded="!collapsed" @click="emit('toggle')">
          <svg :class="{ 'is-collapsed': collapsed }" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4-8 8 8 8" /></svg>
        </button>
      </div>
      <nav id="navigation-group-rail" class="navigation-group-rail" aria-label="功能分组导航" :data-active-index="desktopNavigationGroups.findIndex(group => group.id === selectedGroupId)" :style="{ '--nav-active-index': Math.max(0, desktopNavigationGroups.findIndex(group => group.id === selectedGroupId)) }">
        <span class="nav-active-track" aria-hidden="true" />
        <button
          v-for="group in desktopNavigationGroups"
          :key="group.id"
          type="button"
          :class="{ on: selectedGroupId === group.id }"
          :data-group-id="group.id"
          :aria-label="`${group.label}菜单`"
          :title="`${openGroupId === group.id ? '收起' : '展开'}${group.label}菜单`"
          :aria-pressed="selectedGroupId === group.id"
          :aria-expanded="openGroupId === group.id"
          aria-controls="secondary-navigation"
          @click="toggleGroup(group.id, $event)"
        >
          <i aria-hidden="true"><svg viewBox="0 0 24 24"><template v-if="group.id === 'daily'"><path d="m4 10 8-6 8 6v9H5v-9"/><path d="M9 19v-6h6v6"/></template><template v-else-if="group.id === 'work'"><rect x="4" y="6" width="16" height="13" rx="2"/><path d="M9 6V4h6v2M4 11h16"/></template><template v-else-if="group.id === 'records'"><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 12h6M9 16h6"/></template><template v-else-if="group.id === 'understanding'"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="7" r="2"/><path d="M3.5 19c.6-3.6 2.1-5.4 4.5-5.4s3.9 1.8 4.5 5.4M14 14c2.8-.7 4.7.7 5.6 4"/></template><template v-else-if="group.id === 'daily-tools'"><path d="m14.5 5.5 4 4M4 20l5.5-1.5L19 9l-4-4-9.5 9.5z"/><path d="m12 8 4 4"/></template><template v-else-if="group.id === 'experiments'"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><path d="M8 15h8"/></template><template v-else><circle cx="12" cy="8" r="4"/><path d="M5 21c.8-4.4 3.1-6.6 7-6.6s6.2 2.2 7 6.6"/></template></svg></i>
          <span>{{ group.label }}</span><svg class="group-disclosure" :class="{ 'is-open': openGroupId === group.id }" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
        </button>
      </nav>
      <div class="primary-rail-foot">
        <button class="immersive-entry" type="button" aria-label="进入沉浸模式" title="进入沉浸模式" @click="emit('immersive')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H5a1 1 0 0 0-1 1v3m12-4h3a1 1 0 0 1 1 1v3M4 16v3a1 1 0 0 0 1 1h3m12-4v3a1 1 0 0 1-1 1h-3"/></svg></button>
        <button type="button" aria-label="设置" title="设置" @click="emit('navigate', '/app/admin')"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg></button>
      </div>
    </section>

    <section id="secondary-navigation" class="secondary-sidebar" :class="{ 'is-open': panelOpen }" :aria-label="`${selectedGroup.label}页面`" :aria-hidden="panelOpen ? undefined : 'true'" :style="{ left: `${anchor.left}px`, top: `${anchor.top}px`, maxHeight: `${anchor.maxHeight}px` }">
      <header class="secondary-sidebar-header"><h2 class="secondary-sidebar-title">{{ selectedGroup.label }}</h2><button type="button" aria-label="搜索内容" title="搜索内容" :tabindex="panelOpen ? undefined : -1" @click="openSearch"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg></button></header>
      <nav class="secondary-nav" :aria-label="`${selectedGroup.label}页面列表`">
        <button v-for="item in selectedGroup.items" :key="item.path" type="button" :data-path="item.path" :class="{ on: activePath === item.path || activePath.startsWith(`${item.path}/`) }" :aria-current="activePath === item.path || activePath.startsWith(`${item.path}/`) ? 'page' : undefined" :title="item.label" :tabindex="panelOpen ? undefined : -1" @click="closeAfterNavigate(item.path)"><i aria-hidden="true"><NavigationPageIcon :path="item.path" /></i><span>{{ item.label }}</span></button>
      </nav>
      <div class="secondary-sidebar-foot"><button type="button" class="feature-group-button" aria-label="打开全部功能" title="打开全部功能" aria-haspopup="menu" aria-controls="more-drawer" :aria-expanded="directoryOpen || false" :tabindex="panelOpen ? undefined : -1" @click="emit('directory', $event.currentTarget as HTMLButtonElement)"><i aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="5" height="5" rx="1"/><rect x="15" y="4" width="5" height="5" rx="1"/><rect x="4" y="15" width="5" height="5" rx="1"/><rect x="15" y="15" width="5" height="5" rx="1"/></svg></i><span>全部功能</span></button></div>
    </section>
  </aside>
</template>
