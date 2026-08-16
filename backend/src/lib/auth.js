export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const ITERATIONS = 120000;
const enc = new TextEncoder();
const hex = (bytes) => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
const bytes = (value) => new Uint8Array(value.match(/.{2}/g).map(x => parseInt(x, 16)));

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, base, 256);
  return `pbkdf2$${ITERATIONS}$${hex(salt)}$${hex(new Uint8Array(derived))}`;
}

async function verifyPassword(password, encoded) {
  const parts = String(encoded).split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return (await sha256(password)) === encoded;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 100000) return false;
  try {
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: bytes(parts[2]), iterations, hash: 'SHA-256' }, base, 256);
    return hex(new Uint8Array(derived)) === parts[3];
  } catch { return false; }
}

export async function authorized(request, env, getAuthHash) {
  const expected = await getAuthHash(env);
  if (!expected) return false;
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return !!token && await verifyPassword(token, expected);
}
