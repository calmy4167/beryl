import { createRouter, createWebHashHistory } from 'vue-router'
import { ensureAuth, readSession } from '@/core/auth'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
    { path: '/pass', name: 'pass', component: () => import('@/views/PassView.vue') },
    { path: '/scene', name: 'scene', component: () => import('@/views/SceneView.vue') },
    {
      path: '/app',
      name: 'app',
      component: () => import('@/views/AppShell.vue'),
      children: [
        { path: '', redirect: '/app/today' },
        // Home is kept as a compatibility redirect so old bookmarks do not create a second product center.
        { path: 'home', name: 'home', redirect: '/app/today' },
        { path: 'capture', name: 'capture', component: () => import('@/views/CaptureView.vue') },
        { path: 'today', name: 'today', component: () => import('@/views/TodayView.vue') },
        { path: 'review', name: 'review', component: () => import('@/views/ReviewView.vue') },
        { path: 'calendar', name: 'calendar', component: () => import('@/views/CalendarView.vue') },
        { path: 'people', name: 'people', component: () => import('@/views/PeopleView.vue') },
        { path: 'library', name: 'library', component: () => import('@/views/LibraryView.vue') },
        { path: 'graph', name: 'graph', component: () => import('@/views/GraphView.vue') },
        { path: 'cases', name: 'cases', component: () => import('@/views/CasesView.vue') },
        { path: 'cases/:id', name: 'case', component: () => import('@/views/CaseView.vue') },
        { path: 'matters', name: 'matters', component: () => import('@/views/MattersView.vue') },
        { path: 'matters/:id', name: 'matter', component: () => import('@/views/MatterView.vue') },
        { path: 'module/:id', name: 'module', component: () => import('@/views/ModuleView.vue') },
        { path: 'admin', name: 'admin', component: () => import('@/views/AdminView.vue') }
      ]
    }
  ]
})

router.beforeEach(async (to) => {
  const session = readSession()
  const isAppRoute = to.path.startsWith('/app') || to.path === '/scene'
  if (isAppRoute && !session) return { path: '/login', replace: true }

  if (to.path === '/pass') {
    try {
      const rec = await ensureAuth()
      if (to.query.mode === 'first') {
        if (!rec._d || sessionStorage.getItem('beryl_first_pass') !== '1') return { path: '/login', replace: true }
      } else if (!session || rec.u !== session.u) {
        return { path: '/login', replace: true }
      }
    } catch { return { path: '/login', replace: true } }
  }

  if (to.path === '/login' && session) {
    try {
      const rec = await ensureAuth()
      if (rec._d) return { path: '/pass', query: { mode: 'first' }, replace: true }
      return { path: '/app/today', replace: true }
    } catch { /* allow login */ }
  }
  return true
})

export default router
