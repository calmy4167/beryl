const ITERATIONS = 210_000;
const encoder = new TextEncoder();
const toHex = bytes => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
const fromHex = hex => Uint8Array.from(hex.match(/.{2}/g) || [], value => Number.parseInt(value, 16));

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const input = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, input, 256);
  return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${toHex(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, encoded) {
  const [algorithm, iterationText, saltHex, expectedHex, extra] = String(encoded || '').split('$');
  const iterations = Number(iterationText);
  if (algorithm !== 'pbkdf2' || extra !== undefined || !Number.isInteger(iterations) || iterations < 210_000 || !/^[0-9a-f]{32}$/.test(saltHex || '') || !/^[0-9a-f]{64}$/.test(expectedHex || '')) return false;
  try {
    const input = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromHex(saltHex), iterations, hash: 'SHA-256' }, input, 256);
    const actual = new Uint8Array(bits);
    const expected = fromHex(expectedHex);
    let difference = 0;
    for (let index = 0; index < actual.length; index++) difference |= actual[index] ^ expected[index];
    return difference === 0;
  } catch {
    return false;
  }
}

export function generateTemporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
