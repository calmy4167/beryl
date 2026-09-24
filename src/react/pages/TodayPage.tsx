import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { WorkspacePage } from '../feishu-workspace'
import { FeishuTodayView } from '../FeishuWorkspaceViews'
import { TodayBodyStatePanel } from './today/TodayBodyStatePanel'
import { TodayContextPanels } from './today/TodayContextPanels'
import { TodayNowPanel } from './today/TodayNowPanel'
import { TodayAddActionPanel, TodayLetGoPanel, TodayRealityRecordPanel } from './today/TodayActionForms'
import { notifyTodayRecentRecordsChanged, TodayRecentRecords } from './today/TodayRecentRecords'
import { useTodayWorkspace } from './today/useTodayWorkspace'

export function TodayPage() {
  return <WorkspacePage local={<LocalTodayPage />} feishu={<FeishuTodayView />} />
}

export function TodayWorkspaceLayout({ status, alert, now, capture, records, body, context, secondary }: {
  status: ReactNode
  alert?: ReactNode
  now: ReactNode
  capture: ReactNode
  records: ReactNode
  body: ReactNode
  context: ReactNode
  secondary: ReactNode
}) {
  return <div className="today-page attention-today-page tactile-today-workspace">
    <section className="today-page-status" data-today-region="page-status">
      {status}
      {alert}
    </section>
    <section className="today-journal-stack" data-today-region="today-journal" aria-label="今天的记录">
      <div className="today-capture-region">{capture}</div>
      <div className="today-records-region">{records}</div>
    </section>
    <details className="today-other" data-today-region="other-modules">
      <summary>其他</summary>
      <div className="today-other-content">
        <div className="today-focus-region">{now}</div>
        <div className="today-body-region">{body}</div>
        <div className="today-context-region">{context}</div>
        <div className="today-secondary-region">{secondary}</div>
      </div>
    </details>
  </div>
}

function LocalTodayPage() {
  const navigate = useNavigate()
  const {
    date, loading, saving, plan, matters, protect, letGo, actionTitle, matterId, recordBody, journalCategory,
    realityMessage, error, availableActions,
    primaryAction, extraActions, narrative, refresh, savePlan, addAction, goToReality, toggleAction,
    addRecord, setProtect, setLetGo, setActionTitle, setMatterId, setRecordBody, setJournalCategory,
  } = useTodayWorkspace()
  return <TodayWorkspaceLayout
    status={<header className="today-minimal-heading">
      <h1>今天</h1>
      <time dateTime={date}>{date}</time>
      {(loading || saving) && <span role="status">{loading ? '读取中…' : '正在保存…'}</span>}
    </header>}
    alert={error && <section className="beryl-card empty-state" role="alert"><b>今天的数据暂时无法读取</b><p>{error}</p><button className="react-btn" type="button" onClick={() => void refresh()}>重试</button></section>}
    now={<TodayNowPanel primaryAction={primaryAction} extraActions={extraActions} matters={matters} realityMessage={realityMessage} onGoToReality={goToReality} onToggleAction={toggleAction} onCreateAction={() => {
        const input = document.querySelector<HTMLInputElement>('[aria-label="新增现实行动"]')
        input?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        window.setTimeout(() => input?.focus(), 250)
      }} />}
    capture={<TodayRealityRecordPanel body={recordBody} journalCategory={journalCategory}
      onBodyChange={setRecordBody} onJournalCategoryChange={setJournalCategory} onSave={async () => { await addRecord(); notifyTodayRecentRecordsChanged() }} />}
    records={<TodayRecentRecords />}
    body={<TodayBodyStatePanel load={plan?.load} saving={saving} onLoadChange={load => void savePlan({ load })} />}
    context={<TodayContextPanels analysis={plan?.review.analysis || plan?.why || '还有什么没有看清？可以把问题带到复盘里，不必现在解决。'} narrative={narrative} actions={availableActions} onOpenReview={() => navigate('/app/review')} onOpenFlow={() => navigate('/app/flow')} />}
    secondary={<>
      <TodayLetGoPanel saving={saving} protect={protect} letGo={letGo} onProtectChange={setProtect} onLetGoChange={setLetGo}
      onSave={() => void savePlan({ mustProtect: protect.split(/\r?\n/).map(item => item.trim()).filter(Boolean), letGo: letGo.split(/\r?\n/).map(item => item.trim()).filter(Boolean) })} />
      <TodayAddActionPanel title={actionTitle} matterId={matterId} matters={matters.filter(item => item.status !== 'archived')} onTitleChange={setActionTitle} onMatterChange={setMatterId} onAdd={addAction} />
    </>}
  />
}
