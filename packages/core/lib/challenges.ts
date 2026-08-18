import i18n from 'i18next'
import { localize } from './i18n-db'
import { getCatalogEntry } from './variants'
import type { ChallengeMetric } from '../types'

const METRIC_LABEL_KEYS: Record<ChallengeMetric, string> = {
  most_sessions: 'challenge.metricSessions',
  most_pullups: 'challenge.metricPullups',
  most_pushups: 'challenge.metricPushups',
  longest_streak: 'challenge.metricStreak',
  most_lsit: 'challenge.metricLsit',
  most_handstand: 'challenge.metricHandstand',
  exercise: 'challenge.metricExercise',
  custom: 'challenge.metricCustom',
  total_workouts: 'challenge.metricTotalWorkouts',
  total_exercise: 'challenge.metricTotalExercise',
  total_distance: 'challenge.metricTotalDistance',
}

const METRIC_UNITS: Record<ChallengeMetric, string> = {
  most_sessions: '',
  most_pullups: 'reps',
  most_pushups: 'reps',
  longest_streak: i18n.t('challenge.unitDays'),
  most_lsit: 's',
  most_handstand: 's',
  exercise: 'reps',
  custom: '',
  total_workouts: '',
  total_exercise: 'reps',
  total_distance: 'km',
}

/**
 * Medallas del top 3 de cualquier ranking (retos, amigos, leaderboard global).
 *
 * Vivía duplicada como `const MEDALS` en seis ficheros de web y móvil, y en dos
 * de ellos los emoji se habían perdido por el camino: la constante decía
 * `['', '', '']` y las medallas simplemente no se pintaban, sin que typecheck ni
 * lint pudieran verlo (#455). Un único origen evita que vuelva a pasar.
 *
 * Se indexa por posición 0-based: `RANK_MEDALS[position - 1]` es `undefined`
 * a partir del cuarto puesto, que es lo que la UI usa para caer al número.
 */
export const RANK_MEDALS: readonly string[] = ['🥇', '🥈', '🥉']

/**
 * Human status for a challenge window.
 *
 * Pass `startsAt` whenever it's available: a challenge that hasn't started yet
 * used to report "N days left" counting to its end, which reads as if it were
 * already running — and next to a visible date range that says it starts in a
 * fortnight, the two contradict each other outright.
 */
export function daysRemaining(endsAt: string, startsAt?: string): string {
  if (startsAt) {
    const untilStart = Math.ceil((new Date(startsAt).getTime() - Date.now()) / 86400000)
    if (untilStart === 1) return i18n.t('challenge.startsTomorrow')
    if (untilStart > 1) return i18n.t('challenge.startsInDays', { count: untilStart })
  }
  const diff = Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86400000)
  if (diff <= 0) return i18n.t('challenge.finished')
  if (diff === 1) return i18n.t('challenge.oneDayLeft')
  return i18n.t('challenge.daysLeft', { count: diff })
}

export function getMetricLabel(metric: ChallengeMetric, customMetric?: string, exerciseSlug?: string): string {
  if (metric === 'custom' && customMetric) return customMetric
  if (metric === 'exercise' && exerciseSlug) {
    const entry = getCatalogEntry(exerciseSlug)
    if (entry) return localize(entry.name, i18n.language)
  }
  if (metric === 'total_exercise' && exerciseSlug) {
    const entry = getCatalogEntry(exerciseSlug)
    if (entry) return i18n.t('challenge.metricTotalOf', { name: localize(entry.name, i18n.language) })
  }
  return i18n.t(METRIC_LABEL_KEYS[metric])
}

/** Score unit for a challenge; timer exercises score in seconds, the rest in reps. */
export function getMetricUnit(metric: ChallengeMetric, exerciseSlug?: string): string {
  if (metric === 'custom') return ''
  if (metric === 'exercise' || metric === 'total_exercise') {
    return exerciseSlug && getCatalogEntry(exerciseSlug)?.isTimer ? 's' : 'reps'
  }
  return METRIC_UNITS[metric] ?? ''
}
