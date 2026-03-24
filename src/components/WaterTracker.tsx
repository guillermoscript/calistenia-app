import { useState } from 'react'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent } from './ui/card'
import { Progress } from './ui/progress'

interface WaterTrackerProps {
  todayTotal: number
  goal: number
  onAdd?: (ml: number) => Promise<void>
  onSetGoal?: (ml: number) => void
  compact?: boolean
  adding?: boolean
}

const DEFAULT_GOAL = 2500
const QUICK_AMOUNTS = [200, 350, 500]

export default function WaterTracker({ todayTotal, goal, onAdd, onSetGoal, compact, adding }: WaterTrackerProps) {
  const [custom, setCustom] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalInput, setGoalInput] = useState('')
  const safeGoal = goal > 0 ? goal : DEFAULT_GOAL
  const pct = Math.min(100, (todayTotal / safeGoal) * 100)
  const reached = pct >= 100

  const handleCustom = () => {
    const n = parseInt(custom)
    if (n > 0 && onAdd) { onAdd(n); setCustom(''); setShowCustom(false) }
  }

  if (compact) {
    return (
      <Card className="border-l-[3px] border-l-sky-500">
        <CardContent className="p-5">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative size-14 shrink-0">
              <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
                <circle cx="28" cy="28" r="22" fill="none" stroke="currentColor" className="text-muted" strokeWidth="5" />
                <circle
                  cx="28" cy="28" r="22"
                  fill="none" stroke="currentColor"
                  className={reached ? 'text-emerald-500' : 'text-sky-500'}
                  strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 22}
                  strokeDashoffset={2 * Math.PI * 22 * (1 - pct / 100)}
                  transform="rotate(-90 28 28)"
                  style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] font-bold tabular-nums">{Math.round(pct)}%</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1">Agua Hoy</div>
              <div className="text-sm tabular-nums">
                <span className="text-foreground font-medium">{todayTotal}</span>
                <span className="text-muted-foreground"> / {safeGoal} ml</span>
              </div>
            </div>
            {onAdd && (
              <div className="flex gap-1.5 shrink-0">
                {QUICK_AMOUNTS.map(ml => (
                  <Button
                    key={ml}
                    variant="outline"
                    size="sm"
                    disabled={adding}
                    onClick={() => onAdd(ml)}
                    className="h-8 px-2 text-[10px] tracking-wide hover:border-sky-500 hover:text-sky-500"
                  >
                    +{ml}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div>
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-3 uppercase">Hidratacion</div>
      <Card>
        <CardContent className="p-5">
          <div className="flex items-baseline justify-between mb-3">
            <div className="tabular-nums">
              <span className={cn('font-bebas text-3xl', reached ? 'text-emerald-500' : 'text-sky-500')}>
                {todayTotal}
              </span>
              <span className="text-sm text-muted-foreground ml-1">/ {safeGoal} ml</span>
            </div>
            {reached && (
              <span className="text-[10px] text-emerald-500 font-bebas tracking-widest">META ALCANZADA</span>
            )}
          </div>

          <Progress value={pct} className="h-2 mb-4" />

          {onAdd ? (
            <>
              <div className="flex gap-2 flex-wrap">
                {QUICK_AMOUNTS.map(ml => (
                  <Button
                    key={ml}
                    variant="outline"
                    size="sm"
                    disabled={adding}
                    onClick={() => onAdd(ml)}
                    className="h-9 px-4 text-xs tracking-wide hover:border-sky-500 hover:text-sky-500"
                  >
                    + {ml} ml
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCustom(v => !v)}
                  className={cn(
                    'h-9 px-3 text-xs',
                    showCustom ? 'border-sky-500/30 text-sky-500' : 'hover:border-sky-500 hover:text-sky-500'
                  )}
                >
                  Otro
                </Button>
              </div>

              {showCustom && (
                <div className="flex gap-2 mt-3 motion-safe:animate-fade-in">
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={custom}
                    onChange={e => setCustom(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCustom() }}
                    placeholder="ml"
                    className="w-24 h-9 text-xs"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCustom}
                    className="h-9 px-3 text-xs border-sky-500/30 text-sky-500 hover:bg-sky-500/10"
                  >
                    OK
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="flex gap-3 mt-1">
              <div className="w-0.5 shrink-0 rounded-full bg-sky-500/40" />
              <span className="text-[10px] text-muted-foreground leading-relaxed">Solo lectura — navega a hoy para registrar agua</span>
            </div>
          )}

          {/* Goal editor */}
          {onSetGoal && (
            <div className="mt-3 pt-3 border-t border-border/60">
              {editingGoal ? (
                <div className="flex gap-2 items-center motion-safe:animate-fade-in">
                  <span className="text-[10px] text-muted-foreground tracking-wide">Meta diaria:</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    step="100"
                    min="500"
                    value={goalInput}
                    onChange={e => setGoalInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const n = parseInt(goalInput)
                        if (n >= 500) { onSetGoal(n); setEditingGoal(false) }
                      }
                      if (e.key === 'Escape') setEditingGoal(false)
                    }}
                    placeholder={String(safeGoal)}
                    className="w-24 h-8 text-xs"
                    autoFocus
                  />
                  <span className="text-[10px] text-muted-foreground">ml</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const n = parseInt(goalInput)
                      if (n >= 500) { onSetGoal(n); setEditingGoal(false) }
                    }}
                    className="h-8 px-2 text-[10px]"
                  >
                    OK
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => { setGoalInput(String(safeGoal)); setEditingGoal(true) }}
                  className="text-[10px] text-muted-foreground hover:text-sky-500 transition-colors"
                >
                  Meta: {safeGoal} ml · click para cambiar
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
