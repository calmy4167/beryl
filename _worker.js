/**
 * Beryl 云端 API — Cloudflare Pages 合体版（_worker.js）
 * ================================================================
 * 一个 Pages 项目同时托管【网站(index.html)】与【数据 API】：
 *   - 网站：https://<项目名>.<子域>.pages.dev/            （静态资源）
 *   - API ：https://<项目名>.<子域>.pages.dev/api/data     （本文件处理）
 *
 * 部署步骤（推荐，替代独立 Worker）：
 *   1. Cloudflare → Workers & Pages → Pages → 创建项目
 *   2. 连接 Git 仓库（beryl），或选择「直接上传」把 index.html 与 _worker.js 一起拖入
 *   3. 项目 → 设置 → 变量与机密 → KV 命名空间绑定：变量名 BERYL_KV → 选择 beryl-kv（Bindings 标签亦可）
 *   4. 重新部署（或等 push 自动构建）→ 完成
 *   5. 首次设置同步密码（仅一次）：
 *        Invoke-RestMethod -Method Post -Uri "https://<项目名>.<子域>.pages.dev/api/setup" -ContentType "application/json" -Body '{"password":"你的同步密码"}'
 *   6. 前端「☁️ Cloudflare」的 API 地址填：https://<项目名>.<子域>.pages.dev
 *
 * 说明：同步密码以 SHA-256 哈希存 KV；数据整体存 KV 单键（data）；
 *       /api/* 之外的请求全部转发给 Pages 静态资源（env.ASSETS）。
 * ================================================================ */

const KV_DATA = 'data';
const KV_AUTH = 'auth';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function authorized(request, env) {
  const expected = await env.BERYL_KV.get(KV_AUTH);
  if (!expected) return false;
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  return (await sha256(token)) === expected;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 非 API 路径：交给 Pages 静态资源（网站页面）
    if (!url.pathname.startsWith('/api/')) {
      if (request.method === 'OPTIONS') return new Response('OK', { headers: corsHeaders });
      return env.ASSETS.fetch(request);
    }

    if (request.method === 'OPTIONS') {
      return new Response('OK', { headers: corsHeaders });
    }

    // 容忍尾斜杠：/api/setup/ 与 /api/setup 等效
    const p = url.pathname.replace(/\/+$/, '');

    /* 首次设置同步密码（仅一次） */
    if (p === '/api/setup' && request.method === 'POST') {
      if (await env.BERYL_KV.get(KV_AUTH)) return json({ error: 'already-setup' }, 400);
      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'bad-json' }, 400); }
      if (!body.password || String(body.password).length < 6) return json({ error: 'weak-password' }, 400);
      await env.BERYL_KV.put(KV_AUTH, await sha256(String(body.password)));
      return json({ ok: true, message: '同步密码已设置' });
    }

    /* 数据读写 */
    if (p === '/api/data') {
      if (request.method === 'GET') {
        if (!(await authorized(request, env))) return json({ error: 'unauthorized' }, 401);
        const entry = await env.BERYL_KV.getWithMetadata(KV_DATA);
        return json({
          ok: true,
          data: entry.value ? JSON.parse(entry.value) : {},
          updatedAt: (entry.metadata && entry.metadata.updatedAt) || 0
        });
      }
      if (request.method === 'PUT') {
        if (!(await authorized(request, env))) return json({ error: 'unauthorized' }, 401);
        let body;
        try { body = await request.json(); } catch (e) { return json({ error: 'bad-json' }, 400); }
        if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
          return json({ error: 'bad-data' }, 400);
        }
        const updatedAt = Date.now();
        await env.BERYL_KV.put(KV_DATA, JSON.stringify(body.data), { metadata: { updatedAt } });
        return json({ ok: true, updatedAt });
      }
    }

    return json({ error: 'not-found' }, 404);
  }
};
