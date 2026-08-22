import { useEffect, useRef } from 'react'
import { createApp, h } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import AdminView from '@/views/AdminView.vue'

/** 保留完整同步/Vault/实体迁移能力，后续再逐块拆成 React。 */
export function LegacyAdminHost() {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!host.current) return
    const Redirect = { setup: () => () => h('div', { class: 'empty-state' }, '正在返回 Today…') }
    const router = createRouter({ history: createWebHashHistory(), routes: [
      { path: '/app/admin', component: AdminView },
      { path: '/app/home', component: Redirect },
      { path: '/pass', component: Redirect },
      { path: '/:pathMatch(.*)*', component: AdminView }
    ] })
    const app = createApp(AdminView)
    app.use(router)
    app.use(ElementPlus)
    let mounted = false
    void router.isReady().then(() => { if (host.current) { app.mount(host.current); mounted = true } })
    const onNavigate = () => { if (location.hash.includes('/app/home') || location.hash.includes('/pass')) location.hash = '#/app/today' }
    window.addEventListener('hashchange', onNavigate)
    return () => { window.removeEventListener('hashchange', onNavigate); if (mounted) app.unmount() }
  }, [])
  return <div ref={host} className="legacy-admin-host" aria-label="完整设置与同步界面" />
}
