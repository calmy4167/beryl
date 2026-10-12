import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { readSession } from '@/core/auth'
import { hasUnlockedVault } from '@/core/vault-keys'
import { legacyTargetFor } from '@/domain/legacy/migration'
import { appRouteDefinitions } from '@/router/route-manifest'
import { vuePageRegistry } from '@/vue/page-registry'

const pendingPage = () => import('@/vue/pages/MigrationPendingPage.vue')

const pageComponents: Record<string, () => Promise<unknown>> = {
  desk: () => import('@/vue/pages/DeskPage.vue'),
  deskHistory: () => import('@/vue/pages/desk/DeskRecordsPage.vue'),
  // 「留白」v11 迁移页：总览已迁完，其余页面迁一个换一个
  today: () => import('@/vue/pages/LiubaiToday.vue'),
  capture: () => import('@/vue/pages/LiubaiCapture.vue'),
  matters: () => import('@/vue/pages/LiubaiMatters.vue'),
  matterDetail: () => import('@/vue/pages/MatterDetailPage.vue'),
  review: () => import('@/vue/pages/LiubaiReview.vue'),
  cycle: () => import('@/vue/pages/CyclePage.vue'),
  flow: () => import('@/vue/pages/FlowPage.vue'),
  profile: () => import('@/vue/pages/ProfilePage.vue'),
  memory: () => import('@/vue/pages/MemoryPage.vue'),
  future: () => import('@/vue/pages/FuturePage.vue'),
  admin: () => import('@/vue/pages/AdminPage.vue'),
  advancedAdmin: () => import('@/vue/pages/AdminPage.vue'),
  calendar: () => import('@/vue/pages/CalendarPage.vue'),
  people: () => import('@/vue/pages/PeoplePage.vue'),
  realityScenes: () => import('@/vue/pages/RealityScenesPage.vue'),
  realityContext: () => import('@/vue/pages/RealityContextPage.vue'),
  masterData: () => import('@/vue/pages/MasterDataPage.vue'),
  systemAdmin: () => import('@/vue/pages/SystemAdminPage.vue'),
  library: () => import('@/vue/pages/LibraryPage.vue'),
  graph: () => import('@/vue/pages/GraphPage.vue'),
  inbox: () => import('@/vue/pages/InboxPage.vue'),
  tasks: () => import('@/vue/pages/LiubaiTasks.vue'),
  taskBoard: () => import('@/vue/pages/TaskBoardPage.vue'),
  feishu: () => import('@/vue/pages/FeishuPage.vue'),
  habits: () => import('@/vue/pages/LiubaiHabits.vue'),
  finance: () => import('@/vue/pages/FinancePage.vue'),
  goals: () => import('@/vue/pages/GoalsPage.vue'),
  pomo: () => import('@/vue/pages/LiubaiPomo.vue'),
  diary: () => import('@/vue/pages/LiubaiDiary.vue'),
  posts: () => import('@/vue/pages/PostsPage.vue'),
  scene: () => import('@/vue/pages/ScenePage.vue'),
  moduleFallback: () => import('@/vue/pages/CompatibilityPlaceholderPage.vue'),
  fallback: () => import('@/vue/pages/CompatibilityPlaceholderPage.vue'),
}

const pageById = new Map(vuePageRegistry.map(page => [page.id, page]))

function appChildRoute(route: (typeof appRouteDefinitions)[number]): RouteRecordRaw {
  const path = route.path === '*'
    ? ':pathMatch(.*)*'
    : route.path.endsWith('/*')
      ? `${route.path.slice(0, -2)}/:pathMatch(.*)*`
      : route.path

  if (route.kind === 'redirect') {
    return {
      path,
      name: route.path ? `legacy-${route.path.replace(/\//g, '-')}` : 'app-index-redirect',
      redirect: route.redirectTo,
    }
  }

  if (route.viewKey === 'caseRedirect') {
    return {
      path,
      name: 'case',
      redirect: to => {
        const target = legacyTargetFor('case', String(to.params.id))
        return target ? `/app/matters/${target}` : '/app/matters'
      },
    }
  }

  const page = route.pageId ? pageById.get(route.pageId) : undefined
  const props = route.viewKey === 'moduleFallback'
    ? { title: '模块入口', description: '旧模块入口已经统一收敛到 Vue 工作台。' }
    : undefined

  return {
    path,
    name: route.pageId || route.viewKey,
    component: pageComponents[route.viewKey] || pendingPage,
    ...(props ? { props } : {}),
    meta: {
      pageId: page?.id,
      title: page?.title || route.title || (route.pageId ? 'Calmy' : '模块入口'),
      description: page?.description || route.description || '',
      archetype: page?.archetype || route.archetype,
      shell: page?.shell || route.shell || 'app',
      adminOnly: page?.adminOnly || false,
    },
  }
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: () => readSession() ? '/app/desk' : '/login' },
    {
      path: '/login',
      // 登录页同样套「留白」外壳，保证全站同一套设计与外壳（未登录时隐藏模块导航）
      component: () => import('@/vue/shell/LiubaiShell.vue'),
      children: [{ path: '', name: 'login', component: () => import('@/vue/pages/LoginPage.vue') }],
    },
    { path: '/pass', name: 'pass', component: () => import('@/vue/pages/PassPage.vue') },
    { path: '/vault', name: 'vault', component: () => import('@/vue/pages/VaultPage.vue') },
    // 保留旧桌面入口，桌面页面由 app 子路由挂载到统一外壳。
    { path: '/desk', name: 'legacy-desk', redirect: '/app/desk' },
    {
      path: '/app',
      name: 'app',
      // 「留白」统一外壳：取代原 AppShell 的双壳切换（ReferenceAppShell / LegacyAppShell）
      component: () => import('@/vue/shell/LiubaiShell.vue'),
      children: appRouteDefinitions.map(appChildRoute),
    },
    // 仅开发环境：设计走查通道。未登录（无会话 / 未解锁 Vault）时 /app/* 会被守卫挡回登录页，
    // 迁移期间需要在真实浏览器里对照参考稿看外壳与已迁移页面，故留一条不鉴权的入口。
    // 生产构建里 import.meta.env.DEV 为 false，该路由不存在。
    ...(import.meta.env.DEV
      ? [{
          path: '/liubai-preview',
          component: () => import('@/vue/shell/LiubaiShell.vue'),
          children: [
            { path: 'desk', component: () => import('@/vue/pages/DeskPage.vue'), meta: { pageId: 'desk', title: '桌面', description: '先写下此刻正在面对的事情' } },
            { path: 'desk/history', component: () => import('@/vue/pages/desk/DeskRecordsPage.vue'), meta: { title: '记录', description: '按时间回看你留在桌面的内容', archetype: 'list-detail' } },
            { path: '', component: () => import('@/vue/pages/LiubaiToday.vue') },
            { path: 'tasks', component: () => import('@/vue/pages/LiubaiTasks.vue') },
            { path: 'habits', component: () => import('@/vue/pages/LiubaiHabits.vue') },
            { path: 'pomo', component: () => import('@/vue/pages/LiubaiPomo.vue') },
            { path: 'diary', component: () => import('@/vue/pages/LiubaiDiary.vue') },
            { path: 'review', component: () => import('@/vue/pages/LiubaiReview.vue') },
            { path: 'capture', component: () => import('@/vue/pages/LiubaiCapture.vue') },
            { path: 'matters', component: () => import('@/vue/pages/LiubaiMatters.vue') },
            { path: 'people', component: () => import('@/vue/pages/PeoplePage.vue') },
            { path: 'master-data', component: () => import('@/vue/pages/MasterDataPage.vue') },
            { path: 'reality-scenes', component: () => import('@/vue/pages/RealityScenesPage.vue') },
            { path: 'reality-context', component: () => import('@/vue/pages/RealityContextPage.vue') },
            { path: 'goals', component: () => import('@/vue/pages/GoalsPage.vue') },
            { path: 'finance', component: () => import('@/vue/pages/FinancePage.vue') },
            { path: 'library', component: () => import('@/vue/pages/LibraryPage.vue') },
            { path: 'graph', component: () => import('@/vue/pages/GraphPage.vue') },
            { path: 'inbox', component: () => import('@/vue/pages/InboxPage.vue') },
            { path: 'posts', component: () => import('@/vue/pages/PostsPage.vue') },
            { path: 'calendar', component: () => import('@/vue/pages/CalendarPage.vue') },
            // 「场景」在生产里是 standalone 路由（/scene，需登录），走查通道放一份免鉴权副本
            { path: 'scene', component: () => import('@/vue/pages/ScenePage.vue') },
            { path: 'profile', component: () => import('@/vue/pages/ProfilePage.vue') },
            { path: 'memory', component: () => import('@/vue/pages/MemoryPage.vue') },
            { path: 'future', component: () => import('@/vue/pages/FuturePage.vue') },
            { path: 'flow', component: () => import('@/vue/pages/FlowPage.vue') },
            { path: 'feishu', component: () => import('@/vue/pages/FeishuPage.vue') },
            // SystemAdminPage 用 path 的最后一段决定分区，所以走查通道要给它一个真实分区名
            { path: 'system/users', component: () => import('@/vue/pages/SystemAdminPage.vue') },
            // 处境详情按 id 取数据，走查通道给一个不存在的 id（展示"找不到"分支）
            { path: 'matter/:id', component: () => import('@/vue/pages/MatterDetailPage.vue') },
            { path: 'cycle', component: () => import('@/vue/pages/CyclePage.vue') },
            // 设置页已迁到 v11（自带 .slide-head + .panel），因此不再挂在 legacy/* 下
            { path: 'admin', component: () => import('@/vue/pages/AdminPage.vue') },
            { path: 'board', component: () => import('@/vue/pages/TaskBoardPage.vue') },
          ],
        }]
      : []),
    ...vuePageRegistry
      .filter(page => page.shell === 'standalone')
      .map(page => ({
        path: page.path,
        name: page.id,
        component: pageComponents[page.viewKey] || pendingPage,
        meta: { pageId: page.id, title: page.title, description: page.description || '', archetype: page.archetype, shell: page.shell, adminOnly: page.adminOnly || false },
      })),
    { path: '/:pathMatch(.*)*', redirect: () => readSession() ? '/app/desk' : '/login' },
  ],
})

router.beforeEach(async (to, from) => {
  const session = readSession()
  const isAppRoute = to.path.startsWith('/app') || to.path === '/scene' || to.path === '/desk'
  if (isAppRoute && !session) return { path: '/login', replace: true }
  if ((isAppRoute || to.path === '/vault' || to.path === '/pass') && !session) return { path: '/login', replace: true }
  if (isAppRoute && session?.mustChangePassword) return { path: '/pass', query: { mode: 'first' }, replace: true }
  if (to.meta.pageId === 'desk' && session) {
    const userId = session.user?.id
    if (typeof userId !== 'string' || !userId) return { path: '/login', replace: true }
    try {
      if (!await hasUnlockedVault(userId)) return { path: '/vault', replace: true }
    } catch {
      return { path: '/vault', replace: true }
    }
  }
  if (to.meta.adminOnly && session?.user?.role !== 'admin') return { path: '/app/desk', replace: true }

  if (to.path === '/pass' && (from.path === '/app/admin' || from.path === '/app/admin/advanced')) {
    return { path: '/app/desk', replace: true }
  }

  return true
})

export default router
