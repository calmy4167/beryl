import { createFeishuRecord, getFeishuSchema, getFeishuStatus, listAllFeishuRecords, updateFeishuRecord, type FeishuClientConfig, type FeishuField, type FeishuRecord, type FeishuTableKey } from '@/core/api/feishu'
import { bindFields, taskCreateFields, taskStatusFields, type WorkspaceBindings } from './model'

export const FEISHU_REFRESH_MS = 15_000
const tables: FeishuTableKey[] = ['tasks', 'projects', 'reviews', 'members']
const api = { status: getFeishuStatus, schema: getFeishuSchema, list: listAllFeishuRecords, create: createFeishuRecord, update: updateFeishuRecord }
type WorkspaceApi = typeof api
type TableState = Record<FeishuTableKey, FeishuRecord[]>

interface CachedWorkspaceSnapshot {
  workspaceId: string
  tables: TableState
  fields: WorkspaceSnapshot['fields']
  bindings: WorkspaceBindings
  tableErrors: WorkspaceSnapshot['tableErrors']
  updatedAt: number
}

interface AppCache {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
}

export interface WorkspaceSnapshot {
  workspaceId: string
  tables: TableState
  fields: Partial<Record<FeishuTableKey, FeishuField[]>>
  bindings: WorkspaceBindings
  tableErrors: Partial<Record<FeishuTableKey, string>>
  ready: boolean
  loading: boolean
  saving: boolean
  error: string
  writeError: string
  lastRead: number | null
  cacheUpdatedAt: number | null
  usingCache: boolean
}

function emptySnapshot(): WorkspaceSnapshot {
  return { workspaceId: '', tables: { tasks: [], projects: [], reviews: [], members: [] }, fields: {}, bindings: {}, tableErrors: {}, ready: false, loading: false, saving: false, error: '', writeError: '', lastRead: null, cacheUpdatedAt: null, usingCache: false }
}

function isCachedWorkspaceSnapshot(value: unknown, workspaceId: string): value is CachedWorkspaceSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<CachedWorkspaceSnapshot>
  return snapshot.workspaceId === workspaceId && Number.isFinite(snapshot.updatedAt) && Boolean(snapshot.tables)
    && ['tasks', 'projects', 'reviews', 'members'].every(table => Array.isArray(snapshot.tables?.[table as FeishuTableKey]))
    && Boolean(snapshot.fields && typeof snapshot.fields === 'object')
    && Boolean(snapshot.bindings && typeof snapshot.bindings === 'object')
}

export class FeishuWorkspace {
  private snapshot = emptySnapshot()
  private listeners = new Set<() => void>()
  private connection = ''
  private inFlight: Promise<void> | null = null
  private generation = 0

  constructor(private config: () => FeishuClientConfig | null, private remote: WorkspaceApi = api, private storage?: Pick<Storage, 'getItem' | 'setItem'>, private cache?: AppCache) {}

  getSnapshot = (): WorkspaceSnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private publish(patch: Partial<WorkspaceSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach(listener => listener())
  }
  private loadBindings(id: string): WorkspaceBindings {
    try { return JSON.parse(this.storage?.getItem(`calmy:feishu:fields:${id}`) || '{}') || {} } catch { return {} }
  }

  private async restoreCachedSnapshot(baseUrl: string, generation: number): Promise<void> {
    if (!this.cache || this.snapshot.workspaceId) return
    try {
      const workspaceId = await this.cache.get<string>(`feishu:connection:${baseUrl}`)
      if (!workspaceId) return
      const cached = await this.cache.get<unknown>(`feishu:workspace:${workspaceId}`)
      if (!isCachedWorkspaceSnapshot(cached, workspaceId)) return
      if (generation !== this.generation || JSON.stringify(this.config()) !== this.connection) return
      this.publish({
        workspaceId: cached.workspaceId,
        tables: cached.tables,
        fields: cached.fields,
        bindings: cached.bindings,
        tableErrors: cached.tableErrors || {},
        ready: false,
        loading: true,
        error: '',
        lastRead: cached.updatedAt,
        cacheUpdatedAt: cached.updatedAt,
        usingCache: true,
      })
    } catch { /* Cache loss must not block a live read. */ }
  }

  refresh = (): Promise<void> => {
    if (this.inFlight) return this.inFlight
    if (this.snapshot.saving) return Promise.resolve()
    this.inFlight = this.read().finally(() => { this.inFlight = null })
    return this.inFlight
  }

  private async read(): Promise<void> {
    const config = this.config()
    const connection = config ? JSON.stringify(config) : ''
    if (connection !== this.connection) {
      this.connection = connection
      this.generation++
      this.snapshot = emptySnapshot()
    }
    if (!config) { this.publish({ error: '请先在“设置与同步”填写 Worker 地址和同步密码。', ready: false }); return }
    const generation = this.generation
    this.publish({ loading: true, ready: false, error: '' })
    await this.restoreCachedSnapshot(config.baseUrl.replace(/\/+$/, ''), generation)
    if (generation !== this.generation) return
    try {
      const status = await this.remote.status(config)
      if (!status.configured || !status.tables.tasks) throw new Error('Worker 未配置飞书任务表，请完成后端飞书配置并部署。')
      if (!status.workspaceId) throw new Error('请先更新 Worker：当前后端缺少飞书工作区身份接口。')
      const active = tables.filter(table => status.tables[table])
      const schema = await this.remote.schema(config, active)
      const results = await Promise.all(active.map(async table => {
        try { return { table, items: (await this.remote.list(config, table)).items || [], error: '' } }
        catch (cause) { return { table, items: [] as FeishuRecord[], error: cause instanceof Error ? cause.message : '读取失败' } }
      }))
      if (generation !== this.generation || JSON.stringify(this.config()) !== connection) return
      const sameWorkspace = status.workspaceId === this.snapshot.workspaceId
      const records = sameWorkspace ? { ...this.snapshot.tables } : emptySnapshot().tables
      const fields: WorkspaceSnapshot['fields'] = {}
      const bindings = this.loadBindings(status.workspaceId)
      const tableErrors: WorkspaceSnapshot['tableErrors'] = {}
      for (const table of tables) {
        if (!active.includes(table)) { records[table] = []; tableErrors[table] = '未配置该飞书表'; continue }
        fields[table] = schema.tables[table]?.items || []
        bindings[table] = bindFields(table, fields[table]!, bindings[table])
      }
      for (const result of results) {
        if (result.error) tableErrors[result.table] = result.error
        else records[result.table] = result.items
      }
      try { this.storage?.setItem(`calmy:feishu:fields:${status.workspaceId}`, JSON.stringify(bindings)) } catch { /* Reads remain usable; no credential or business value is stored here. */ }
      const readAt = Date.now()
      let cacheUpdatedAt = this.snapshot.cacheUpdatedAt
      let usingCache = Object.keys(tableErrors).length > 0 && cacheUpdatedAt != null
      if (this.cache && results.every(result => !result.error)) {
        const cached: CachedWorkspaceSnapshot = { workspaceId: status.workspaceId, tables: records, fields, bindings, tableErrors, updatedAt: readAt }
        try {
          await this.cache.set(`feishu:workspace:${status.workspaceId}`, cached)
          await this.cache.set(`feishu:connection:${config.baseUrl.replace(/\/+$/, '')}`, status.workspaceId)
          cacheUpdatedAt = readAt
          usingCache = false
        } catch { /* Live reads remain usable if the offline snapshot cannot be stored. */ }
      }
      if (generation !== this.generation || JSON.stringify(this.config()) !== connection) return
      this.publish({ workspaceId: status.workspaceId, tables: records, fields, bindings, tableErrors, ready: !tableErrors.tasks, loading: false, error: tableErrors.tasks || '', lastRead: tableErrors.tasks ? this.snapshot.lastRead : readAt, cacheUpdatedAt, usingCache })
    } catch (cause) {
      if (generation === this.generation) this.publish({ ready: false, loading: false, usingCache: this.snapshot.cacheUpdatedAt != null, error: cause instanceof Error ? cause.message : '飞书读取失败' })
    } finally {
      if (generation === this.generation) this.publish({ loading: false })
    }
  }

  private async write(operation: (config: FeishuClientConfig) => Promise<unknown>): Promise<void> {
    const config = this.config()
    if (!config || JSON.stringify(config) !== this.connection || !this.snapshot.ready || this.snapshot.loading || this.snapshot.saving) throw new Error('飞书数据尚未就绪，请刷新后再保存。')
    this.generation++ // Discard reads started before this write.
    this.publish({ saving: true, writeError: '' })
    try { await operation(config) }
    catch (cause) {
      const error = cause instanceof Error ? cause.message : '飞书保存失败'
      this.publish({ writeError: `${error}。写回未确认，请先查看飞书后再决定是否重试。` })
      throw cause
    } finally { this.publish({ saving: false }) }
    // The caller applies the confirmed local patch before this background refresh.
    // Dragging should not wait for all tables and schema to be downloaded again.
  }

  private patchTaskStatus(recordId: string, status: string): void {
    const field = (this.snapshot.fields.tasks || []).find(item => item.field_id === this.snapshot.bindings.tasks?.status)
    if (!field) return
    const tasks = this.snapshot.tables.tasks.map(record => record.record_id === recordId ? { ...record, fields: { ...record.fields, [field.field_name]: status } } : record)
    this.publish({ tables: { ...this.snapshot.tables, tasks }, lastRead: Date.now(), writeError: '' })
  }

  createTask = async (title: string, projectId = ''): Promise<string> => {
    const fields = taskCreateFields(this.snapshot.fields.tasks || [], this.snapshot.bindings.tasks || {}, title, projectId)
    if (projectId && (this.snapshot.tableErrors.projects || !this.snapshot.tables.projects.some(item => item.record_id === projectId))) throw new Error('关联项目未就绪，请先刷新。')
    let recordId = ''
    await this.write(async config => {
      const result = await this.remote.create(config, 'tasks', fields)
      if (!result.record?.record_id) throw new Error('飞书未返回新任务 ID')
      recordId = result.record.record_id
    })
    void this.refresh()
    return recordId
  }

  changeStatus = async (recordId: string, status: string): Promise<void> => {
    if (!this.snapshot.tables.tasks.some(item => item.record_id === recordId)) throw new Error('任务已不在当前工作区，请刷新。')
    const fields = taskStatusFields(this.snapshot.fields.tasks || [], this.snapshot.bindings.tasks || {}, status)
    await this.write(config => this.remote.update(config, 'tasks', recordId, fields))
    this.patchTaskStatus(recordId, status)
    void this.refresh()
  }
}

// Only mounted Feishu surfaces poll. No background thread, offline queue or write retry.
export function watchFeishuWorkspace(workspace: Pick<FeishuWorkspace, 'refresh'>, page: Document = document, host: Window = window): () => void {
  const refresh = () => { if (page.visibilityState !== 'hidden') void workspace.refresh() }
  const refreshWhenOnline = () => { if (host.navigator.onLine !== false) refresh() }
  refresh()
  const timer = host.setInterval(refreshWhenOnline, FEISHU_REFRESH_MS)
  host.addEventListener('focus', refreshWhenOnline)
  host.addEventListener('online', refreshWhenOnline)
  host.addEventListener('offline', refresh)
  page.addEventListener('visibilitychange', refresh)
  return () => {
    host.clearInterval(timer)
    host.removeEventListener('focus', refreshWhenOnline)
    host.removeEventListener('online', refreshWhenOnline)
    host.removeEventListener('offline', refresh)
    page.removeEventListener('visibilitychange', refresh)
  }
}
