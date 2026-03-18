import { useMemo } from 'react'
import { WORKOUTS } from '../../data/workouts'
import { Card, CardContent } from '../ui/card'
import { cn } from '../../lib/utils'
import type { ProgressMap } from '../../types'

// Map common muscle keywords to groups
const MUSCLE_GROUPS: Record<string, string[]> = {
  'Pecho':   ['pecho'],
  'Espalda': ['dorsal', 'romboides', 'trapecios', 'erectores'],
  'Hombros': ['deltoides', 'hombros', 'manguito'],
  'Brazos':  ['bíceps', 'tríceps'],
  'Core':    ['core', 'tva', 'oblicuos'],
  'Piernas': ['cuádriceps', 'glúteos', 'isquio', 'pantorrillas', 'aductor'],
  'Lumbar':  ['lumbar', 'columna', 'psoas', 'piriforme'],
}

function classifyMuscle(muscleStr: string): string[] {
  const lower = muscleStr.toLowerCase()
  const matched: string[] = []
  for (const [group, keywords] of Object.entries(MUSCLE_GROUPS)) {
    if (keywords.some(k => lower.includes(k))) matched.push(group)
  }
  return matched.length > 0 ? matched : ['Otro']
}

const GROUP_COLORS: Record<string, string> = {
  'Pecho':   'bg-red-500',
  'Espalda': 'bg-sky-500',
  'Hombros': 'bg-amber-400',
  'Brazos':  'bg-pink-500',
  'Core':    'bg-lime',
  'Piernas': 'bg-purple-500',
  'Lumbar':  'bg-emerald-500',
  'Otro':    'bg-zinc-500',
}

interface MuscleVolumeChartProps {
  progress: ProgressMap
}

export default function MuscleVolumeChart({ progress }: MuscleVolumeChartProps) {
  const volumeByGroup = useMemo(() => {
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay() + 1) // Monday
    const weekStartStr = weekStart.toISOString().split('T')[0]

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
      <div className="text-[10px] text-muted-foreground tracking-[3px] mb-4 uppercase">Volumen semanal por musculo</div>
      <Card>
        <CardContent className="p-5">
          <div className="space-y-2.5">
            {volumeByGroup.map(([group, sets]) => {
              const pct = (sets / maxSets) * 100
              const color = GROUP_COLORS[group] || 'bg-zinc-500'
              return (
                <div key={group}>
                  <div className="flex justify-between mb-1">
                    <span className="text-[12px] text-foreground">{group}</span>
                    <span className="text-[11px] text-muted-foreground font-mono">{sets} series</span>
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
          <div className="text-[10px] text-muted-foreground mt-3 pt-3 border-t border-border/60">
            Total: {volumeByGroup.reduce((s, [, v]) => s + v, 0)} series esta semana
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
