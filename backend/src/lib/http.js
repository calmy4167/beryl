export function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = String(env.FRONTEND_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
  const allowOrigin = !allowed.length ? '*' : (origin && allowed.includes(origin) ? origin : 'null');
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin'
  };
}

export function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}
