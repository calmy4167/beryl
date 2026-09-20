import { useNavigate } from 'react-router-dom'
import { WorkspacePage } from '../feishu-workspace'
import { FeishuTodayView } from '../FeishuWorkspaceViews'
import { TodayBodyStatePanel } from './today/TodayBodyStatePanel'
import { TodayContextPanels } from './today/TodayContextPanels'
import { TodayNowPanel } from './today/TodayNowPanel'
import { TodayAddActionPanel, TodayLetGoPanel, TodayRealityRecordPanel } from './today/TodayActionForms'
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
    <header className="page-head attention-page-head">
      <div><p className="eyebrow">今天 · {date}</p><h1 className="font-title">今天，把注意力还给自己</h1><p>看清此刻，选择一件现实行动，然后离开 Calmy。</p></div>
      <span className="today-status">{loading ? '正在读取本机数据…' : saving ? '正在保存…' : '本地优先 · 离线可用'}</span>
    </header>
      {error && <section className="beryl-card empty-state" role="alert"><b>今天的数据暂时无法读取</b><p>{error}</p><button className="react-btn" type="button" onClick={() => void refresh()}>重试</button></section>}

    <TodayBodyStatePanel load={plan?.load} saving={saving} onLoadChange={load => void savePlan({ load })} />

    <div className="attention-surface-grid">
      <TodayNowPanel primaryAction={primaryAction} extraActions={extraActions} matters={matters} realityMessage={realityMessage} onGoToReality={goToReality} onToggleAction={toggleAction} />

      <TodayContextPanels analysis={plan?.review.analysis || plan?.why || '还有什么没有看清？可以把问题带到复盘里，不必现在解决。'} narrative={narrative} actions={availableActions} onOpenReview={() => navigate('/app/review')} onOpenFlow={() => navigate('/app/flow')} />
    </div>

    <TodayLetGoPanel saving={saving} protect={protect} letGo={letGo} onProtectChange={setProtect} onLetGoChange={setLetGo}
      onSave={() => void savePlan({ mustProtect: protect.split(/\r?\n/).map(item => item.trim()).filter(Boolean), letGo: letGo.split(/\r?\n/).map(item => item.trim()).filter(Boolean) })} />

    <TodayAddActionPanel title={actionTitle} matterId={matterId} matters={matters.filter(item => item.status !== 'archived')} onTitleChange={setActionTitle} onMatterChange={setMatterId} onAdd={addAction} />

    <TodayRealityRecordPanel body={recordBody} type={recordType} actionId={recordActionId} matterId={recordMatterId} impact={impact} actions={actions} matters={matters}
      onBodyChange={setRecordBody} onTypeChange={setRecordType} onActionChange={setRecordActionId} onMatterChange={setRecordMatterId} onImpactChange={setImpact} onSave={addRecord} />
  </div>
}
