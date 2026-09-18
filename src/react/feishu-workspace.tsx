import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { sync } from '@/core/sync'
import { FeishuWorkspace, watchFeishuWorkspace } from '@/core/feishu/workspace'
import { readTodayReferences, writeTodayReferences } from '@/core/feishu/model'
import { todayKey } from '@/core/storage'

const sourceKey = 'calmy:workspace:source'
const sourceEvent = 'calmy-workspace-source'
const todayEvent = 'calmy-feishu-today'
function source(): 'local' | 'feishu' {
  try { return localStorage.getItem(sourceKey) === 'feishu' ? 'feishu' : 'local' } catch { return 'local' }
}
function subscribeSource(listener: () => void): () => void {
  window.addEventListener(sourceEvent, listener)
  window.addEventListener('storage', listener)
  return () => { window.removeEventListener(sourceEvent, listener); window.removeEventListener('storage', listener) }
}
const browserStorage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
}
export const feishuWorkspace = new FeishuWorkspace(() => {
  const config = sync.saved.cloud
  return config?.url && config.key ? { baseUrl: config.url.replace(/\/+$/, ''), syncKey: config.key } : null
}, undefined, browserStorage)

export function useFeishuWorkspace() {
  const snapshot = useSyncExternalStore(feishuWorkspace.subscribe, feishuWorkspace.getSnapshot)
  useEffect(() => watchFeishuWorkspace(feishuWorkspace), [])
  return snapshot
}

export function WorkspaceSourceBar({ forcedFeishu = false }: { forcedFeishu?: boolean }) {
  const selected = useSyncExternalStore(subscribeSource, source)
  const snapshot = useSyncExternalStore(feishuWorkspace.subscribe, feishuWorkspace.getSnapshot)
  const [error, setError] = useState('')
  const choose = (value: 'local' | 'feishu') => {
    try { localStorage.setItem(sourceKey, value); window.dispatchEvent(new Event(sourceEvent)); setError('') }
    catch { setError('浏览器无法保存来源选择，请允许网站存储。') }
  }
  return <section className="beryl-card workspace-source" aria-label="数据来源">
    <div><b>数据来源</b><div className="range-tabs" role="group" aria-label="选择数据来源">
      <button type="button" aria-pressed={!forcedFeishu && selected === 'local'} className={!forcedFeishu && selected === 'local' ? 'on' : ''} disabled={snapshot.saving || forcedFeishu} onClick={() => choose('local')}>本地</button>
      <button type="button" aria-pressed={forcedFeishu || selected === 'feishu'} className={forcedFeishu || selected === 'feishu' ? 'on' : ''} disabled={snapshot.saving} onClick={() => choose('feishu')}>飞书</button>
    </div></div>
    <small>{forcedFeishu || selected === 'feishu' ? '任务直接保存在飞书；前台每 15 秒检查更新。' : '保留原有本机数据；切换来源不会迁移或删除数据。'} {forcedFeishu && '此工作台始终显示飞书。'}</small>
    <Link to="/app/admin">连接设置 →</Link><Link to="/app/feishu">飞书工作台 →</Link>
    {error && <p role="alert">{error}</p>}
  </section>
}

export function WorkspacePage({ local, feishu }: { local: ReactNode; feishu: ReactNode }) {
  const selected = useSyncExternalStore(subscribeSource, source)
  return <><WorkspaceSourceBar />{selected === 'feishu' ? feishu : local}</>
}

export function addFeishuTaskToToday(workspaceId: string, recordId: string): void {
  const date = todayKey()
  const ids = readTodayReferences(browserStorage, workspaceId, date)
  if (!ids.includes(recordId) && ids.length >= 3) throw new Error('今天已选了 3 项；任务已保存在飞书，可在 Today 调整选择。')
  writeTodayReferences(browserStorage, workspaceId, date, [...ids, recordId])
  window.dispatchEvent(new Event(todayEvent))
}

export function useFeishuToday(workspaceId: string) {
  const date = todayKey()
  const [ids, setIds] = useState<string[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    const load = () => setIds(workspaceId ? readTodayReferences(browserStorage, workspaceId, date) : [])
    load()
    window.addEventListener(todayEvent, load)
    window.addEventListener('storage', load)
    return () => { window.removeEventListener(todayEvent, load); window.removeEventListener('storage', load) }
  }, [workspaceId, date])
  const save = (next: string[]) => {
    try { writeTodayReferences(browserStorage, workspaceId, date, next); setIds(next.slice(0, 3)); setError(''); window.dispatchEvent(new Event(todayEvent)) }
    catch { setError('今日选择未保存：浏览器无法写入本机设置。') }
  }
  return { ids, save, error }
}
