import type { TodayLoad } from '@/domain/today/model'

const bodyStates: Array<{ value: TodayLoad; label: string; hint: string }> = [
  { value: 'good', label: '很好', hint: '可以多留一点余力' },
  { value: 'normal', label: '正常', hint: '保持当前承载' },
  { value: 'tired', label: '疲惫', hint: '优先保留一件事' },
  { value: 'bad', label: '明显不舒服', hint: '可以关闭所有建议' },
]

interface TodayBodyStatePanelProps {
  load: TodayLoad | null | undefined
  saving: boolean
  onLoadChange: (load: TodayLoad | null) => void
}

export function TodayBodyStatePanel({ load, saving, onLoadChange }: TodayBodyStatePanelProps) {
  const selectedBody = bodyStates.find(item => item.value === load)
  return <section className="body-state-panel beryl-card" aria-labelledby="body-state-title">
    <div><p className="eyebrow">BODY · 可跳过</p><h2 id="body-state-title" className="font-title">现在的身体状态</h2><small>{selectedBody?.hint || '不记录也可以继续'}</small></div>
    <div className="body-state-options" role="group" aria-label="身体状态">
      {bodyStates.map(item => <button key={item.value} type="button" className={load === item.value ? 'on' : ''} aria-pressed={load === item.value} disabled={saving} onClick={() => onLoadChange(item.value)}>{item.label}</button>)}
      <button type="button" className={!load ? 'on' : ''} aria-pressed={!load} disabled={saving} onClick={() => onLoadChange(null)}>不记录</button>
    </div>
  </section>
}
