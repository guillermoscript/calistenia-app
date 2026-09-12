import { localDay, todayStr, getTimezone } from '@calistenia/core/lib/dateUtils'
import { buildWidgetSnapshot } from './widget-snapshot'
import { writeWidgetSnapshot } from './widget-bridge'
import type { Settings, WeekDay, Workout } from '@calistenia/core/types'

const DAY_IDS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'] as const

export function syncWidgetSnapshot(args: {
  lang: string
  programName: string | null
  settings: Settings
  /**
   * Fase del programa activo (#616). Antes se leía de `settings.phase`, el
   * entero global del usuario; ahora la deriva `programProgress` a partir de
   * `started_at`, así que el widget avanza de fase solo.
   */
  phase: number
  weekDays: WeekDay[]
  getWorkout: (phase: number, dayId: string) => Workout | null
  isWorkoutDone: (key: string) => boolean
  streak: number
  lastSessionDate: string | null
  weeklyDone: number
}): void {
  const todayId = DAY_IDS[localDay()]
  const tomorrowId = DAY_IDS[(localDay() + 1) % 7]
  const phase = args.phase || 1
  const workout = args.programName ? args.getWorkout(phase, todayId) : null
  // Misma fase que hoy: los programas no cambian de fase a mitad de semana.
  const workoutTomorrow = args.programName ? args.getWorkout(phase, tomorrowId) : null
  const todayMeta = args.weekDays.find(d => d.id === todayId)
  const tomorrowMeta = args.weekDays.find(d => d.id === tomorrowId)

  void writeWidgetSnapshot(buildWidgetSnapshot({
    today: todayStr(),
    tz: getTimezone(),
    lang: args.lang.startsWith('en') ? 'en' : 'es',
    programName: args.programName,
    programPhase: phase,
    todayId,
    todayType: todayMeta?.type || 'strength',
    tomorrowType: tomorrowMeta?.type || 'strength',
    weekDays: args.weekDays.map(d => ({ id: d.id, type: d.type })),
    workout: workout ? { title: workout.title, exerciseCount: workout.exercises.length } : null,
    workoutTomorrow: workoutTomorrow ? { title: workoutTomorrow.title, exerciseCount: workoutTomorrow.exercises.length } : null,
    isDone: args.isWorkoutDone,
    streak: args.streak,
    lastSessionDate: args.lastSessionDate,
    weeklyDone: args.weeklyDone,
    weeklyGoal: args.settings.weeklyGoal || 5,
  }))
}
