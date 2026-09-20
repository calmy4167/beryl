import { useNavigate } from 'react-router-dom'
import { PageHead } from '../ui'
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

function LocalTodayPage() {
  const navigate = useNavigate()
  const {
    date, loading, saving, plan, actions, matters, protect, letGo, actionTitle, matterId, recordBody,
    recordType, recordActionId, recordMatterId, impact, realityMessage, error, availableActions,
    primaryAction, extraActions, narrative, refresh, savePlan, addAction, goToReality, toggleAction,
    addRecord, setProtect, setLetGo, setActionTitle, setMatterId, setRecordBody, setRecordType,
    setRecordActionId, setRecordMatterId, setImpact,
  } = useTodayWorkspace()
  return <div className="today-page attention-today-page">
    <PageHead className="attention-page-head" eyebrow={`今天 · ${date}`} title="今天" description="把注意力还给自己：看清此刻，选择一件现实行动，然后离开 Calmy。">
      <span className="today-status">{loading ? '正在读取本机数据…' : saving ? '正在保存…' : '本地优先 · 离线可用'}</span>
    </PageHead>
      {error && <section className="beryl-card empty-state" role="alert"><b>今天的数据暂时无法读取</b><p>{error}</p><button className="react-btn" type="button" onClick={() => void refresh()}>重试</button></section>}

    <div className="attention-surface-grid">
      <TodayNowPanel primaryAction={primaryAction} extraActions={extraActions} matters={matters} realityMessage={realityMessage} onGoToReality={goToReality} onToggleAction={toggleAction} onCreateAction={() => {
        const input = document.querySelector<HTMLInputElement>('[aria-label="新增现实行动"]')
        input?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        window.setTimeout(() => input?.focus(), 250)
      }} />
      <TodayRealityRecordPanel body={recordBody} type={recordType} actionId={recordActionId} matterId={recordMatterId} impact={impact} actions={actions} matters={matters}
        defaultOpen={document.documentElement.classList.contains('ui-refresh')}
        onBodyChange={setRecordBody} onTypeChange={setRecordType} onActionChange={setRecordActionId} onMatterChange={setRecordMatterId} onImpactChange={setImpact} onSave={async () => { await addRecord(); notifyTodayRecentRecordsChanged() }} />
      <TodayRecentRecords />
      <TodayBodyStatePanel load={plan?.load} saving={saving} onLoadChange={load => void savePlan({ load })} />
      <TodayContextPanels analysis={plan?.review.analysis || plan?.why || '还有什么没有看清？可以把问题带到复盘里，不必现在解决。'} narrative={narrative} actions={availableActions} onOpenReview={() => navigate('/app/review')} onOpenFlow={() => navigate('/app/flow')} />
    </div>

    <TodayLetGoPanel saving={saving} protect={protect} letGo={letGo} onProtectChange={setProtect} onLetGoChange={setLetGo}
      onSave={() => void savePlan({ mustProtect: protect.split(/\r?\n/).map(item => item.trim()).filter(Boolean), letGo: letGo.split(/\r?\n/).map(item => item.trim()).filter(Boolean) })} />

    <TodayAddActionPanel title={actionTitle} matterId={matterId} matters={matters.filter(item => item.status !== 'archived')} onTitleChange={setActionTitle} onMatterChange={setMatterId} onAdd={addAction} />

  </div>
}
