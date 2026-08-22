import { caseRepository } from '@/domain/case/repository'
import type { CaseItem } from '@/domain/case/model'
import { actionRepository } from '@/domain/action/repository'
import type { ActionItem } from '@/domain/action/model'
import { captureRepository } from '@/domain/capture'
import type { CaptureItem } from '@/domain/capture'
import { matterRepository } from '@/domain/matter/repository'
import type { Matter } from '@/domain/matter/model'
import { recordRepository } from '@/domain/record/repository'
import type { RealityRecord } from '@/domain/record/model'
import { todayRepository } from '@/domain/today/repository'
import type { TodayPlan } from '@/domain/today/model'
import { store } from '@/core/storage'
import { CORE_ENTITY_TYPES, unifiedRepository, type CoreEntity, type CoreEntityType, type Cycle } from '@/domain/unified'
import { legacyMapping } from '@/domain/legacy/migration'

export type RealitySource = 'legacy' | 'unified'
export type RealityEntityType = 'case' | 'matter' | 'action' | 'record' | 'today' | 'capture' | 'task' | 'inbox' | 'diary' | 'post' | 'transaction' | 'habit' | 'char' | 'goal' | 'pomo' | 'moment' | CoreEntityType

export interface RealityDocument {
  id: string
  calmyId: string
  source: RealitySource
  entityType: RealityEntityType
  title: string
  summary: string
  body?: string
  route: string
  updatedAt: number
  occurredAt?: number
  matterId?: string
  cycleId?: string
  stageId?: string
  date?: string
  status?: string
  type?: string
  resultNote?: string
  recordType?: string
  impact?: string
  why?: string
  currentStage?: string
  trajectory?: string
  revision?: number
  priority?: string
  dueAt?: string
  done?: boolean
  sourceIndex?: number
  amount?: number
  amountCents?: number
  category?: string
  financeType?: string
  dates?: string[]
  color?: string
  days?: number
  name?: string
  charTitle?: string
  minutes?: number
  count?: number
  visibility?: string
  commentCount?: number
  likeCount?: number
  searchText: string
}

export interface RealityQuery {
  text?: string
  types?: RealityEntityType[]
  from?: number
  to?: number
  limit?: number
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function dateTimestamp(value: string): number | undefined {
  const timestamp = Date.parse(`${value.slice(0, 10)}T00:00:00`)
  return Number.isFinite(timestamp) ? timestamp : undefined
}

function parsedTimestamp(value?: string): number {
  const timestamp = value ? Date.parse(value) : NaN
  return Number.isFinite(timestamp) ? timestamp : 0
}

function hashId(prefix: string, value: string): string {
  let hash = 2166136261
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return `${prefix}-${(hash >>> 0).toString(36)}`
}

function matterRoute(matterId?: string): string | undefined {
  return matterId ? `/app/matters/${matterId}` : undefined
}

function routeForCore(entity: CoreEntity): string {
  if (entity.entityType === 'person' || entity.entityType === 'relationship' || entity.entityType === 'shared_space') return '/app/people'
  if (entity.entityType === 'cycle') return matterRoute(entity.matterId) || '/app/library'
  if (entity.entityType === 'stage') {
    const cycle = unifiedRepository.find<Cycle>('cycle', entity.cycleId)
    return matterRoute(cycle?.matterId) || '/app/library'
  }
  if (entity.entityType === 'outcome') {
    const action = actionRepository.find(entity.actionId)
    return matterRoute(entity.matterId || action?.matterId) || '/app/today'
  }
  if (entity.entityType === 'practice') return matterRoute(entity.matterIds[0]) || '/app/library'
  return '/app/library'
}

function coreTitle(entity: CoreEntity): string {
  switch (entity.entityType) {
    case 'person': return entity.displayName
    case 'relationship': return entity.label
    case 'relation': return `${entity.from.entityType} ${entity.relationType} ${entity.to.entityType}`
    case 'daily_state': return `Today ${entity.date}`
    case 'asset': return entity.path
    default: return 'title' in entity ? entity.title : entity.entityType
  }
}

function coreSummary(entity: CoreEntity): string {
  switch (entity.entityType) {
    case 'person': return [entity.domain, entity.notes, ...entity.roles, ...entity.tags].filter(Boolean).join(' ') || 'Person 人物'
    case 'relationship': return [entity.boundary, entity.rhythm].filter(Boolean).join(' ') || 'Relationship 关系'
    case 'shared_space': return [entity.purpose, entity.boundary].filter(Boolean).join(' ') || 'Shared Space 空间'
    case 'cycle': return [entity.theme, entity.status, entity.trajectory].filter(Boolean).join(' ')
    case 'stage': return [entity.element, entity.status].filter(Boolean).join(' ')
    case 'resource': return [entity.body, entity.uri, ...entity.tags].filter(Boolean).join(' ') || 'Resource 资料'
    case 'relation': return entity.relationType
    case 'seed': return [entity.body, entity.status, ...entity.tags].filter(Boolean).join(' ')
    case 'insight': return [entity.body, entity.status].filter(Boolean).join(' ')
    case 'outcome': return [entity.summary, entity.result, entity.status].filter(Boolean).join(' ')
    case 'practice': return [entity.description, entity.status, entity.cadence, ...entity.matterIds].filter(Boolean).join(' ')
    case 'daily_state': return [entity.bodyState, entity.mentalState, entity.trajectory, entity.todayPlanId].filter(Boolean).join(' ')
    case 'asset': return [entity.mimeType, entity.lifecycle, entity.externalUri].filter(Boolean).join(' ')
  }
  return 'Core entity'
}

function document(input: Omit<RealityDocument, 'searchText' | 'calmyId'>): RealityDocument {
  return { ...input, calmyId: input.id, searchText: normalize([input.title, input.summary, input.body].filter(Boolean).join(' ')) }
}

function legacyDocuments(): RealityDocument[] {
  const cases = caseRepository.list().filter(item => !legacyMapping('case', item.id)).map((item: CaseItem) => document({
    id: item.id, source: 'legacy', entityType: 'case', title: item.title,
    summary: item.problem || item.desiredOutcome || '打开课题', route: `/app/cases/${item.id}`, updatedAt: item.updatedAt
  }))
  const matters = matterRepository.list().map((item: Matter) => document({
    id: item.calmyId, source: 'legacy', entityType: 'matter', title: item.title,
    summary: item.primaryContradiction || item.why || `${item.status} · ${item.currentStage}`,
    route: `/app/matters/${item.calmyId}`, updatedAt: item.updatedAt, matterId: item.calmyId,
    status: item.status, why: item.why, currentStage: item.currentStage, trajectory: item.trajectory, revision: item.revision
  }))
  const actions = actionRepository.list().map((item: ActionItem) => document({
    id: item.calmyId, source: 'legacy', entityType: 'action', title: item.title,
    summary: item.resultNote || `${item.date} · ${item.status}`, route: matterRoute(item.matterId) || '/app/today',
    updatedAt: item.updatedAt, occurredAt: dateTimestamp(item.date), matterId: item.matterId, date: item.date, status: item.status, resultNote: item.resultNote
  }))
  const records = recordRepository.list().map((item: RealityRecord) => document({
    id: item.calmyId, source: 'legacy', entityType: 'record', title: item.body.split(/\r?\n/, 1)[0].slice(0, 100),
    summary: `${item.type} · ${new Date(item.occurredAt).toLocaleDateString()}`, body: item.body,
    route: matterRoute(item.matterId) || '/app/today', updatedAt: item.updatedAt, occurredAt: item.occurredAt, matterId: item.matterId,
    cycleId: item.cycleId, stageId: item.stageId, type: item.type, recordType: item.type, impact: item.impact
  }))
  const today = todayRepository.list().map((item: TodayPlan) => document({
    id: item.date, source: 'legacy', entityType: 'today', title: `Today ${item.date}`,
    summary: item.why || item.review.observation || item.focusActionIds.join(' ') || '打开今日计划', route: '/app/today',
    updatedAt: item.updatedAt, occurredAt: dateTimestamp(item.date)
  }))
  const captures = captureRepository.list().map((item: CaptureItem) => document({
    id: item.calmyId, source: 'legacy', entityType: 'capture', title: item.body.split(/\r?\n/, 1)[0].slice(0, 120),
    summary: `${item.status} · 原始收集`, body: item.body, route: '/app/capture', updatedAt: item.updatedAt
  }))
  const rawTasks = store.get<Array<{ id?: string; title?: string; priority?: string; date?: string; dueAt?: string; done?: boolean }>>('tasks', [])
  const tasks = (Array.isArray(rawTasks) ? rawTasks : []).filter(item => item.id && item.title?.trim() && !legacyMapping('task', item.id)).map(item => document({
    id: item.id!, source: 'legacy', entityType: 'task', title: item.title!.trim(), summary: `${item.done ? 'done' : 'open'} · ${item.priority || '中'}`,
    route: '/app/module/tasks', updatedAt: Date.parse(item.date || '') || 0, occurredAt: Date.parse(item.date || '') || undefined,
    date: item.date, status: item.done ? 'done' : 'open', priority: item.priority || '中', dueAt: item.dueAt, done: !!item.done
  }))
  const rawInbox = store.get<Array<{ id?: string; text?: string; date?: string }>>('inbox', [])
  const inbox = (Array.isArray(rawInbox) ? rawInbox : []).map((item, sourceIndex) => {
    const text = typeof item.text === 'string' ? item.text.trim() : ''
    if (!text || legacyMapping('inbox', item.id || `row-${sourceIndex}-${encodeURIComponent(text.slice(0, 32))}`)) return undefined
    const id = item.id || hashId('inbox', `${item.date || ''}:${text}:${sourceIndex}`)
    return document({
      id, source: 'legacy', entityType: 'inbox', title: text.slice(0, 120), summary: 'open · 收集箱', body: text,
      route: '/app/module/inbox', updatedAt: Date.parse(item.date || '') || 0, date: item.date, status: 'open', sourceIndex
    })
  }).filter((item): item is RealityDocument => !!item)
  const rawDiary = store.get<Array<{ date?: string; content?: string }>>('diary', [])
  const diary = (Array.isArray(rawDiary) ? rawDiary : []).filter(item => item.date && item.content?.trim()).map(item => document({
    id: item.date!, source: 'legacy', entityType: 'diary', title: `Diary ${item.date}`, summary: item.content!.slice(0, 120), body: item.content!,
    route: '/app/module/diary', updatedAt: parsedTimestamp(item.date), occurredAt: dateTimestamp(item.date!), date: item.date
  }))
  const rawPosts = store.get<Array<{ id?: string; title?: string; content?: string; date?: string }>>('posts', [])
  const posts = (Array.isArray(rawPosts) ? rawPosts : []).filter(item => item.id && item.title?.trim()).map(item => document({
    id: item.id!, source: 'legacy', entityType: 'post', title: item.title!.trim(), summary: item.content?.replace(/\r?\n/g, ' ').slice(0, 120) || '文章', body: item.content,
    route: '/app/module/posts', updatedAt: parsedTimestamp(item.date), occurredAt: item.date ? dateTimestamp(item.date) : undefined, date: item.date
  }))
  const rawFinance = store.get<Array<{ id?: string; type?: string; amount?: number; amountCents?: number; category?: string; note?: string; date?: string }>>('finance', [])
  const transactions = (Array.isArray(rawFinance) ? rawFinance : []).filter(item => item.id).map(item => document({
    id: item.id!, source: 'legacy', entityType: 'transaction', title: item.category || '其他', summary: `${item.type === 'income' ? 'income' : 'expense'} · ${item.category || '其他'}`,
    body: item.note, route: '/app/module/finance', updatedAt: parsedTimestamp(item.date), occurredAt: item.date ? dateTimestamp(item.date) : undefined,
    date: item.date, status: item.type, amount: item.amount, amountCents: item.amountCents, category: item.category, financeType: item.type
  }))
  const rawHabits = store.get<Array<{ id?: string; name?: string; color?: string; days?: number; dates?: string[] }>>('habits', [])
  const habits = (Array.isArray(rawHabits) ? rawHabits : []).filter(item => item.id && item.name?.trim()).map(item => document({
    id: item.id!, source: 'legacy', entityType: 'habit', title: item.name!.trim(), summary: `${item.days || item.dates?.length || 0} 天`,
    route: '/app/module/habits', updatedAt: dateTimestamp(item.dates?.slice().sort().pop() || '') || 0, dates: item.dates || [], color: item.color, days: item.days || item.dates?.length || 0
  }))
  const rawChars = store.get<Array<{ id?: string; name?: string; title?: string; date?: string }>>('chars', [])
  const chars = (Array.isArray(rawChars) ? rawChars : []).filter(item => item.id && item.name?.trim()).map(item => document({
    id: item.id!, source: 'legacy', entityType: 'char', title: item.name!.trim(), summary: item.title || '人物',
    route: '/app/module/chars', updatedAt: parsedTimestamp(item.date), occurredAt: item.date ? dateTimestamp(item.date) : undefined, date: item.date,
    name: item.name, charTitle: item.title
  }))
  const rawGoals = store.get<Array<{ id?: string; title?: string; done?: boolean }>>('goals', [])
  const goals = (Array.isArray(rawGoals) ? rawGoals : []).filter(item => item.id && item.title?.trim()).map(item => document({
    id: item.id!, source: 'legacy', entityType: 'goal', title: item.title!.trim(), summary: item.done ? 'done · 目标' : 'open · 目标',
    route: '/app/module/goals', updatedAt: 0, status: item.done ? 'done' : 'open', done: !!item.done
  }))
  const pomoMinutes = Number(store.get('pomoTotal', 0)) || 0
  const pomoCount = Number(store.get('pomoCount', 0)) || 0
  const pomo = document({
    id: 'pomo', source: 'legacy', entityType: 'pomo', title: '番茄钟', summary: `${pomoMinutes} 分钟 · ${pomoCount} 个`, route: '/app/module/pomo', updatedAt: 0,
    minutes: pomoMinutes, count: pomoCount
  })
  const rawMoments = store.get<Array<{ id?: string; author?: { name?: string }; content?: string; visibility?: string; createdAt?: number; updatedAt?: number; comments?: unknown[]; likedBy?: unknown[] }>>('moments', [])
  const moments = (Array.isArray(rawMoments) ? rawMoments : []).filter(item => item.id && item.content?.trim()).map(item => document({
    id: item.id!, source: 'legacy', entityType: 'moment', title: item.author?.name || '动态', summary: item.content!.slice(0, 120), body: item.content,
    route: '/app/module/moments', updatedAt: item.updatedAt || item.createdAt || 0, occurredAt: item.createdAt, visibility: item.visibility,
    commentCount: item.comments?.length || 0, likeCount: item.likedBy?.length || 0
  }))
  return [...cases, ...matters, ...actions, ...records, ...today, ...captures, ...tasks, ...inbox, ...diary, ...posts, ...transactions, ...habits, ...chars, ...goals, pomo, ...moments]
}

function unifiedDocuments(): RealityDocument[] {
  return CORE_ENTITY_TYPES.flatMap(entityType => unifiedRepository.list<CoreEntity & { entityType: typeof entityType }>(entityType).map(entity => document({
    id: entity.calmyId, source: 'unified', entityType: entity.entityType, title: coreTitle(entity), summary: coreSummary(entity),
    route: routeForCore(entity), updatedAt: entity.updatedAt,
    occurredAt: entity.entityType === 'daily_state' ? dateTimestamp(entity.date) : undefined,
    matterId: 'matterId' in entity ? entity.matterId : undefined
  })))
}

function deduplicate(documents: RealityDocument[]): RealityDocument[] {
  const byKey = new Map<string, RealityDocument>()
  for (const item of documents) {
    const key = `${item.entityType}:${item.id}`
    const current = byKey.get(key)
    if (!current || item.updatedAt > current.updatedAt || (item.updatedAt === current.updatedAt && item.source === 'unified')) byKey.set(key, item)
  }
  return [...byKey.values()]
}

function eventTime(item: RealityDocument): number {
  return item.occurredAt ?? item.updatedAt
}

export function listRealityDocuments(query: RealityQuery = {}): RealityDocument[] {
  const types = query.types?.length ? new Set(query.types) : undefined
  const tokens = normalize(query.text || '').split(/\s+/).filter(Boolean)
  const limit = query.limit === undefined ? Number.MAX_SAFE_INTEGER : Math.max(0, query.limit)
  if (limit === 0 || (query.from !== undefined && query.to !== undefined && query.from > query.to)) return []
  return deduplicate([...legacyDocuments(), ...unifiedDocuments()])
    .filter(item => !types || types.has(item.entityType))
    .filter(item => tokens.every(token => item.searchText.includes(token)))
    .filter(item => query.from === undefined || eventTime(item) >= query.from)
    .filter(item => query.to === undefined || eventTime(item) <= query.to)
    .sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
    .slice(0, limit)
}
