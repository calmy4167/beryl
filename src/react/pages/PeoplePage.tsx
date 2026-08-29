import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { withSaveState } from '@/core/save-state'
import { unifiedAsyncRepository, unifiedFactories, type Person } from '@/domain/unified'

type PersonFilter = 'active' | 'archived' | 'all'

interface PersonFormState {
  displayName: string
  roles: string
  domain: string
  notes: string
  tags: string
}

const emptyForm: PersonFormState = {
  displayName: '',
  roles: '',
  domain: '',
  notes: '',
  tags: ''
}

const toast = (message: string, kind: 'success' | 'warning' | 'error' = 'success') => {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

function splitValues(value: string): string[] {
  return [...new Set(value.split(/[,，、\n]/).map(item => item.trim()).filter(Boolean))]
}

function matchesSearch(person: Person, query: string): boolean {
  if (!query.trim()) return true
  const haystack = [
    person.displayName,
    person.domain || '',
    person.notes || '',
    ...person.roles,
    ...person.tags
  ].join(' ').toLocaleLowerCase()
  return haystack.includes(query.trim().toLocaleLowerCase())
}

function formatUpdatedAt(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(timestamp)
}

export function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([])
  const [form, setForm] = useState<PersonFormState>(emptyForm)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<PersonFilter>('active')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    setLoading(true)
    try {
      const nextPeople = await unifiedAsyncRepository.list<Person>('person')
      setPeople(nextPeople.sort((a, b) => b.updatedAt - a.updatedAt))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '人物数据加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const visiblePeople = useMemo(() => people.filter(person => {
    const matchesFilter = filter === 'all' || person.status === filter
    return matchesFilter && matchesSearch(person, query)
  }), [filter, people, query])

  const activeCount = people.filter(person => person.status === 'active').length
  const archivedCount = people.filter(person => person.status === 'archived').length

  function updateForm(field: keyof PersonFormState, value: string) {
    setForm(current => ({ ...current, [field]: value }))
  }

  async function createPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const displayName = form.displayName.trim()
    if (!displayName) {
      toast('请先填写人物名称', 'warning')
      return
    }

    setSaving(true)
    try {
      await withSaveState(() => unifiedAsyncRepository.create(unifiedFactories.person({
        displayName,
        roles: splitValues(form.roles),
        domain: form.domain.trim() || undefined,
        notes: form.notes.trim() || undefined,
        tags: splitValues(form.tags),
        status: 'active'
      })))
      setForm(emptyForm)
      await refresh()
      toast('人物已加入上下文')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '人物保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(person: Person, status: Person['status']) {
    setSaving(true)
    try {
      await withSaveState(() => unifiedAsyncRepository.update<Person>('person', person.calmyId, {
        status,
        archivedAt: status === 'archived' ? Date.now() : undefined
      }, { expectedRevision: person.revision }))
      await refresh()
      toast(status === 'archived' ? '人物已归档' : '人物已恢复')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '人物状态更新失败', 'error')
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="people-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">PEOPLE · CONTEXT</p>
          <h1 className="font-title">人物上下文</h1>
          <p>把重要的人、关系背景和相处边界放在同一个可回看的地方。</p>
        </div>
        <span className="load-pill">{loading ? '正在读取…' : activeCount + ' 位活跃人物'}</span>
      </header>

      <section className="beryl-card admin-block">
        <div className="panel-head">
          <div>
            <p className="eyebrow">ADD PERSON</p>
            <h2 className="font-title">新增人物</h2>
          </div>
          <span>姓名必填，其余信息可以之后补充</span>
        </div>
        <form className="matter-create" onSubmit={event => void createPerson(event)}>
          <div className="two-col">
            <label>
              人物名称
              <input
                aria-label="人物名称"
                value={form.displayName}
                onChange={event => updateForm('displayName', event.target.value)}
                placeholder="例如：林老师"
                required
              />
            </label>
            <label>
              角色 / 关系
              <input
                aria-label="人物角色"
                value={form.roles}
                onChange={event => updateForm('roles', event.target.value)}
                placeholder="用逗号分隔，例如：朋友、合作者"
              />
            </label>
            <label>
              所属领域
              <input
                aria-label="人物领域"
                value={form.domain}
                onChange={event => updateForm('domain', event.target.value)}
                placeholder="例如：设计、家庭、客户"
              />
            </label>
            <label>
              标签
              <input
                aria-label="人物标签"
                value={form.tags}
                onChange={event => updateForm('tags', event.target.value)}
                placeholder="用逗号分隔，例如：重要、长期"
              />
            </label>
          </div>
          <label>
            上下文备注
            <textarea
              aria-label="人物备注"
              value={form.notes}
              onChange={event => updateForm('notes', event.target.value)}
              placeholder="记录你希望在行动、复盘或关系判断时记住的背景。"
            />
          </label>
          <div className="btns">
            <button className="primary" type="submit" disabled={saving || loading}>
              {saving ? '保存中…' : '保存人物'}
            </button>
            <button type="button" onClick={() => setForm(emptyForm)} disabled={saving}>清空</button>
          </div>
        </form>
      </section>

      <section className="beryl-card admin-block">
        <div className="panel-head">
          <div>
            <p className="eyebrow">PEOPLE INDEX</p>
            <h2 className="font-title">人物列表</h2>
          </div>
          <span>{archivedCount} 位已归档</span>
        </div>
        <div className="people-toolbar" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '16px 0' }}>
          <input
            className="global-search"
            aria-label="搜索人物"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="搜索姓名、角色、领域或备注"
          />
          <div className="range-tabs" role="tablist" aria-label="人物筛选">
            {([['active', '活跃'], ['archived', '已归档'], ['all', '全部']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={filter === value ? 'on' : ''}
                role="tab"
                aria-selected={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && <section className="beryl-card empty-state" role="alert"><b>人物数据暂时无法读取</b><p>{error}</p><button className="react-btn" type="button" onClick={() => void refresh()}>重试</button></section>}
        {loading ? <div className="empty-state" role="status">正在加载人物…</div> : visiblePeople.length ? (
          <div className="matter-grid">
            {visiblePeople.map(person => (
              <article className="matter-card beryl-card" key={person.calmyId}>
                <div className="matter-card-head">
                  <span className="matter-status">{person.status === 'active' ? '活跃' : '已归档'}</span>
                  <small>更新于 {formatUpdatedAt(person.updatedAt)}</small>
                </div>
                <h2>{person.displayName}</h2>
                <p>{person.notes || '还没有上下文备注。'}</p>
                {(person.roles.length > 0 || person.domain) && (
                  <small>{[person.domain, ...person.roles].filter(Boolean).join(' · ')}</small>
                )}
                {person.tags.length > 0 && (
                  <p className="muted">#{person.tags.join('  #')}</p>
                )}
                <div className="btns">
                  {person.status === 'active' ? (
                    <button type="button" className="danger" onClick={() => void updateStatus(person, 'archived')} disabled={saving}>
                      归档人物
                    </button>
                  ) : (
                    <button type="button" onClick={() => void updateStatus(person, 'active')} disabled={saving}>
                      恢复人物
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            {query ? '没有匹配的人物。' : filter === 'archived' ? '还没有已归档人物。' : '还没有人物，先添加一个重要的人吧。'}
          </div>
        )}
      </section>
    </div>
  )
}
