import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { cn } from '../../lib/utils'
import type { ExerciseLog } from '../../types'

// Brzycki formula: 1RM = weight × (36 / (37 - reps))
function brzycki(weight: number, reps: number): number {
  if (reps >= 37) return weight
  return weight * (36 / (37 - reps))
}

// Epley formula: 1RM = weight × (1 + reps / 30)
function epley(weight: number, reps: number): number {
  return weight * (1 + reps / 30)
}

function estimate1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0
  if (reps === 1) return weight
  return Math.round((brzycki(weight, reps) + epley(weight, reps)) / 2)
}

// Percentage table
const PERCENTAGES = [100, 95, 90, 85, 80, 75, 70, 65, 60]

interface OneRepMaxCalculatorProps {
  exerciseLogs: Record<string, ExerciseLog[]>
  bodyweightKg?: number
}

export default function OneRepMaxCalculator({ exerciseLogs, bodyweightKg = 70 }: OneRepMaxCalculatorProps) {
  const { t } = useTranslation()
  const [manualWeight, setManualWeight] = useState('')
  const [manualReps, setManualReps] = useState('')
  const [showManual, setShowManual] = useState(false)

  // Auto-detect best sets with weight from logs
  const autoEstimates = useMemo(() => {
    const estimates: { exerciseId: string; weight: number; reps: number; oneRM: number }[] = []

    Object.entries(exerciseLogs).forEach(([exId, logs]) => {
      let bestOneRM = 0
      let bestWeight = 0
      let bestReps = 0

      logs.forEach(log => {
        log.sets.forEach(s => {
          const reps = parseInt(s.reps)
          const weight = (s.weight || 0) + bodyweightKg // bodyweight + added weight for calisthenics
          if (!isNaN(reps) && reps > 0 && s.weight && s.weight > 0) {
            const orm = estimate1RM(weight, reps)
            if (orm > bestOneRM) {
              bestOneRM = orm
              bestWeight = weight
              bestReps = reps
            }
          }
        })
      })

      if (bestOneRM > 0) {
        estimates.push({ exerciseId: exId, weight: bestWeight, reps: bestReps, oneRM: bestOneRM })
      }
    })

    return estimates.sort((a, b) => b.oneRM - a.oneRM)
  }, [exerciseLogs, bodyweightKg])

  const manual1RM = useMemo(() => {
    const w = parseFloat(manualWeight)
    const r = parseInt(manualReps)
    if (isNaN(w) || isNaN(r) || w <= 0 || r <= 0) return null
    return estimate1RM(w, r)
  }, [manualWeight, manualReps])

  if (autoEstimates.length === 0 && !showManual) {
    return (
      <div className="mb-8">
        <div className="text-[10px] text-muted-foreground tracking-[3px] mb-4 uppercase">{t('progress.oneRepMax.title')}</div>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground mb-3">
              {t('progress.oneRepMax.emptyState')}
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowManual(true)}
              className="text-[10px] tracking-widest hover:border-lime hover:text-lime">
              {t('progress.oneRepMax.manualCalculator')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mb-8">
      <div className="text-[10px] text-muted-foreground tracking-[3px] mb-4 uppercase">{t('progress.oneRepMax.title')}</div>
      <Card>
        <CardContent className="p-5">
          {/* Auto estimates from logs */}
          {autoEstimates.length > 0 && (
            <div className="space-y-3 mb-4">
              {autoEstimates.map(e => (
                <div key={e.exerciseId} className="flex items-center justify-between">
                  <div>
                    <div className="text-[13px] font-medium capitalize">{e.exerciseId.replace(/_/g, ' ')}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {e.weight}kg × {e.reps} reps ({t('progress.oneRepMax.bwPlusWeight')})
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bebas text-2xl text-lime">{e.oneRM} kg</div>
                    <div className="text-[9px] text-muted-foreground">{t('progress.oneRepMax.estimated')}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Manual calculator */}
          <div className="pt-3 border-t border-border/60">
            <Button variant="outline" size="sm" onClick={() => setShowManual(v => !v)}
              className="text-[10px] tracking-widest hover:border-lime hover:text-lime mb-3">
              {showManual ? t('progress.oneRepMax.close') : t('progress.oneRepMax.manualCalculator')}
            </Button>

            {showManual && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div>
                    <label className="text-[9px] text-muted-foreground block mb-1">{t('progress.oneRepMax.totalWeight')}</label>
                    <Input type="number" min="0" step="0.5" value={manualWeight} onChange={e => setManualWeight(e.target.value)}
                      placeholder="80" className="h-8 w-24 text-xs" />
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground block mb-1">{t('progress.oneRepMax.reps')}</label>
                    <Input type="number" min="1" max="50" value={manualReps} onChange={e => setManualReps(e.target.value)}
                      placeholder="8" className="h-8 w-20 text-xs" />
                  </div>
                  {manual1RM && (
                    <div className="flex items-end pb-0.5">
                      <div className="font-bebas text-2xl text-lime">{manual1RM} kg</div>
                    </div>
                  )}
                </div>

                {/* Percentage table */}
                {manual1RM && (
                  <div className="grid grid-cols-3 gap-1.5 mt-2">
                    {PERCENTAGES.map(pct => (
                      <div key={pct} className="text-center py-1.5 bg-muted/30 rounded border border-border/40">
                        <div className="text-[10px] text-muted-foreground">{pct}%</div>
                        <div className={cn('font-mono text-[12px]', pct === 100 ? 'text-lime font-bold' : 'text-foreground')}>
                          {Math.round(manual1RM * pct / 100)} kg
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
