const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis'

let tokenCache = { appId: '', token: '', expiresAt: 0 }

export class FeishuApiError extends Error {
  constructor(message, status = 502, code = 'FEISHU_API_ERROR') {
    super(message)
    this.name = 'FeishuApiError'
    this.status = status
    this.code = code
  }
}

function value(env, key) {
  return String(env[key] || '').trim()
}

export function readFeishuConfig(env) {
  return {
    appId: value(env, 'FEISHU_APP_ID'),
    appSecret: value(env, 'FEISHU_APP_SECRET'),
    baseToken: value(env, 'FEISHU_BASE_TOKEN'),
    tables: {
      projects: value(env, 'FEISHU_TABLE_PROJECTS'),
      tasks: value(env, 'FEISHU_TABLE_TASKS') || value(env, 'FEISHU_TABLE_ID'),
      reviews: value(env, 'FEISHU_TABLE_REVIEWS'),
    },
    views: {
      projects: value(env, 'FEISHU_VIEW_PROJECTS'),
      tasks: value(env, 'FEISHU_VIEW_TASKS'),
      reviews: value(env, 'FEISHU_VIEW_REVIEWS'),
    },
  }
}

export function feishuStatus(env) {
  const config = readFeishuConfig(env)
  const configuredTables = Object.fromEntries(Object.entries(config.tables).map(([key, tableId]) => [key, Boolean(tableId)]))
  return {
    provider: 'feishu-bitable',
    authMode: 'tenant_access_token',
    configured: Boolean(config.appId && config.appSecret && config.baseToken && Object.values(config.tables).some(Boolean)),
    appIdConfigured: Boolean(config.appId),
    appSecretConfigured: Boolean(config.appSecret),
    baseTokenConfigured: Boolean(config.baseToken),
    tables: configuredTables,
  }
}

function requireConfig(env) {
  const config = readFeishuConfig(env)
  if (!config.appId || !config.appSecret || !config.baseToken) {
    throw new FeishuApiError('飞书未完成配置：需要 App ID、App Secret 和 Base Token', 503, 'FEISHU_NOT_CONFIGURED')
  }
  return config
}

function tableIdFor(config, tableKey) {
  const key = String(tableKey || '').trim()
  const tableId = config.tables[key]
  if (!tableId) throw new FeishuApiError(`未配置飞书数据表：${key || '未指定'}`, 400, 'FEISHU_TABLE_NOT_CONFIGURED')
  return tableId
}

async function tenantAccessToken(config) {
  const now = Date.now()
  if (tokenCache.appId === config.appId && tokenCache.token && tokenCache.expiresAt > now + 60_000) return tokenCache.token
  let response
  try {
    response = await fetch(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }),
    })
  } catch {
    throw new FeishuApiError('无法连接飞书授权服务', 502, 'FEISHU_AUTH_NETWORK')
  }
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload || Number(payload.code) !== 0 || !payload.tenant_access_token) {
    throw new FeishuApiError(payload?.msg || '飞书应用身份授权失败，请检查应用发布和密钥配置', 502, `FEISHU_AUTH_${payload?.code || response.status}`)
  }
  tokenCache = {
    appId: config.appId,
    token: String(payload.tenant_access_token),
    expiresAt: now + Math.max(60, Number(payload.expire) || 7200) * 1000,
  }
  return tokenCache.token
}

async function callFeishu(env, path, init = {}) {
  const config = requireConfig(env)
  const token = await tenantAccessToken(config)
  let response
  try {
    response = await fetch(`${FEISHU_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    })
  } catch {
    throw new FeishuApiError('无法连接飞书数据服务', 502, 'FEISHU_NETWORK')
  }
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload || Number(payload.code) !== 0) {
    throw new FeishuApiError(payload?.msg || '飞书数据请求失败', response.status >= 400 ? 502 : response.status, `FEISHU_${payload?.code || response.status}`)
  }
  return payload.data || {}
}

function queryValue(url, key) {
  const value = url.searchParams.get(key)
  return value == null || value === '' ? null : value
}

function pageSize(url) {
  const requested = Number(queryValue(url, 'page_size') || 100)
  return String(Math.min(500, Math.max(1, Number.isFinite(requested) ? requested : 100)))
}

export async function listFeishuFields(env, tableKey) {
  const config = requireConfig(env)
  const tableId = tableIdFor(config, tableKey)
  return callFeishu(env, `/bitable/v1/apps/${encodeURIComponent(config.baseToken)}/tables/${encodeURIComponent(tableId)}/fields?page_size=500`)
}

export async function listFeishuRecords(env, tableKey, url) {
  const config = requireConfig(env)
  const tableId = tableIdFor(config, tableKey)
  const query = new URLSearchParams({ page_size: pageSize(url) })
  const configuredView = config.views[tableKey]
  for (const key of ['view_id', 'page_token', 'filter', 'sort']) {
    const next = queryValue(url, key)
    if (next) query.set(key, next)
  }
  if (!query.has('view_id') && configuredView) query.set('view_id', configuredView)
  return callFeishu(env, `/bitable/v1/apps/${encodeURIComponent(config.baseToken)}/tables/${encodeURIComponent(tableId)}/records?${query.toString()}`)
}

export async function createFeishuRecord(env, tableKey, fields) {
  const config = requireConfig(env)
  const tableId = tableIdFor(config, tableKey)
  return callFeishu(env, `/bitable/v1/apps/${encodeURIComponent(config.baseToken)}/tables/${encodeURIComponent(tableId)}/records`, {
    method: 'POST',
    body: JSON.stringify({ fields }),
  })
}

export async function updateFeishuRecord(env, tableKey, recordId, fields) {
  const config = requireConfig(env)
  const tableId = tableIdFor(config, tableKey)
  if (!String(recordId || '').trim()) throw new FeishuApiError('缺少飞书 record_id', 400, 'FEISHU_RECORD_ID_REQUIRED')
  return callFeishu(env, `/bitable/v1/apps/${encodeURIComponent(config.baseToken)}/tables/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordId)}`, {
    method: 'PUT',
    body: JSON.stringify({ fields }),
  })
}
