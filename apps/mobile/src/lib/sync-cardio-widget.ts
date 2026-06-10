/**
 * Sincroniza el widget de cardio: consulta las sesiones de la semana en PB,
 * escribe el snapshot en AsyncStorage y fuerza el refresh del widget.
 * Best-effort: nunca lanza (un fallo de widget no rompe la app).
 */
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Sentry from '@sentry/react-native'
import i18n from 'i18next'
import { pb } from '@calistenia/core/lib/pocketbase'
import { todayStr } from '@calistenia/core/lib/dateUtils'
import { CARDIO_WIDGET_SNAPSHOT_KEY, type CardioWidgetSnapshot } from './cardio-widget-snapshot'

let lastJson: string | null = null

function mondayStart(): Date {
  const now = new Date()
  const day = now.getDay() // 0=dom
  const diff = day === 0 ? 6 : day - 1
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff)
  return monday
}

export async function syncCardioWidget(userId: string | null): Promise<void> {
  if (Platform.OS !== 'android' || !userId) return
  try {
    const res = await pb.collection('cardio_sessions').getList(1, 50, {
      filter: pb.filter('user = {:userId}', { userId }),
      sort: '-started_at',
      fields: 'activity_type,distance_km,duration_seconds,avg_pace,started_at',
    })

    const weekStartMs = mondayStart().getTime()
    let weekKm = 0
    let weekSessions = 0
    for (const s of res.items as any[]) {
      if (new Date(s.started_at).getTime() >= weekStartMs) {
        weekKm += s.distance_km || 0
        weekSessions++
      }
    }

    const last = res.items[0] as any | undefined
    const snapshot: CardioWidgetSnapshot = {
      date: todayStr(),
      weekKm: Math.round(weekKm * 10) / 10,
      weekSessions,
      lastSession: last
        ? {
            activity: last.activity_type,
            distanceKm: last.distance_km || 0,
            durationSeconds: last.duration_seconds || 0,
            paceMinKm: last.avg_pace || 0,
            date: String(last.started_at).slice(0, 10),
          }
        : null,
      lang: i18n.language?.startsWith('en') ? 'en' : 'es',
    }

    const json = JSON.stringify(snapshot)
    if (json === lastJson) return
    lastJson = json

    await AsyncStorage.setItem(CARDIO_WIDGET_SNAPSHOT_KEY, json)
    const { requestWidgetUpdate } = await import('react-native-android-widget')
    const React = await import('react')
    const { CardioWidget } = await import('../widgets/CardioWidget')
    await requestWidgetUpdate({
      widgetName: 'CardioWidget',
      renderWidget: () => React.createElement(CardioWidget, { snapshot }),
      widgetNotFound: () => {},
    })
  } catch (e) {
    Sentry.captureException(e)
  }
}
