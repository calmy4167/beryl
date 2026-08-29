import { useEffect, useState } from 'react'
import { HashRouter } from 'react-router-dom'
import { bootstrapData } from './bootstrap'
import { AppShell } from './AppShell'
import { AttentionCapturePage, CalendarPage, CyclePage, DiaryPage, FinancePage, GoalsPage, GraphPage, HabitsPage, InboxPage, LegacyAdminHost, LibraryPage, MemoryPage, PeoplePage, PomoPage, PostsPage, ProfilePage, ReactAdminPage, ScenePage, TaskBoardPage, TasksPage } from './lazy-pages'
import { TodayPage } from './pages/TodayPage'
import { MattersPage } from './pages/MattersPage'
import { ReviewPage } from './pages/ReviewPage'
import { MatterDetailPage } from './pages/MatterDetailPage'
import { AppRoutes } from './routes'
import { LegacyCaseRedirect, LoginPage, PassPage, PlaceholderPage, ProtectedRoute } from './route-views'

function App() {
  const [ready, setReady] = useState(false)
  useEffect(() => { void bootstrapData().finally(() => setReady(true)) }, [bootstrapData])
  if (!ready) return <div className="boot-screen"><div className="brand-mark">C</div><h1 className="font-title">正在恢复本机数据</h1><p>Calmy 即将准备好。</p></div>
  return <HashRouter><AppRoutes views={{ login: <LoginPage />, pass: <PassPage />, protected: <ProtectedRoute />, shell: <AppShell />, today: <TodayPage />, cycle: <CyclePage />, profile: <ProfilePage />, memory: <MemoryPage />, capture: <AttentionCapturePage />, matters: <MattersPage />, caseRedirect: <LegacyCaseRedirect />, matterDetail: <MatterDetailPage />, review: <ReviewPage />, admin: <ReactAdminPage />, advancedAdmin: <LegacyAdminHost />, calendar: <CalendarPage />, people: <PeoplePage />, library: <LibraryPage />, graph: <GraphPage />, inbox: <InboxPage />, tasks: <TasksPage />, taskBoard: <TaskBoardPage />, habits: <HabitsPage />, finance: <FinancePage />, goals: <GoalsPage />, pomo: <PomoPage />, diary: <DiaryPage />, posts: <PostsPage />, scene: <ScenePage />, moduleFallback: <PlaceholderPage title="模块入口" description="旧模块入口已经统一收敛到 React 工作台。" />, fallback: <PlaceholderPage /> }} /></HashRouter>
}

export { LegacyTodayPage } from './pages/LegacyTodayPage'
export { LegacyCapturePage } from './pages/LegacyCapturePage'
export { MattersPage } from './pages/MattersPage'
export { ReviewPage } from './pages/ReviewPage'
export { MatterDetailPage } from './pages/MatterDetailPage'
export { App }
