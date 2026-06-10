/**
 * Capa GPS para sesiones de cardio: watchPositionAsync de expo-location.
 * El proceso sigue vivo en background gracias al foreground service de tipo
 * location que levanta la notificación de cardio-live (notifee) — Android 14+
 * permite seguir recibiendo ubicación "mientras se usa" si hay un FGS location
 * arrancado con la app en primer plano.
 */
import * as Location from 'expo-location'

export interface CardioFix {
  latitude: number
  longitude: number
  altitude: number | null
  accuracy: number | null
  speed: number | null
  timestamp: number
}

type FixListener = (fixes: CardioFix[]) => void
let listener: FixListener | null = null

/** El CardioSessionContext registra aquí el procesado de fixes. */
export function setCardioFixListener(fn: FixListener | null): void {
  listener = fn
}

function toFix(l: Location.LocationObject): CardioFix {
  return {
    latitude: l.coords.latitude,
    longitude: l.coords.longitude,
    altitude: l.coords.altitude,
    accuracy: l.coords.accuracy,
    speed: l.coords.speed,
    timestamp: l.timestamp,
  }
}

let subscription: Location.LocationSubscription | null = null

export async function requestCardioPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  return status === 'granted'
}

export async function startCardioTracking(): Promise<void> {
  subscription?.remove()
  subscription = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
    (loc) => listener?.([toFix(loc)]),
  )
}

export async function stopCardioTracking(): Promise<void> {
  subscription?.remove()
  subscription = null
}
