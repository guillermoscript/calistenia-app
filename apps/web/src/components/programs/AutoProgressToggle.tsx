import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TrendingUp } from 'lucide-react'
import { useSetAutoProgress } from '@calistenia/core/hooks/useAutoProgression'
import { useWorkoutState } from '../../contexts/WorkoutContext'
import { useAuthState } from '../../contexts/AuthContext'
import { cn } from '../../lib/utils'

/**
 * El opt-in de la progresión automática, por INSCRIPCIÓN (#617).
 *
 * Solo tiene sentido —y solo se monta— en la ficha del programa activo: el
 * interruptor vive en `user_programs`, así que sin inscripción no hay nada que
 * encender. Lee el contexto en vez de recibirlo por props porque
 * `ProgramDetailPage` la comparte con la vista pública `/shared/:id`, que se
 * pinta FUERA del `WorkoutProvider`: pasarle el dato por props obligaría a
 * ensuciar también esa ruta con algo que allí no existe.
 */
export default function AutoProgressToggle() {
  const { t } = useTranslation()
  const { activeEnrollment } = useWorkoutState()
  const { userId } = useAuthState()
  const setAutoProgress = useSetAutoProgress(userId ?? null, activeEnrollment?.id ?? null)
  const [saving, setSaving] = useState(false)

  if (!activeEnrollment || !userId) return null

  const on = !!activeEnrollment.auto_progress

  const toggle = async (): Promise<void> => {
    if (saving) return
    setSaving(true)
    await setAutoProgress(!on)
    setSaving(false)
  }

  return (
    <div className="max-w-md mb-6 flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <TrendingUp className={cn('w-5 h-5 mt-0.5 shrink-0', on ? 'text-lime' : 'text-muted-foreground')} aria-hidden />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{t('progression.optInLabel')}</div>
        <p className="text-xs text-muted-foreground mt-0.5">{t('progression.optInHint')}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={t('progression.optInLabel')}
        onClick={toggle}
        disabled={saving}
        className={cn(
          'shrink-0 mt-0.5 w-11 h-6 rounded-full transition-colors relative',
          on ? 'bg-lime' : 'bg-muted',
          saving && 'opacity-70',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background transition-transform',
            on && 'translate-x-5',
          )}
        />
      </button>
    </div>
  )
}
