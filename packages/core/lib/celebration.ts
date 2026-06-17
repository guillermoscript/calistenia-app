/**
 * Tagline motivacional para la pantalla de "¡SESIÓN COMPLETADA!".
 *
 * Determinista a partir del contexto (no aleatorio) para que se sienta
 * "consciente" de lo que acabas de hacer: prioriza hitos concretos de la
 * sesión (volumen, duración) sobre la hora del día. Tono gym, en español,
 * a juego con el "💪" del título y las frases de campeón.
 *
 * Pura y sin dependencias: el front móvil/web solo le pasa números.
 */
export interface CelebrationContext {
  /** Duración total de la sesión en minutos. */
  durationMin: number
  /** Series registradas en la sesión. */
  totalSets: number
  /** Cantidad de ejercicios distintos. */
  exerciseCount: number
  /** Hora local 0–23 (new Date().getHours()). */
  hour: number
}

export const getCelebrationTagline = (ctx: CelebrationContext): string => {
  const { durationMin, totalSets, exerciseCount, hour } = ctx

  // 1) Hitos de la propia sesión — lo más específico va primero.
  if (durationMin >= 60) return 'Una hora entera. Eso es oficio. 🔥'
  if (totalSets >= 30) return `${totalSets} series. Hoy fuiste imparable.`
  if (durationMin >= 45) return 'Sesión larga, cero excusas. 💯'
  if (exerciseCount >= 8) return 'Cuerpo completo, sin saltarte nada.'
  if (durationMin > 0 && durationMin <= 18 && totalSets >= 8) return 'Corta e intensa. Calidad pura. ⚡'

  // 2) Momento del día — siempre hay algo que decir.
  if (hour < 6) return 'Entrenando de madrugada. Otra liga. 🌙'
  if (hour < 12) return 'Empezaste el día ganando. ☀️'
  if (hour < 18) return 'Un descanso bien ganado te espera.'
  if (hour >= 22) return 'Cerrando el día fuerte. 🌙'

  // 3) Fallback neutro pero con energía.
  return 'Otra marca en el muro. A seguir. 💪'
}
