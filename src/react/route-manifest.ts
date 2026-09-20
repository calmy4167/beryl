import { matchPath } from 'react-router-dom'

export type AppRouteViewKey =
  | 'today' | 'cycle' | 'flow' | 'profile' | 'memory' | 'capture' | 'matters'
  | 'caseRedirect' | 'matterDetail' | 'review' | 'future' | 'admin' | 'advancedAdmin'
  | 'calendar' | 'people' | 'library' | 'graph' | 'inbox' | 'tasks' | 'taskBoard'
  | 'feishu' | 'habits' | 'finance' | 'goals' | 'pomo' | 'diary' | 'posts'
  | 'scene' | 'moduleFallback' | 'fallback'

export type PrimaryNavigationKey = 'today' | 'capture' | 'matters' | 'review'
export type FeatureNavigationGroupId = 'work' | 'records' | 'understanding' | 'daily-tools' | 'experiments' | 'personal'
export type PageArchetype =
  | 'today' | 'capture' | 'list-detail' | 'timeline' | 'content' | 'board'
  | 'calendar' | 'personal-tool' | 'insight' | 'integration' | 'settings' | 'experiment'

type PrimaryNavMeta = {
  kind: 'primary'
  key: PrimaryNavigationKey
  label: string
  icon: string
  order: number
}

type FeatureNavMeta = {
  kind: 'feature'
  groupId: FeatureNavigationGroupId
  label: string
  icon: string
  order: number
}

export type AppPageDescriptor = {
  id: string
  path: string
  viewKey: AppRouteViewKey
  title: string
  description?: string
  archetype: PageArchetype
  shell: 'app' | 'standalone'
  lazyLabel?: string
  navigation?: PrimaryNavMeta | FeatureNavMeta
}

export type AppRouteDefinition =
  | { kind: 'redirect'; path: string; redirectTo: string }
  | { kind: 'view'; path: string; viewKey: AppRouteViewKey; lazyLabel?: string; pageId?: string }

export const featureNavigationGroupMeta: readonly { id: FeatureNavigationGroupId; label: string }[] = [
  { id: 'work', label: '工作' },
  { id: 'records', label: '内容' },
  { id: 'understanding', label: '关系' },
  { id: 'daily-tools', label: '工具' },
  { id: 'experiments', label: '试验' },
  { id: 'personal', label: '个人' },
]

export const appPageRegistry: readonly AppPageDescriptor[] = [
  {
    id: 'today', path: '/app/today', viewKey: 'today', title: '今天', description: '现在关注的事与行动',
    archetype: 'today', shell: 'app', navigation: { kind: 'primary', key: 'today', label: '今天', icon: '⌂', order: 0 },
  },
  {
    id: 'capture', path: '/app/capture', viewKey: 'capture', title: '记录', description: '先留下原话，不必立即整理',
    archetype: 'capture', shell: 'app', lazyLabel: '记录', navigation: { kind: 'primary', key: 'capture', label: '记录', icon: '↓', order: 1 },
  },
  {
    id: 'matters', path: '/app/matters', viewKey: 'matters', title: '处境', description: '持续影响你的现实处境',
    archetype: 'list-detail', shell: 'app', navigation: { kind: 'primary', key: 'matters', label: '处境', icon: '☷', order: 2 },
  },
  {
    id: 'matter-detail', path: '/app/matters/:id', viewKey: 'matterDetail', title: '处境', description: '持续影响你的现实处境',
    archetype: 'list-detail', shell: 'app',
  },
  {
    id: 'review', path: '/app/review', viewKey: 'review', title: '回顾', description: '看看发生了什么，以及它意味着什么',
    archetype: 'timeline', shell: 'app', navigation: { kind: 'primary', key: 'review', label: '回顾', icon: '◴', order: 3 },
  },
  {
    id: 'cycle', path: '/app/cycle', viewKey: 'cycle', title: '周期', description: '查看当前阶段',
    archetype: 'timeline', shell: 'app', lazyLabel: '周期', navigation: { kind: 'feature', groupId: 'work', label: '周期', icon: '◌', order: 5 },
  },
  {
    id: 'flow', path: '/app/flow', viewKey: 'flow', title: '探索', description: '重新看看已有资料',
    archetype: 'content', shell: 'app', lazyLabel: '探索', navigation: { kind: 'feature', groupId: 'records', label: '探索', icon: '◌', order: 2 },
  },
  {
    id: 'profile', path: '/app/profile', viewKey: 'profile', title: '我的', description: '个人会话、场景和数据概览',
    archetype: 'personal-tool', shell: 'app', lazyLabel: '我的', navigation: { kind: 'feature', groupId: 'personal', label: '我的', icon: '○', order: 0 },
  },
  {
    id: 'memory', path: '/app/memory', viewKey: 'memory', title: '记忆', description: '查看并管理系统对你的理解',
    archetype: 'insight', shell: 'app', lazyLabel: '记忆', navigation: { kind: 'feature', groupId: 'understanding', label: '记忆', icon: '✦', order: 2 },
  },
  {
    id: 'future', path: '/app/future', viewKey: 'future', title: '未来', description: '看看一个选择的不同可能',
    archetype: 'experiment', shell: 'app', lazyLabel: '未来', navigation: { kind: 'feature', groupId: 'experiments', label: '未来', icon: '↗', order: 0 },
  },
  {
    id: 'admin', path: '/app/admin', viewKey: 'admin', title: '设置', description: '管理本地数据、同步与外观',
    archetype: 'settings', shell: 'app', lazyLabel: '设置', navigation: { kind: 'feature', groupId: 'personal', label: '设置', icon: '⚙', order: 1 },
  },
  {
    id: 'admin-advanced', path: '/app/admin/advanced', viewKey: 'advancedAdmin', title: '设置', description: '管理本地数据、同步与外观',
    archetype: 'settings', shell: 'app', lazyLabel: '设置',
  },
  {
    id: 'calendar', path: '/app/calendar', viewKey: 'calendar', title: '日历',
    archetype: 'calendar', shell: 'app', lazyLabel: '日历', navigation: { kind: 'feature', groupId: 'work', label: '日历', icon: '□', order: 3 },
  },
  {
    id: 'people', path: '/app/people', viewKey: 'people', title: '人物',
    archetype: 'list-detail', shell: 'app', lazyLabel: '人物', navigation: { kind: 'feature', groupId: 'understanding', label: '人物', icon: '♙', order: 0 },
  },
  {
    id: 'library', path: '/app/library', viewKey: 'library', title: '资料', description: '保存可复用的内容',
    archetype: 'content', shell: 'app', lazyLabel: '资料', navigation: { kind: 'feature', groupId: 'records', label: '资料', icon: '▧', order: 1 },
  },
  {
    id: 'graph', path: '/app/graph', viewKey: 'graph', title: '图谱',
    archetype: 'insight', shell: 'app', lazyLabel: '图谱', navigation: { kind: 'feature', groupId: 'understanding', label: '图谱', icon: '⌁', order: 1 },
  },
  {
    id: 'inbox', path: '/app/module/inbox', viewKey: 'inbox', title: '收集',
    archetype: 'capture', shell: 'app', lazyLabel: '收集', navigation: { kind: 'feature', groupId: 'records', label: '收集', icon: '↓', order: 0 },
  },
  {
    id: 'tasks', path: '/app/module/tasks', viewKey: 'tasks', title: '任务',
    archetype: 'list-detail', shell: 'app', lazyLabel: '任务', navigation: { kind: 'feature', groupId: 'work', label: '任务', icon: '✓', order: 1 },
  },
  {
    id: 'task-board', path: '/app/task-board', viewKey: 'taskBoard', title: '看板', description: '按状态查看行动',
    archetype: 'board', shell: 'app', lazyLabel: '看板', navigation: { kind: 'feature', groupId: 'work', label: '看板', icon: '▦', order: 0 },
  },
  {
    id: 'feishu', path: '/app/feishu', viewKey: 'feishu', title: '飞书', description: '查看和更新飞书项目与任务',
    archetype: 'integration', shell: 'app', lazyLabel: '飞书', navigation: { kind: 'feature', groupId: 'work', label: '飞书', icon: '▤', order: 4 },
  },
  {
    id: 'habits', path: '/app/module/habits', viewKey: 'habits', title: '习惯', description: '身体、状态与日常小行动',
    archetype: 'personal-tool', shell: 'app', lazyLabel: '习惯', navigation: { kind: 'feature', groupId: 'daily-tools', label: '习惯', icon: '♧', order: 0 },
  },
  {
    id: 'finance', path: '/app/module/finance', viewKey: 'finance', title: '财务',
    archetype: 'personal-tool', shell: 'app', lazyLabel: '财务', navigation: { kind: 'feature', groupId: 'daily-tools', label: '财务', icon: '¥', order: 1 },
  },
  {
    id: 'goals', path: '/app/module/goals', viewKey: 'goals', title: '目标', description: '现实结果、证据与下一步',
    archetype: 'list-detail', shell: 'app', lazyLabel: '目标', navigation: { kind: 'feature', groupId: 'work', label: '目标', icon: '◇', order: 2 },
  },
  {
    id: 'pomo', path: '/app/module/pomo', viewKey: 'pomo', title: '专注',
    archetype: 'personal-tool', shell: 'app', lazyLabel: '专注', navigation: { kind: 'feature', groupId: 'daily-tools', label: '专注', icon: '🍅', order: 2 },
  },
  {
    id: 'diary', path: '/app/module/diary', viewKey: 'diary', title: '日记', description: '按日期查看生活记录',
    archetype: 'content', shell: 'app', lazyLabel: '日记', navigation: { kind: 'feature', groupId: 'records', label: '日记', icon: '▤', order: 3 },
  },
  {
    id: 'posts', path: '/app/module/posts', viewKey: 'posts', title: '文章',
    archetype: 'content', shell: 'app', lazyLabel: '文章', navigation: { kind: 'feature', groupId: 'records', label: '文章', icon: '✎', order: 4 },
  },
  {
    id: 'scene', path: '/scene', viewKey: 'scene', title: '场景',
    archetype: 'experiment', shell: 'standalone', lazyLabel: '场景', navigation: { kind: 'feature', groupId: 'experiments', label: '场景', icon: '◌', order: 1 },
  },
]

export const appRouteDefinitions: readonly AppRouteDefinition[] = [
  { kind: 'redirect', path: '', redirectTo: '/app/today' },
  ...appPageRegistry.filter(page => page.shell === 'app').map(page => ({
    kind: 'view' as const,
    path: page.path.replace(/^\/app\/?/, ''),
    viewKey: page.viewKey,
    lazyLabel: page.lazyLabel,
    pageId: page.id,
  })),
  { kind: 'redirect', path: 'home', redirectTo: '/app/today' },
  { kind: 'redirect', path: 'items', redirectTo: '/app/matters' },
  { kind: 'redirect', path: 'cases', redirectTo: '/app/matters' },
  { kind: 'view', path: 'cases/:id', viewKey: 'caseRedirect', pageId: 'matters' },
  { kind: 'redirect', path: 'module/chars', redirectTo: '/app/people' },
  { kind: 'redirect', path: 'module/moments', redirectTo: '/app/module/posts' },
  { kind: 'redirect', path: 'module/:id', redirectTo: '/app/module/inbox' },
  { kind: 'view', path: 'module/*', viewKey: 'moduleFallback' },
  { kind: 'view', path: '*', viewKey: 'fallback' },
]

export function getPageForPath(pathname: string): AppPageDescriptor | undefined {
  return appPageRegistry.find(page => matchPath({ path: page.path, end: true }, pathname) !== null)
}
