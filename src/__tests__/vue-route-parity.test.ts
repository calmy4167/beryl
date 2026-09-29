import { describe, expect, it } from 'vitest'
import router from '../router'
import { appPageRegistry } from '../router/route-manifest'

describe('Vue route parity with the current 迁移前界面基线 registry', () => {
  it('resolves every currently registered 迁移前界面基线 page path', () => {
    const unresolved = appPageRegistry
      .filter(page => router.resolve(page.path).matched.length === 0)
      .map(page => `${page.id}: ${page.path}`)

    expect(unresolved).toEqual([])
  })

  it('keeps every current page title and shell classification in the Vue registry', async () => {
    const { vuePageRegistry } = await import('../vue/page-registry')
    expect(vuePageRegistry.map(page => ({ id: page.id, path: page.path, title: page.title, shell: page.shell })))
      .toEqual(appPageRegistry.map(page => ({ id: page.id, path: page.path, title: page.title, shell: page.shell })))
  })

  it.each([
    ['/app/today', 'TodayPage.vue'],
    ['/app/capture', 'CapturePage.vue'],
    ['/app/review', 'ReviewPage.vue'],
    ['/app/matters', 'MattersPage.vue'],
    ['/app/matters/:id', 'MatterDetailPage.vue'],
    ['/app/cycle', 'CyclePage.vue'],
    ['/app/flow', 'FlowPage.vue'],
    ['/app/profile', 'ProfilePage.vue'],
    ['/app/future', 'FuturePage.vue'],
    ['/app/memory', 'MemoryPage.vue'],
    ['/app/people', 'PeoplePage.vue'],
    ['/app/master-data', 'MasterDataPage.vue'],
    ['/app/library', 'LibraryPage.vue'],
    ['/app/graph', 'GraphPage.vue'],
    ['/app/module/inbox', 'InboxPage.vue'],
    ['/app/module/diary', 'DiaryPage.vue'],
    ['/app/module/posts', 'PostsPage.vue'],
    ['/app/calendar', 'CalendarPage.vue'],
    ['/app/module/tasks', 'TasksPage.vue'],
    ['/app/task-board', 'TaskBoardPage.vue'],
    ['/app/module/goals', 'GoalsPage.vue'],
    ['/app/module/habits', 'HabitsPage.vue'],
    ['/app/module/finance', 'FinancePage.vue'],
    ['/app/module/pomo', 'PomoPage.vue'],
    ['/app/feishu', 'FeishuPage.vue'],
    ['/app/admin', 'AdminPage.vue'],
    ['/app/admin/advanced', 'AdminPage.vue'],
    ['/scene', 'ScenePage.vue'],
  ])('uses the migrated Vue page for %s', async (path, fileName) => {
    const route = router.resolve(path.replace(':id', 'route-test-id'))
    const loader = route.matched.at(-1)?.components?.default
    expect(loader).toBeTypeOf('function')
    const page = await (loader as () => Promise<{ default: { __file?: string } }>)()
    expect(page.default.__file).toContain(fileName)
  }, 10000)

  it.each([
    ['/login', 'LoginPage.vue'],
    ['/pass', 'PassPage.vue'],
  ])('uses the current 迁移前界面基线 presentation on %s', async (path, fileName) => {
    const loader = router.resolve(path).matched.at(-1)?.components?.default
    expect(loader).toBeTypeOf('function')
    const page = await (loader as () => Promise<{ default: { __file?: string } }>)()
    expect(page.default.__file).toContain(fileName)
  })
})
