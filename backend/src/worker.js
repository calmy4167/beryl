import { authorized, sha256 } from './lib/auth.js';
import { corsHeaders, json } from './lib/http.js';

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
 *   5. 旧 KV 数据自动迁移：若项目仍绑定 BERYL_KV（beryl-kv），首次请求时自动导入
 *      records 表（含 auth 密码哈希），迁移完成后 KV 绑定可解除。
 *
 * 协议（v2 阶段 3/4）：
 *   POST /api/sync/pull { since }   → { ok, records:[{key,value,ts,device,deleted}], maxTs }
 *   POST /api/sync/push { changes:[{key,ts,device,value}] } → { ok, maxTs }
 *     - 服务端 LWW：仅当新 ts 大于现有记录 ts 时覆盖
 *     - value 为前端 AES-GCM 密文（服务端不感知内容）
 * ================================================================ */

/* ---------- D1 模式（v2 阶段 4） ---------- */

let schemaReady = false;
let schemaPromise = null;

async function ensureSchema(env) {
  if (schemaReady) return;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await env.BERYL_D1.prepare(
        'CREATE TABLE IF NOT EXISTS records (' +
        'key TEXT PRIMARY KEY, value TEXT NOT NULL, ts INTEGER NOT NULL, ' +
        'device TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)'
      ).run();
      await env.BERYL_D1.prepare(
        'CREATE TABLE IF NOT EXISTS auth (id INTEGER PRIMARY KEY CHECK (id = 1), hash TEXT NOT NULL)'
      ).run();
      await migrateFromKv(env);
      schemaReady = true;
    })();
  }
  await schemaPromise;
}

/** 旧 KV 数据自动迁移（仅当 D1 records 为空且 KV 绑定存在） */
async function migrateFromKv(env) {
  if (!env.BERYL_KV) return;
  const count = await env.BERYL_D1.prepare('SELECT COUNT(*) AS n FROM records').first();
  if (count && count.n > 0) return;
  try {
    const entry = await env.BERYL_KV.getWithMetadata('data');
    if (entry && entry.value) {
      const data = JSON.parse(entry.value);
      const stmts = [];
      let ts = Date.now();
      for (const [k, v] of Object.entries(data)) {
        if (!k.startsWith('b_')) continue;
        stmts.push(env.BERYL_D1.prepare(
          'INSERT OR IGNORE INTO records (key, value, ts, device, deleted) VALUES (?, ?, ?, ?, 0)'
        ).bind(k, typeof v === 'string' ? v : JSON.stringify(v), ts++, 'kv-migrate'));
      }
      if (stmts.length) await env.BERYL_D1.batch(stmts);
    }
    const auth = await env.BERYL_KV.get('auth');
    if (auth) {
      await env.BERYL_D1.prepare('INSERT OR IGNORE INTO auth (id, hash) VALUES (1, ?)').bind(auth).run();
    }
  } catch (e) {
    /* 迁移失败不阻断 API（下次请求重试） */
  }
}

async function getAuthHash(env) {
  await ensureSchema(env);
  const row = await env.BERYL_D1.prepare('SELECT hash FROM auth WHERE id = 1').first();
  if (row) return row.hash;
  // D1 无密码：回退旧 KV 中的密码哈希（并顺手迁移进 D1，兼容升级期）
  if (env.BERYL_KV) {
    try {
      const kvAuth = await env.BERYL_KV.get('auth');
      if (kvAuth) {
        await env.BERYL_D1.prepare('INSERT OR IGNORE INTO auth (id, hash) VALUES (1, ?)').bind(kvAuth).run();
        return kvAuth;
      }
    } catch (e) { /* ignore */ }
  }
  return null;
}

async function maxTs(env) {
  const row = await env.BERYL_D1.prepare('SELECT COALESCE(MAX(ts), 0) AS m FROM records').first();
  return row ? Number(row.m) : 0;
}

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

    /* 首次设置同步密码（仅一次） */
    if (p === '/api/setup' && request.method === 'POST') {
      if (!env.BERYL_D1) return respond({ error: 'no-d1-binding' }, 500);
      await ensureSchema(env);
      if (await getAuthHash(env)) return respond({ error: 'already-setup' }, 400);
      let body;
      try { body = await request.json(); } catch (e) { return respond({ error: 'bad-json' }, 400); }
      if (!body.password || String(body.password).length < 6) return respond({ error: 'weak-password' }, 400);
      await env.BERYL_D1.prepare('INSERT OR REPLACE INTO auth (id, hash) VALUES (1, ?)')
        .bind(await sha256(String(body.password))).run();
      return respond({ ok: true, message: '同步密码已设置' });
    }

    /* 增量拉取（阶段 3/4 协议） */
    if (p === '/api/sync/pull' && request.method === 'POST') {
      if (!env.BERYL_D1) return respond({ error: 'no-d1-binding' }, 500);
      await ensureSchema(env);
      if (!(await authorized(request, env, getAuthHash))) return respond({ error: 'unauthorized' }, 401);
      let body;
      try { body = await request.json(); } catch (e) { return respond({ error: 'bad-json' }, 400); }
      const since = Number(body && body.since) || 0;
      const { results } = await env.BERYL_D1.prepare(
        'SELECT key, value, ts, device, deleted FROM records WHERE ts > ? ORDER BY ts ASC LIMIT 500'
      ).bind(since).all();
      return respond({ ok: true, records: results.map(r => ({
        key: r.key, value: r.value, ts: r.ts, device: r.device, deleted: !!r.deleted
      })), maxTs: await maxTs(env) });
    }

    /* 增量推送（阶段 3/4 协议，服务端 LWW） */
    if (p === '/api/sync/push' && request.method === 'POST') {
      if (!env.BERYL_D1) return respond({ error: 'no-d1-binding' }, 500);
      await ensureSchema(env);
      if (!(await authorized(request, env, getAuthHash))) return respond({ error: 'unauthorized' }, 401);
      let body;
      try { body = await request.json(); } catch (e) { return respond({ error: 'bad-json' }, 400); }
      const changes = Array.isArray(body && body.changes) ? body.changes : [];
      if (!changes.length) return respond({ ok: true, maxTs: await maxTs(env) });
      const stmts = changes
        .filter(c => c && typeof c.key === 'string' && c.key.startsWith('b_') && typeof c.ts === 'number')
        .map(c => env.BERYL_D1.prepare(
          'INSERT INTO records (key, value, ts, device, deleted) VALUES (?, ?, ?, ?, 0) ' +
          'ON CONFLICT(key) DO UPDATE SET value = excluded.value, ts = excluded.ts, device = excluded.device, deleted = excluded.deleted ' +
          'WHERE excluded.ts > records.ts'
        ).bind(c.key, typeof c.value === 'string' ? c.value : JSON.stringify(c.value), c.ts, String(c.device || 'unknown')));
      if (stmts.length) await env.BERYL_D1.batch(stmts);
      return respond({ ok: true, maxTs: await maxTs(env) });
    }

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
            'ON CONFLICT(key) DO UPDATE SET value = excluded.value, ts = excluded.ts, device = excluded.device, deleted = excluded.deleted'
          ).bind(k, typeof v === 'string' ? v : JSON.stringify(v), ts++, 'legacy-put'));
        }
        if (stmts.length) await env.BERYL_D1.batch(stmts);
        return respond({ ok: true, updatedAt: now });
      }
    }

    return respond({ error: 'not-found' }, 404);
  }
};
