import i18n from './i18n'
import type { ChallengeMetric } from '../types'

const METRIC_LABEL_KEYS: Record<ChallengeMetric, string> = {
  most_sessions: 'challenge.metricSessions',
  most_pullups: 'challenge.metricPullups',
  most_pushups: 'challenge.metricPushups',
  longest_streak: 'challenge.metricStreak',
  most_lsit: 'challenge.metricLsit',
  most_handstand: 'challenge.metricHandstand',
  custom: 'challenge.metricCustom',
}

export function getMetricLabels(): Record<ChallengeMetric, string> {
  const labels = {} as Record<ChallengeMetric, string>
  for (const [k, v] of Object.entries(METRIC_LABEL_KEYS)) {
    labels[k as ChallengeMetric] = i18n.t(v)
  }
  return labels
}

/** @deprecated Use getMetricLabels() for reactive labels */
export const METRIC_LABELS = new Proxy({} as Record<ChallengeMetric, string>, {
  get(_target, prop: string) {
    const key = METRIC_LABEL_KEYS[prop as ChallengeMetric]
    return key ? i18n.t(key) : prop
  },
})

export const METRIC_UNITS: Record<ChallengeMetric, string> = {
  most_sessions: '',
  most_pullups: 'reps',
  most_pushups: 'reps',
  longest_streak: i18n.t('challenge.unitDays'),
  most_lsit: 's',
  most_handstand: 's',
  custom: '',
}

export function daysRemaining(endsAt: string): string {
  const diff = Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86400000)
  if (diff <= 0) return i18n.t('challenge.finished')
  if (diff === 1) return i18n.t('challenge.oneDayLeft')
  return i18n.t('challenge.daysLeft', { count: diff })
}

export function getMetricLabel(metric: ChallengeMetric, customMetric?: string): string {
  if (metric === 'custom' && customMetric) return customMetric
  return i18n.t(METRIC_LABEL_KEYS[metric])
}
