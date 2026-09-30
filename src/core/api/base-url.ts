const CONFIG_KEY = 'calmy:api-base-url'
const BUILT_IN = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')

export function apiBaseUrl(): string {
  try {
    const saved = localStorage.getItem(CONFIG_KEY)?.trim().replace(/\/+$/, '')
    if (saved) return saved
  } catch { /* use build configuration */ }
  return BUILT_IN
}

export function saveApiBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(normalized)) throw new Error('请输入以 http:// 或 https:// 开头的服务地址')
  try { localStorage.setItem(CONFIG_KEY, normalized) } catch { /* value remains in the current page */ }
  return normalized
}
