import { CORE_ENTITY_TYPES, type CoreEntityType } from './model'

export type CatalogEntityType = CoreEntityType | 'thing' | 'matter' | 'action' | 'record' | 'today'
  | 'capture' | 'suggestion' | 'inbox_item' | 'legacy_task' | 'habit_entry' | 'finance_entry'
  | 'goal' | 'focus_session' | 'diary_entry' | 'post' | 'user'
  | 'feishu_project' | 'feishu_task' | 'feishu_weekly_report' | 'feishu_member'

export type CanonicalRepositoryId = `core:${CoreEntityType}`
  | 'matter' | 'action' | 'record' | 'today' | 'capture' | 'suggestion' | 'inbox' | 'tasks'
  | 'habits' | 'finance' | 'goals' | 'pomo' | 'diary' | 'posts' | 'server:users' | 'feishu:base'

export type ModuleClassification = 'entity-type' | 'domain' | 'view' | 'reality-object'
export type ModuleViewRole = 'entry' | 'aggregate' | 'detail' | 'board' | 'calendar' | 'settings' | 'configuration' | 'integration' | 'domain-view' | 'admin'
export type RealityObjectRef = 'person' | 'thing' | 'scene' | 'space' | 'time'

export interface ModuleCatalogEntry {
  key: string
  title: string
  classification: 'view'
  canonicalEntityTypes: CatalogEntityType[]
  canonicalRepositories: CanonicalRepositoryId[]
  domainKey?: string
  domainAssignment: 'via-relation' | 'partial' | 'not-yet-supported' | 'external'
  supportedRealityObjectRefs: RealityObjectRef[]
  viewRole: ModuleViewRole
}

export interface ModuleConceptEntry {
  key: string
  classification: Exclude<ModuleClassification, 'view'>
  canonicalEntityType: CatalogEntityType
  canonicalRepository: CanonicalRepositoryId
  stableIdField: 'calmyId' | 'date' | 'id' | 'providerRecordId'
}

const coreTypes = new Set<string>(CORE_ENTITY_TYPES)
const entityTypeRepository = new Map<CatalogEntityType, CanonicalRepositoryId>([
  ...CORE_ENTITY_TYPES.map(type => [type, `core:${type}` as CanonicalRepositoryId] as const),
  ['thing', 'matter'], ['matter', 'matter'], ['action', 'action'], ['record', 'record'], ['today', 'today'],
  ['capture', 'capture'], ['suggestion', 'suggestion'], ['inbox_item', 'inbox'], ['legacy_task', 'tasks'],
  ['habit_entry', 'habits'], ['finance_entry', 'finance'], ['goal', 'goals'], ['focus_session', 'pomo'],
  ['diary_entry', 'diary'], ['post', 'posts'], ['user', 'server:users'],
  ['feishu_project', 'feishu:base'], ['feishu_task', 'feishu:base'], ['feishu_weekly_report', 'feishu:base'], ['feishu_member', 'feishu:base']
])
const canonicalRepositories = new Set<string>(entityTypeRepository.values())
const entityStableIdField = new Map<CatalogEntityType, ModuleConceptEntry['stableIdField']>([
  ...CORE_ENTITY_TYPES.map(type => [type, 'calmyId'] as const),
  ['thing', 'calmyId'], ['matter', 'calmyId'], ['action', 'calmyId'], ['record', 'calmyId'], ['today', 'date'],
  ['capture', 'calmyId'], ['suggestion', 'calmyId'], ['inbox_item', 'id'], ['legacy_task', 'id'],
  ['habit_entry', 'id'], ['finance_entry', 'id'], ['goal', 'id'], ['focus_session', 'id'],
  ['diary_entry', 'date'], ['post', 'id'], ['user', 'id'],
  ['feishu_project', 'providerRecordId'], ['feishu_task', 'providerRecordId'], ['feishu_weekly_report', 'providerRecordId'], ['feishu_member', 'providerRecordId']
])
export const CANONICAL_ENTITY_IDENTITIES: ReadonlyMap<CatalogEntityType, { repository: CanonicalRepositoryId; stableIdField: ModuleConceptEntry['stableIdField'] }> = new Map(
  [...entityTypeRepository].map(([entityType, repository]) => [entityType, { repository, stableIdField: entityStableIdField.get(entityType)! }])
)
const knownEntityTypes = new Set<string>([...coreTypes, ...entityTypeRepository.keys()])
const validRealityRefs = new Set<string>(['person', 'thing', 'scene', 'space', 'time'])
const relationAssignableTypes = new Set<string>([
  'person', 'organization', 'relationship', 'shared_space', 'cycle', 'stage', 'resource', 'relation', 'seed', 'insight', 'outcome',
  'practice', 'daily_state', 'asset', 'scene', 'scene_participant', 'space', 'domain', 'thing', 'matter', 'action', 'record', 'finance_entry', 'goal', 'important_date', 'diary_entry', 'post'
])
export const supportsDomainAssignment = (entityType: string): boolean => relationAssignableTypes.has(entityType)

function page(
  key: string,
  title: string,
  viewRole: ModuleViewRole,
  canonicalEntityTypes: CatalogEntityType[] = [],
  options: Partial<Pick<ModuleCatalogEntry, 'domainKey' | 'domainAssignment' | 'supportedRealityObjectRefs'>> = {}
): ModuleCatalogEntry {
  const repositories = [...new Set(canonicalEntityTypes.map(type => entityTypeRepository.get(type)).filter((value): value is CanonicalRepositoryId => !!value))]
  const assignable = canonicalEntityTypes.filter(type => relationAssignableTypes.has(type)).length
  const domainAssignment = options.domainAssignment || (canonicalEntityTypes.length > 0 && assignable === canonicalEntityTypes.length
    ? 'via-relation'
    : assignable > 0 ? 'partial' : 'not-yet-supported')
  return {
    key, title, classification: 'view', canonicalEntityTypes, canonicalRepositories: repositories,
    domainAssignment,
    supportedRealityObjectRefs: options.supportedRealityObjectRefs || [],
    ...options, viewRole
  }
}

/** UI routes are views. The canonical entity concepts and stores are listed separately below. */
export const MODULE_CATALOG: readonly ModuleCatalogEntry[] = [
  page('today', '今天', 'aggregate', ['today', 'action', 'daily_state', 'outcome'], { supportedRealityObjectRefs: ['person', 'thing', 'scene', 'space', 'time'] }),
  page('capture', '记录', 'entry', ['capture', 'suggestion']),
  page('matters', '处境', 'aggregate', ['matter', 'cycle', 'stage', 'outcome', 'practice'], { supportedRealityObjectRefs: ['thing', 'scene', 'time'] }),
  page('matter-detail', '处境详情', 'detail', ['matter', 'action', 'record', 'resource', 'asset', 'cycle', 'stage', 'outcome', 'practice'], { supportedRealityObjectRefs: ['person', 'thing', 'scene', 'space', 'time'] }),
  page('review', '回顾', 'aggregate', ['record', 'action', 'today', 'diary_entry', 'post'], { supportedRealityObjectRefs: ['thing', 'time'] }),
  page('cycle', '周期', 'aggregate', ['cycle', 'stage', 'action', 'record'], { supportedRealityObjectRefs: ['person', 'thing', 'scene', 'space', 'time'] }),
  page('flow', '探索', 'aggregate', ['resource', 'seed', 'insight', 'outcome', 'practice', 'record'], { supportedRealityObjectRefs: ['person', 'thing', 'scene', 'time'] }),
  page('profile', '我的', 'aggregate', ['person', 'important_date', 'scene', 'scene_participant', 'space'], { supportedRealityObjectRefs: ['person', 'scene', 'space'] }),
  page('memory', '记忆', 'aggregate', ['insight', 'seed', 'record', 'resource'], { supportedRealityObjectRefs: ['person', 'thing', 'time'] }),
  page('future', '未来', 'aggregate', ['matter', 'cycle', 'stage', 'seed', 'outcome'], { supportedRealityObjectRefs: ['thing', 'time'] }),
  page('admin', '设置', 'settings'),
  page('admin-advanced', '高级设置', 'settings'),
  page('calendar', '日历', 'calendar', ['action', 'today', 'matter'], { supportedRealityObjectRefs: ['thing', 'time'] }),
  page('people', '人物', 'aggregate', ['person', 'important_date', 'relationship', 'space', 'scene_participant'], { supportedRealityObjectRefs: ['person', 'scene', 'space'] }),
  page('reality-scenes', '共同经历', 'aggregate', ['scene', 'scene_participant', 'person', 'matter', 'space'], { supportedRealityObjectRefs: ['person', 'thing', 'scene', 'space', 'time'] }),
  page('reality-context', '情境视图', 'aggregate', ['person', 'scene', 'scene_participant', 'space', 'domain', 'relation', 'matter', 'action', 'record', 'resource'], { supportedRealityObjectRefs: ['person', 'thing', 'scene', 'space', 'time'] }),
  page('master-data', '主数据管理', 'settings', ['person', 'resource', 'asset', 'domain', 'dictionary_option']),
  page('system-users', '用户管理', 'admin', ['user'], { domainAssignment: 'external' }),
  page('system-roles', '角色权限', 'admin', [], { domainAssignment: 'external' }),
  page('system-security', '安全设置', 'admin', [], { domainAssignment: 'external' }),
  page('system-login-logs', '登录日志', 'admin', [], { domainAssignment: 'external' }),
  page('system-operation-logs', '操作日志', 'admin', [], { domainAssignment: 'external' }),
  page('system-sessions', '在线会话', 'admin', ['user'], { domainAssignment: 'external' }),
  page('library', '资料', 'aggregate', ['resource', 'asset', 'seed', 'insight', 'record'], { supportedRealityObjectRefs: ['person', 'thing', 'scene', 'space', 'time'] }),
  page('graph', '图谱', 'aggregate', ['relation', 'person', 'scene', 'space', 'domain', 'matter', 'action', 'record', 'resource'], { supportedRealityObjectRefs: ['person', 'thing', 'scene', 'space', 'time'] }),
  page('inbox', '收集箱', 'aggregate', ['inbox_item', 'legacy_task', 'capture']),
  page('tasks', '任务', 'aggregate', ['legacy_task', 'action'], { supportedRealityObjectRefs: ['person', 'thing', 'time'] }),
  page('task-board', '看板', 'board', ['action'], { supportedRealityObjectRefs: ['person', 'thing', 'time'] }),
  page('feishu', '飞书', 'integration', ['feishu_project', 'feishu_task', 'feishu_weekly_report', 'feishu_member'], { domainAssignment: 'external' }),
  page('habits', '习惯', 'aggregate', ['habit_entry', 'daily_state'], { supportedRealityObjectRefs: ['time'] }),
  page('finance', '财务', 'domain-view', ['finance_entry', 'asset', 'matter'], { domainKey: 'finance', supportedRealityObjectRefs: ['person', 'thing', 'time'] }),
  page('goals', '目标', 'aggregate', ['goal', 'outcome', 'action', 'record'], { supportedRealityObjectRefs: ['person', 'thing', 'time'] }),
  page('pomo', '专注', 'aggregate', ['focus_session', 'action', 'today'], { supportedRealityObjectRefs: ['person', 'thing', 'scene', 'space', 'time'] }),
  page('diary', '日记', 'aggregate', ['diary_entry', 'record'], { supportedRealityObjectRefs: ['person', 'thing', 'scene', 'time'] }),
  page('posts', '文章', 'aggregate', ['post', 'record'], { supportedRealityObjectRefs: ['person', 'thing', 'scene', 'time'] }),
  page('scene', '场景主题', 'configuration')
]

const concept = (key: string, classification: ModuleConceptEntry['classification'], canonicalEntityType: CatalogEntityType): ModuleConceptEntry => {
  const identity = CANONICAL_ENTITY_IDENTITIES.get(canonicalEntityType)!
  return { key, classification, canonicalEntityType, canonicalRepository: identity.repository, stableIdField: identity.stableIdField }
}

export const MODULE_CONCEPTS: readonly ModuleConceptEntry[] = [
  concept('person', 'entity-type', 'person'),
  concept('thing', 'reality-object', 'thing'),
  concept('scene', 'reality-object', 'scene'),
  concept('space', 'reality-object', 'space'),
  concept('domain', 'domain', 'domain'),
  ...['health', 'finance', 'relationship', 'work', 'learning', 'travel'].map(key => concept(`domain:${key}`, 'domain', 'domain')),
  ...CORE_ENTITY_TYPES.filter(type => !['person', 'scene', 'space', 'domain'].includes(type)).map(type => concept(type, 'entity-type', type))
]

export type ModuleCatalogValidation = { valid: true; moduleCount: number }

export function validateModuleCatalog(modules: readonly ModuleCatalogEntry[]): ModuleCatalogValidation {
  const keys = new Set<string>()
  for (const module of modules) {
    if (keys.has(module.key)) throw new Error(`duplicate module key: ${module.key}`)
    keys.add(module.key)
    if (!module.key.trim()) throw new Error('module key is required')
    for (const entityType of module.canonicalEntityTypes as readonly string[]) {
      if (!knownEntityTypes.has(entityType)) throw new Error(`unknown entity type: ${entityType}`)
    }
    for (const repository of module.canonicalRepositories as readonly string[]) {
      if (!canonicalRepositories.has(repository)) throw new Error(`noncanonical repository: ${repository}`)
      if (!module.canonicalEntityTypes.some(entityType => entityTypeRepository.get(entityType) === repository)) throw new Error(`module ${module.key} references an unassigned repository: ${repository}`)
    }
    for (const entityType of module.canonicalEntityTypes as readonly string[]) {
      const identity = CANONICAL_ENTITY_IDENTITIES.get(entityType as CatalogEntityType)
      if (!identity || !identity.stableIdField || !module.canonicalRepositories.includes(identity.repository)) throw new Error(`module ${module.key} does not reference the canonical repository and stable ID for ${entityType}`)
    }
    for (const reference of module.supportedRealityObjectRefs as readonly string[]) {
      if (!validRealityRefs.has(reference)) throw new Error(`unknown Reality Object reference: ${reference}`)
    }
    if (module.classification !== 'view') throw new Error(`route module ${module.key} must be a view over canonical data`)
  }
  return { valid: true, moduleCount: modules.length }
}

export const validateModuleCatalogOrThrow = validateModuleCatalog
