/** Contrato del snapshot del widget de cardio. Puro: testeable sin react-native. */
export interface CardioWidgetSnapshot {
  /** YYYY-MM-DD local de la última escritura — el widget marca stale si es viejo. */
  date: string
  weekKm: number
  weekSessions: number
  lastSession: {
    activity: string // running | walking | cycling
    distanceKm: number
    durationSeconds: number
    paceMinKm: number
    /** YYYY-MM-DD local */
    date: string
  } | null
  lang: 'es' | 'en'
}

export const CARDIO_WIDGET_SNAPSHOT_KEY = 'cardio_widget_snapshot'
