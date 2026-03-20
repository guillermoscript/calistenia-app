import { useState, useEffect, useRef, useId } from 'react'
import { cn } from '../../lib/utils'
import type { FoodCategory, PortionUnit } from '../../types'
import { UNIT_WEIGHT_GRAMS } from '../../types'

const UNITS: { value: PortionUnit; label: string }[] = [
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
  { value: 'ml', label: 'ml' },
  { value: 'L', label: 'L' },
  { value: 'oz', label: 'oz' },
  { value: 'unidad', label: 'ud' },
]

const SLIDER_CONFIG: Record<string, { min: number; max: number; step: number; presets: number[] }> = {
  g:      { min: 10, max: 500, step: 5,    presets: [50, 100, 150, 200, 250] },
  kg:     { min: 0.1, max: 5, step: 0.1,   presets: [0.5, 1, 1.5, 2, 2.5] },
  ml:     { min: 50, max: 1000, step: 25,   presets: [100, 200, 250, 330, 500] },
  L:      { min: 0.1, max: 3, step: 0.1,    presets: [0.25, 0.5, 1, 1.5, 2] },
  oz:     { min: 1, max: 20, step: 0.5,     presets: [2, 4, 6, 8, 12] },
  unidad: { min: 0.5, max: 10, step: 0.5,   presets: [1, 2, 3, 4, 5] },
}

interface PortionInputProps {
  amount: number
  unit: PortionUnit
  unitWeight: number
  onChange: (amount: number, unit: PortionUnit, unitWeight: number) => void
  category?: FoodCategory
  portionNote?: string
}

export default function PortionInput({ amount, unit, unitWeight, onChange, portionNote }: PortionInputProps) {
  const id = useId()
  const [showUnits, setShowUnits] = useState(false)
  const unitDropdownRef = useRef<HTMLDivElement>(null)

  // Close unit dropdown on outside click
  useEffect(() => {
    if (!showUnits) return
    const handler = (e: PointerEvent) => {
      if (unitDropdownRef.current && !unitDropdownRef.current.contains(e.target as Node)) {
        setShowUnits(false)
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [showUnits])

  const config = SLIDER_CONFIG[unit] || SLIDER_CONFIG.g
  const safeAmount = Number.isFinite(amount) ? amount : 0
  const sliderValue = Math.min(Math.max(safeAmount, config.min), config.max)

  const handleUnitChange = (newUnit: PortionUnit) => {
    const newWeight = newUnit === 'unidad' ? unitWeight : UNIT_WEIGHT_GRAMS[newUnit]
    onChange(safeAmount, newUnit, newWeight)
    setShowUnits(false)
  }

  const unitLabel = UNITS.find(u => u.value === unit)?.label ?? unit

  return (
    <div className="space-y-2.5" role="group" aria-label="Porcion">
      {/* Amount + unit row */}
      <div className="flex items-center gap-2">
        <label htmlFor={`${id}-amount`} className="sr-only">Cantidad</label>
        <input
          id={`${id}-amount`}
          type="number"
          inputMode="decimal"
          value={safeAmount || ''}
          onChange={e => {
            const val = Math.max(0, parseFloat(e.target.value) || 0)
            onChange(val, unit, unitWeight)
          }}
          placeholder="100"
          className="w-20 h-10 text-base px-2 rounded-lg border border-input bg-transparent text-center tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          min={0}
          step={config.step}
        />

        {/* Unit badge (tappable) */}
        <div ref={unitDropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setShowUnits(!showUnits)}
            aria-expanded={showUnits}
            aria-haspopup="listbox"
            className={cn(
              'h-10 min-w-[44px] px-3 rounded-lg border text-sm font-mono tracking-wide transition-colors',
              showUnits
                ? 'border-lime-400/50 bg-lime-400/10 text-lime-400'
                : 'border-border text-muted-foreground hover:border-muted-foreground/60 active:bg-muted/50'
            )}
          >
            {unitLabel}
          </button>
          {showUnits && (
            <div className="absolute top-full left-0 mt-1 z-50 rounded-lg border border-border bg-popover shadow-xl overflow-hidden" role="listbox">
              {UNITS.map(u => (
                <button
                  key={u.value}
                  type="button"
                  role="option"
                  aria-selected={unit === u.value}
                  onClick={() => handleUnitChange(u.value)}
                  className={cn(
                    'block w-full text-left px-4 py-2.5 text-sm hover:bg-muted active:bg-muted transition-colors',
                    unit === u.value && 'text-lime-400 bg-lime-400/5'
                  )}
                >
                  {u.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {unit === 'unidad' && (
          <div className="flex items-center gap-1">
            <label htmlFor={`${id}-weight`} className="sr-only">Peso por unidad (g)</label>
            <input
              id={`${id}-weight`}
              type="number"
              inputMode="numeric"
              value={unitWeight || ''}
              onChange={e => {
                const val = Math.max(1, parseFloat(e.target.value) || 100)
                onChange(safeAmount, unit, val)
              }}
              placeholder="100"
              className="w-14 h-10 text-sm px-1 rounded-lg border border-input bg-transparent text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              min={1}
            />
            <span className="text-[10px] text-muted-foreground" aria-hidden="true">g/ud</span>
          </div>
        )}
      </div>

      {/* Slider — enlarged touch target */}
      <div className="py-1">
        <input
          type="range"
          min={config.min}
          max={config.max}
          step={config.step}
          value={sliderValue}
          onChange={e => {
            const val = parseFloat(e.target.value)
            if (Number.isFinite(val)) onChange(val, unit, unitWeight)
          }}
          className="w-full h-2 rounded-full appearance-none cursor-pointer bg-border accent-lime-400 touch-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-lime-400 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:shadow-lime-400/20 [&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-lime-400 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-md [&::-moz-range-track]:bg-border [&::-moz-range-track]:rounded-full [&::-moz-range-track]:h-2"
          aria-label="Ajustar porcion"
        />
      </div>

      {/* Presets — 44px min touch target */}
      <div className="flex gap-1.5 flex-wrap">
        {config.presets.map(preset => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset, unit, unitWeight)}
            className={cn(
              'min-h-[36px] px-3 py-1.5 rounded-full text-xs border transition-colors active:scale-95',
              safeAmount === preset
                ? 'border-lime-400 bg-lime-400/10 text-lime-400'
                : 'border-border text-muted-foreground hover:border-lime-400/40 active:bg-muted/50'
            )}
          >
            {preset}{unitLabel}
          </button>
        ))}
      </div>

      {/* Portion note from AI */}
      {portionNote && (
        <div className="text-[11px] text-muted-foreground/70 italic pl-0.5 truncate" title={portionNote}>
          {portionNote}
        </div>
      )}
    </div>
  )
}
