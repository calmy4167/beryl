import { readFeishuCache, writeFeishuCache } from '@/core/feishu/cache'
import { FeishuWorkspace } from '@/core/feishu/workspace'
import { apiBaseUrl } from '@/core/api/base-url'
import { getActiveAccount } from '@/core/account-context'

const browserStorage = {
  getItem: (key: string) => localStorage.getItem(storageKey(key)),
  setItem: (key: string, value: string) => localStorage.setItem(storageKey(key), value),
}

function storageKey(key: string): string {
  const userId = getActiveAccount()
  return userId ? `calmy:user:${encodeURIComponent(userId)}:${key}` : key
}

export const feishuWorkspace = new FeishuWorkspace(() => {
  const baseUrl = apiBaseUrl()
  return baseUrl ? { baseUrl } : null
}, undefined, browserStorage, { get: readFeishuCache, set: writeFeishuCache })
