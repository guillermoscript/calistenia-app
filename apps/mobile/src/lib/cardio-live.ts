/**
 * Notificación en vivo de la sesión de cardio (Android), estilo Strava:
 * cronómetro nativo que avanza solo, distancia + ritmo en el cuerpo, color de
 * marca y botón PAUSAR/REANUDAR. Es el foreground service (tipo location) que
 * mantiene el GPS vivo con la pantalla bloqueada.
 * iOS: no-op por ahora (Live Activity pendiente junto al resto de iOS).
 * Mismo patrón que live-session.ts: estado a nivel de módulo + dispatcher.
 */
import { Platform } from 'react-native'
import * as Sentry from '@sentry/react-native'
import i18n from 'i18next'
import { formatPace, formatSpeed } from '@calistenia/core/lib/geo'
import { CARDIO_ACTIVITY } from '@calistenia/core/lib/style-tokens'
import type { CardioActivityType } from '@calistenia/core/types'

const NOTIF_ID = 'cardio-live'
// Canal con sufijo -active: Android congela la importance de un canal tras
// crearlo, así que para subir de LOW a DEFAULT hace falta un id nuevo. DEFAULT
// saca la notif del cajón "silenciosas" que HyperOS/MIUI esconde del lock screen.
const CHANNEL_ID = 'cardio-live-active'
const UPDATE_THROTTLE_MS = 3000

interface CardioLiveState {
  activity: CardioActivityType
  paused: boolean
  /** Epoch ms del que arranca el cronómetro: startTime + pausas acumuladas. */
  chronoBase: number
  distanceKm: number
  paceMinKm: number
  speedKmh: number
}

let active = false
let state: CardioLiveState | null = null
let lastDisplayAt = 0

type CardioLiveAction = 'pause' | 'resume'
let actionHandler: ((action: CardioLiveAction) => void) | null = null

/** El CardioSessionContext registra aquí cómo pausar/reanudar la sesión. */
export function setCardioLiveActionHandler(handler: ((action: CardioLiveAction) => void) | null): void {
  actionHandler = handler
}

/** Llamado desde los listeners de notifee en index.js al pulsar un botón. */
export function dispatchCardioLiveAction(pressId: string): void {
  if (!active) return
  if (pressId === 'cardio-pause') actionHandler?.('pause')
  else if (pressId === 'cardio-resume') actionHandler?.('resume')
}

async function getNotifee() {
  try {
    return await import('@notifee/react-native')
  } catch {
    return null
  }
}

async function display(s: CardioLiveState): Promise<void> {
  const mod = await getNotifee()
  if (!mod) {
    // En release build notifee siempre existe; null = el módulo nativo no cargó.
    Sentry.captureMessage('cardio-live: notifee no disponible en Android')
    return
  }
  const notifee = mod.default
  const { AndroidImportance, AndroidForegroundServiceType, AndroidVisibility } = mod

  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Cardio en curso',
    // DEFAULT (no LOW): HyperOS/MIUI ocultan las "silenciosas" del lock screen.
    // onlyAlertOnce abajo evita que suene en cada update.
    importance: AndroidImportance.DEFAULT,
    visibility: AndroidVisibility.PUBLIC,
  })

  const icon = CARDIO_ACTIVITY[s.activity]?.icon ?? '🏃'
  const metrics =
    s.activity === 'cycling'
      ? `${s.distanceKm.toFixed(2)} km${s.speedKmh > 0 ? ` · ${formatSpeed(s.speedKmh)} km/h` : ''}`
      : `${s.distanceKm.toFixed(2)} km${s.paceMinKm > 0 ? ` · ${formatPace(s.paceMinKm)} /km` : ''}`

  await notifee.displayNotification({
    id: NOTIF_ID,
    title: `${icon} ${i18n.t(`cardio.${s.activity}`)} — ${i18n.t(s.paused ? 'cardio.paused' : 'cardio.recording')}`,
    body: metrics,
    android: {
      channelId: CHANNEL_ID,
      asForegroundService: true,
      foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_LOCATION],
      ongoing: true,
      onlyAlertOnce: true,
      color: '#a3e635',
      colorized: true,
      smallIcon: 'notification_icon',
      largeIcon: 'ic_launcher',
      visibility: AndroidVisibility.PUBLIC,
      pressAction: { id: 'default', launchActivity: 'default' },
      // Cronómetro nativo: avanza solo, sin re-render de la notificación
      ...(s.paused ? {} : { showChronometer: true, timestamp: s.chronoBase }),
      actions: [
        s.paused
          ? { title: i18n.t('cardio.resume').toUpperCase(), pressAction: { id: 'cardio-resume' } }
          : { title: i18n.t('cardio.pause').toUpperCase(), pressAction: { id: 'cardio-pause' } },
      ],
    },
  })
}

export async function startCardioLive(activity: CardioActivityType, chronoBase: number): Promise<void> {
  if (Platform.OS !== 'android') return
  try {
    state = { activity, paused: false, chronoBase, distanceKm: 0, paceMinKm: 0, speedKmh: 0 }
    active = true
    lastDisplayAt = Date.now()
    await display(state)
  } catch (e) {
    Sentry.captureException(e)
  }
}

/** Métricas nuevas desde el pipeline GPS — throttled para no spamear el sistema. */
export function updateCardioLive(metrics: { distanceKm: number; paceMinKm: number; speedKmh: number }): void {
  if (!active || !state || Platform.OS !== 'android') return
  state = { ...state, ...metrics }
  const now = Date.now()
  if (state.paused || now - lastDisplayAt < UPDATE_THROTTLE_MS) return
  lastDisplayAt = now
  display(state).catch((e) => Sentry.captureException(e))
}

export async function pauseCardioLive(): Promise<void> {
  if (!active || !state || Platform.OS !== 'android') return
  try {
    state = { ...state, paused: true }
    await display(state)
  } catch (e) {
    Sentry.captureException(e)
  }
}

export async function resumeCardioLive(chronoBase: number): Promise<void> {
  if (!active || !state || Platform.OS !== 'android') return
  try {
    state = { ...state, paused: false, chronoBase }
    lastDisplayAt = Date.now()
    await display(state)
  } catch (e) {
    Sentry.captureException(e)
  }
}

export async function endCardioLive(): Promise<void> {
  if (Platform.OS !== 'android') return
  try {
    if (!active) return
    active = false
    state = null
    const mod = await getNotifee()
    await mod?.default.stopForegroundService()
    await mod?.default.cancelNotification(NOTIF_ID)
  } catch (e) {
    Sentry.captureException(e)
  }
}
