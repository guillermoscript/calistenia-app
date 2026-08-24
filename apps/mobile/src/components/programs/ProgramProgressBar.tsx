import { View } from 'react-native'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import type { ProgramProgress } from '@calistenia/core/lib/programProgress'

interface ProgramProgressBarProps {
  progress: ProgramProgress
  className?: string
  /** Compacto: sin el contador semanal, para cabeceras apretadas. */
  compact?: boolean
}

/**
 * «Semana 3 de 12 · 2 de 4 esta semana» con su barra (#616). Gemela de
 * `apps/web/src/components/programs/ProgramProgressBar.tsx`.
 *
 * No se pinta si el programa no declara duración (`duration_weeks = 0`): sin
 * semanas totales la barra no significaría nada.
 */
export default function ProgramProgressBar({ progress, className, compact = false }: ProgramProgressBarProps) {
  const { t } = useTranslation()
  if (progress.totalWeeks <= 0) return null

  const { currentWeek, totalWeeks, percent, sessionsThisWeek, plannedThisWeek, isCompleted, hasStarted } = progress
  // Antes de empezar `currentWeek` es null: la etiqueta lo dice en vez de
  // inventarse una «Semana 0».
  const label = isCompleted
    ? t('programProgress.programCompleted')
    : hasStarted && currentWeek
      ? t('programProgress.weekOf', { week: currentWeek, total: totalWeeks })
      : t('programProgress.notStarted')

  const weekDone = sessionsThisWeek >= plannedThisWeek
  const weekLabel = plannedThisWeek > 0 && hasStarted && !isCompleted
    ? weekDone
      ? t('programProgress.weekDone')
      : t('programProgress.thisWeek', { done: sessionsThisWeek, planned: plannedThisWeek })
    : null

  return (
    <View className={cn('w-full', className)}>
      <View className="mb-1.5 flex-row items-center justify-between gap-3">
        <Text
          className={cn(
            'font-mono text-[10px] uppercase tracking-widest',
            isCompleted ? 'text-emerald-500' : 'text-muted-foreground',
          )}
        >
          {label}
        </Text>
        {!compact && !!weekLabel && (
          <Text
            className={cn(
              'font-mono text-[10px] uppercase tracking-widest',
              weekDone ? 'text-emerald-500' : 'text-muted-foreground',
            )}
          >
            {weekLabel}
          </Text>
        )}
      </View>
      {/* El track necesita alto propio y el relleno `h-full`: una barra en % sin
          `h-full` sale invisible en RN. */}
      <View
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: percent }}
        accessibilityLabel={label}
      >
        <View
          className={cn('h-full rounded-full', isCompleted ? 'bg-emerald-500' : 'bg-lime')}
          style={{ width: `${percent}%` }}
        />
      </View>
    </View>
  )
}
