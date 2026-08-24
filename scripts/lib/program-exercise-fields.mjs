/**
 * Vocabulario de `priority` y `section` para `program_exercises` (issue #607).
 *
 * El JSON de los programas nunca habló el idioma de la app. Usa
 * `primary|secondary|accessory` para la prioridad y, encima, reutiliza el mismo
 * campo como marcador de sección (`warmup`/`cooldown`). La app, en cambio, solo
 * conoce `high|med|low` — ver `Priority` en `packages/core/types/index.ts` y
 * `PRIORITY_COLORS` en `packages/core/lib/style-tokens.ts`.
 *
 * Los seeders copiaban el valor crudo, así que el 99 % de las filas caía al color
 * de fallback. Este módulo es el único sitio donde se traduce: todo escritor de
 * `program_exercises` pasa por aquí, y lo que no encaja **revienta** en vez de
 * colarse en la base de datos.
 *
 * Si cambias `PRIORITY_ALIASES`, el test de `packages/core/lib/style-tokens.test.ts`
 * te obliga a darle color al valor nuevo.
 */

/** Los únicos valores que la app sabe pintar. Espejo de `Priority`. */
export const PRIORITIES = ['high', 'med', 'low']

/** Prioridad de un ejercicio que no declara ninguna (o que solo marcaba sección). */
export const DEFAULT_PRIORITY = 'med'

/**
 * Vocabulario del JSON → vocabulario de la app.
 *
 * `warmup`/`cooldown` no son prioridades: son marcadores de sección. Se aceptan
 * porque el JSON los trae en el campo `priority`, pero se traducen a la prioridad
 * por defecto; la sección la resuelve `resolveSection()`.
 */
export const PRIORITY_ALIASES = {
  primary: 'high',
  secondary: 'med',
  accessory: 'low',
  high: 'high',
  med: 'med',
  low: 'low',
  warmup: DEFAULT_PRIORITY,
  cooldown: DEFAULT_PRIORITY,
}

/** Valores de `priority` en el JSON que en realidad nombran una sección. */
export const SECTION_MARKERS = ['warmup', 'cooldown']

/** Sección por defecto: el bloque de trabajo principal del día. */
export const DEFAULT_SECTION = 'main'

/**
 * Traduce el `priority` del JSON al enum de la app.
 *
 * Lanza ante cualquier valor desconocido — es un error del contenido, no algo que
 * merezca un fallback silencioso: así fue como entraron `primary` y compañía. El
 * `label` sale en el mensaje para poder localizar el ejercicio en el JSON.
 *
 * @param {unknown} raw    valor de `priority` tal cual viene del JSON
 * @param {string} [label] nombre del ejercicio, solo para el mensaje de error
 * @returns {'high'|'med'|'low'}
 */
export function normalizePriority(raw, label = '') {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_PRIORITY

  const key = String(raw).trim().toLowerCase()
  const mapped = Object.prototype.hasOwnProperty.call(PRIORITY_ALIASES, key)
    ? PRIORITY_ALIASES[key]
    : undefined

  if (!mapped) {
    const where = label ? ` (ejercicio: ${label})` : ''
    throw new Error(
      `priority "${raw}" fuera del enum${where}. ` +
      `Valores aceptados: ${Object.keys(PRIORITY_ALIASES).join(', ')}.`
    )
  }

  return mapped
}

/**
 * Sección del ejercicio: la explícita si la trae, si no la que insinúa el
 * `priority` del JSON (`warmup`/`cooldown`), y `main` en cualquier otro caso.
 *
 * @param {{ section?: unknown, priority?: unknown }} exercise
 * @returns {string}
 */
export function resolveSection(exercise) {
  const explicit = exercise && exercise.section
  if (explicit) return String(explicit).trim().toLowerCase()

  const marker = exercise && exercise.priority
  const key = marker ? String(marker).trim().toLowerCase() : ''
  return SECTION_MARKERS.includes(key) ? key : DEFAULT_SECTION
}
