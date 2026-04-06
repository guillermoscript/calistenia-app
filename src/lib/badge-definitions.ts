import type { BadgeType } from '../types'

export interface BadgeDefinition {
  icon: string
  label: string
  description: string
  oneTime: boolean
}

export const BADGE_DEFINITIONS: Record<BadgeType, BadgeDefinition> = {
  first_a: {
    icon: '\u2B50',
    label: 'Primera A',
    description: 'Tu primera comida con score A',
    oneTime: true,
  },
  streak_3: {
    icon: '\uD83D\uDD25',
    label: 'Racha de 3',
    description: '3 dias seguidos con score A o B',
    oneTime: false,
  },
  streak_7: {
    icon: '\uD83D\uDD25',
    label: 'Racha de 7',
    description: '7 dias seguidos con score A o B',
    oneTime: false,
  },
  streak_30: {
    icon: '\uD83C\uDFC6',
    label: 'Racha de 30',
    description: '30 dias seguidos con score A o B',
    oneTime: false,
  },
  weekly_improvement: {
    icon: '\u2B06\uFE0F',
    label: 'Mejora semanal',
    description: 'Tu score semanal mejoro respecto a la anterior',
    oneTime: false,
  },
  no_e_week: {
    icon: '\uD83D\uDEE1\uFE0F',
    label: 'Semana limpia',
    description: 'Una semana completa sin comida score E',
    oneTime: false,
  },
  balanced_day: {
    icon: '\uD83D\uDC51',
    label: 'Dia perfecto',
    description: 'Un dia con todas las comidas A o B',
    oneTime: false,
  },
  comeback: {
    icon: '\uD83D\uDE80',
    label: 'Comeback',
    description: 'Pasaste de semana D/E a semana A/B/C',
    oneTime: false,
  },
}
