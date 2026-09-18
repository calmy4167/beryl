import { authorized } from '../lib/auth.js'
import { FeishuApiError, createFeishuRecord, feishuStatus, feishuWorkspaceId, listFeishuFields, listFeishuRecords, updateFeishuRecord } from '../lib/feishu.js'
import { ensureSchema, getAuthHash } from '../lib/d1.js'

async function guard(request, env) {
  if (!env.BERYL_D1) return { body: { error: 'no-d1-binding' }, status: 500 }
  await ensureSchema(env)
  if (!(await authorized(request, env, getAuthHash))) return { body: { error: 'unauthorized' }, status: 401 }
  return null
}

function errorResponse(cause) {
  if (cause instanceof FeishuApiError) return { body: { error: cause.code, message: cause.message }, status: cause.status || 502 }
  return { body: { error: 'feishu-request-failed', message: cause instanceof Error ? cause.message : '飞书请求失败' }, status: 502 }
}

export async function handleFeishuStatus(request, env) {
  const denied = await guard(request, env); if (denied) return denied
  return { body: { ok: true, ...feishuStatus(env), workspaceId: await feishuWorkspaceId(env) }, status: 200 }
}

export async function handleFeishuSchema(request, env) {
  const denied = await guard(request, env); if (denied) return denied
  const url = new URL(request.url)
  const requested = url.searchParams.get('tables')
  const tableKeys = (requested ? requested.split(',') : ['projects', 'tasks', 'reviews']).map(item => item.trim()).filter(Boolean)
  try {
    const entries = await Promise.all(tableKeys.map(async key => [key, await listFeishuFields(env, key)]))
    return { body: { ok: true, tables: Object.fromEntries(entries) }, status: 200 }
  } catch (cause) { return errorResponse(cause) }
}

export async function handleFeishuRecords(request, env) {
  const denied = await guard(request, env); if (denied) return denied
  const url = new URL(request.url)
  const tableKey = url.searchParams.get('table') || ''
  try {
    return { body: { ok: true, ...(await listFeishuRecords(env, tableKey, url)) }, status: 200 }
  } catch (cause) { return errorResponse(cause) }
}

export async function handleFeishuRecordCreate(request, env) {
  const denied = await guard(request, env); if (denied) return denied
  const url = new URL(request.url)
  const tableKey = url.searchParams.get('table') || ''
  let body
  try { body = await request.json() } catch { return { body: { error: 'bad-json' }, status: 400 } }
  if (!body || !body.fields || typeof body.fields !== 'object' || Array.isArray(body.fields)) return { body: { error: 'fields-required' }, status: 400 }
  try { return { body: { ok: true, ...(await createFeishuRecord(env, tableKey, body.fields)) }, status: 200 } } catch (cause) { return errorResponse(cause) }
}

export async function handleFeishuRecordUpdate(request, env) {
  const denied = await guard(request, env); if (denied) return denied
  const url = new URL(request.url)
  const tableKey = url.searchParams.get('table') || ''
  const recordId = url.pathname.split('/').pop()
  let body
  try { body = await request.json() } catch { return { body: { error: 'bad-json' }, status: 400 } }
  if (!body || !body.fields || typeof body.fields !== 'object' || Array.isArray(body.fields)) return { body: { error: 'fields-required' }, status: 400 }
  try { return { body: { ok: true, ...(await updateFeishuRecord(env, tableKey, recordId, body.fields)) }, status: 200 } } catch (cause) { return errorResponse(cause) }
}
