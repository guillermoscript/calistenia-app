import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { WORKOUTS } from '../../data/workouts'
import { Card, CardContent } from '../ui/card'
import { cn } from '../../lib/utils'
import { toLocalDateStr } from '../../lib/dateUtils'
import type { ProgressMap } from '../../types'

// Map muscle group keys to keywords for classification
const MUSCLE_GROUPS: Record<string, string[]> = {
  'chest':    ['pecho'],
  'back':     ['dorsal', 'romboides', 'trapecios', 'erectores'],
  'shoulders':['deltoides', 'hombros', 'manguito'],
  'arms':     ['bíceps', 'tríceps'],
  'core':     ['core', 'tva', 'oblicuos'],
  'legs':     ['cuádriceps', 'glúteos', 'isquio', 'pantorrillas', 'aductor'],
  'lumbar':   ['lumbar', 'columna', 'psoas', 'piriforme'],
}

const GROUP_LABEL_KEYS: Record<string, string> = {
  'chest':    'progress.muscleVolume.chest',
  'back':     'progress.muscleVolume.back',
  'shoulders':'progress.muscleVolume.shoulders',
  'arms':     'progress.muscleVolume.arms',
  'core':     'progress.muscleVolume.core',
  'legs':     'progress.muscleVolume.legs',
  'lumbar':   'progress.muscleVolume.lumbar',
  'other':    'progress.muscleVolume.other',
}

function classifyMuscle(muscleStr: string): string[] {
  const lower = muscleStr.toLowerCase()
  const matched: string[] = []
  for (const [group, keywords] of Object.entries(MUSCLE_GROUPS)) {
    if (keywords.some(k => lower.includes(k))) matched.push(group)
  }
  return matched.length > 0 ? matched : ['other']
}

const GROUP_COLORS: Record<string, string> = {
  'chest':    'bg-red-500',
  'back':     'bg-sky-500',
  'shoulders':'bg-amber-400',
  'arms':     'bg-pink-500',
  'core':     'bg-lime',
  'legs':     'bg-purple-500',
  'lumbar':   'bg-emerald-500',
  'other':    'bg-zinc-500',
}

interface MuscleVolumeChartProps {
  progress: ProgressMap
}

export default function MuscleVolumeChart({ progress }: MuscleVolumeChartProps) {
  const { t } = useTranslation()
  const volumeByGroup = useMemo(() => {
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay() + 1) // Monday
    const weekStartStr = toLocalDateStr(weekStart)

    const volume: Record<string, number> = {}

    Object.entries(progress).forEach(([key, val]) => {
      if (!key.startsWith('done_')) return
      const date = key.split('_')[1]
      if (date < weekStartStr) return

      const workoutKey = key.split('_').slice(2).join('_')
      const workout = WORKOUTS[workoutKey]
      if (!workout) return

      workout.exercises.forEach(ex => {
        const groups = classifyMuscle(ex.muscles)
        const sets = typeof ex.sets === 'number' ? ex.sets : 3
        groups.forEach(g => {
          volume[g] = (volume[g] || 0) + sets
        })
      })
    })

    return Object.entries(volume).sort((a, b) => b[1] - a[1])
  }, [progress])

  if (volumeByGroup.length === 0) return null

  const maxSets = Math.max(...volumeByGroup.map(([, v]) => v), 1)

  return (
    <div className="mb-8">
      <div className="text-[10px] text-muted-foreground tracking-[3px] mb-4 uppercase">{t('progress.muscleVolume.title')}</div>
      <Card>
        <CardContent className="p-5">
          <div className="space-y-2.5">
            {volumeByGroup.map(([group, sets]) => {
              const pct = (sets / maxSets) * 100
              const color = GROUP_COLORS[group] || 'bg-zinc-500'
              return (
                <div key={group}>
                  <div className="flex justify-between mb-1">
                    <span className="text-[12px] text-foreground">{t(GROUP_LABEL_KEYS[group] || group)}</span>
                    <span className="text-[11px] text-muted-foreground font-mono">{sets} {t('progress.muscleVolume.sets')}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', color)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
