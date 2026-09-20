interface ImpactItem {
  title: string
  body: string
  kind?: 'gain' | 'cost'
}

interface ScenarioPathCardProps {
  label: string
  title: string
  items: ImpactItem[]
  side: 'action' | 'inaction'
  custom: boolean
}

export function ScenarioPathCard({ label, title, items, side, custom }: ScenarioPathCardProps) {
  const gains = items.filter(item => side === 'action' ? item.kind !== 'cost' : item.kind === 'gain')
  const costs = items.filter(item => side === 'action' ? item.kind === 'cost' : item.kind !== 'gain')

  return <article className="future-path beryl-card"><header><span>{label}</span><h3 className="font-title">{title}</h3></header>
    {custom
      ? items.map(item => <section key={item.title} className="future-possibility future-uncertain"><h4>{item.title}</h4><p>{item.body}</p></section>)
      : <>{(side === 'action' || gains.length > 0) && <div className="future-impact-group"><h4>可能收获</h4>{gains.map(item => <section key={item.title} className="future-possibility future-glad"><h5>{item.title}</h5><p>{item.body}</p></section>)}</div>}
        {(side === 'inaction' || costs.length > 0) && <div className="future-impact-group"><h4>可能代价</h4>{costs.map(item => <section key={item.title} className="future-possibility future-regret"><h5>{item.title}</h5><p>{item.body}</p></section>)}</div>}</>}
  </article>
}
