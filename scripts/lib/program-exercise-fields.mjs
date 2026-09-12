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

// ── Progresión semanal dentro de la fase (#755) ──────────────────────────────

/**
 * Campos de un ejercicio sobre los que una rampa puede actuar, del vocabulario
 * del JSON al de la app. Espejo de `PROGRESSION_FIELDS` en
 * `packages/core/types/index.ts`.
 *
 * Los nombres de la app se aceptan además de los del JSON: escribir
 * `timerSeconds` en vez de `timer_seconds` no es un error del autor, solo el
 * otro dialecto del mismo campo.
 */
export const PROGRESSION_FIELDS = {
  sets: 'sets',
  reps: 'reps',
  timer_seconds: 'timerSeconds',
  timerSeconds: 'timerSeconds',
  rest_seconds: 'rest',
  rest: 'rest',
}

/**
 * `weekly_progression` del JSON → el valor que va a la fila (#755).
 *
 * Una rampa dice cómo cambia UN campo a lo largo de las semanas de su fase, en
 * una de dos formas excluyentes: `step` (lineal, acotada por `min`/`max`) o
 * `values` (un valor por semana, índice 0 = primera semana de la fase). Se
 * acepta una rampa suelta o una lista, y nunca dos sobre el mismo campo.
 *
 * Igual que `normalizePriority`, lo que no encaja **revienta** en vez de
 * colarse en la base de datos. Aquí el fallo silencioso sería especialmente
 * caro: una rampa mal escrita no se nota mirando la pantalla —la sesión sale
 * igual que antes de #755— así que una progresión muerta llegaría a producción
 * sin que nada chistara.
 *
 * Devuelve SIEMPRE una lista, para que la fila tenga una sola forma y el motor
 * no tenga que distinguir.
 *
 * @param {unknown} raw     valor de `weekly_progression` tal cual viene del JSON
 * @param {string} [label]  nombre del ejercicio, solo para el mensaje de error
 * @returns {object[]|null} lista normalizada, o `null` si no hay rampa
 */
export function normalizeWeeklyProgression(raw, label = '') {
  if (raw === undefined || raw === null || raw === '') return null

  const where = label ? ` (ejercicio: ${label})` : ''
  const list = Array.isArray(raw) ? raw : [raw]
  if (list.length === 0) return null

  const seen = new Set()
  return list.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`weekly_progression: cada rampa debe ser un objeto${where}.`)
    }

    const field = PROGRESSION_FIELDS[String(entry.field ?? '').trim()]
    if (!field) {
      throw new Error(
        `weekly_progression: campo "${entry.field}" fuera del enum${where}. ` +
        `Valores aceptados: ${Object.keys(PROGRESSION_FIELDS).join(', ')}.`
      )
    }
    if (seen.has(field)) {
      throw new Error(`weekly_progression: dos rampas sobre "${entry.field}"${where}. Una por campo.`)
    }
    seen.add(field)

    const hasStep = entry.step !== undefined && entry.step !== null
    const hasValues = Array.isArray(entry.values) && entry.values.length > 0
    if (entry.values !== undefined && !Array.isArray(entry.values)) {
      throw new Error(`weekly_progression: "values" debe ser una lista${where}.`)
    }
    if (hasStep && hasValues) {
      throw new Error(`weekly_progression: "step" y "values" son excluyentes${where}. Elige una.`)
    }
    if (!hasStep && !hasValues) {
      throw new Error(`weekly_progression: hace falta "step" o "values"${where}.`)
    }

    const norm = { field }
    if (hasValues) {
      norm.values = entry.values.map(v => (typeof v === 'number' ? v : String(v)))
      return norm
    }

    const step = Number(entry.step)
    if (!Number.isFinite(step) || step === 0) {
      throw new Error(`weekly_progression: "step" debe ser un número distinto de 0${where}.`)
    }
    norm.step = step
    for (const bound of ['min', 'max']) {
      if (entry[bound] === undefined || entry[bound] === null) continue
      const n = Number(entry[bound])
      if (!Number.isFinite(n)) {
        throw new Error(`weekly_progression: "${bound}" debe ser un número${where}.`)
      }
      norm[bound] = n
    }
    if (norm.min !== undefined && norm.max !== undefined && norm.min > norm.max) {
      throw new Error(`weekly_progression: "min" (${norm.min}) por encima de "max" (${norm.max})${where}.`)
    }
    return norm
  })
}
