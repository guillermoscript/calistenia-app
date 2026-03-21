import type { ChallengeMetric } from '../types'

export const METRIC_LABELS: Record<ChallengeMetric, string> = {
  most_sessions: 'Más sesiones',
  most_pullups: 'Mas pull-ups',
  most_pushups: 'Mas push-ups',
  longest_streak: 'Mayor racha',
  most_lsit: 'Mayor L-sit',
  most_handstand: 'Mayor handstand',
  custom: 'Personalizado',
}

export const METRIC_UNITS: Record<ChallengeMetric, string> = {
  most_sessions: '',
  most_pullups: 'reps',
  most_pushups: 'reps',
  longest_streak: 'días',
  most_lsit: 's',
  most_handstand: 's',
  custom: '',
}

export function daysRemaining(endsAt: string): string {
  const diff = Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86400000)
  if (diff <= 0) return 'Finalizado'
  if (diff === 1) return '1 día restante'
  return `${diff} días restantes`
}

export function getMetricLabel(metric: ChallengeMetric, customMetric?: string): string {
  if (metric === 'custom' && customMetric) return customMetric
  return METRIC_LABELS[metric]
}
