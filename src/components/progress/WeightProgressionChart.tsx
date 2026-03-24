import { useMemo, useState } from 'react'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import type { ExerciseLog } from '../../types'

interface WeightProgressionChartProps {
  exerciseLogs: Record<string, ExerciseLog[]>
}

export default function WeightProgressionChart({ exerciseLogs }: WeightProgressionChartProps) {
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null)

  // Build weight progression data per exercise
  const weightData = useMemo(() => {
    const data: Record<string, { date: string; maxWeight: number; maxReps: string }[]> = {}
    Object.entries(exerciseLogs).forEach(([exId, logs]) => {
      const points: { date: string; maxWeight: number; maxReps: string }[] = []
      const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date))
      sorted.forEach(log => {
          const weighted = log.sets.filter(s => s.weight && s.weight > 0)
          if (weighted.length > 0) {
            const best = weighted.reduce((max, s) => (s.weight || 0) > (max.weight || 0) ? s : max)
            points.push({ date: log.date, maxWeight: best.weight || 0, maxReps: best.reps })
          }
        })
      if (points.length > 0) data[exId] = points
    })
    return data
  }, [exerciseLogs])

  const exerciseIds = Object.keys(weightData)
  if (exerciseIds.length === 0) return null

  const active = selectedExercise || exerciseIds[0]
  const points = weightData[active] || []
  const maxW = Math.max(...points.map(p => p.maxWeight), 1)

  return (
    <div className="mb-8">
      <div className="text-[10px] text-muted-foreground tracking-[3px] mb-4 uppercase">Progresión de lastre</div>
      <Card>
        <CardContent className="p-5">
          {/* Exercise selector */}
          <div className="flex gap-1.5 flex-wrap mb-4">
            {exerciseIds.map(id => (
              <Button
                key={id}
                variant="outline"
                size="sm"
                onClick={() => setSelectedExercise(id)}
                className={cn(
                  'h-7 px-3 text-[10px] tracking-wide capitalize',
                  (active === id) && 'border-amber-400/50 text-amber-400 bg-amber-400/10'
                )}
              >
                {id.replace(/_/g, ' ')}
              </Button>
            ))}
          </div>

          {/* Chart */}
          {points.length > 1 ? (
            <div className="h-32 flex items-end gap-1">
              {points.map((p, i) => {
                const h = (p.maxWeight / maxW) * 100
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${p.date}: ${p.maxWeight}kg × ${p.maxReps}`}>
                    <span className="text-[9px] text-amber-400 font-mono">{p.maxWeight}</span>
                    <div
                      className="w-full bg-amber-400/20 rounded-t border border-amber-400/30 transition-all"
                      style={{ height: `${Math.max(h, 8)}%` }}
                    />
                    <span className="text-[8px] text-muted-foreground font-mono">{p.date.slice(5)}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-4">
              <div className="text-amber-400 font-bebas text-3xl">{points[0]?.maxWeight || 0} kg</div>
              <div className="text-[11px] text-muted-foreground">{points[0]?.date} · {points[0]?.maxReps} reps</div>
            </div>
          )}

          {/* Summary */}
          {points.length > 1 && (
            <div className="flex gap-4 mt-3 pt-3 border-t border-border/60 text-[11px]">
              <div className="text-muted-foreground">
                Inicio: <span className="text-foreground">{points[0].maxWeight}kg</span>
              </div>
              <div className="text-muted-foreground">
                Actual: <span className="text-amber-400 font-medium">{points[points.length - 1].maxWeight}kg</span>
              </div>
              <div className="text-muted-foreground">
                Progreso: <span className={cn(
                  points[points.length - 1].maxWeight > points[0].maxWeight ? 'text-emerald-500' : 'text-muted-foreground'
                )}>
                  +{(points[points.length - 1].maxWeight - points[0].maxWeight).toFixed(1)}kg
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
