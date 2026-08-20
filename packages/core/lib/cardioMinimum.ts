// Umbral mínimo para que una sesión de cardio merezca guardarse (#562).
//
// Pulsar «empezar» y «parar» sin querer dejaba una fila de 2 s y 0 km que,
// al ordenar por `started_at`, tapaba la sesión real en la tarjeta de
// «ÚLTIMA SESIÓN» y sumaba una sesión vacía a los totales de la semana.
//
// Vive en core para que web y móvil (y la cola offline de cada una) apliquen
// exactamente el mismo criterio.

export const CARDIO_MIN_SESSION = {
  /** Por debajo de esto se descarta siempre: nadie entrena 9 segundos. */
  durationSeconds: 10,
  /** Distancia mínima (50 m) para considerar que hubo movimiento. */
  distanceKm: 0.05,
  /**
   * Una sesión sin distancia sólo se descarta si además es corta. Un paseo
   * largo sin fix GPS (interior, permiso retirado a mitad) es entreno real y
   * no debe perderse en silencio.
   */
  noDistanceGraceSeconds: 60,
} as const

export interface CardioSessionSize {
  duration_seconds?: unknown
  distance_km?: unknown
}

function asNumber(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/**
 * `true` cuando la sesión es tan corta que se considera accidental:
 * menos de 10 s, o menos de 50 m sin llegar al minuto.
 */
export function isCardioSessionTooShort(session: CardioSessionSize): boolean {
  const duration = asNumber(session.duration_seconds)
  const distance = asNumber(session.distance_km)
  if (duration < CARDIO_MIN_SESSION.durationSeconds) return true
  return distance < CARDIO_MIN_SESSION.distanceKm
    && duration < CARDIO_MIN_SESSION.noDistanceGraceSeconds
}
