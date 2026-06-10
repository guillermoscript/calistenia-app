/**
 * Timer de sesión en vivo fuera de la app.
 * iOS: Live Activity (ActivityKit vía widget-bridge). Android: notificación
 * persistente de foreground service con cronómetro (notifee).
 * Todas las funciones son best-effort: nunca lanzan.
 */
import { Platform } from 'react-native'
import * as Sentry from '@sentry/react-native'
import type { LiveActivityState } from './live-activity-state'
import { getWidgetBridge } from '../../modules/widget-bridge'

const NOTIF_ID = 'live-session'
let active = false
let workoutTitle = ''
let lastState: LiveActivityState | null = null

/** true si el timer en vivo gestiona el aviso de fin de descanso (Android). */
export function liveSessionHandlesRest(): boolean {
  return active && Platform.OS === 'android'
}

async function getNotifee() {
  try {
    // Lazy: notifee es módulo nativo; en Expo Go no existe
    return (await import('@notifee/react-native')).default
  } catch {
    return null
  }
}

async function displayAndroid(state: LiveActivityState): Promise<void> {
  const notifee = await getNotifee()
  if (!notifee) return
  const { AndroidImportance } = await import('@notifee/react-native')
  await notifee.createChannel({ id: NOTIF_ID, name: 'Sesión en curso', importance: AndroidImportance.LOW })
  const resting = state.phase === 'rest' && !!state.restEndsAt
  await notifee.displayNotification({
    id: NOTIF_ID,
    title: workoutTitle,
    body: state.setTotal > 0
      ? `${state.exerciseName} — SERIE ${state.setIndex}/${state.setTotal}`
      : state.exerciseName,
    android: {
      channelId: NOTIF_ID,
      asForegroundService: true,
      ongoing: true,
      onlyAlertOnce: true,
      pressAction: { id: 'default', launchActivity: 'default' },
      ...(resting
        ? { showChronometer: true, chronometerDirection: 'down' as const, timestamp: state.restEndsAt! }
        : {}),
    },
  })
}

export async function startLiveSession(title: string, state: LiveActivityState): Promise<void> {
  try {
    workoutTitle = title
    lastState = state
    if (Platform.OS === 'ios') {
      active = getWidgetBridge()?.startActivity(title, JSON.stringify(state)) ?? false
    } else if (Platform.OS === 'android') {
      await displayAndroid(state)
      active = true
    }
  } catch (e) {
    Sentry.captureException(e)
  }
}

export async function updateLiveSession(state: LiveActivityState): Promise<void> {
  try {
    if (!active) return
    // Orden de efectos React: RestScreen (hijo) llama updateLiveRest ANTES de que
    // el efecto de useLiveSession (padre) emita el update de fase con restEndsAt
    // null — preservar el countdown ya empujado para no pisarlo.
    if (state.phase === 'rest' && state.restEndsAt == null && lastState?.phase === 'rest' && lastState.restEndsAt) {
      state = { ...state, restEndsAt: lastState.restEndsAt }
    }
    lastState = state
    if (Platform.OS === 'ios') getWidgetBridge()?.updateActivity(JSON.stringify(state))
    else if (Platform.OS === 'android') await displayAndroid(state)
  } catch (e) {
    Sentry.captureException(e)
  }
}

/** Resync del countdown cuando el usuario ajusta el descanso (−15/+15/+30 o nuevo rest). */
export async function updateLiveRest(restEndsAt: number): Promise<void> {
  if (!lastState) return
  await updateLiveSession({ ...lastState, phase: 'rest', restEndsAt })
}

export async function endLiveSession(): Promise<void> {
  try {
    if (!active) return
    active = false
    lastState = null
    if (Platform.OS === 'ios') {
      getWidgetBridge()?.endActivity()
    } else if (Platform.OS === 'android') {
      const notifee = await getNotifee()
      await notifee?.stopForegroundService()
      await notifee?.cancelNotification(NOTIF_ID)
    }
  } catch (e) {
    Sentry.captureException(e)
  }
}
