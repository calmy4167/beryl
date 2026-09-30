import { authorized, hashPassword } from './lib/auth.js';
import { corsHeaders, json } from './lib/http.js';
import { ensureSchema, getAuthHash, legacySyncEnabled, maxTs } from './lib/d1.js';
import { handleEntityPull, handleEntityPush, handleSyncPull, handleSyncPush } from './routes/sync.js';
import { handleBootstrap, handleCurrentSession, handleLogin, handleLogout, handlePasswordChange, handleRefresh, handlePublicSecurityPolicy, handleCreateLoginChallenge } from './routes/auth.js';
import { handleCreateUser, handleDeleteUser, handleListUsers, handleResetUserPassword, handleSetUserStatus, handleUpdateUser, handleSetUserRoles, handleUnlockUser } from './routes/users.js';
import { handleAuditLogs, handleCapabilities, handleDeleteRole, handleRevokeSession, handleRevokeUserSessions, handleRoles, handleSaveRole, handleSecuritySettings, handleSessions } from './routes/system-admin.js';
import { handleLegacyExport, handleLegacyMigrationComplete, handleLegacyStatus } from './routes/legacy-migration.js';
import { handleGetUserKey, handlePutUserKey, handleVaultPull, handleVaultPush, handleVaultSnapshot } from './routes/vault.js';
import { handleFeishuRecordCreate, handleFeishuRecordUpdate, handleFeishuRecords, handleFeishuSchema, handleFeishuStatus } from './routes/feishu.js';

/**
 * Beryl 云端 API — 独立 Cloudflare Worker（v2 阶段 4）
 * ================================================================
 * 存储从 KV（整包快照）升级为 D1（SQLite，按键记录 + LWW + 游标增量）。
 * 前端由 Cloudflare Pages 独立托管，Worker 只提供数据 API：
 *   - 增量 API：/api/sync/pull、/api/sync/push（新前端使用）
 *   - 兼容 API：/api/data（旧前端全量快照仍可用）
 *
 * 部署步骤：
 *   1. Cloudflare → Workers & Pages → D1 → 创建数据库（如 beryl-d1）
 *   2. Worker → Settings → Bindings → D1：变量名 BERYL_D1 → 选择 beryl-d1
 *   3. 部署 Worker → 完成
 *   4. 首个管理员通过 CALMY_BOOTSTRAP_SECRET 调用 /api/auth/bootstrap 创建；
 *      不要把该环境密钥写入 wrangler.toml 或提交到 Git。
 *   5. 当前版本已完成 KV 退役：D1 是唯一云端数据和认证来源。
 *
 * 协议（v2 阶段 3/4）：
 *   POST /api/sync/pull { since, sinceDevice, sinceKey } → { ok, records, nextCursor, hasMore, maxTs }
 *   POST /api/sync/push { changes:[{key,ts,device,value}] } → { ok, maxTs }
 *     - 服务端 LWW：仅当新 ts 大于现有记录 ts 时覆盖
 *     - value 为前端 AES-GCM 密文（服务端不感知内容）
 * ================================================================ */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    const respond = (body, status = 200) => json(body, status, cors);

    if (request.method === 'OPTIONS') {
      return new Response('OK', { headers: cors });
    }

    // 容忍尾斜杠：/api/setup/ 与 /api/setup 等效
    const p = url.pathname.replace(/\/+$/, '');

    /** 部署诊断：不暴露业务数据，仅用于前端和人工确认 Worker/D1 是否可用。 */
    if (p === '/api/health' && request.method === 'GET') {
      if (!env.BERYL_D1) return respond({ ok: false, error: 'no-d1-binding' }, 500);
      try {
        await ensureSchema(env);
        return respond({ ok: true, service: 'beryl-api', protocol: 2 });
      } catch {
        return respond({ ok: false, error: 'd1-unavailable' }, 503);
      }
    }

    if (p === '/api/auth/bootstrap' && request.method === 'POST') {
      const r = await handleBootstrap(request, env); return respond(r.body, r.status || 200);
    }
    if (p === '/api/auth/security-policy' && request.method === 'GET') {
      const r = await handlePublicSecurityPolicy(request, env); return respond(r.body, r.status || 200);
    }
    if (p === '/api/auth/challenge' && request.method === 'POST') {
      const r = await handleCreateLoginChallenge(request, env); return respond(r.body, r.status || 200);
    }
    if (p === '/api/auth/login' && request.method === 'POST') {
      const r = await handleLogin(request, env); return respond(r.body, r.status || 200);
    }
    if (p === '/api/auth/session' && request.method === 'GET') {
      const r = await handleCurrentSession(request, env); return respond(r.body, r.status || 200);
    }
    if (p === '/api/auth/refresh' && request.method === 'POST') {
      const r = await handleRefresh(request, env); return respond(r.body, r.status || 200);
    }
    if (p === '/api/auth/logout' && request.method === 'POST') {
      const r = await handleLogout(request, env); return respond(r.body, r.status || 200);
    }
    if (p === '/api/auth/password' && request.method === 'POST') {
      const r = await handlePasswordChange(request, env); return respond(r.body, r.status || 200);
    }

    if (p === '/api/admin/users' && request.method === 'GET') {
      const r = await handleListUsers(request, env); return respond(r.body, r.status || 200);
    }
    if (p === '/api/admin/users' && request.method === 'POST') {
      const r = await handleCreateUser(request, env); return respond(r.body, r.status || 200);
    }
    if (p === '/api/admin/capabilities' && request.method === 'GET') {
      const r = await handleCapabilities(request, env); return respond(r.body, r.status || 200);
    }
    if (p === '/api/admin/roles' && request.method === 'GET') {
      const r = await handleRoles(request, env); return respond(r.body, r.status || 200);
    }
    if (p === '/api/admin/roles' && request.method === 'POST') {
      const r = await handleSaveRole(request, env); return respond(r.body, r.status || 200);
    }
    const roleMatch = p.match(/^\/api\/admin\/roles\/([^/]+)$/);
    if (roleMatch && request.method === 'PUT') {
      const r = await handleSaveRole(request, env, decodeURIComponent(roleMatch[1])); return respond(r.body, r.status || 200);
    }
    if (roleMatch && request.method === 'DELETE') {
      const r = await handleDeleteRole(request, env, decodeURIComponent(roleMatch[1])); return respond(r.body, r.status || 200);
    }
    if (p === '/api/admin/security' && request.method === 'GET') {
      const r = await handleSecuritySettings(request, env, 'GET'); return respond(r.body, r.status || 200);
    }
    if (p === '/api/admin/security' && request.method === 'PUT') {
      const r = await handleSecuritySettings(request, env, 'PUT'); return respond(r.body, r.status || 200);
    }
    if (p === '/api/admin/login-logs' && request.method === 'GET') {
      const r = await handleAuditLogs(request, env, 'login'); return respond(r.body, r.status || 200);
    }
    if (p === '/api/admin/operation-logs' && request.method === 'GET') {
      const r = await handleAuditLogs(request, env, 'operation'); return respond(r.body, r.status || 200);
    }
    if (p === '/api/admin/sessions' && request.method === 'GET') {
      const r = await handleSessions(request, env); return respond(r.body, r.status || 200);
    }
    const sessionMatch = p.match(/^\/api\/admin\/sessions\/([^/]+)$/);
    if (sessionMatch && request.method === 'DELETE') {
      const r = await handleRevokeSession(request, env, decodeURIComponent(sessionMatch[1])); return respond(r.body, r.status || 200);
    }
    const userSessionsMatch = p.match(/^\/api\/admin\/users\/([^/]+)\/sessions$/);
    if (userSessionsMatch && request.method === 'DELETE') {
      const r = await handleRevokeUserSessions(request, env, decodeURIComponent(userSessionsMatch[1])); return respond(r.body, r.status || 200);
    }
    const userStatusMatch = p.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
    if (userStatusMatch && request.method === 'PATCH') {
      const r = await handleSetUserStatus(request, env, decodeURIComponent(userStatusMatch[1])); return respond(r.body, r.status || 200);
    }
    const userRolesMatch = p.match(/^\/api\/admin\/users\/([^/]+)\/roles$/);
    if (userRolesMatch && request.method === 'PUT') {
      const r = await handleSetUserRoles(request, env, decodeURIComponent(userRolesMatch[1])); return respond(r.body, r.status || 200);
    }
    const userUnlockMatch = p.match(/^\/api\/admin\/users\/([^/]+)\/unlock$/);
    if (userUnlockMatch && request.method === 'POST') {
      const r = await handleUnlockUser(request, env, decodeURIComponent(userUnlockMatch[1])); return respond(r.body, r.status || 200);
    }
    const userDeleteMatch = p.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (userDeleteMatch && request.method === 'PATCH') {
      const r = await handleUpdateUser(request, env, decodeURIComponent(userDeleteMatch[1])); return respond(r.body, r.status || 200);
    }
    if (userDeleteMatch && request.method === 'DELETE') {
      const r = await handleDeleteUser(request, env, decodeURIComponent(userDeleteMatch[1])); return respond(r.body, r.status || 200);
    }
    const userPasswordMatch = p.match(/^\/api\/admin\/users\/([^/]+)\/reset-password$/);
    if (userPasswordMatch && request.method === 'POST') {
      const r = await handleResetUserPassword(request, env, decodeURIComponent(userPasswordMatch[1])); return respond(r.body, r.status || 200);
    }

    if (p === '/api/admin/legacy/export' && request.method === 'GET') {
      const r = await handleLegacyExport(request, env); return respond(r.body, r.status || 200);
    }
    if (p === '/api/admin/legacy/status' && request.method === 'GET') {
      const r = await handleLegacyStatus(request, env); return respond(r.body, r.status || 200);
    }
    if (p === '/api/admin/legacy/complete' && request.method === 'POST') {
      const r = await handleLegacyMigrationComplete(request, env); return respond(r.body, r.status || 200);
    }

    if (p === '/api/vault/key' && request.method === 'GET') {
      const r = await handleGetUserKey(request, env); return respond(r.body, r.status || 200);
    }
    if (p === '/api/vault/key' && request.method === 'PUT') {
      const r = await handlePutUserKey(request, env); return respond(r.body, r.status || 200);
    }
    if (p === '/api/vault/sync/pull' && request.method === 'POST') {
      const r = await handleVaultPull(request, env); return respond(r.body, r.status || 200);
    }
    if (p === '/api/vault/sync/snapshot' && request.method === 'GET') {
      const r = await handleVaultSnapshot(request, env); return respond(r.body, r.status || 200);
    }
    if (p === '/api/vault/sync/push' && request.method === 'POST') {
      const r = await handleVaultPush(request, env); return respond(r.body, r.status || 200);
    }

    /* KV 退役前检查：只返回元数据，不返回 KV/D1 业务内容。 */
    if (p === '/api/kv-status' && request.method === 'GET') {
      if (!env.BERYL_D1) return respond({ error: 'no-d1-binding' }, 500);
      await ensureSchema(env);
      if (!(await legacySyncEnabled(env))) return respond({ error: 'identity-system-enabled' }, 410);
      if (!(await authorized(request, env, getAuthHash))) return respond({ error: 'unauthorized' }, 401);
      const count = await env.BERYL_D1.prepare('SELECT COUNT(*) AS n FROM records').first();
      const auth = await env.BERYL_D1.prepare('SELECT COUNT(*) AS n FROM auth').first();
      return respond({ ok: true, kvCompatEnabled: false, kvBound: false, legacyKvPresent: false, d1Records: Number(count?.n || 0), d1Auth: Number(auth?.n || 0) });
    }

    /* 首次设置同步密码（仅一次） */
    if (p === '/api/setup' && request.method === 'POST') {
      if (!env.BERYL_D1) return respond({ error: 'no-d1-binding' }, 500);
      await ensureSchema(env);
      if (await env.BERYL_D1.prepare('SELECT user_id FROM users LIMIT 1').first()) return respond({ error: 'identity-system-enabled' }, 410);
      if (await getAuthHash(env)) return respond({ error: 'already-setup' }, 400);
      let body;
      try { body = await request.json(); } catch (e) { return respond({ error: 'bad-json' }, 400); }
      if (!body.password || String(body.password).length < 6) return respond({ error: 'weak-password' }, 400);
      await env.BERYL_D1.prepare('INSERT OR REPLACE INTO auth (id, hash) VALUES (1, ?)')
         .bind(await hashPassword(String(body.password))).run();
      return respond({ ok: true, message: '同步密码已设置' });
    }

    if (p === '/api/sync/pull' && request.method === 'POST') { const r = await handleSyncPull(request, env); return respond(r.body, r.status || 200); }
    if (p === '/api/sync/push' && request.method === 'POST') { const r = await handleSyncPush(request, env); return respond(r.body, r.status || 200); }
    if (p === '/api/entity-sync/pull' && request.method === 'POST') { const r = await handleEntityPull(request, env); return respond(r.body, r.status || 200); }
    if (p === '/api/entity-sync/push' && request.method === 'POST') { const r = await handleEntityPush(request, env); return respond(r.body, r.status || 200); }

    /* Feishu Bitable adapter: the Worker keeps credentials server-side and exposes only the configured table boundary. */
    if (p === '/api/feishu/status' && request.method === 'GET') { const r = await handleFeishuStatus(request, env); return respond(r.body, r.status || 200); }
    if (p === '/api/feishu/schema' && request.method === 'GET') { const r = await handleFeishuSchema(request, env); return respond(r.body, r.status || 200); }
    if (p === '/api/feishu/records' && request.method === 'GET') { const r = await handleFeishuRecords(request, env); return respond(r.body, r.status || 200); }
    if (p === '/api/feishu/records' && request.method === 'POST') { const r = await handleFeishuRecordCreate(request, env); return respond(r.body, r.status || 200); }
    if (p.startsWith('/api/feishu/records/') && request.method === 'PUT') { const r = await handleFeishuRecordUpdate(request, env); return respond(r.body, r.status || 200); }

    /* 旧协议兼容：全量快照读写（旧前端/工具仍可用） */
    if (p === '/api/data') {
      if (request.method === 'GET') {
        if (!env.BERYL_D1) return respond({ error: 'no-d1-binding' }, 500);
        await ensureSchema(env);
        if (!(await legacySyncEnabled(env))) return respond({ error: 'identity-system-enabled' }, 410);
        if (!(await authorized(request, env, getAuthHash))) return respond({ error: 'unauthorized' }, 401);
        const { results } = await env.BERYL_D1.prepare(
          'SELECT key, value FROM records WHERE deleted = 0'
        ).all();
        const data = {};
        results.forEach(r => { data[r.key] = r.value; });
        return respond({ ok: true, data, updatedAt: await maxTs(env) });
      }
      if (request.method === 'PUT') {
        if (!env.BERYL_D1) return respond({ error: 'no-d1-binding' }, 500);
        await ensureSchema(env);
        if (!(await legacySyncEnabled(env))) return respond({ error: 'identity-system-enabled' }, 410);
        if (!(await authorized(request, env, getAuthHash))) return respond({ error: 'unauthorized' }, 401);
        let body;
        try { body = await request.json(); } catch (e) { return respond({ error: 'bad-json' }, 400); }
        if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
          return respond({ error: 'bad-data' }, 400);
        }
        const now = Date.now();
        const stmts = [];
        let ts = now;
        for (const [k, v] of Object.entries(body.data)) {
          if (!k.startsWith('b_')) continue;
          stmts.push(env.BERYL_D1.prepare(
            'INSERT INTO records (key, value, ts, device, deleted) VALUES (?, ?, ?, ?, 0) ' +
            'ON CONFLICT(key) DO UPDATE SET value = excluded.value, ts = excluded.ts, device = excluded.device, deleted = excluded.deleted ' +
            'WHERE excluded.ts > records.ts OR (excluded.ts = records.ts AND excluded.device > records.device)'
          ).bind(k, typeof v === 'string' ? v : JSON.stringify(v), ts++, 'legacy-put'));
        }
        if (stmts.length) await env.BERYL_D1.batch(stmts);
        return respond({ ok: true, updatedAt: now });
      }
    }

    return respond({ error: 'not-found' }, 404);
  }
};
