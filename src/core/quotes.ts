/* ============ 卡片墙数据层 ============
 * 层级：大卡片（QuoteGroup，容器）→ 小卡片（QuoteCard，内容项）。
 * 小卡类型注册表见 QuoteCard.vue；大卡只负责分组与布局，不感知小卡内部结构。
 * 随机性遵循设计原则「温柔的随机」：只影响呈现层，绝不触碰数据层。
 */

export type QuoteCardKind = 'person-quote' | 'quote' | 'person'

/** 小卡片：最小数据契约（渲染器按 kind 分发，未知 kind 兜底） */
export interface QuoteCard {
  kind: QuoteCardKind
  id: string
  quote: string
  author?: string
  source?: string
  personName?: string
  personTitle?: string
  personColor?: string
  fromNetwork: boolean
}

/** 大卡片：一个分组容器，内含若干小卡片 */
export interface QuoteGroup {
  id: string
  title: string
  icon: string
  kind: 'quotes' | 'persons' | 'mixed'
  cards: QuoteCard[]
}

/* ---------- 通用工具 ---------- */
let seq = 0
const uid = () => 'q-' + Date.now().toString(36) + '-' + (seq++).toString(36)

function pickOne<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)]
}

/** Fisher–Yates 洗牌（只影响呈现顺序，不动数据） */
export function shuffle<T>(list: readonly T[]): T[] {
  const out = list.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = out[i]
    out[i] = out[j]
    out[j] = t
  }
  return out
}

/* ---------- 离线名句池（网络不可用时的兜底；随机抽取不重复） ---------- */
const OFFLINE_QUOTES: { q: string; a: string }[] = [
  { q: '知之者不如好之者，好之者不如乐之者。', a: '孔子' },
  { q: '学而不思则罔，思而不学则殆。', a: '孔子' },
  { q: '博学之，审问之，慎思之，明辨之，笃行之。', a: '《礼记》' },
  { q: '不积跬步，无以至千里；不积小流，无以成江海。', a: '荀子' },
  { q: '人生到处知何似，应似飞鸿踏雪泥。', a: '苏轼' },
  { q: '千淘万漉虽辛苦，吹尽狂沙始到金。', a: '刘禹锡' },
  { q: '路漫漫其修远兮，吾将上下而求索。', a: '屈原' },
  { q: '志不立，天下无可成之事。', a: '王阳明' },
  { q: '为天地立心，为生民立命，为往圣继绝学，为万世开太平。', a: '张载' },
  { q: '问渠那得清如许？为有源头活水来。', a: '朱熹' },
  { q: '纸上得来终觉浅，绝知此事要躬行。', a: '陆游' },
  { q: '海内存知己，天涯若比邻。', a: '王勃' },
  { q: '苟利国家生死以，岂因祸福避趋之。', a: '林则徐' },
  { q: '会当凌绝顶，一览众山小。', a: '杜甫' },
  { q: '沉舟侧畔千帆过，病树前头万木春。', a: '刘禹锡' },
  { q: '老骥伏枥，志在千里。', a: '曹操' },
  { q: '非淡泊无以明志，非宁静无以致远。', a: '诸葛亮' },
  { q: '天行健，君子以自强不息。', a: '《周易》' },
]

/** 随机抽 n 条离线名句（不重复） */
function offlinePick(n: number): QuoteCard[] {
  return shuffle(OFFLINE_QUOTES).slice(0, n).map((x) => ({
    kind: 'quote' as const,
    id: uid(),
    quote: x.q,
    author: x.a,
    fromNetwork: false,
  }))
}

/* ---------- 本地源：人物库 → person 小卡 ---------- */
const PERSON_COLORS = ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#06B6D4']

function localPersonCards(): QuoteCard[] {
  try {
    const raw = localStorage.getItem('b_chars')
    if (!raw) return []
    const list = JSON.parse(raw) as unknown
    if (!Array.isArray(list)) return []
    return list.slice(0, 8).map((c: { name?: string; title?: string }, i) => ({
      kind: 'person' as const,
      id: uid(),
      quote: '',
      personName: String((c && c.name) || '?'),
      personTitle: String((c && c.title) || ''),
      personColor: PERSON_COLORS[i % PERSON_COLORS.length],
      fromNetwork: false,
    }))
  } catch {
    return []
  }
}

/* ---------- 大卡片（分组）构建 ---------- */
const GROUP_TITLES = ['今日名言', '灵感碎片', '思考片刻', '远方与诗', '碎片拾遗', '夜读摘句']

export async function buildGroups(): Promise<QuoteGroup[]> {
  // 名句属于装饰性内容，不能让它成为首屏外部网络依赖；核心体验始终使用本地语料。
  const net = offlinePick(5)
  const plain = net
  const withAuthor: QuoteCard[] = []
  const persons = localPersonCards()
  const groups: QuoteGroup[] = []

  // 大卡 1：单独名句（网络不足时离线随机补足，保证数量）
  const quotes = shuffle(plain.length >= 3 ? plain : [...plain, ...offlinePick(5 - plain.length)]).slice(0, 5)
  groups.push({ id: uid(), title: pickOne(GROUP_TITLES), icon: '🖋', kind: 'quotes', cards: quotes })

  // 大卡 2：人物 + 名句（网络带作者名句 + 本地人物配离线名句）
  const mixed: QuoteCard[] = withAuthor.slice(0, 2)
  const pool = shuffle(OFFLINE_QUOTES)
  persons.slice(0, 3).forEach((p, i) => {
    if (mixed.length >= 4) return
    const q = pool[i % pool.length]
    mixed.push({
      kind: 'person-quote' as const,
      id: uid(),
      quote: q.q,
      author: p.personName,
      personTitle: p.personTitle,
      personColor: p.personColor,
      fromNetwork: false,
    })
  })
  if (mixed.length) groups.push({ id: uid(), title: '人物 · 语录', icon: '💬', kind: 'mixed', cards: mixed })

  // 大卡 3：人物库
  if (persons.length) groups.push({ id: uid(), title: '人物库', icon: '👥', kind: 'persons', cards: persons })

  return groups
}

/* ---------- 布局持久化：按大卡 kind 存储（换一批后顺序与大小依然恢复） ---------- */
export interface WallLayout {
  /** 大卡 kind 顺序（quotes / mixed / persons） */
  orderKinds: string[]
  /** kind → 跨列数（1 = 半列，2 = 整行） */
  spanByKind: Record<string, 1 | 2>
}

export function loadWallLayout(): WallLayout | null {
  try {
    const raw = localStorage.getItem('b_wall_layout')
    if (!raw) return null
    const d = JSON.parse(raw) as WallLayout
    if (!d || !Array.isArray(d.orderKinds) || typeof d.spanByKind !== 'object') return null
    return d
  } catch {
    return null
  }
}

export function saveWallLayout(l: WallLayout): void {
  try { localStorage.setItem('b_wall_layout', JSON.stringify(l)) } catch { /* ignore */ }
}

/* ---------- 温柔的随机：呈现层语料池 ---------- */
const HERO_QUOTES = [
  '今天也有一点新的可能。',
  '把复杂的事，做简单一点。',
  '记录，是为了不辜负此刻。',
  '慢慢来，比较快。',
  '每一件小事都值得被认真对待。',
  '灵感会在行动中自己找上门。',
  '完成比完美更重要。',
  '今天想清楚一件小事就够了。',
  '给未来的自己留一张纸条。',
  '风会记得每一条走过的路。',
]

const EMPTY_HINTS = [
  '名言还在路上，稍等一下…',
  '今天还没收集到名言，先看看输入框？',
  '网络打了个盹，名句稍后就来。',
  '空空如也——但这通常不是坏事。',
]

export function randomHeroQuote(): string {
  return pickOne(HERO_QUOTES)
}

export function randomEmptyHint(): string {
  return pickOne(EMPTY_HINTS)
}
