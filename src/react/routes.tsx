import { Suspense } from 'react'
import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { readSession } from '@/core/auth'

type AppRouteViews = {
  login: ReactNode
  pass: ReactNode
  protected: ReactNode
  shell: ReactNode
  today: ReactNode
  cycle: ReactNode
  profile: ReactNode
  memory: ReactNode
  capture: ReactNode
  matters: ReactNode
  caseRedirect: ReactNode
  matterDetail: ReactNode
  review: ReactNode
  admin: ReactNode
  advancedAdmin: ReactNode
  calendar: ReactNode
  people: ReactNode
  library: ReactNode
  graph: ReactNode
  inbox: ReactNode
  tasks: ReactNode
  taskBoard: ReactNode
  habits: ReactNode
  finance: ReactNode
  goals: ReactNode
  pomo: ReactNode
  diary: ReactNode
  posts: ReactNode
  scene: ReactNode
  moduleFallback: ReactNode
  fallback: ReactNode
}

function lazyView(label: string, view: ReactNode) {
  return <Suspense fallback={<div className="empty-state">正在加载{label}…</div>}>{view}</Suspense>
}

export function AppRoutes({ views }: { views: AppRouteViews }) {
  return <Routes><Route path="/login" element={views.login} /><Route path="/pass" element={views.pass} /><Route element={views.protected}><Route path="/app" element={views.shell}><Route index element={<Navigate to="today" replace />} /><Route path="home" element={<Navigate to="/app/today" replace />} /><Route path="today" element={views.today} /><Route path="cycle" element={lazyView(' Cycle', views.cycle)} /><Route path="profile" element={lazyView('我的页面', views.profile)} /><Route path="memory" element={lazyView(' AI 记忆', views.memory)} /><Route path="capture" element={lazyView(' Capture', views.capture)} /><Route path="matters" element={views.matters} /><Route path="items" element={<Navigate to="/app/matters" replace />} /><Route path="cases" element={<Navigate to="/app/matters" replace />} /><Route path="cases/:id" element={views.caseRedirect} /><Route path="matters/:id" element={views.matterDetail} /><Route path="review" element={views.review} /><Route path="admin" element={lazyView('设置与同步', views.admin)} /><Route path="admin/advanced" element={lazyView('高级同步工具', views.advancedAdmin)} /><Route path="calendar" element={lazyView('日历', views.calendar)} /><Route path="people" element={lazyView('人物上下文', views.people)} /><Route path="library" element={lazyView('资料库', views.library)} /><Route path="graph" element={lazyView('图谱', views.graph)} /><Route path="module/inbox" element={lazyView('收件箱', views.inbox)} /><Route path="module/tasks" element={lazyView('任务', views.tasks)} /><Route path="task-board" element={lazyView('事项看板', views.taskBoard)} /><Route path="module/habits" element={lazyView('习惯', views.habits)} /><Route path="module/finance" element={lazyView('财务', views.finance)} /><Route path="module/goals" element={lazyView('目标', views.goals)} /><Route path="module/pomo" element={lazyView('番茄钟', views.pomo)} /><Route path="module/diary" element={lazyView('日记', views.diary)} /><Route path="module/posts" element={lazyView('文章', views.posts)} /><Route path="module/chars" element={<Navigate to="/app/people" replace />} /><Route path="module/moments" element={<Navigate to="/app/module/posts" replace />} /><Route path="module/:id" element={<Navigate to="/app/module/inbox" replace />} /><Route path="module/*" element={views.moduleFallback} /><Route path="*" element={views.fallback} /></Route><Route path="/scene" element={lazyView('场景', views.scene)} /></Route><Route path="/" element={<Navigate to={readSession() ? '/app/today' : '/login'} replace />} /><Route path="*" element={<Navigate to={readSession() ? '/app/today' : '/login'} replace />} /></Routes>
}
