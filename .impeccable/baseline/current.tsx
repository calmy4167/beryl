import { createRoot } from 'react-dom/client'
import { MemoryRouter, Outlet } from 'react-router-dom'
import '@/styles/main.css'
import '@/react/react.css'
import '@/react/mobile-nav.css'
import '@/react/feishu-workspace.css'
import '@/react/feishu-board.css'
import '@/react/product-ui.css'
import '@/react/ui-refresh.css'
import '@/react/tactile-ui.css'
import { AppShell } from '@/react/AppShell'
import { AppRoutes } from '@/react/routes'
import { TodayPage } from '@/react/pages/TodayPage'
import { MattersPage } from '@/react/pages/MattersPage'
import { MatterDetailPage } from '@/react/pages/MatterDetailPage'
import { ReviewPage } from '@/react/pages/ReviewPage'
import { AttentionCapturePage, CalendarPage, CyclePage, DiaryPage, FeishuPage, FinancePage, FlowPage, FuturePage, GoalsPage, GraphPage, HabitsPage, InboxPage, LegacyAdminHost, LibraryPage, MemoryPage, PeoplePage, PomoPage, PostsPage, ProfilePage, ScenePage, TaskBoardPage, TasksPage } from '@/react/lazy-pages'
import { LegacyCaseRedirect, LoginPage, PassPage, PlaceholderPage } from '@/react/route-views'
import { applyBackgroundPreferences } from '@/react/theme-preferences'

document.documentElement.classList.add('tactile-ui')
applyBackgroundPreferences('light')

const route = new URLSearchParams(window.location.search).get('route') || '/app/today'

createRoot(document.getElementById('app')!).render(
  <MemoryRouter initialEntries={[route]}>
    <AppRoutes views={{
      login: <LoginPage />,
      pass: <PassPage />,
      protected: <Outlet />,
      shell: <AppShell />,
      today: <TodayPage />,
      cycle: <CyclePage />,
      flow: <FlowPage />,
      profile: <ProfilePage />,
      memory: <MemoryPage />,
      capture: <AttentionCapturePage />,
      matters: <MattersPage />,
      caseRedirect: <LegacyCaseRedirect />,
      matterDetail: <MatterDetailPage />,
      review: <ReviewPage />,
      future: <FuturePage />,
      admin: <LegacyAdminHost />,
      advancedAdmin: <LegacyAdminHost />,
      calendar: <CalendarPage />,
      people: <PeoplePage />,
      library: <LibraryPage />,
      graph: <GraphPage />,
      inbox: <InboxPage />,
      tasks: <TasksPage />,
      taskBoard: <TaskBoardPage />,
      feishu: <FeishuPage />,
      habits: <HabitsPage />,
      finance: <FinancePage />,
      goals: <GoalsPage />,
      pomo: <PomoPage />,
      diary: <DiaryPage />,
      posts: <PostsPage />,
      scene: <ScenePage />,
      moduleFallback: <PlaceholderPage title="模块入口" description="旧模块入口已经统一收敛到 React 工作台。" />,
      fallback: <PlaceholderPage />,
    }} />
  </MemoryRouter>,
)
