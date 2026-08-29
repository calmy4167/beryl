import { useEffect, useMemo, useState } from 'react'
import { nextId, fmtDate } from '@/core/storage'
import { createAsyncCollectionRepository } from '@/core/repository'
import { registerUndo } from '@/core/undo'
import { withSaveState } from '@/core/save-state'
import { linkFinanceToCase } from '@/application'
import { caseAsyncRelationRepository, caseAsyncRepository } from '@/domain/case/repository'

interface FinanceItem {
  id: string
  type: 'income' | 'expense' | string
  amount?: number
  amountCents?: number
  category: string
  note: string
  date: string
}

const financeRepository = createAsyncCollectionRepository<FinanceItem>('finance', item => item.id)

const CATEGORIES = ['餐饮', '交通', '购物', '娱乐', '住房', '工资', '理财', '医疗', '学习', '其他']

function toast(message: string, kind: 'success' | 'warning' | 'error' = 'success'): void {
  window.dispatchEvent(new CustomEvent('beryl-toast', { detail: { message, kind } }))
}

/** Parse a user-entered decimal without using floating point arithmetic. */
function parseAmountCents(value: string): number | null {
  const normalized = value.trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null
  const [whole, fraction = ''] = normalized.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null
}

function amountCents(item: Pick<FinanceItem, 'amount' | 'amountCents'>): number {
  const storedCents = Number(item.amountCents)
  if (Number.isSafeInteger(storedCents)) return storedCents

  // Old records only had `amount`; parse its decimal string first so values
  // such as 0.1 do not accumulate binary floating-point rounding errors.
  const legacy = item.amount == null ? null : parseAmountCents(String(item.amount))
  return legacy ?? Math.round(Number(item.amount || 0) * 100)
}

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const absolute = Math.abs(Math.trunc(cents))
  const whole = Math.floor(absolute / 100).toLocaleString('zh-CN')
  const fraction = String(absolute % 100).padStart(2, '0')
  return `${sign}${whole}.${fraction}`
}

function toFinanceItem(item: FinanceItem): FinanceItem {
  return {
    id: item.id,
    type: item.type || 'expense',
    amount: item.amount,
    amountCents: item.amountCents,
    category: item.category || '其他',
    note: item.note || '',
    date: item.date || ''
  }
}

async function loadItems(): Promise<FinanceItem[]> {
  return (await financeRepository.list()).filter(item => item?.id).map(toFinanceItem)
}

function PageHead({ count, loading }: { count: number; loading: boolean }) {
  return <header className="page-head">
    <div>
      <p className="eyebrow">FINANCE · EARTH</p>
      <h1 className="font-title">财务</h1>
      <p>记录每一笔现金流，先看清发生了什么，再决定下一步。</p>
    </div>
    <span className="load-pill">{loading ? '正在读取…' : count + ' 条记录'}</span>
  </header>
}

function CaseLink({ itemId, onChanged }: { itemId: string; onChanged: () => void }) {
  const [cases, setCases] = useState<Awaited<ReturnType<typeof caseAsyncRepository.list>>>([])
  const [selected, setSelected] = useState('')

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      try {
        const [nextCases, relations] = await Promise.all([
          caseAsyncRepository.list(),
          caseAsyncRelationRepository.listForTarget('transaction', itemId),
        ])
        if (cancelled) return
        setCases(nextCases.filter(item => item.status !== 'archived'))
        setSelected(relations[0]?.caseId || '')
      } catch (cause) {
        if (!cancelled) toast(cause instanceof Error ? cause.message : '课题关联读取失败', 'warning')
      }
    }
    void refresh()
    const onDataSynced = () => { void refresh() }
    window.addEventListener('beryl-data-synced', onDataSynced)
    return () => { cancelled = true; window.removeEventListener('beryl-data-synced', onDataSynced) }
  }, [itemId])

  async function save(value: string): Promise<void> {
    try {
      await withSaveState(async () => {
        await linkFinanceToCase({ caseId: value, transactionId: itemId, phase: 'earth', commandId: nextId() })
      })
      setSelected(value)
      onChanged()
      window.dispatchEvent(new CustomEvent('beryl-data-synced'))
      toast(value ? '已关联课题' : '已取消课题关联')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '课题关联保存失败', 'error')
    }
  }

  return <select className="case-link" value={selected} aria-label={selected ? '已关联课题' : '关联课题'} onChange={event => { void save(event.target.value) }}>
    <option value="">关联课题</option>
    {cases.map(item => <option key={item.id} value={item.id}>◈ {item.title}</option>)}
  </select>
}

export function FinancePage() {
  const [items, setItems] = useState<FinanceItem[]>([])
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [busyId, setBusyId] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function refresh(): Promise<void> {
    setLoading(true)
    setError('')
    try {
      setItems(await loadItems())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '财务数据读取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    const onDataSynced = () => { void refresh() }
    window.addEventListener('beryl-data-synced', onDataSynced)
    return () => window.removeEventListener('beryl-data-synced', onDataSynced)
  }, [])

  const stats = useMemo(() => items.reduce((result, item) => {
    const cents = amountCents(item)
    if (item.type === 'income') result.income += cents
    else result.expense += cents
    return result
  }, { income: 0, expense: 0 }), [items])

  const visibleItems = useMemo(() => filter === 'all' ? items : items.filter(item => item.type === filter), [filter, items])

  async function add(): Promise<void> {
    const cents = parseAmountCents(amount)
    if (cents == null) {
      toast('请输入大于 0 且最多两位小数的金额', 'warning')
      return
    }

    const item: FinanceItem = {
      id: nextId(),
      type,
      amountCents: cents,
      // Keep the legacy field for older Vue screens and existing exports.
      amount: cents / 100,
      category: category.trim() || '其他',
      note: note.trim(),
      date: fmtDate(Date.now())
    }

    try {
      await withSaveState(async () => {
        await financeRepository.create(item)
      })
      setAmount('')
      setNote('')
      await refresh()
      window.dispatchEvent(new CustomEvent('beryl-data-synced'))
      toast(type === 'income' ? '已记录收入' : '已记录支出')
    } catch (error) {
      toast(error instanceof Error ? error.message : '财务记录保存失败', 'error')
    }
  }

  async function remove(item: FinanceItem): Promise<void> {
    const confirmed = window.confirm(`确定删除「${item.category}」${item.note ? `（${item.note}）` : ''}的 ${formatCents(amountCents(item))} 元记录吗？删除后可在短时间内撤销。`)
    if (!confirmed) return
    setBusyId(item.id)

    try {
      await withSaveState(async () => {
        const list = await financeRepository.list()
        const index = list.findIndex(candidate => String(candidate.id) === item.id)
        if (index < 0) throw new Error('记录已不存在，请刷新后重试')
        const [removed] = list.splice(index, 1)
        if (!await financeRepository.remove(item.id)) throw new Error('删除失败，原记录未改变')
        registerUndo('finance', removed, index, item.id)
      })
      await refresh()
      window.dispatchEvent(new CustomEvent('beryl-data-synced'))
      toast('财务记录已删除，可在提示出现后撤销')
    } catch (error) {
      toast(error instanceof Error ? error.message : '删除失败', 'error')
    } finally {
      setBusyId(undefined)
    }
  }

  function notifyCaseChanged(): void {
    // CaseLink keeps its own selection state; this refreshes the surrounding
    // page when another view changes relation data.
    void refresh()
  }

  return <div className="finance-page">
    <PageHead count={items.length} loading={loading} />

    {error && <section className="beryl-card empty-state" role="alert"><b>财务数据暂时无法读取</b><p>{error}</p><button className="react-btn" type="button" onClick={() => void refresh()}>重试</button></section>}

    <section className="stats-grid" aria-label="财务汇总">
      <article className="stat-card beryl-card"><small>收入</small><b className="finance-income">{formatCents(stats.income)}</b><span>元</span></article>
      <article className="stat-card beryl-card"><small>支出</small><b className="finance-expense">{formatCents(stats.expense)}</b><span>元</span></article>
      <article className="stat-card beryl-card"><small>结余</small><b className="finance-balance">{formatCents(stats.income - stats.expense)}</b><span>元</span></article>
    </section>

    <form className="beryl-card admin-block finance-form" onSubmit={event => { event.preventDefault(); void add() }}>
      <div className="panel-head"><div><p className="eyebrow">CASH FLOW</p><h2 className="font-title">记一笔</h2></div><span>金额以分为单位保存</span></div>
      <div className="create-row">
        <select aria-label="收支类型" value={type} onChange={event => setType(event.target.value as 'expense' | 'income')}>
          <option value="expense">支出</option>
          <option value="income">收入</option>
        </select>
        <input list="finance-categories" aria-label="财务分类" value={category} onChange={event => setCategory(event.target.value)} placeholder="分类，例如餐饮" />
        <input aria-label="金额" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="金额，例如 12.50" />
      </div>
      <div className="create-row finance-note-row">
        <input aria-label="财务备注" value={note} onChange={event => setNote(event.target.value)} placeholder="备注（可选）" />
        <button className="primary" type="submit" disabled={loading}>添加记录</button>
      </div>
      <datalist id="finance-categories">{CATEGORIES.map(item => <option key={item} value={item} />)}</datalist>
    </form>

    <div className="section-title finance-list-head"><h2 className="font-title">记录</h2><select aria-label="财务记录筛选" value={filter} onChange={event => setFilter(event.target.value as 'all' | 'income' | 'expense')}><option value="all">全部</option><option value="income">收入</option><option value="expense">支出</option></select></div>
    <section className="history-list" aria-live="polite">
      {loading ? <div className="empty-state" role="status">正在读取财务记录…</div> : visibleItems.map(item => <article className="beryl-card history-card finance-item" key={item.id}>
        <div className="panel-head"><div><p className="eyebrow">{item.type === 'income' ? 'INCOME · 收入' : 'EXPENSE · 支出'}</p><h3 className="font-title">{item.category}</h3></div><time>{item.date || '日期未知'}</time></div>
        <div className="finance-item-body"><p>{item.note || '没有备注'}</p><strong className={item.type === 'income' ? 'finance-income' : 'finance-expense'}>{item.type === 'income' ? '+' : '-'}{formatCents(amountCents(item))} 元</strong></div>
        <div className="finance-item-actions"><CaseLink itemId={item.id} onChanged={notifyCaseChanged} /><button className="react-btn danger" disabled={busyId === item.id || loading} onClick={() => void remove(item)} aria-label={`删除${item.category}财务记录`}>{busyId === item.id ? '删除中…' : '删除'}</button></div>
      </article>)}
      {!loading && !visibleItems.length && <div className="empty-state">还没有匹配的财务记录。记录第一笔收入或支出，开始看见现金流。</div>}
    </section>
  </div>
}
