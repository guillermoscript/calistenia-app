import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkoutReminders } from '@calistenia/core/hooks/useWorkoutReminders'
import { useWorkoutState } from '../../contexts/WorkoutContext'
import { DAY_BY_INDEX } from '@calistenia/core/lib/training-day'
import { localDay } from '@calistenia/core/lib/dateUtils'
import { computeNextWorkoutPromise } from '@calistenia/core/lib/next-workout-promise'

interface Props {
  userId: string | null | undefined
}

/**
 * «Vuelve el `<día>`»: la promesa del próximo entreno en la celebración
 * (#825). Ninguna `CelebrateScreen` decía antes cuándo volver.
 *
 * Fuente, en orden: el recordatorio `workout` activo (hora + día) y, si no
 * hay uno con días válidos, el siguiente día entrenable del programa activo
 * (solo día). Sin ninguno de los dos no se pinta nada — nunca se inventa una
 * fecha. El cálculo puro vive en `next-workout-promise.ts`.
 */
export default function NextWorkoutPromise({ userId }: Props) {
  const { t } = useTranslation()
  const { reminders } = useWorkoutReminders(userId ?? null)
  const { activeEnrollment, weekDays } = useWorkoutState()

  const workoutReminder = reminders.find((r) => r.reminderType === 'workout' && r.enabled)
  const todayId = DAY_BY_INDEX[localDay()]

  const promise = useMemo(() => computeNextWorkoutPromise({
    todayId,
    reminder: workoutReminder
      ? { hour: workoutReminder.hour, minute: workoutReminder.minute, daysOfWeek: workoutReminder.daysOfWeek }
      : null,
    // Sin inscripción activa, `weekDays` del contexto son los del catálogo
    // hardcodeado de fallback (ver `usePrograms`): no cuentan como «programa
    // activo» para esta promesa.
    weekDays: activeEnrollment ? weekDays : null,
  }), [todayId, workoutReminder, activeEnrollment, weekDays])

  if (!promise) return null

  const dayLabel = t(`day.${promise.dayId}`)

  return (
    <div
      className="max-w-[380px] text-center text-[13px] text-foreground/70"
      style={{ animation: 'fadeUp 0.5s 0.6s ease-out both' }}
    >
      {promise.source === 'reminder'
        ? t('session.nextWorkoutDayWithTime', { day: dayLabel, time: promise.time })
        : t('session.nextWorkoutDay', { day: dayLabel })}
    </div>
  )
}
