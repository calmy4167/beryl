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
  case: { label: '课题', icon: '◈' },
  matter: { label: '处境', icon: '◎' },
  action: { label: '行动', icon: '→' },
  record: { label: '记录', icon: '▤' },
  today: { label: '今天', icon: '◷' },
  capture: { label: '原文', icon: '↓' },
  task: { label: '任务', icon: '☐' },
  inbox: { label: '收集', icon: '⇩' },
  diary: { label: '日记', icon: '✎' },
  post: { label: '文章', icon: '✍' },
  transaction: { label: '财务', icon: '¥' },
  habit: { label: '习惯', icon: '◎' },
  char: { label: '角色', icon: '♙' },
  goal: { label: '目标', icon: '◎' },
  pomo: { label: '专注', icon: '🍅' },
  moment: { label: '动态', icon: '♡' },
  person: { label: '人物', icon: '♧' },
  relationship: { label: '关系', icon: '↔' },
  shared_space: { label: '空间', icon: '⌂' },
  cycle: { label: '周期', icon: '◌' },
  stage: { label: '阶段', icon: '◇' },
  resource: { label: '资料', icon: '▥' },
  relation: { label: '关联', icon: '⋈' },
  seed: { label: '种子', icon: '✦' },
  insight: { label: '洞察', icon: '✧' },
  outcome: { label: '结果', icon: '✓' },
  practice: { label: '练习', icon: '♨' },
  daily_state: { label: '状态', icon: '☼' },
  asset: { label: '附件', icon: '▧' }
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
