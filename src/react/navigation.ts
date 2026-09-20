export interface PrimaryNavigationItem {
  key: 'today' | 'capture' | 'matters' | 'review'
  icon: string
  label: string
  path: string
}

export const primaryNavigation: readonly PrimaryNavigationItem[] = [
  { key: 'today', icon: '⌂', label: '今天', path: '/app/today' },
  { key: 'capture', icon: '↓', label: '记录', path: '/app/capture' },
  { key: 'matters', icon: '☷', label: '处境', path: '/app/matters' },
  { key: 'review', icon: '◴', label: '回顾', path: '/app/review' },
]

export interface FeatureNavigationItem {
  icon: string
  label: string
  path: string
}

export interface FeatureNavigationGroup {
  id: string
  label: string
  items: readonly FeatureNavigationItem[]
}

export const featureNavigationGroups: readonly FeatureNavigationGroup[] = [
  {
    id: 'work',
    label: '工作',
    items: [
      { icon: '▦', label: '看板', path: '/app/task-board' },
      { icon: '✓', label: '任务', path: '/app/module/tasks' },
      { icon: '◇', label: '目标', path: '/app/module/goals' },
      { icon: '□', label: '日历', path: '/app/calendar' },
      { icon: '▤', label: '飞书', path: '/app/feishu' },
      { icon: '◌', label: '周期', path: '/app/cycle' },
    ],
  },
  {
    id: 'records',
    label: '内容',
    items: [
      { icon: '↓', label: '收集', path: '/app/module/inbox' },
      { icon: '▧', label: '资料', path: '/app/library' },
      { icon: '◌', label: '探索', path: '/app/flow' },
      { icon: '▤', label: '日记', path: '/app/module/diary' },
      { icon: '✎', label: '文章', path: '/app/module/posts' },
    ],
  },
  {
    id: 'understanding',
    label: '关系',
    items: [
      { icon: '♙', label: '人物', path: '/app/people' },
      { icon: '⌁', label: '图谱', path: '/app/graph' },
      { icon: '✦', label: '记忆', path: '/app/memory' },
    ],
  },
  {
    id: 'daily-tools',
    label: '工具',
    items: [
      { icon: '♧', label: '习惯', path: '/app/module/habits' },
      { icon: '¥', label: '财务', path: '/app/module/finance' },
      { icon: '🍅', label: '专注', path: '/app/module/pomo' },
    ],
  },
  {
    id: 'experiments',
    label: '试验',
    items: [
      { icon: '↗', label: '未来', path: '/app/future' },
      { icon: '◌', label: '场景', path: '/scene' },
    ],
  },
  {
    id: 'personal',
    label: '个人',
    items: [
      { icon: '○', label: '我的', path: '/app/profile' },
      { icon: '⚙', label: '设置', path: '/app/admin' },
    ],
  },
]
