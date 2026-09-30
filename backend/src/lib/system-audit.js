function clipped(value, max = 160) {
  return String(value || '').slice(0, max);
}

export async function writeLoginAudit(env, event) {
  await env.BERYL_D1.prepare(
    'INSERT INTO login_logs (log_id, user_id, username, outcome, failure_code, ip_address, device_id, user_agent, created_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    crypto.randomUUID(),
    event.userId || null,
    clipped(event.username, 64).trim().toLowerCase(),
    ['success', 'failure', 'locked'].includes(event.outcome) ? event.outcome : 'failure',
    event.failureCode ? clipped(event.failureCode, 64) : null,
    event.ipAddress ? clipped(event.ipAddress, 64) : null,
    event.deviceId ? clipped(event.deviceId, 128) : null,
    event.userAgent ? clipped(event.userAgent, 256) : null,
    Date.now()
  ).run();
}

function safeChanges(changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return null;
  const fields = Array.isArray(changes.changedFields)
    ? changes.changedFields.map(value => clipped(value, 64)).filter(Boolean).slice(0, 40)
    : [];
  return JSON.stringify({ changedFields: fields });
}

export async function writeOperationAudit(env, event) {
  await env.BERYL_D1.prepare(
    'INSERT INTO operation_logs (log_id, actor_user_id, action, target_type, target_id, outcome, changes_json, created_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    crypto.randomUUID(),
    event.actorUserId,
    clipped(event.action, 100),
    clipped(event.targetType, 80),
    event.targetId ? clipped(event.targetId, 128) : null,
    event.outcome === 'failure' ? 'failure' : 'success',
    safeChanges(event.changes),
    Date.now()
  ).run();
}
