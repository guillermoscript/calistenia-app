import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../ui/card'
import { cn } from '../../lib/utils'
import { toLocalDateStr } from '../../lib/dateUtils'
import type { ProgressMap, ExerciseLog } from '../../types'

interface VolumeLoadChartProps {
  progress: ProgressMap
}

export default function VolumeLoadChart({ progress }: VolumeLoadChartProps) {
  const { t } = useTranslation()
  const weeklyVolume = useMemo(() => {
    const now = new Date()
    const weeks: { label: string; volume: number; sets: number; startDate: string }[] = []

    for (let w = 3; w >= 0; w--) {
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - now.getDay() + 1 - w * 7)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 7)

      const startStr = toLocalDateStr(weekStart)
      const endStr = toLocalDateStr(weekEnd)

      let volume = 0
      let sets = 0

      Object.values(progress).forEach(val => {
        const log = val as ExerciseLog
        if (!log.exerciseId || !log.sets || !log.date) return
        if (log.date < startStr || log.date >= endStr) return

        log.sets.forEach(s => {
          const reps = parseInt(s.reps)
          if (isNaN(reps)) return
          sets++
          const weight = s.weight || 0
          volume += reps * (weight > 0 ? weight : 1) // bodyweight = 1 as base unit
        })
      })

      weeks.push({
        label: `S${4 - w}`,
        volume: Math.round(volume),
        sets,
        startDate: startStr,
      })
    }

    return weeks
  }, [progress])

  const hasWeightData = weeklyVolume.some(w => w.volume > w.sets) // means someone used actual weight
  const maxVolume = Math.max(...weeklyVolume.map(w => w.volume), 1)
  const totalVolume = weeklyVolume[weeklyVolume.length - 1]?.volume || 0
  const prevVolume = weeklyVolume[weeklyVolume.length - 2]?.volume || 0
  const volumeDiff = totalVolume - prevVolume

  if (weeklyVolume.every(w => w.sets === 0)) return null

  return (
    <div className="mb-8">
      <div className="text-[10px] text-muted-foreground tracking-[3px] mb-4 uppercase">{t('progress.volumeLoad.title')}</div>
      <Card>
        <CardContent className="p-5">
          <div className="flex items-baseline gap-3 mb-4">
            <div className="font-bebas text-3xl text-lime">
              {hasWeightData ? `${totalVolume} kg` : `${weeklyVolume[weeklyVolume.length - 1]?.sets || 0} sets`}
            </div>
            <div className="text-[11px] text-muted-foreground">{t('progress.volumeLoad.thisWeek')}</div>
            {volumeDiff !== 0 && (
              <div className={cn('text-[11px]', volumeDiff > 0 ? 'text-emerald-500' : 'text-red-400')}>
                {volumeDiff > 0 ? '+' : ''}{hasWeightData ? `${volumeDiff} kg` : `${volumeDiff} sets`}
              </div>
            )}
          </div>

          <div className="h-24 flex items-end gap-2">
            {weeklyVolume.map((w, i) => {
              const h = maxVolume > 0 ? (w.volume / maxVolume) * 100 : 0
              const isCurrent = i === weeklyVolume.length - 1
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1"
                  title={`${w.startDate}: ${w.volume} kg total, ${w.sets} series`}>
                  <span className="text-[9px] text-muted-foreground font-mono">
                    {hasWeightData ? w.volume : w.sets}
                  </span>
                  <div
                    className={cn(
                      'w-full rounded-t transition-all',
                      isCurrent ? 'bg-lime' : 'bg-lime/20'
                    )}
                    style={{ height: `${Math.max(h, 4)}%` }}
                  />
                  <span className={cn('text-[10px] font-mono', isCurrent ? 'text-lime' : 'text-muted-foreground')}>
                    {w.label}
                  </span>
                </div>
              )
            })}
          </div>

          {!hasWeightData && (
            <div className="text-[10px] text-muted-foreground mt-3 pt-3 border-t border-border/60">
              {t('progress.volumeLoad.addWeightHint')}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
