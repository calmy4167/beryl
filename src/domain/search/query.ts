import { listRealityDocuments, listRealityDocumentsAsync, type RealityDocument, type RealityEntityType, type RealitySource } from '@/domain/reality'

export type SearchResultType = RealityEntityType

export interface SearchResult {
  id: string
  source: RealitySource
  type: SearchResultType
  typeLabel: string
  icon: string
  title: string
  summary: string
  route: string
  updatedAt: number
  score: number
}

const TYPE_META: Record<SearchResultType, { label: string; icon: string }> = {
  case: { label: 'Case 课题', icon: '◈' },
  matter: { label: 'Matter 事项', icon: '◎' },
  action: { label: 'Action 行动', icon: '→' },
  record: { label: 'Record 记录', icon: '▤' },
  today: { label: 'Today 计划', icon: '◷' },
  capture: { label: 'Capture 收集', icon: '↓' },
  task: { label: 'Task 任务', icon: '☐' },
  inbox: { label: 'Inbox 收集箱', icon: '⇩' },
  diary: { label: 'Diary 日记', icon: '✎' },
  post: { label: 'Post 文章', icon: '✍' },
  transaction: { label: 'Finance 财务', icon: '¥' },
  habit: { label: 'Habit 习惯', icon: '◎' },
  char: { label: 'Char 人物', icon: '♙' },
  goal: { label: 'Goal 目标', icon: '◎' },
  pomo: { label: 'Pomo 番茄钟', icon: '🍅' },
  moment: { label: 'Moment 动态', icon: '♡' },
  person: { label: 'Person 人物', icon: '♧' },
  relationship: { label: 'Relationship 关系', icon: '↔' },
  shared_space: { label: 'Shared Space 空间', icon: '⌂' },
  cycle: { label: 'Cycle 周期', icon: '◌' },
  stage: { label: 'Stage 阶段', icon: '◇' },
  resource: { label: 'Resource 资料', icon: '▥' },
  relation: { label: 'Relation 关联', icon: '⋈' },
  seed: { label: 'Seed 种子', icon: '✦' },
  insight: { label: 'Insight 洞察', icon: '✧' },
  outcome: { label: 'Outcome 结果', icon: '✓' },
  practice: { label: 'Practice 实践', icon: '♨' },
  daily_state: { label: 'Daily State 日常', icon: '☼' },
  asset: { label: 'Asset 资产', icon: '▧' }
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function scoreDocument(document: RealityDocument, tokens: string[]): number {
  if (!tokens.length) return 0
  const title = normalize(document.title)
  const summary = normalize(document.summary)
  if (!tokens.every(token => document.searchText.includes(token))) return -1
  return tokens.reduce((score, token) => score + (title.includes(token) ? 8 : 0) + (summary.includes(token) ? 3 : 0) + 1, 0)
}

function searchDocuments(documents: RealityDocument[], query: string, limit: number): SearchResult[] {
  const tokens = normalize(query).split(/\s+/).filter(Boolean)
  return documents
    .map(document => ({ document, score: scoreDocument(document, tokens) }))
    .filter(item => !tokens.length || item.score >= 0)
    .sort((a, b) => b.score - a.score || b.document.updatedAt - a.document.updatedAt || a.document.title.localeCompare(b.document.title))
    .slice(0, Math.max(0, limit))
    .map(({ document, score }) => ({
      id: document.id,
      source: document.source,
      type: document.entityType,
      typeLabel: TYPE_META[document.entityType].label,
      icon: TYPE_META[document.entityType].icon,
      title: document.title,
      summary: document.summary,
      route: document.route,
      updatedAt: document.updatedAt,
      score
    }))
}

export function searchAll(query: string, limit = 20): SearchResult[] {
  return searchDocuments(listRealityDocuments(), query, limit)
}

/** React 生产入口使用异步 Reality 查询，搜索不能重新绕回同步存储。 */
export async function searchAllAsync(query: string, limit = 20): Promise<SearchResult[]> {
  return searchDocuments(await listRealityDocumentsAsync(), query, limit)
}
