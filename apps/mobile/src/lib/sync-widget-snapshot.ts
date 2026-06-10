import { localDay, todayStr } from '@calistenia/core/lib/dateUtils'
import { buildWidgetSnapshot } from './widget-snapshot'
import { writeWidgetSnapshot } from './widget-bridge'
import type { Settings, WeekDay, Workout } from '@calistenia/core/types'

const DAY_IDS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'] as const

export function syncWidgetSnapshot(args: {
  lang: string
  programName: string | null
  settings: Settings
  weekDays: WeekDay[]
  getWorkout: (phase: number, dayId: string) => Workout | null
  isWorkoutDone: (key: string) => boolean
  streak: number
  weeklyDone: number
}): void {
  const todayId = DAY_IDS[localDay()]
  const phase = args.settings.phase || 1
  const workout = args.programName ? args.getWorkout(phase, todayId) : null
  const todayMeta = args.weekDays.find(d => d.id === todayId)

  void writeWidgetSnapshot(buildWidgetSnapshot({
    today: todayStr(),
    lang: args.lang.startsWith('en') ? 'en' : 'es',
    programName: args.programName,
    programPhase: phase,
    todayId,
    todayType: todayMeta?.type || 'strength',
    weekDays: args.weekDays.map(d => ({ id: d.id, type: d.type })),
    workout: workout ? { title: workout.title, exerciseCount: workout.exercises.length } : null,
    isDone: args.isWorkoutDone,
    streak: args.streak,
    weeklyDone: args.weeklyDone,
    weeklyGoal: args.settings.weeklyGoal || 5,
  }))
}
