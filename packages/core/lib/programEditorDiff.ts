/**
 * programEditorDiff — reconcilia lo que el editor de programas quiere guardar
 * contra lo que ya existe en PocketBase.
 *
 * El editor guardaba antes con «borrar todo y recrear»: si fallaba una creación
 * a mitad, los borrados ya estaban confirmados y el programa se quedaba vacío
 * (ver issue #463). Aquí se calcula el conjunto mínimo de escrituras y, sobre
 * todo, se separan las escrituras de los borrados para que quien ejecute el
 * plan pueda hacer los borrados **al final**: si algo falla antes, no se ha
 * destruido nada.
 *
 * Todo el módulo es puro — sin React y sin PocketBase — para poder testear la
 * decisión sin servidor.
 */

import type { TranslatableField } from './i18n-db'

/** Fila tal y como se manda a PocketBase. */
export type Row = Record<string, unknown>

/** Registro tal y como viene de PocketBase: una fila con `id`. */
export type ExistingRecord = Row & { id: string }

/**
 * Una fila deseada junto con la clave natural que la identifica entre
 * guardados. Al no guardar el editor los `id` de PocketBase, la identidad se
 * deriva del contenido lógico (número de fase, día, posición).
 */
export interface DesiredRow {
  key: string
  data: Row
}

export interface DiffPlan {
  toCreate: Row[]
  toUpdate: Array<{ id: string; data: Row }>
  toDelete: string[]
}

/** Plan vacío — no hay nada que escribir ni que borrar. */
export function emptyPlan(): DiffPlan {
  return { toCreate: [], toUpdate: [], toDelete: [] }
}

/** ¿El plan no toca nada? Útil para saltarse una colección entera. */
export function isNoop(plan: DiffPlan): boolean {
  return plan.toCreate.length === 0 && plan.toUpdate.length === 0 && plan.toDelete.length === 0
}

/** Número total de escrituras (sin contar borrados) que implica un plan. */
export function planWriteCount(plan: DiffPlan): number {
  return plan.toCreate.length + plan.toUpdate.length
}

/**
 * Un campo traducible se considera igual si coincide el valor del locale
 * actual. Comparar el objeto entero daría falsos positivos: `toTranslatable`
 * produce `{ [locale]: valor }`, así que un programa guardado en `es` y
 * reabierto en `en` parecería «cambiado» en todas sus filas.
 */
function translatableEquals(existing: unknown, desired: unknown, locale: string): boolean {
  const desiredText = readLocale(desired, locale)
  const existingText = readLocale(existing, locale)
  return desiredText === existingText
}

function readLocale(field: unknown, locale: string): string {
  if (field == null) return ''
  if (typeof field === 'string') return field
  if (typeof field === 'object') {
    const map = field as Record<string, unknown>
    const v = map[locale]
    return typeof v === 'string' ? v : ''
  }
  return ''
}

function isTranslatable(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Fusiona un campo traducible sobre el existente en vez de reemplazarlo, para
 * no perder las traducciones de otros locales al guardar desde uno solo.
 */
function mergeTranslatable(
  existing: unknown,
  desired: unknown,
): TranslatableField {
  const desiredMap = isTranslatable(desired) ? (desired as Record<string, string>) : {}
  if (isTranslatable(existing)) {
    return { ...(existing as Record<string, string>), ...desiredMap }
  }
  // El valor previo era un string legacy (pre-migración i18n) o no existía:
  // se queda solo con lo nuevo, que ya viene con su locale.
  return desiredMap
}

/**
 * Normaliza un escalar para comparar. PocketBase devuelve algunos numéricos
 * como string y los campos vacíos como `""`, así que comparar en crudo marcaría
 * como «cambiado» algo idéntico y provocaría escrituras inútiles.
 */
function scalarEquals(existing: unknown, desired: unknown): boolean {
  if (existing === desired) return true
  if (existing == null && (desired === '' || desired == null)) return true
  if (desired == null && (existing === '' || existing == null)) return true
  if (typeof desired === 'number' || typeof existing === 'number') {
    const a = Number(existing)
    const b = Number(desired)
    if (!Number.isNaN(a) && !Number.isNaN(b)) return a === b
  }
  if (typeof desired === 'boolean' || typeof existing === 'boolean') {
    return Boolean(existing) === Boolean(desired)
  }
  return String(existing ?? '') === String(desired ?? '')
}

export interface DiffOptions {
  /** Locale activo, para comparar y fusionar campos traducibles. */
  locale: string
  /** Campos que guardan `{ locale: texto }` en vez de un escalar. */
  translatableFields?: readonly string[]
}

/**
 * ¿Hay que actualizar este registro? Devuelve los campos a escribir, o `null`
 * si el registro ya está como debe y no hay que tocarlo.
 */
function buildUpdate(
  existing: ExistingRecord,
  desired: Row,
  opts: DiffOptions,
): Row | null {
  const translatable = new Set(opts.translatableFields ?? [])
  const patch: Row = {}
  let changed = false

  for (const [field, desiredValue] of Object.entries(desired)) {
    const existingValue = existing[field]
    if (translatable.has(field)) {
      if (!translatableEquals(existingValue, desiredValue, opts.locale)) {
        patch[field] = mergeTranslatable(existingValue, desiredValue)
        changed = true
      }
      continue
    }
    if (!scalarEquals(existingValue, desiredValue)) {
      patch[field] = desiredValue
      changed = true
    }
  }

  return changed ? patch : null
}

/**
 * Calcula el plan para una colección.
 *
 * - clave presente en ambos lados → `update` (y solo si algo cambió)
 * - clave que falta en el servidor → `create`
 * - clave que sobra en el servidor → `delete`
 *
 * Si una clave está duplicada en el servidor (restos de un guardado a medias),
 * se reutiliza el primer registro y los demás se marcan para borrar, de modo
 * que un guardado correcto limpia la basura que dejó uno fallido.
 */
export function diffCollection(
  existingRecords: readonly ExistingRecord[],
  desiredRows: readonly DesiredRow[],
  keyOf: (record: ExistingRecord) => string,
  opts: DiffOptions,
): DiffPlan {
  const plan = emptyPlan()

  const byKey = new Map<string, ExistingRecord>()
  for (const record of existingRecords) {
    const key = keyOf(record)
    if (byKey.has(key)) {
      // Duplicado: sobra. Se borra al final, nunca antes de escribir.
      plan.toDelete.push(record.id)
      continue
    }
    byKey.set(key, record)
  }

  for (const { key, data } of desiredRows) {
    const existing = byKey.get(key)
    if (!existing) {
      plan.toCreate.push(data)
      continue
    }
    byKey.delete(key)
    const patch = buildUpdate(existing, data, opts)
    if (patch) plan.toUpdate.push({ id: existing.id, data: patch })
  }

  // Lo que queda en el mapa ya no lo quiere el editor.
  for (const leftover of byKey.values()) {
    plan.toDelete.push(leftover.id)
  }

  return plan
}

// ─── Ejecución del plan ──────────────────────────────────────────────────────

/** Operaciones de PocketBase que necesita el ejecutor, inyectadas para testear. */
export interface CollectionWriter {
  create(data: Row): Promise<unknown>
  update(id: string, data: Row): Promise<unknown>
  delete(id: string): Promise<unknown>
}

export interface PlannedCollection {
  writer: CollectionWriter
  plan: DiffPlan
}

/**
 * Ejecuta varios planes garantizando el invariante del issue #463:
 * **primero todas las altas y modificaciones, y solo si todas van bien, los
 * borrados**.
 *
 * Si falla cualquier escritura, el error se propaga sin haber borrado nada, así
 * que el programa del usuario sigue completo en el servidor. El peor caso es
 * que sobren filas, y el siguiente guardado correcto las limpia.
 *
 * Dentro de cada fase las operaciones van en paralelo (`Promise.all`), que es
 * lo que quita los ~190 round-trips secuenciales.
 */
export async function executePlans(collections: readonly PlannedCollection[]): Promise<void> {
  // Fase 1 — altas y modificaciones. Nada destructivo todavía.
  await Promise.all(
    collections.flatMap(({ writer, plan }) => [
      ...plan.toCreate.map(data => writer.create(data)),
      ...plan.toUpdate.map(({ id, data }) => writer.update(id, data)),
    ]),
  )

  // Fase 2 — borrados. Solo se llega aquí si todo lo anterior fue bien.
  await Promise.all(
    collections.flatMap(({ writer, plan }) => plan.toDelete.map(id => writer.delete(id))),
  )
}

// ─── Claves naturales ────────────────────────────────────────────────────────
//
// El estado del editor no conserva los `id` de PocketBase, así que la identidad
// entre guardados se deriva del contenido lógico. Los ejercicios se identifican
// por su posición dentro del día: así, reordenar es un `update` de la fila que
// ocupa esa posición y nunca un borrado seguido de una creación.

export function phaseKey(phaseNumber: number | string): string {
  return `p${Number(phaseNumber)}`
}

export function dayConfigKey(phaseNumber: number | string, dayId: string): string {
  return `p${Number(phaseNumber)}|${dayId}`
}

export function exerciseKey(
  phaseNumber: number | string,
  dayId: string,
  position: number | string,
): string {
  return `p${Number(phaseNumber)}|${dayId}|${Number(position)}`
}
