import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { saveFutureReflection } from '@/application'
import { withSaveState } from '@/core/save-state'

type FuturePageStage = 'intro' | 'scenarios' | 'reflection' | 'saved'
type FutureReflectionHorizon = 'six-months' | 'five-years'
type FutureImpactKey = 'work' | 'relationships' | 'learning' | 'personal-time' | 'custom'

interface FutureImpactItem {
  title: string
  body: string
}

interface FutureImpactProfile {
  actionTitle: string
  inactionTitle: string
  horizons: Record<FutureReflectionHorizon, { action: FutureImpactItem[]; inaction: FutureImpactItem[] }>
  sources: Array<{ label: string; url: string; note: string }>
}

const horizonOptions: Array<{ value: FutureReflectionHorizon; label: string }> = [
  { value: 'six-months', label: '半年后' },
  { value: 'five-years', label: '五年后' },
]

const choiceOptions = [
  { value: 'work', label: '工作与机会', text: '争取一个新的工作机会' },
  { value: 'relationships', label: '关系与沟通', text: '和一个重要的人谈谈一直没说的话' },
  { value: 'learning', label: '学习 Python', text: '学习 Python' },
  { value: 'personal-time', label: '为自己留时间', text: '每周为自己在意的事留一点时间' },
] as const

const customChoice = 'custom'

const impactProfiles: Record<FutureImpactKey, FutureImpactProfile> = {
  learning: {
    actionTitle: '开始学习并持续做项目',
    inactionTitle: '一直没有开始学习',
    horizons: {
      'six-months': {
        action: [
          { title: '能制作简单工具', body: '在持续练习和动手做项目的前提下，你可能已经能写脚本、处理数据，或把一部分重复工作自动化。' },
          { title: '开始留下作品', body: '练习项目可以逐渐变成能运行、能展示的作品，让“学过”变成更具体的能力证据。' },
        ],
        inaction: [
          { title: '重复工作仍要手动完成', body: '原本可以用程序处理的整理、计算或批量操作，仍然需要原来的时间和操作方式。' },
          { title: '还没有项目可以展示', body: '没有开始练习，也就不会自然形成代码、工具或项目经历；以后需要时仍要从基础补起。' },
        ],
      },
      'five-years': {
        action: [
          { title: '能力可以扩展到多个方向', body: 'Python 被用于 Web、数据分析、科学计算、自动化和软件开发。持续积累可能让你拥有更多解决问题的方式。' },
          { title: '职业选择可能增加', body: '如果同时积累项目、工程能力和领域知识，这项技能可以成为进入软件、数据或自动化相关工作的基础之一；仅会语法并不能保证就业。' },
        ],
        inaction: [
          { title: '长期积累没有发生', body: '代码经验、项目作品和解决实际问题的方法都不会自行出现。以后再开始时，这段积累仍需重新投入时间。' },
          { title: '相关机会仍在能力范围之外', body: '需要编程、数据或自动化能力的任务和岗位，仍然较难独立承担；即使机会出现，也可能缺少作品和经验去证明自己。' },
        ],
      },
    },
    sources: [
      { label: 'Python.org：Python 的应用领域', url: 'https://www.python.org/about/apps/', note: '列出 Web、科学计算、教育、软件开发和商业应用等方向。' },
      { label: 'Python 官方教程', url: 'https://docs.python.org/3/tutorial/', note: '说明 Python 适合脚本和快速应用开发。' },
      { label: '美国劳工统计局：软件开发岗位', url: 'https://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm', note: '提供岗位职责、常见教育要求和就业预测；不能推出学会 Python 就一定能就业。' },
    ],
  },
  work: {
    actionTitle: '开始了解并争取新机会',
    inactionTitle: '一直没有接触外部机会',
    horizons: {
      'six-months': {
        action: [
          { title: '获得真实的市场反馈', body: '准备简历、研究岗位和参加沟通后，你会更清楚市场需要什么，以及自己还缺哪些能力和经历。' },
          { title: '开始形成新的选择', body: '投递、交流和面试让潜在机会从想法变成真实接触；结果可能是录用，也可能是更明确的改进方向。' },
        ],
        inaction: [
          { title: '对外部机会仍然不了解', body: '没有研究岗位和接触市场，就难以知道自己的经验能匹配什么，也得不到简历或面试反馈。' },
          { title: '当前不满意之处继续存在', body: '如果工作内容、成长或收入问题没有其他变化，它们大概率仍会留在原来的位置。' },
        ],
      },
      'five-years': {
        action: [
          { title: '职业路径可能被重新打开', body: '持续了解岗位、补齐能力并建立同行联系，可能带来新的职位、合作关系或发展方向。' },
          { title: '更了解自己的市场位置', body: '多轮真实反馈会让你更清楚优势、差距和合适的工作环境，减少只靠想象判断职业选择。' },
        ],
        inaction: [
          { title: '外部选择没有积累', body: '没有持续了解行业、建立联系或准备作品，机会出现时可能仍要从信息收集和材料准备开始。' },
          { title: '职业惯性继续扩大', body: '如果环境本身不会改善，长期不行动会让经验继续集中在原路径，转换方向所需的准备可能更多。' },
        ],
      },
    },
    sources: [
      { label: 'CareerOneStop：转换职业或行业指南', url: 'https://cloudfront.careeronestop.org/TridionMultimedia/tcm24-50399_PDF_changeoccupationuserguideACC.pdf', note: '建议研究职业、定向修改简历并建立相关领域的人际联系。' },
    ],
  },
  relationships: {
    actionTitle: '选择一次合适的坦诚沟通',
    inactionTitle: '一直不谈这件事',
    horizons: {
      'six-months': {
        action: [
          { title: '让对方知道真实想法', body: '一次清楚、尊重的沟通能把隐藏的信息带进关系，让双方有机会确认理解、需求和边界。' },
          { title: '更早知道关系能否回应', body: '对方可能理解，也可能不同意；真实回应能减少长期猜测，让你知道接下来需要协商、调整还是接受差异。' },
        ],
        inaction: [
          { title: '误解和猜测继续存在', body: '没有说出的信息无法被对方直接回应，双方仍可能按照各自的猜测理解同一件事。' },
          { title: '问题缺少被处理的机会', body: '如果问题会重复出现，沉默不会自动产生共同方案，积累的不满或距离可能继续保留。' },
        ],
      },
      'five-years': {
        action: [
          { title: '形成处理重要问题的经验', body: '多次尊重而具体的沟通，可能让双方更熟悉如何表达需要、听取回应和处理分歧。沟通并不保证关系一定改善。' },
          { title: '减少长期建立在猜测上的选择', body: '更早获得真实回应，有助于根据现实关系作决定，而不是一直围绕没有验证的假设生活。' },
        ],
        inaction: [
          { title: '重要信息长期没有交换', body: '彼此仍可能不了解对方真正重视、介意或需要什么，过去的解释也可能逐渐固化。' },
          { title: '可能在更晚时后悔没有开口', body: '当关系或环境变化后，原本可以交流的窗口可能缩小；届时更难知道一次坦诚沟通是否会带来不同结果。' },
        ],
      },
    },
    sources: [
      { label: '夫妻沟通与关系满意度的纵向研究', url: 'https://pubmed.ncbi.nlm.nih.gov/27152050/', note: '研究发现沟通与满意度存在联系，但因果路径并不稳固，因此页面不承诺沟通一定改善关系。' },
    ],
  },
  'personal-time': {
    actionTitle: '把固定时间真正留出来',
    inactionTitle: '继续把时间交给其他安排',
    horizons: {
      'six-months': {
        action: [
          { title: '在意的事开始进入日常', body: '固定时段让阅读、创作、锻炼、陪伴或休息不再只依靠临时空闲，也更容易形成可重复的生活安排。' },
          { title: '更早发现它是否值得继续', body: '真实投入一段时间后，你能依据体验调整频率、内容和边界，而不是一直停留在想象中。' },
        ],
        inaction: [
          { title: '它仍然排在其他事情之后', body: '没有明确时间边界时，临时任务和他人需求更容易继续占满日程，在意的事仍难进入生活。' },
          { title: '缺少真实体验来修正判断', body: '没有实际尝试，就难以知道这件事能否带来恢复、满足或新的能力，也无法据此调整安排。' },
        ],
      },
      'five-years': {
        action: [
          { title: '长期累积出作品、关系或生活习惯', body: '稳定投入可能逐渐形成作品、技能、共同记忆或恢复节奏；结果取决于你把时间用于什么。' },
          { title: '生活中保留由自己决定的部分', body: '持续保护一部分时间，有机会让个人需要和长期价值进入日常安排，而不是只处理眼前要求。' },
        ],
        inaction: [
          { title: '原本想积累的东西没有形成', body: '没有持续投入，作品、技能、共同记忆或休息习惯都不会因为愿望本身而增长。' },
          { title: '日程继续由眼前事务决定', body: '如果没有新的边界，当前的时间分配方式可能继续延伸，让真正想做的事一再推迟。' },
        ],
      },
    },
    sources: [
      { label: 'APA：晚间放松与次日精力研究', url: 'https://www.apa.org/pubs/journals/features/ocp-ocp0000155.pdf', note: '研究讨论工作之外的放松和恢复；具体收益仍取决于活动内容与个人情况。' },
    ],
  },
  custom: {
    actionTitle: '需要先查明会带来什么',
    inactionTitle: '需要先确认会错过什么',
    horizons: {
      'six-months': {
        action: [{ title: '当前不能可靠生成', body: '这是一条自定义内容。现有本地原型没有联网事实检索能力，不能只根据一句话编造它会带来的结果。' }],
        inaction: [{ title: '不能直接写成好处的反面', body: '只有先确认这件事真实可能带来的能力、改变或机会，才能把未获得的部分写成不行动的代价。' }],
      },
      'five-years': {
        action: [{ title: '长期影响需要证据和条件', body: '需要先了解这件事的领域事实、所需投入和你的现实条件，再建立可信的长期影响链。' }],
        inaction: [{ title: '暂不作长期判断', body: '在没有事实依据时，系统不把想象写成你的未来，也不使用空泛模板制造后悔。' }],
      },
    },
    sources: [],
  },
}

function resolveImpactKey(selectedChoice: string, choice: string): FutureImpactKey {
  if (selectedChoice === 'work' || selectedChoice === 'relationships' || selectedChoice === 'learning' || selectedChoice === 'personal-time') return selectedChoice
  if (/python/i.test(choice)) return 'learning'
  return 'custom'
}

function HorizonPicker({ value, onChange }: { value: FutureReflectionHorizon; onChange: (value: FutureReflectionHorizon) => void }) {
  return <div className="future-horizons" role="group" aria-label="选择回望时间">
    {horizonOptions.map(option => <button key={option.value} type="button" className={value === option.value ? 'selected' : ''} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>
}

export function FuturePage() {
  const [stage, setStage] = useState<FuturePageStage>('intro')
  const [horizon, setHorizon] = useState<FutureReflectionHorizon>('six-months')
  const [choice, setChoice] = useState('')
  const [selectedChoice, setSelectedChoice] = useState<string | typeof customChoice>('')
  const [reflection, setReflection] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const stageHeadingRef = useRef<HTMLHeadingElement>(null)
  const choiceInputRef = useRef<HTMLTextAreaElement>(null)
  const previousStageRef = useRef(stage)
  const impactKey = resolveImpactKey(selectedChoice, choice)
  const impactProfile = impactProfiles[impactKey]
  const horizonImpact = impactProfile.horizons[horizon]

  useEffect(() => {
    if (previousStageRef.current === stage) return
    previousStageRef.current = stage
    stageHeadingRef.current?.focus()
  }, [stage])

  async function saveReflection(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!choice.trim()) {
      setError('先写下你想回头看的选择，再保存。')
      return
    }
    if (!reflection.trim()) {
      setError('先写下看过这些可能后的想法，再保存。')
      return
    }
    setSaving(true)
    setError('')
    try {
      await withSaveState(() => saveFutureReflection({ choice, reflection, nextStep }))
      setStage('saved')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请重试。')
    } finally {
      setSaving(false)
    }
  }

  return <div className="future-page">
    <header className="page-head future-page-head">
      <div><p className="eyebrow">未来回望 · 试验体验</p><h1 className="font-title">先去未来看看，再回来决定</h1><p>看看去做能得到什么，一直不做又会错过什么。</p></div>
      <Link className="future-text-link" to="/app/today">回到 Today</Link>
    </header>

    {stage === 'intro' && <section className="future-intro beryl-card">
      <span className="future-example-label">第一步</span>
      <h2 ref={stageHeadingRef} tabIndex={-1} className="font-title">你想提前想想什么？</h2>
      <p>选项可以修改，也可以自己填写。</p>
      <div className="future-choice-options" role="group" aria-label="选择一个想回头看的事情">
        {choiceOptions.map(option => <button key={option.value} type="button" className={selectedChoice === option.value ? 'selected' : ''} aria-pressed={selectedChoice === option.value} onClick={() => { setSelectedChoice(option.value); setChoice(option.text) }}>{option.label}</button>)}
        <button type="button" className={selectedChoice === customChoice ? 'selected' : ''} aria-pressed={selectedChoice === customChoice} onClick={() => { setSelectedChoice(customChoice); setChoice(''); choiceInputRef.current?.focus() }}>自己填写</button>
      </div>
      <label className="future-choice-label">你的选择
        <textarea ref={choiceInputRef} value={choice} onChange={event => { setChoice(event.target.value); setSelectedChoice(customChoice) }} maxLength={120} rows={2} placeholder="写下一件你正在考虑的事" />
      </label>
      <div className="future-choice-meta"><span>{impactKey === 'custom' ? '自定义内容需要先查证事实，当前原型不会编造结果。' : '后面会展示这类选择的具体影响链。'}</span><span>{choice.length}/120</span></div>
      <div className="future-time-picker"><b>从什么时候回头看？</b><HorizonPicker value={horizon} onChange={setHorizon} /></div>
      <p className="future-boundary-note">结果来自已整理的领域事实和因果关系，仍需结合个人条件；它不是结果保证。</p>
      <button className="future-primary" type="button" onClick={() => setStage('scenarios')} disabled={!choice.trim()}>开始体验</button>
    </section>}

    {stage === 'scenarios' && <section className="future-scenarios">
      <div className="future-section-head"><div><span className="future-example-label">影响推演</span><h2 ref={stageHeadingRef} tabIndex={-1} className="font-title">如果从{horizonOptions.find(option => option.value === horizon)?.label}回头看</h2><p>「{choice}」可能产生的获得与错过。</p></div><HorizonPicker value={horizon} onChange={setHorizon} /></div>
      <div className="future-path-grid">
        <article className="future-path beryl-card"><header><span>如果去做 · 可能得到</span><h3 className="font-title">{impactProfile.actionTitle}</h3></header>
          {horizonImpact.action.map(item => <section key={item.title} className="future-possibility future-glad"><h4>{item.title}</h4><p>{item.body}</p></section>)}
        </article>
        <article className="future-path beryl-card"><header><span>如果一直不做 · 可能错过</span><h3 className="font-title">{impactProfile.inactionTitle}</h3></header>
          {horizonImpact.inaction.map(item => <section key={item.title} className="future-possibility future-regret"><h4>{item.title}</h4><p>{item.body}</p></section>)}
        </article>
      </div>
      {impactProfile.sources.length > 0 && <aside className="future-evidence" aria-label="推演依据">
        <b>推演依据</b>
        <ul>{impactProfile.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a><span>{source.note}</span></li>)}</ul>
      </aside>}
      <p className="future-boundary-note">“可能得到”需要实际投入和条件配合；“可能错过”是前述收益没有发生，不代表唯一未来。</p>
      <div className="future-actions"><button className="future-secondary" type="button" onClick={() => setStage('intro')}>修改这件事</button><button className="future-primary" type="button" onClick={() => setStage('reflection')}>回到我现在的想法</button></div>
    </section>}

    {stage === 'reflection' && <section className="future-reflection beryl-card">
      <span className="future-example-label">回到今天</span><h2 ref={stageHeadingRef} tabIndex={-1} className="font-title">看过可能得到和错过的东西，你现在怎么想？</h2>
      <p>你在想的是：「{choice}」。写下哪些结果对你重要，以及你准备怎样回应。</p>
      <form onSubmit={event => void saveReflection(event)}>
        <label>此刻的想法<textarea value={reflection} onChange={event => { setReflection(event.target.value); setError('') }} rows={4} placeholder="例如：我想试一小步，看看它是否真的重要……" required disabled={saving} /></label>
        <label>我准备的下一步（可选）<input value={nextStep} onChange={event => setNextStep(event.target.value)} placeholder="例如：这周先留出一个晚上" disabled={saving} /></label>
        {error && <p className="future-error" role="alert">{error}</p>}
        <div className="future-actions"><button className="future-secondary" type="button" onClick={() => { setStage('scenarios'); setError('') }}>再看一次</button><button className="future-primary" type="submit" disabled={saving || !reflection.trim()}>{saving ? '正在保存…' : '保存我的反思'}</button></div>
      </form>
      <small className="future-save-note">保存你的选择和反思；推演内容和来源不会保存。</small>
    </section>}

    {stage === 'saved' && <section className="future-saved beryl-card" role="status">
      <span className="future-saved-mark">✓</span><h2 ref={stageHeadingRef} tabIndex={-1} className="font-title">选择和反思已保存</h2><p>你可以稍后查看原文；推演内容没有保存。</p>
      <div className="future-actions"><Link className="future-secondary" to="/app/capture">查看已保存的内容</Link><Link className="future-primary" to="/app/today">回到 Today</Link><button className="future-text-link" type="button" onClick={() => { setStage('intro'); setReflection(''); setNextStep('') }}>再体验一次</button></div>
    </section>}
  </div>
}
