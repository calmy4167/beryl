import { horizonOptions, type FutureReflectionHorizon } from './data'

export function HorizonPicker({ value, onChange }: { value: FutureReflectionHorizon; onChange: (value: FutureReflectionHorizon) => void }) {
  return <div className="future-horizons" role="group" aria-label="选择回望时间">
    {horizonOptions.map(option => <button key={option.value} type="button" className={value === option.value ? 'selected' : ''} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>
}

