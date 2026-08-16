import { authorized, hashPassword } from './lib/auth.js';
import { corsHeaders, json } from './lib/http.js';
import { ensureSchema, getAuthHash, maxTs } from './lib/d1.js';
import { handleEntityPull, handleEntityPush, handleSyncPull, handleSyncPush } from './routes/sync.js';

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
 *   4. 首次设置同步密码（仅一次）：
 *        Invoke-RestMethod -Method Post -Uri "https://<Worker 地址>/api/setup" -ContentType "application/json" -Body '{"password":"你的同步密码"}'
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

    /* KV 退役前检查：只返回元数据，不返回 KV/D1 业务内容。 */
    if (p === '/api/kv-status' && request.method === 'GET') {
      if (!env.BERYL_D1) return respond({ error: 'no-d1-binding' }, 500);
      await ensureSchema(env);
      if (!(await authorized(request, env, getAuthHash))) return respond({ error: 'unauthorized' }, 401);
      const count = await env.BERYL_D1.prepare('SELECT COUNT(*) AS n FROM records').first();
      const auth = await env.BERYL_D1.prepare('SELECT COUNT(*) AS n FROM auth').first();
      return respond({ ok: true, kvCompatEnabled: false, kvBound: false, legacyKvPresent: false, d1Records: Number(count?.n || 0), d1Auth: Number(auth?.n || 0) });
    }

    /* 首次设置同步密码（仅一次） */
    if (p === '/api/setup' && request.method === 'POST') {
      if (!env.BERYL_D1) return respond({ error: 'no-d1-binding' }, 500);
      await ensureSchema(env);
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

    /* 旧协议兼容：全量快照读写（旧前端/工具仍可用） */
    if (p === '/api/data') {
      if (request.method === 'GET') {
        if (!env.BERYL_D1) return respond({ error: 'no-d1-binding' }, 500);
        await ensureSchema(env);
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
