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

/** Etiquetas localizadas para el botón de acción de la notificación Android. */
export interface LiveSessionLabels {
  work: string
  rest: string
  transition: string
}
let labels: LiveSessionLabels | null = null

let actionHandler: (() => void) | null = null

/** SessionView (vía useLiveSession) registra aquí cómo avanzar la sesión. */
export function setLiveSessionActionHandler(handler: (() => void) | null): void {
  actionHandler = handler
}

/** Llamado desde los listeners de notifee en index.js al pulsar un botón. */
export function dispatchLiveSessionAction(pressId: string): void {
  if (pressId === 'live-next' && active) actionHandler?.()
}

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
  const { AndroidImportance, AndroidForegroundServiceType, AndroidVisibility } = await import('@notifee/react-native')
  await notifee.createChannel({
    id: NOTIF_ID,
    name: 'Sesión en curso',
    importance: AndroidImportance.LOW,
    // Visible (con acciones) en la pantalla de bloqueo para saltar de ejercicio sin desbloquear
    visibility: AndroidVisibility.PUBLIC,
  })
  const resting = state.phase === 'rest' && !!state.restEndsAt
  const actionTitle = !labels
    ? null
    : state.phase === 'rest' ? labels.rest
    : state.setTotal > 0 ? labels.work
    : labels.transition
  await notifee.displayNotification({
    id: NOTIF_ID,
    title: workoutTitle,
    body: state.setTotal > 0
      ? `${state.exerciseName} — SERIE ${state.setIndex}/${state.setTotal}`
      : state.exerciseName,
    android: {
      channelId: NOTIF_ID,
      asForegroundService: true,
      // FGS de entreno = dataSync (no location). El service de notifee es
      // compartido y su tipo de manifest incluye location; sin especificar tipo
      // acá, notifee arrancaría con location y crashea sin permiso de ubicación.
      foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_DATA_SYNC],
      ongoing: true,
      onlyAlertOnce: true,
      // Silueta de marca (status bar) en vez del círculo genérico; logo a color como large icon
      smallIcon: 'notification_icon',
      largeIcon: 'ic_launcher',
      // Mostrar contenido + acción "saltar" en la pantalla de bloqueo
      visibility: AndroidVisibility.PUBLIC,
      // Lime de marca: tinta icono/acentos; colorized pinta el fondo (estilo
      // notificación de música) en los launchers que lo soportan
      color: '#a3e635',
      colorized: true,
      ...(state.phase === 'work' && state.setTotal > 0
        ? { progress: { max: state.setTotal, current: state.setIndex } }
        : {}),
      pressAction: { id: 'default', launchActivity: 'default' },
      ...(actionTitle
        ? { actions: [{ title: actionTitle, pressAction: { id: 'live-next' } }] }
        : {}),
      ...(resting
        ? { showChronometer: true, chronometerDirection: 'down' as const, timestamp: state.restEndsAt! }
        : {}),
    },
  })
}

export async function startLiveSession(title: string, state: LiveActivityState, actionLabels?: LiveSessionLabels): Promise<void> {
  try {
    workoutTitle = title
    lastState = state
    labels = actionLabels ?? null
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
    labels = null
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
