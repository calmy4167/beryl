import { sync } from '@/core/sync'
import { readFeishuCache, writeFeishuCache } from '@/core/feishu/cache'
import { FeishuWorkspace } from '@/core/feishu/workspace'

const browserStorage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
}

export const feishuWorkspace = new FeishuWorkspace(() => {
  const config = sync.saved.cloud
  return config?.url && config.key ? { baseUrl: config.url.replace(/\/+$/, ''), syncKey: config.key } : null
}, undefined, browserStorage, { get: readFeishuCache, set: writeFeishuCache })
