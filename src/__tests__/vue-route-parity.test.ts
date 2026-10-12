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

  it.each(['/app/desk/history', '/liubai-preview/desk/history'])('routes the homepage records control to the complete records page at %s', async path => {
    const route = router.resolve(path)
    expect(route.meta.title).toBe('记录')
    const loader = route.matched.at(-1)?.components?.default
    expect(loader).toBeTypeOf('function')
    const page = await (loader as () => Promise<{ default: { __file?: string } }>)()
    expect(page.default.__file).toContain('DeskRecordsPage.vue')
  }, 10000)

  it.each([
    ['/app/today', 'LiubaiToday.vue'],
    ['/app/capture', 'LiubaiCapture.vue'],
    ['/app/review', 'LiubaiReview.vue'],
    ['/app/matters', 'LiubaiMatters.vue'],
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
    ['/app/module/diary', 'LiubaiDiary.vue'],
    ['/app/module/posts', 'PostsPage.vue'],
    ['/app/calendar', 'CalendarPage.vue'],
    ['/app/module/tasks', 'LiubaiTasks.vue'],
    ['/app/task-board', 'TaskBoardPage.vue'],
    ['/app/module/goals', 'GoalsPage.vue'],
    ['/app/module/habits', 'LiubaiHabits.vue'],
    ['/app/module/finance', 'FinancePage.vue'],
    ['/app/module/pomo', 'LiubaiPomo.vue'],
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
