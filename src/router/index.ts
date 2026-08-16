import { createRouter, createWebHashHistory } from 'vue-router'

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
        { path: '', redirect: '/app/home' },
        { path: 'home', name: 'home', component: () => import('@/views/HomeView.vue') },
        { path: 'cases', name: 'cases', component: () => import('@/views/CasesView.vue') },
        { path: 'cases/:id', name: 'case', component: () => import('@/views/CaseView.vue') },
        { path: 'module/:id', name: 'module', component: () => import('@/views/ModuleView.vue') },
        { path: 'admin', name: 'admin', component: () => import('@/views/AdminView.vue') }
      ]
    }
  ]
})

export default router
