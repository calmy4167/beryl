import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { fmtDate, store } from '@/core/storage'
import { createCollectionRepository, createEntityId } from '@/core/repository'
import { registerUndo } from '@/core/undo'
import { withSaveState } from '@/core/save-state'
import { listRealityDocuments } from '@/domain/reality'

interface StoredPost {
  id?: string
  title?: string
  content?: string
  date?: string
  archivedAt?: number
}

interface PostItem {
  id: string
  title: string
  content: string
  date: string
  archivedAt?: number
}

type PostFilter = 'active' | 'archived' | 'all'

const postRepository = createCollectionRepository<StoredPost>('posts')

const toast = (message: string, kind: 'success' | 'warning' | 'error' = 'success') => {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

function readStoredPosts(): StoredPost[] {
  const value = store.get<unknown>('posts', [])
  return Array.isArray(value)
    ? value.filter(item => !!item && typeof item === 'object') as StoredPost[]
    : []
}

function loadPosts(): PostItem[] {
  const storedById = new Map(readStoredPosts().filter(item => typeof item.id === 'string').map(item => [item.id!, item]))

  return listRealityDocuments({ types: ['post'] })
    .map(document => {
      const stored = storedById.get(document.id)
      return {
        id: document.id,
        title: stored?.title?.trim() || document.title,
        content: stored?.content || document.body || document.summary || '文章暂无正文',
        date: stored?.date || document.date || '',
        archivedAt: stored?.archivedAt,
      }
    })
    .sort((a, b) => {
      const aTime = Date.parse(a.date) || 0
      const bTime = Date.parse(b.date) || 0
      return bTime - aTime
    })
}

function formatDate(value: string): string {
  if (!value) return '未记录日期'
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString('zh-CN') : value
}

export function PostsPage() {
  const [posts, setPosts] = useState<PostItem[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<PostFilter>('active')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [editingId, setEditingId] = useState<string>()
  const [reading, setReading] = useState<PostItem>()
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function refresh(): void {
    try {
      setPosts(loadPosts())
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '文章读取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const onDataSynced = () => refresh()
    window.addEventListener('beryl-data-synced', onDataSynced)
    return () => window.removeEventListener('beryl-data-synced', onDataSynced)
  }, [])

  const visiblePosts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return posts.filter(post => {
      const matchesFilter = filter === 'all' || (filter === 'archived' ? !!post.archivedAt : !post.archivedAt)
      const searchable = `${post.title} ${post.content}`.toLocaleLowerCase()
      return matchesFilter && (!normalized || searchable.includes(normalized))
    })
  }, [filter, posts, query])

  function resetEditor(): void {
    setEditingId(undefined)
    setTitle('')
    setContent('')
  }

  function beginEdit(post: PostItem): void {
    setEditingId(post.id)
    setTitle(post.title)
    setContent(post.content)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function savePost(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const nextTitle = title.trim()
    const nextContent = content.trim()
    if (!nextTitle || !nextContent) {
      toast('标题和内容都要填写哦', 'warning')
      return
    }

    setSaving(true)
    try {
      await withSaveState(async () => {
        if (editingId) {
          const updated = postRepository.update(editingId, current => ({
            ...current,
            title: nextTitle,
            content: nextContent,
            date: current.date || fmtDate(Date.now()),
          }))
          if (!updated) throw new Error('文章不存在，可能已被其他设备删除')
        } else {
          postRepository.create({ id: createEntityId(), title: nextTitle, content: nextContent, date: fmtDate(Date.now()) })
        }
      })
      const wasEditing = !!editingId
      resetEditor()
      refresh()
      toast(wasEditing ? '文章已更新' : '文章已发布 ✍️')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '文章保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function toggleArchive(post: PostItem): Promise<void> {
    setSaving(true)
    try {
      await withSaveState(async () => {
        const updated = postRepository.update(post.id, current => {
          const next = { ...current }
          if (post.archivedAt) delete next.archivedAt
          else next.archivedAt = Date.now()
          return next
        })
        if (!updated) throw new Error('文章不存在，可能已被其他设备删除')
      })
      if (reading?.id === post.id) setReading(undefined)
      refresh()
      toast(post.archivedAt ? '文章已恢复' : '文章已归档')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '文章归档失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function removePost(post: PostItem): Promise<void> {
    if (!window.confirm(`确认永久删除文章“${post.title}”吗？归档文章也可以保留在归档列表中。`)) return
    setSaving(true)
    try {
      await withSaveState(async () => {
        const raw = readStoredPosts()
        const index = raw.findIndex(item => item.id === post.id)
        const removed = index >= 0 ? raw[index] : undefined
        if (!removed) throw new Error('文章不存在，可能已被其他设备删除')
        if (!postRepository.remove(post.id)) throw new Error('文章删除失败')
        registerUndo('posts', removed, index, post.id)
      })
      if (reading?.id === post.id) setReading(undefined)
      if (editingId === post.id) resetEditor()
      refresh()
      toast('文章已删除，可在提示消失前撤销')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '文章删除失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="posts-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">POSTS · KNOWLEDGE</p>
          <h1 className="font-title">文章</h1>
          <p>把值得留下的经验写成文章，按需检索并持续整理。</p>
        </div>
        <span className="load-pill">{posts.filter(post => !post.archivedAt).length} 篇在库</span>
      </header>

      <section className="beryl-card matter-create">
        <form onSubmit={event => void savePost(event)}>
          <div className="panel-head">
            <div>
              <p className="eyebrow">{editingId ? 'EDIT POST' : 'NEW POST'}</p>
              <h2 className="font-title">{editingId ? '编辑文章' : '写一篇文章'}</h2>
            </div>
            {editingId && <button type="button" className="react-btn" onClick={resetEditor} disabled={saving}>取消编辑</button>}
          </div>
          <input aria-label="文章标题" value={title} onChange={event => setTitle(event.target.value)} placeholder="文章标题" disabled={saving} />
          <textarea aria-label="文章内容" value={content} onChange={event => setContent(event.target.value)} placeholder="写下你的文章……支持 Markdown 文本" rows={8} disabled={saving} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="primary" type="submit" disabled={saving}>{saving ? '保存中…' : editingId ? '保存修改' : '发布文章'}</button>
          </div>
        </form>
      </section>

      <section className="beryl-card admin-block">
        <div className="panel-head">
          <div>
            <p className="eyebrow">ARTICLE INDEX</p>
            <h2 className="font-title">文章列表</h2>
          </div>
          <span>{loading ? '正在读取…' : `${visiblePosts.length} 篇`}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '16px 0' }}>
          <input aria-label="搜索文章" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索标题或正文" />
          <div className="range-tabs" role="tablist" aria-label="文章状态筛选">
            {([['active', '在库'], ['archived', '已归档'], ['all', '全部']] as Array<[PostFilter, string]>).map(([value, label]) => (
              <button key={value} type="button" className={filter === value ? 'on' : ''} role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}>{label}</button>
            ))}
          </div>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {loading ? <div className="empty-state">正在读取文章…</div> : visiblePosts.length ? (
          <div className="history-list" aria-live="polite">
            {visiblePosts.map(post => (
              <article className="beryl-card history-card" key={post.id}>
                <div className="panel-head">
                  <button type="button" onClick={() => setReading(post)} style={{ flex: 1, minWidth: 0, border: 0, padding: 0, background: 'transparent', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                    <h3 style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</h3>
                  </button>
                  <small>{formatDate(post.date)}</small>
                </div>
                <p style={{ margin: '8px 0 0', color: 'var(--c-text-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflow: 'hidden', maxHeight: '4.8em' }}>{post.content}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  <button type="button" className="react-btn" onClick={() => setReading(post)} disabled={saving}>阅读全文</button>
                  <button type="button" className="react-btn" onClick={() => beginEdit(post)} disabled={saving}>编辑</button>
                  <button type="button" className="react-btn" onClick={() => void toggleArchive(post)} disabled={saving}>{post.archivedAt ? '恢复' : '归档'}</button>
                  <button type="button" className="react-btn danger" onClick={() => void removePost(post)} disabled={saving}>删除</button>
                </div>
              </article>
            ))}
          </div>
        ) : <div className="empty-state">{query ? '没有匹配的文章。' : filter === 'archived' ? '还没有归档文章。' : '还没有文章，把值得留下的经验写下来。'}</div>}
      </section>

      {reading && (
        <div className="el-drawer-overlay" role="presentation" onClick={() => setReading(undefined)}>
          <aside className="el-drawer" role="dialog" aria-modal="true" aria-label={reading.title} onClick={event => event.stopPropagation()}>
            <div className="drawer">
              <button type="button" className="drawer-close" aria-label="关闭文章阅读" onClick={() => setReading(undefined)}>×</button>
              <p className="eyebrow">ARTICLE</p>
              <h1 className="font-title" style={{ fontSize: 'clamp(28px, 5vw, 42px)', lineHeight: 1.15 }}>{reading.title}</h1>
              <p className="muted">{formatDate(reading.date)}{reading.archivedAt ? ' · 已归档' : ''}</p>
              <hr style={{ border: 0, borderTop: '1px solid var(--c-border-soft)', margin: '20px 0' }} />
              <div style={{ maxWidth: 720, margin: '0 auto', lineHeight: 1.9, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{reading.content}</div>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
