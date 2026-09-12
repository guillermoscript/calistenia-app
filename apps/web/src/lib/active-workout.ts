/**
 * ¿Hay un entrenamiento en curso en este navegador? (#690)
 *
 * El service worker está en modo `prompt` a propósito: recargar la página a
 * mitad de una serie tira el cronómetro y el progreso todavía no subido. Pero
 * el aviso de «nueva versión» sale UNA vez por carga y se puede descartar, así
 * que un cliente podía quedarse con el bundle viejo horas después de un deploy.
 *
 * La salida: aplicar la actualización sola cuando NO hay nada que perder, y
 * dejar el aviso solo cuando sí lo hay. Esta función es el «¿hay algo que
 * perder?».
 *
 * Lee directamente de `localStorage` en vez de un context de React porque se
 * consulta desde `main.tsx`, fuera del árbol y antes de que monte nada.
 */
import {
  CARDIO_ACTIVE_KEY,
  CIRCUIT_ACTIVE_KEY,
  STRENGTH_ACTIVE_KEY,
} from '@calistenia/core/lib/storage-keys'

/**
 * Mismo umbral que usan los tres hooks al restaurar
 * (`useActiveSessionState`, `useCircuitSessionState`, `useCardioPersistence`).
 * Una sesión más vieja que esto ellos la BORRAN al montar, así que aquí
 * tampoco puede bloquear la actualización: si no, un usuario que abandonó un
 * entreno hace una semana no volvería a actualizar nunca.
 */
const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Las tres claves de sesión en curso, con el campo donde cada una guarda su
 * instante de arranque. Fuerza y circuito usan `startedAt`; cardio `startTime`.
 */
const ACTIVE_SESSION_KEYS: readonly string[] = [
  STRENGTH_ACTIVE_KEY,
  CARDIO_ACTIVE_KEY,
  CIRCUIT_ACTIVE_KEY,
]

const STARTED_AT_FIELDS = ['startedAt', 'startTime'] as const

function readStartedAt(data: Record<string, unknown>): number | null {
  for (const field of STARTED_AT_FIELDS) {
    const value = data[field]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

/** ¿La clave `key` guarda una sesión viva (bien formada y de menos de 24 h)? */
function isLiveSession(key: string): boolean {
  let raw: string | null
  try {
    raw = localStorage.getItem(key)
  } catch {
    // Safari en privado tira al leer. Sin poder mirar, lo prudente es asumir
    // que puede haber un entreno: como mucho sale el aviso en vez de aplicarse.
    return true
  }
  if (!raw) return false

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    // Entrada corrupta: los hooks la borran al montar, no es una sesión.
    return false
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false

  const startedAt = readStartedAt(data as Record<string, unknown>)
  // Un objeto con forma pero sin instante de arranque no lo sabemos fechar.
  // Se trata como vivo: el coste de equivocarse hacia este lado es un aviso
  // de más; el del otro lado es tirarle el entreno a alguien.
  if (startedAt === null) return true

  return Date.now() - startedAt <= MAX_SESSION_AGE_MS
}

/**
 * `true` si alguna de las tres sesiones (fuerza, cardio, circuito) está viva.
 * Ante la duda devuelve `true`: nunca recargar encima de un entreno.
 */
export function hasActiveWorkout(): boolean {
  return ACTIVE_SESSION_KEYS.some(isLiveSession)
}
