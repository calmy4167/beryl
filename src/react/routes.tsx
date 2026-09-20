import { Suspense } from 'react'
import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { readSession } from '@/core/auth'
import { appPageRegistry, appRouteDefinitions, type AppRouteViewKey } from './route-manifest'

type AppRouteViews = {
  login: ReactNode
  pass: ReactNode
  protected: ReactNode
  shell: ReactNode
} & Record<AppRouteViewKey, ReactNode>

function lazyView(label: string, view: ReactNode) {
  return <Suspense fallback={<div className="empty-state">正在加载{label}…</div>}>{view}</Suspense>
}

export function AppRoutes({ views }: { views: AppRouteViews }) {
  const scenePage = appPageRegistry.find(page => page.id === 'scene')

  return <Routes>
    <Route path="/login" element={views.login} />
    <Route path="/pass" element={views.pass} />
    <Route element={views.protected}>
      <Route path="/app" element={views.shell}>
        {appRouteDefinitions.map((route, index) => {
          const element = route.kind === 'redirect'
            ? <Navigate to={route.redirectTo} replace />
            : lazyView(route.lazyLabel ?? (route.pageId ? appPageRegistry.find(page => page.id === route.pageId)?.title : '') ?? '', views[route.viewKey])
          return route.path
            ? <Route key={`${route.path}-${index}`} path={route.path} element={element} />
            : <Route key={`index-${index}`} index element={element} />
        })}
      </Route>
      {scenePage && <Route path={scenePage.path} element={lazyView(scenePage.lazyLabel ?? scenePage.title, views[scenePage.viewKey])} />}
    </Route>
    <Route path="/" element={<Navigate to={readSession() ? '/app/today' : '/login'} replace />} />
    <Route path="*" element={<Navigate to={readSession() ? '/app/today' : '/login'} replace />} />
  </Routes>
}
