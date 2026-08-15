<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SCENES, currentSceneId, applySceneTheme } from '@/core/scenes'
import { MODS, catsFor } from '@/core/modules'
import { readSession } from '@/core/auth'

const route = useRoute()
const router = useRouter()
const scene = ref(SCENES[currentSceneId()])
const avatar = ref('U')
const dark = ref(document.documentElement.classList.contains('dark'))
/* 触屏设备（手机/平板）一律使用移动布局（顶栏 + 抽屉），避免侧边栏占屏 */
const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
const wide = ref(window.innerWidth >= 768 && !isTouch)
const drawer = ref(false)
const collapsed = ref(false)

try { collapsed.value = localStorage.getItem('b_side') === '1' } catch { /* ignore */ }

/* 十神分类（一级菜单），去掉「全部」重复分类 */
const cats = computed(() => catsFor(currentSceneId()).filter(c => c.id !== 'all'))
const activeId = computed(() => {
  if (route.name === 'home') return 'home'
  if (route.name === 'module') return String(route.params.id || '')
  if (route.name === 'admin') return 'admin'
  return ''
})

/* ---- 二级菜单展开状态（持久化 b_nav_open） ---- */
const openGroups = ref<Record<string, boolean>>({})
try {
  Object.assign(openGroups.value, JSON.parse(localStorage.getItem('b_nav_open') || '{}'))
} catch { /* ignore */ }

function persistOpen() {
  try { localStorage.setItem('b_nav_open', JSON.stringify(openGroups.value)) } catch { /* ignore */ }
}
function toggleGroup(id: string) {
  openGroups.value[id] = !openGroups.value[id]
  persistOpen()
}
/** 当前激活模块所属分类自动展开（保证激活项可见） */
watch(activeId, (id) => {
  const cat = cats.value.find(c => c.mods.includes(id))
  if (cat && !openGroups.value[cat.id]) {
    openGroups.value[cat.id] = true
    persistOpen()
  }
})

function toggleTheme() {
  dark.value = !dark.value
  document.documentElement.classList.toggle('dark', dark.value)
  try { localStorage.setItem('b_theme', dark.value ? 'dark' : 'light') } catch { /* ignore */ }
}
function toggleCollapse() {
  collapsed.value = !collapsed.value
  try { localStorage.setItem('b_side', collapsed.value ? '1' : '0') } catch { /* ignore */ }
}
function go(path: string) {
  drawer.value = false
  router.push(path)
}
function onResize() {
  wide.value = window.innerWidth >= 768 && !isTouch
}

onMounted(() => {
  applySceneTheme(scene.value.id)
  const s = readSession()
  if (s) avatar.value = (s.u[0] || 'U').toUpperCase()
  window.addEventListener('resize', onResize)
  // 初始：激活模块所在分类自动展开
  const cat = cats.value.find(c => c.mods.includes(activeId.value))
  if (cat && !openGroups.value[cat.id]) { openGroups.value[cat.id] = true; persistOpen() }
})
onUnmounted(() => window.removeEventListener('resize', onResize))

const visibleMods = (catId: string) => cats.value.find(c => c.id === catId)?.mods.filter(m => scene.value.mods.includes(m)) || []
const isOpen = (id: string) => collapsed.value || !!openGroups.value[id]
</script>

<template>
  <div class="shell">
    <!-- 桌面侧边栏（可折叠，一级/二级菜单） -->
    <aside v-if="wide" class="side" :class="{ collapsed }">
      <div class="side-head">
        <span class="brand-badge font-title">B</span>
        <div class="side-brand">
          <span class="font-title brand-name">beryl</span>
          <span class="scene-tag" :style="{ color: scene.color, borderColor: scene.color + '66', background: scene.color + '1a' }">{{ scene.icon }} {{ scene.name }}</span>
        </div>
        <button class="collapse-btn" :title="collapsed ? '展开侧边栏' : '折叠侧边栏'" @click="toggleCollapse">{{ collapsed ? '»' : '«' }}</button>
      </div>

      <nav class="side-nav">
        <!-- 一级：首页 -->
        <button class="nav-item lv1" :class="{ on: activeId === 'home' }" @click="go('/app/home')" title="首页">
          <span class="nav-icon">🏠</span><span class="nav-label">首页</span>
        </button>

        <!-- 一级：十神分类（可展开）→ 二级：模块 -->
        <div v-for="c in cats" :key="c.id" class="nav-group">
          <button class="nav-item lv1" :class="{ open: isOpen(c.id) }" @click="toggleGroup(c.id)" :title="c.name">
            <span class="caret" :class="{ open: isOpen(c.id) }">▸</span>
            <span class="nav-icon">{{ c.icon }}</span>
            <span class="nav-label">{{ c.name }}</span>
            <span class="lv1-count">{{ visibleMods(c.id).length }}</span>
          </button>
          <div class="nav-sub" :class="{ open: isOpen(c.id) }">
            <div class="nav-sub-inner">
              <button
                v-for="m in visibleMods(c.id)"
                :key="m"
                class="nav-item lv2"
                :class="{ on: activeId === m }"
                :title="MODS[m].name"
                @click="go('/app/module/' + m)"
              >
                <span class="nav-dot" :style="{ background: MODS[m].color }" />
                <span class="nav-icon">{{ MODS[m].icon }}</span>
                <span class="nav-label">{{ MODS[m].name }}</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div class="side-foot">
        <button class="nav-item lv1" :class="{ on: activeId === 'admin' }" @click="go('/app/admin')" title="后台管理">
          <span class="nav-icon">⚙️</span><span class="nav-label">后台管理</span>
        </button>
        <button class="nav-item lv1" @click="go('/scene')" title="切换场景">
          <span class="nav-icon">🎭</span><span class="nav-label">切换场景</span>
        </button>
        <button class="nav-item lv1" @click="toggleTheme" :title="dark ? '切换到浅色' : '切换到深色'">
          <span class="nav-icon">{{ dark ? '☀️' : '🌙' }}</span><span class="nav-label">{{ dark ? '浅色模式' : '深色模式' }}</span>
        </button>
      </div>
    </aside>

    <!-- 移动端顶栏 -->
    <header v-else class="topbar">
      <div class="inner">
        <div class="left">
          <el-button circle text @click="drawer = true" title="打开导航">☰</el-button>
          <span class="brand-badge font-title">B</span>
          <span class="font-title brand-name">beryl</span>
        </div>
        <div class="right">
          <el-button circle text @click="toggleTheme" :title="dark ? '切换到浅色' : '切换到深色'">{{ dark ? '☀️' : '🌙' }}</el-button>
          <span class="avatar">{{ avatar }}</span>
        </div>
      </div>
    </header>

    <main class="page-container">
      <RouterView />
    </main>

    <!-- 移动端导航抽屉（同层级结构） -->
    <el-drawer v-model="drawer" direction="ltr" size="min(82vw, 280px)" :with-header="false">
      <div class="side side-static">
        <div class="side-head">
          <span class="brand-badge font-title">B</span>
          <div class="side-brand">
            <span class="font-title brand-name">beryl</span>
            <span class="scene-tag" :style="{ color: scene.color, borderColor: scene.color + '66', background: scene.color + '1a' }">{{ scene.icon }} {{ scene.name }}</span>
          </div>
        </div>
        <nav class="side-nav">
          <button class="nav-item lv1" :class="{ on: activeId === 'home' }" @click="go('/app/home')">
            <span class="nav-icon">🏠</span><span class="nav-label">首页</span>
          </button>
          <div v-for="c in cats" :key="c.id" class="nav-group">
            <button class="nav-item lv1" :class="{ open: openGroups[c.id] }" @click="toggleGroup(c.id)">
              <span class="caret" :class="{ open: openGroups[c.id] }">▸</span>
              <span class="nav-icon">{{ c.icon }}</span>
              <span class="nav-label">{{ c.name }}</span>
              <span class="lv1-count">{{ visibleMods(c.id).length }}</span>
            </button>
            <div class="nav-sub" :class="{ open: openGroups[c.id] }">
              <div class="nav-sub-inner">
                <button
                  v-for="m in visibleMods(c.id)"
                  :key="m"
                  class="nav-item lv2"
                  :class="{ on: activeId === m }"
                  @click="go('/app/module/' + m)"
                >
                  <span class="nav-dot" :style="{ background: MODS[m].color }" />
                  <span class="nav-icon">{{ MODS[m].icon }}</span>
                  <span class="nav-label">{{ MODS[m].name }}</span>
                </button>
              </div>
            </div>
          </div>
        </nav>
        <div class="side-foot">
          <button class="nav-item lv1" @click="go('/app/admin')"><span class="nav-icon">⚙️</span><span class="nav-label">后台管理</span></button>
          <button class="nav-item lv1" @click="go('/scene')"><span class="nav-icon">🎭</span><span class="nav-label">切换场景</span></button>
          <button class="nav-item lv1" @click="toggleTheme"><span class="nav-icon">{{ dark ? '☀️' : '🌙' }}</span><span class="nav-label">{{ dark ? '浅色模式' : '深色模式' }}</span></button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.shell { min-height: 100vh; display: flex; }

/* ---- 侧边栏 ---- */
.side {
  width: 232px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--c-bg-soft);
  border-right: 1px solid var(--c-border-soft);
  transition: width .2s ease;
}
.side-static { position: static; height: 100%; width: 100%; border-right: none; transition: none; }

/* 折叠态：窄栏只留图标，二级直接平铺图标 */
.side.collapsed { width: 64px; }
.side.collapsed .side-head { flex-direction: column; gap: 8px; padding: 16px 0 10px; }
.side.collapsed .side-brand,
.side.collapsed .nav-label,
.side.collapsed .lv1-count,
.side.collapsed .caret { display: none; }
.side.collapsed .nav-item { justify-content: center; padding: 9px 0; }
.side.collapsed .nav-dot { display: none; }
.side.collapsed .nav-sub { grid-template-rows: 1fr; margin-left: 0; padding-left: 0; border-left: none; }
.side.collapsed .nav-sub-inner { padding: 0; }

.side-head { display: flex; align-items: center; gap: 10px; padding: 16px 12px 12px; }
.side-brand { display: flex; flex-direction: column; gap: 3px; overflow: hidden; white-space: nowrap; flex: 1; min-width: 0; }
.brand-badge {
  width: 32px; height: 32px; border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  color: var(--scene); background: var(--scene-soft); border: 1px solid var(--scene-border);
  font-size: 15px;
  flex-shrink: 0;
}
.brand-name { font-weight: 700; letter-spacing: 0.05em; font-size: 15px; line-height: 1; }
.scene-tag { font-size: 10px; padding: 2px 8px; border-radius: 999px; width: fit-content; }
.collapse-btn {
  width: 28px; height: 28px;
  border-radius: 8px;
  border: 1px solid var(--c-border-soft);
  background: transparent;
  color: var(--c-text-3);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: all .15s ease;
}
.collapse-btn:hover { color: var(--scene); border-color: var(--scene-border); background: var(--scene-soft); }

.side-nav { flex: 1; overflow-y: auto; padding: 4px 8px 8px; }

/* ---- 导航项基础 ---- */
.nav-item {
  display: flex; align-items: center; gap: 8px;
  width: 100%;
  padding: 7px 10px;
  margin: 1px 0;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--c-text-2);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  white-space: nowrap;
  transition: background .15s ease, color .15s ease;
}
.nav-item:hover { background: var(--c-hover); color: var(--c-text); }
.nav-item.on {
  background: var(--scene-soft);
  border-color: var(--scene-border-soft);
  color: var(--scene);
  font-weight: 600;
  box-shadow: inset 2px 0 0 var(--scene);
}

/* ---- 一级菜单 ---- */
.nav-item.lv1 { font-size: 12px; font-weight: 600; letter-spacing: 0.02em; }
.nav-item.lv1.open { color: var(--c-text); }
.caret {
  width: 12px;
  flex-shrink: 0;
  font-size: 9px;
  color: var(--c-text-3);
  transition: transform .18s ease;
}
.caret.open { transform: rotate(90deg); }
.lv1-count {
  margin-left: auto;
  font-size: 9px;
  color: var(--c-text-3);
  background: var(--c-bg-2);
  border-radius: 999px;
  padding: 1px 7px;
  flex-shrink: 0;
}

/* ---- 二级菜单：缩进 + 竖线 + 展开过渡 ---- */
.nav-sub {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows .2s ease;
  margin-left: 15px;
  padding-left: 10px;
  border-left: 1px solid var(--c-border-soft);
}
.nav-sub.open { grid-template-rows: 1fr; }
.nav-sub-inner { overflow: hidden; min-height: 0; }
.nav-item.lv2 { font-size: 12.5px; padding-left: 6px; }
.nav-item.lv2 .nav-dot { width: 6px; height: 6px; }
.nav-item.lv2.on { color: var(--scene); }

.nav-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.nav-icon { width: 18px; text-align: center; flex-shrink: 0; }
.nav-label { overflow: hidden; text-overflow: ellipsis; }

.side-foot { border-top: 1px solid var(--c-border-soft); padding: 8px; }

/* ---- 移动端顶栏 ---- */
.topbar {
  position: sticky; top: 0; z-index: 40;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background: var(--c-topbar);
  border-bottom: 1px solid var(--c-border-soft);
}
.inner { max-width: 960px; margin: 0 auto; padding: 0 12px; height: 52px; display: flex; align-items: center; justify-content: space-between; }
.left { display: flex; align-items: center; gap: 8px; }
.right { display: flex; align-items: center; gap: 6px; }
.avatar {
  width: 30px; height: 30px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 13px;
  color: var(--scene); background: var(--scene-soft); border: 1px solid var(--scene-border-strong);
}
</style>
