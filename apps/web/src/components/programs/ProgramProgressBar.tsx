import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import type { ProgramProgress } from '@calistenia/core/lib/programProgress'

interface ProgramProgressBarProps {
  progress: ProgramProgress
  className?: string
  /** Compacto: sin el contador semanal, para cabeceras apretadas. */
  compact?: boolean
}

/**
 * «Semana 3 de 12 · 2 de 4 esta semana» con su barra (#616).
 *
 * No se pinta si el programa no tiene duración declarada
 * (`duration_weeks = 0`): sin semanas totales la barra no significaría nada, y
 * es preferible no enseñarla a enseñar una vacía.
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

  const weekLabel = plannedThisWeek > 0 && hasStarted && !isCompleted
    ? sessionsThisWeek >= plannedThisWeek
      ? t('programProgress.weekDone')
      : t('programProgress.thisWeek', { done: sessionsThisWeek, planned: plannedThisWeek })
    : null

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span
          className={cn(
            'font-mono text-[10px] tracking-widest uppercase',
            isCompleted ? 'text-emerald-500' : 'text-muted-foreground',
          )}
        >
          {label}
        </span>
        {!compact && weekLabel && (
          <span
            className={cn(
              'font-mono text-[10px] tracking-widest uppercase',
              sessionsThisWeek >= plannedThisWeek ? 'text-emerald-500' : 'text-muted-foreground',
            )}
          >
            {weekLabel}
          </span>
        )}
      </div>
      <div
        className="h-1.5 w-full rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500',
            isCompleted ? 'bg-emerald-500' : 'bg-[hsl(var(--lime))]',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
