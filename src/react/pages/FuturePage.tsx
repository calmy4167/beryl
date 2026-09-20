import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { saveFutureFeedback, saveFutureReflection } from '@/application'
import { withSaveState } from '@/core/save-state'

import { choiceOptions, customChoice, horizonOptions, impactProfiles, pathLabels, resolveImpactKey, type FutureReflectionHorizon } from './future-lookback/data'
import { HorizonPicker } from './future-lookback/HorizonPicker'
import { ReflectionStage } from './future-lookback/ReflectionStage'
import { SavedStage } from './future-lookback/SavedStage'
import { ScenarioPathCard } from './future-lookback/ScenarioPathCard'
type FuturePageStage = 'intro' | 'scenarios' | 'reflection' | 'saved'
export function FuturePage() {
  const [stage, setStage] = useState<FuturePageStage>('intro')
  const [horizon, setHorizon] = useState<FutureReflectionHorizon>('six-months')
  const [choice, setChoice] = useState('')
  const [facts, setFacts] = useState('')
  const [interpretation, setInterpretation] = useState('')
  const [selectedChoice, setSelectedChoice] = useState<string | typeof customChoice>('')
  const [reflection, setReflection] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [externalUrl, setExternalUrl] = useState('')
  const [reflectionCaptureId, setReflectionCaptureId] = useState('')
  const [feedback, setFeedback] = useState('')
  const [feedbackSaving, setFeedbackSaving] = useState(false)
  const [feedbackError, setFeedbackError] = useState('')
  const [feedbackSaved, setFeedbackSaved] = useState(false)
  const [feedbackNeedsReflectionResave, setFeedbackNeedsReflectionResave] = useState(false)
  const [feedbackReflectionResaving, setFeedbackReflectionResaving] = useState(false)
  const [feedbackRecoveryMessage, setFeedbackRecoveryMessage] = useState('')
  const [showFeedbackForm, setShowFeedbackForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const stageHeadingRef = useRef<HTMLHeadingElement>(null)
  const choiceInputRef = useRef<HTMLTextAreaElement>(null)
  const previousStageRef = useRef(stage)
  const impactKey = resolveImpactKey(selectedChoice, choice)
  const impactProfile = impactProfiles[impactKey]
  const horizonImpact = impactProfile.horizons[horizon]
  const pathLabel = pathLabels[impactKey]
  const showContextFields = selectedChoice !== ''

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
      const savedCapture = await withSaveState(() => saveFutureReflection({ choice, facts, interpretation, reflection, nextStep, externalUrl }))
      setReflectionCaptureId(savedCapture.calmyId)
      setStage('saved')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请重试。')
    } finally {
      setSaving(false)
    }
  }

  async function saveFeedback(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!reflectionCaptureId) {
      setFeedbackNeedsReflectionResave(true)
      setFeedbackError('找不到对应的选择记录。你可以用当前页面保留的内容重新保存选择和反思。')
      return
    }
    setFeedbackSaving(true)
    setFeedbackError('')
    setFeedbackRecoveryMessage('')
    try {
      await withSaveState(() => saveFutureFeedback({ reflectionCaptureId, feedback }))
      setFeedbackSaved(true)
      setShowFeedbackForm(false)
    } catch (cause) {
      setFeedbackError(cause instanceof Error ? cause.message : '反馈保存失败，请重试。')
      if (cause instanceof Error && cause.message.includes('原选择记录已不存在')) setFeedbackNeedsReflectionResave(true)
    } finally {
      setFeedbackSaving(false)
    }
  }

  async function resaveReflectionForFeedback(): Promise<void> {
    if (!choice.trim() || !reflection.trim()) {
      setFeedbackError('当前页面缺少选择或反思内容，请先补充后再保存。')
      return
    }
    setFeedbackReflectionResaving(true)
    setFeedbackError('')
    setFeedbackRecoveryMessage('')
    try {
      const savedCapture = await withSaveState(() => saveFutureReflection({ choice, facts, interpretation, reflection, nextStep, externalUrl }))
      setReflectionCaptureId(savedCapture.calmyId)
      setFeedbackNeedsReflectionResave(false)
      setFeedbackRecoveryMessage('选择和反思已重新保存，可以继续保存上面的反馈。')
    } catch (cause) {
      setFeedbackError(cause instanceof Error ? cause.message : '重新保存失败，请重试。')
    } finally {
      setFeedbackReflectionResaving(false)
    }
  }

  return <div className="future-page">
    <header className="page-head future-page-head">
      <div><p className="eyebrow">未来 · 试验</p><h1 className="font-title">先去未来看看，再回来决定</h1><p>行动和暂缓，都可能有收获，也可能有代价。</p></div>
      <Link className="future-text-link" to="/app/today">回到今天</Link>
    </header>

    {stage === 'intro' && <section className="future-intro beryl-card">
      <span className="future-example-label">第一步</span>
      <h2 ref={stageHeadingRef} tabIndex={-1} className="font-title">你想提前想想什么？</h2>
      <p>选项可以修改，也可以自己填写。</p>
      <div className="future-choice-options" role="group" aria-label="选择一个想回头看的事情">
        {choiceOptions.map(option => <button key={option.value} type="button" className={selectedChoice === option.value ? 'selected' : ''} aria-pressed={selectedChoice === option.value} onClick={() => { if (selectedChoice !== option.value) { setSelectedChoice(option.value); setChoice(option.text); setFacts(''); setInterpretation('') } }}>{option.label}</button>)}
        <button type="button" className={selectedChoice === customChoice ? 'selected' : ''} aria-pressed={selectedChoice === customChoice} onClick={() => { if (selectedChoice !== customChoice) { setSelectedChoice(customChoice); setChoice(''); setFacts(''); setInterpretation('') } choiceInputRef.current?.focus() }}>自己填写</button>
      </div>
      <label className="future-choice-label">你的选择
        <textarea ref={choiceInputRef} value={choice} onChange={event => { setChoice(event.target.value); setSelectedChoice(customChoice) }} maxLength={120} rows={2} placeholder="写下一件你正在考虑的事" />
      </label>
      {showContextFields && <div className="future-context-fields">
        <label className="future-choice-label">已经发生的事（可选）
          <textarea value={facts} onChange={event => setFacts(event.target.value)} maxLength={500} rows={2} placeholder="例如：我看到了一个岗位，要求有……" />
        </label>
        <label className="future-choice-label">我的理解或担心（可选）
          <textarea value={interpretation} onChange={event => setInterpretation(event.target.value)} maxLength={500} rows={2} placeholder="例如：我担心自己的经验还不够……" />
        </label>
      </div>}
      <div className="future-choice-meta"><span>{impactKey === 'custom' ? '自定义内容需要先查证事实，当前原型不会编造结果。' : '后面会展示这类选择的具体影响链。'}</span><span>{choice.length}/120</span></div>
      <div className="future-time-picker"><b>从什么时候回头看？</b><HorizonPicker value={horizon} onChange={setHorizon} /></div>
      <p className="future-boundary-note">这些是有条件的可能性，不是结果保证；本页不会根据你的个人情况预测结果。</p>
      <button className="future-primary" type="button" onClick={() => setStage('scenarios')} disabled={!choice.trim()}>开始体验</button>
    </section>}

    {stage === 'scenarios' && <section className="future-scenarios">
      <div className="future-section-head"><div><span className="future-example-label">影响推演</span><h2 ref={stageHeadingRef} tabIndex={-1} className="font-title">如果从{horizonOptions.find(option => option.value === horizon)?.label}回头看</h2><p>「{choice}」可能带来的收获与代价。</p></div><HorizonPicker value={horizon} onChange={setHorizon} /></div>
      {(facts.trim() || interpretation.trim()) && <aside className="future-context-summary" aria-label="你补充的背景">
        <b>你补充的背景</b>
        {facts.trim() && <p><strong>已经发生的事：</strong>{facts}</p>}
        {interpretation.trim() && <p><strong>你的理解或担心：</strong>{interpretation}</p>}
      </aside>}
      {impactKey !== 'work' && impactKey !== 'custom' && <p className="future-boundary-note">目前只有工作预设补齐了两种选择各自的收获与代价；其他预设尚未完成平衡复核。</p>}
      {impactKey === 'custom' && <p className="future-boundary-note">这条自定义内容没有可用事实依据，下面只说明为什么暂停推演，不代表未来结果。</p>}
      <div className="future-path-grid">
        <ScenarioPathCard label={pathLabel.action} title={impactProfile.actionTitle} items={horizonImpact.action} side="action" custom={impactKey === 'custom'} />
        <ScenarioPathCard label={pathLabel.inaction} title={impactProfile.inactionTitle} items={horizonImpact.inaction} side="inaction" custom={impactKey === 'custom'} />
      </div>
      {impactProfile.sources.length > 0 && <aside className="future-evidence" aria-label="推演依据">
        <b>推演依据</b>
        <ul>{impactProfile.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a><span>{source.note}</span></li>)}</ul>
      </aside>}
      <p className="future-boundary-note">每条都是一种可能，不代表唯一未来。工作预设使用一般求职步骤，不包含你所在地区的岗位或薪酬数据。</p>
      <div className="future-actions"><button className="future-secondary" type="button" onClick={() => setStage('intro')}>修改这件事</button><button className="future-primary" type="button" onClick={() => setStage('reflection')}>回到我现在的想法</button></div>
    </section>}

    {stage === 'reflection' && <ReflectionStage
      headingRef={stageHeadingRef}
      choice={choice}
      reflection={reflection}
      nextStep={nextStep}
      externalUrl={externalUrl}
      saving={saving}
      error={error}
      onReflectionChange={value => { setReflection(value); setError('') }}
      onNextStepChange={setNextStep}
      onExternalUrlChange={setExternalUrl}
      onSubmit={event => void saveReflection(event)}
      onReturnToScenarios={() => { setStage('scenarios'); setError('') }}
    />}

    {stage === 'saved' && <SavedStage
      headingRef={stageHeadingRef}
      externalUrl={externalUrl}
      feedback={{ value: feedback, saved: feedbackSaved, showForm: showFeedbackForm, saving: feedbackSaving, error: feedbackError, needsReflectionResave: feedbackNeedsReflectionResave, reflectionResaving: feedbackReflectionResaving, recoveryMessage: feedbackRecoveryMessage }}
      onFeedbackChange={value => { setFeedback(value); setFeedbackError('') }}
      onFeedbackSubmit={event => void saveFeedback(event)}
      onShowFeedbackForm={() => setShowFeedbackForm(true)}
      onResaveReflection={() => void resaveReflectionForFeedback()}
      onDeferFeedback={() => setShowFeedbackForm(false)}
      onStartOver={() => { setStage('intro'); setFacts(''); setInterpretation(''); setReflection(''); setNextStep(''); setExternalUrl(''); setReflectionCaptureId(''); setFeedback(''); setFeedbackSaved(false); setFeedbackNeedsReflectionResave(false); setFeedbackRecoveryMessage(''); setShowFeedbackForm(false); setFeedbackError('') }}
    />}
  </div>
}
