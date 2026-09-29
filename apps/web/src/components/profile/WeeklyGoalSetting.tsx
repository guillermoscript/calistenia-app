import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useWorkoutActions } from '../../contexts/WorkoutContext'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

const GOAL_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const

interface WeeklyGoalSettingProps {
  /** Objetivo efectivo ahora mismo (`getEffectiveWeeklyGoal`). */
  goal: number
  /** El usuario lo eligió a mano (`settings.weeklyGoalCustom`). */
  isCustom: boolean
  /** Días que marca el programa: el objetivo si no hay uno propio. */
  programGoal: number
}

/**
 * Objetivo semanal (#856, con el campo de #853). Al guardar se escriben
 * `weeklyGoal` y `weeklyGoalCustom: true` a la vez; «Usar el del programa»
 * vuelve a `weeklyGoalCustom: false` y el objetivo pasa a ser el del programa.
 * Como sale del contexto de entreno, Hoy y Progreso lo ven al momento.
 */
export function WeeklyGoalSetting({ goal, isCustom, programGoal }: WeeklyGoalSettingProps) {
  const { t } = useTranslation()
  const { updateSettings } = useWorkoutActions()
  const [draft, setDraft] = useState(goal)
  const [saving, setSaving] = useState(false)
  const dirty = draft !== goal || !isCustom

  const save = async (patch: { weeklyGoal?: number; weeklyGoalCustom: boolean }) => {
    setSaving(true)
    try {
      await updateSettings(patch)
      toast.success(t('profile.weeklyGoal.saved'))
    } catch {
      toast.error(t('profile.weeklyGoal.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t('profile.weeklyGoal.desc')}</p>
      <div role="group" aria-label={t('profile.weeklyGoal.title')} className="grid grid-cols-7 gap-1.5">
        {GOAL_OPTIONS.map(n => {
          const selected = draft === n
          return (
            <button
              key={n}
              type="button"
              aria-pressed={selected}
              onClick={() => setDraft(n)}
              className={cn(
                'h-11 rounded-md border font-bebas text-xl transition-colors',
                selected ? 'border-foreground bg-foreground text-background' : 'border-border hover:border-foreground/40',
              )}
            >
              {n}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {t('profile.weeklyGoal.programHint', { count: programGoal })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => save({ weeklyGoal: draft, weeklyGoalCustom: true })}
          disabled={saving || !dirty}
          className="h-11"
        >
          {t('profile.weeklyGoal.save', { count: draft })}
        </Button>
        {isCustom ? (
          <Button
            variant="outline"
            onClick={() => { setDraft(programGoal); save({ weeklyGoalCustom: false }) }}
            disabled={saving}
            className="h-11"
          >
            {t('profile.weeklyGoal.useProgram')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
