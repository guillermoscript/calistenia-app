import { useId } from 'react'
import type { PortionUnit } from '../../types'
import { UNIT_WEIGHT_GRAMS } from '../../types'

const UNITS: { value: PortionUnit; label: string }[] = [
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
  { value: 'ml', label: 'ml' },
  { value: 'L', label: 'L' },
  { value: 'oz', label: 'oz' },
  { value: 'unidad', label: 'ud' },
]

interface PortionInputProps {
  amount: number
  unit: PortionUnit
  unitWeight: number
  onChange: (amount: number, unit: PortionUnit, unitWeight: number) => void
}

export default function PortionInput({ amount, unit, unitWeight, onChange }: PortionInputProps) {
  const id = useId()

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Porción">
      <label htmlFor={`${id}-amount`} className="sr-only">Cantidad</label>
      <input
        id={`${id}-amount`}
        type="number"
        value={amount || ''}
        onChange={e => {
          const val = parseFloat(e.target.value) || 0
          onChange(val, unit, unitWeight)
        }}
        placeholder="100"
        className="w-16 h-9 text-sm px-2 rounded-md border border-input bg-transparent text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        min={0}
        step={unit === 'unidad' ? 1 : 10}
      />
      <label htmlFor={`${id}-unit`} className="sr-only">Unidad</label>
      <select
        id={`${id}-unit`}
        value={unit}
        onChange={e => {
          const newUnit = e.target.value as PortionUnit
          const newWeight = newUnit === 'unidad' ? unitWeight : UNIT_WEIGHT_GRAMS[newUnit]
          onChange(amount, newUnit, newWeight)
        }}
        className="h-9 text-xs px-1.5 rounded-md border border-input bg-transparent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {UNITS.map(u => (
          <option key={u.value} value={u.value}>{u.label}</option>
        ))}
      </select>
      {unit === 'unidad' && (
        <div className="flex items-center gap-0.5">
          <label htmlFor={`${id}-weight`} className="sr-only">Peso por unidad (g)</label>
          <input
            id={`${id}-weight`}
            type="number"
            value={unitWeight || ''}
            onChange={e => {
              const val = parseFloat(e.target.value) || 100
              onChange(amount, unit, val)
            }}
            placeholder="100"
            className="w-12 h-9 text-[10px] px-1 rounded-md border border-input bg-transparent text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            min={1}
          />
          <span className="text-[9px] text-muted-foreground" aria-hidden="true">g/ud</span>
        </div>
      )}
    </div>
  )
}
