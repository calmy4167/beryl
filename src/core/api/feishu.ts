import { apiFetch, ApiError } from './client'

export type FeishuTableKey = 'projects' | 'tasks' | 'reviews'

export interface FeishuClientConfig {
  baseUrl: string
  syncKey: string
}

async function request<T>(config: FeishuClientConfig, path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(config.baseUrl, path, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.syncKey}`,
      ...(init.headers || {}),
    },
  })
  const payload = await response.json().catch(() => null) as T & { error?: string; message?: string } | null
  if (!response.ok || !payload) throw new ApiError(payload?.message || payload?.error || `飞书请求失败（${response.status}）`, response.status)
  return payload
}

export interface FeishuStatus {
  ok: boolean
  provider: 'feishu-bitable'
  authMode: 'tenant_access_token'
  configured: boolean
  appIdConfigured: boolean
  appSecretConfigured: boolean
  baseTokenConfigured: boolean
  tables: Record<FeishuTableKey, boolean>
}

export interface FeishuRecordResponse<T = Record<string, unknown>> {
  ok: boolean
  items?: Array<{ record_id: string; fields: T; created_by?: string; updated_by?: string; created_time?: number; last_modified_time?: number }>
  page_token?: string
  has_more?: boolean
  total?: number
}

export function getFeishuStatus(config: FeishuClientConfig): Promise<FeishuStatus> {
  return request<FeishuStatus>(config, '/api/feishu/status')
}

export function getFeishuSchema(config: FeishuClientConfig, tables: FeishuTableKey[] = ['projects', 'tasks', 'reviews']): Promise<unknown> {
  return request(config, `/api/feishu/schema?tables=${encodeURIComponent(tables.join(','))}`)
}

export function listFeishuRecords<T = Record<string, unknown>>(config: FeishuClientConfig, table: FeishuTableKey, query = ''): Promise<FeishuRecordResponse<T>> {
  const suffix = query ? `&${query.replace(/^\?/, '')}` : ''
  return request<FeishuRecordResponse<T>>(config, `/api/feishu/records?table=${encodeURIComponent(table)}${suffix}`)
}

export function createFeishuRecord(config: FeishuClientConfig, table: FeishuTableKey, fields: Record<string, unknown>): Promise<unknown> {
  return request(config, `/api/feishu/records?table=${encodeURIComponent(table)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
}

export function updateFeishuRecord(config: FeishuClientConfig, table: FeishuTableKey, recordId: string, fields: Record<string, unknown>): Promise<unknown> {
  return request(config, `/api/feishu/records/${encodeURIComponent(recordId)}?table=${encodeURIComponent(table)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
}
