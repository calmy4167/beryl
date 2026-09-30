import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { readSession } from '@/core/auth'
import { legacyTargetFor } from '@/domain/legacy/migration'
import { appRouteDefinitions } from '@/router/route-manifest'
import { vuePageRegistry } from '@/vue/page-registry'

const pendingPage = () => import('@/vue/pages/MigrationPendingPage.vue')

const pageComponents: Record<string, () => Promise<unknown>> = {
    today: () => import('@/vue/pages/TodayPage.vue'),
  capture: () => import('@/vue/pages/CapturePage.vue'),
  matters: () => import('@/vue/pages/MattersPage.vue'),
  matterDetail: () => import('@/vue/pages/MatterDetailPage.vue'),
  review: () => import('@/vue/pages/ReviewPage.vue'),
  cycle: () => import('@/vue/pages/CyclePage.vue'),
  flow: () => import('@/vue/pages/FlowPage.vue'),
  profile: () => import('@/vue/pages/ProfilePage.vue'),
  memory: () => import('@/vue/pages/MemoryPage.vue'),
  future: () => import('@/vue/pages/FuturePage.vue'),
  admin: () => import('@/vue/pages/AdminPage.vue'),
  advancedAdmin: () => import('@/vue/pages/AdminPage.vue'),
  calendar: () => import('@/vue/pages/CalendarPage.vue'),
  people: () => import('@/vue/pages/PeoplePage.vue'),
  masterData: () => import('@/vue/pages/MasterDataPage.vue'),
  userManagement: () => import('@/vue/pages/UserAdminPage.vue'),
  library: () => import('@/vue/pages/LibraryPage.vue'),
  graph: () => import('@/vue/pages/GraphPage.vue'),
  inbox: () => import('@/vue/pages/InboxPage.vue'),
  tasks: () => import('@/vue/pages/TasksPage.vue'),
  taskBoard: () => import('@/vue/pages/TaskBoardPage.vue'),
  feishu: () => import('@/vue/pages/FeishuPage.vue'),
  habits: () => import('@/vue/pages/HabitsPage.vue'),
  finance: () => import('@/vue/pages/FinancePage.vue'),
  goals: () => import('@/vue/pages/GoalsPage.vue'),
  pomo: () => import('@/vue/pages/PomoPage.vue'),
  diary: () => import('@/vue/pages/DiaryPage.vue'),
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
      title: page?.title || (route.pageId ? 'Calmy' : '模块入口'),
      description: page?.description || '',
      archetype: page?.archetype,
      shell: page?.shell || 'app',
      adminOnly: page?.adminOnly || false,
    },
  }
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: () => readSession() ? '/app/today' : '/login' },
    { path: '/login', name: 'login', component: () => import('@/vue/pages/LoginPage.vue') },
    { path: '/pass', name: 'pass', component: () => import('@/vue/pages/PassPage.vue') },
    { path: '/vault', name: 'vault', component: () => import('@/vue/pages/VaultPage.vue') },
    {
      path: '/app',
      name: 'app',
      component: () => import('@/vue/shell/AppShell.vue'),
      children: appRouteDefinitions.map(appChildRoute),
    },
    ...vuePageRegistry
      .filter(page => page.shell === 'standalone')
      .map(page => ({
        path: page.path,
        name: page.id,
        component: pageComponents[page.viewKey] || pendingPage,
        meta: { pageId: page.id, title: page.title, description: page.description || '', archetype: page.archetype, shell: page.shell, adminOnly: page.adminOnly || false },
      })),
    { path: '/:pathMatch(.*)*', redirect: () => readSession() ? '/app/today' : '/login' },
  ],
})

router.beforeEach(async (to, from) => {
  const session = readSession()
  const isAppRoute = to.path.startsWith('/app') || to.path === '/scene'
  if (isAppRoute && !session) return { path: '/login', replace: true }
  if ((isAppRoute || to.path === '/vault' || to.path === '/pass') && !session) return { path: '/login', replace: true }
  if (isAppRoute && session?.mustChangePassword) return { path: '/pass', query: { mode: 'first' }, replace: true }
  if (to.meta.adminOnly && session?.user?.role !== 'admin') return { path: '/app/today', replace: true }

  if (to.path === '/pass' && (from.path === '/app/admin' || from.path === '/app/admin/advanced')) {
    return { path: '/app/today', replace: true }
  }

  return true
})

export default router
