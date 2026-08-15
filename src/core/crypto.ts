/* ============ v2 阶段 5：AES-GCM 数据加密 ============
 * 主密码（同步密码）→ PBKDF2(100k, SHA-256, 随机盐) → AES-GCM 密钥。
 * 每个值独立随机盐 + IV；密文格式：{ v: 2, salt, iv, ct }（hex）。
 * 云端只存密文；解密失败返回 null（调用方决定回退/报错）。
 * crypto.subtle 不可用（非 HTTPS / 非本机）时返回 null，不抛异常。
 */
const enc = new TextEncoder()

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}
function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}
function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n)
  crypto.getRandomValues(buf)
  return buf
}

/** 派生密钥：PBKDF2(password, salt, 100k) → AES-GCM 256 位 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey | null> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
    return await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    )
  } catch {
    return null
  }
}

/** 加密一个值；返回密文对象或 null（不可用/失败） */
export async function encryptValue(password: string, plain: string): Promise<{ v: number; salt: string; iv: string; ct: string } | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null
  try {
    const salt = randomBytes(16)
    const iv = randomBytes(12)
    const key = await deriveKey(password, salt)
    if (!key) return null
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain))
    return { v: 2, salt: toHex(salt), iv: toHex(iv), ct: toHex(new Uint8Array(ct)) }
  } catch {
    return null
  }
}

/** 解密一个值；失败返回 null（密码错误/数据损坏/不支持） */
export async function decryptValue(password: string, payload: unknown): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null
  try {
    const p = payload as { v?: number; salt?: string; iv?: string; ct?: string }
    if (!p || p.v !== 2 || typeof p.salt !== 'string' || typeof p.iv !== 'string' || typeof p.ct !== 'string') {
      return null // 不是密文格式（可能是旧明文）
    }
    const key = await deriveKey(password, fromHex(p.salt))
    if (!key) return null
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromHex(p.iv) }, key, fromHex(p.ct))
    return new TextDecoder().decode(pt)
  } catch {
    return null
  }
}
