/**
 * useProgramEditor — manages state for the 4-step program creation/editing wizard.
 *
 * Steps:
 *   1. Program info (name, description, duration)
 *   2. Phases (1-4, each with name, weeks, color)
 *   3. Days per phase (7 days, focus, type)
 *   4. Exercises per day
 */

import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { getPlatform } from '../platform'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '../lib/analytics'
import { PHASES as FALLBACK_PHASES, WEEK_DAYS as FALLBACK_WEEK_DAYS, WORKOUTS } from '../data/workouts'
import i18n from 'i18next'
import { localize, toTranslatable } from '../lib/i18n-db'
import {
  diffCollection,
  executePlans,
  phaseKey,
  dayConfigKey,
  exerciseKey,
  makeExerciseKeyOf,
  type CollectionWriter,
  type DesiredRow,
  type ExistingRecord,
  type PlannedCollection,
  type Row,
} from '../lib/programEditorDiff'
import { stretchTemplates } from '../data/stretch-templates'
import {
  buildCoverPayload,
  buildExerciseMediaPayload,
  emptyExerciseMedia,
  hasExerciseMediaChanges,
  type CoverMediaState,
  type EditorMediaFile,
  type ExerciseMediaState,
} from '../lib/programMedia'
import type {
  DayType,
  Exercise,
  ProgramGoalType,
  ProgramIntensity,
  ProgramSkill,
  ProgramVisibility,
} from '../types'

/**
 * Campos de las colecciones del programa que se guardan como `{ locale: texto }`.
 * El diff los compara y fusiona por locale para no pisar traducciones ajenas
 * ni marcar como «cambiada» una fila que solo se está leyendo en otro idioma.
 */
const PROGRAM_TRANSLATABLE_FIELDS = [
  'name',
  'day_name',
  'day_focus',
  'exercise_name',
  'muscles',
  'note',
] as const

/**
 * Adapta una colección de PocketBase a la interfaz que espera executePlans.
 *
 * `requestKey: null` no es cosmético (issue #536). El SDK de PocketBase deriva
 * la clave de auto-cancelación de `MÉTODO + ruta`, y **todos los `create` de una
 * colección comparten ruta** (`POST /api/collections/X/records`): de las N altas
 * que `executePlans` lanza con un solo `Promise.all` sobrevivía únicamente la
 * última, y el resto se abortaban. Un programa de 4 fases se guardaba con 1 fase,
 * 1 día y 1 ejercicio. El error de aborto llega con el cuerpo vacío, que es de
 * donde salía el «({})» del mensaje de error que veía el usuario.
 *
 * En `update` y `delete` la ruta lleva el id del registro, así que entre sí no
 * colisionan; se pasa el flag igual para que una escritura no se aborte al
 * coincidir con otra en vuelo sobre el mismo registro.
 */
function collectionWriter(collection: string): CollectionWriter {
  return {
    create: (data: Row) => pb.collection(collection).create(data, { requestKey: null }),
    update: (id: string, data: Row) => pb.collection(collection).update(id, data, { requestKey: null }),
    delete: (id: string) => pb.collection(collection).delete(id, { requestKey: null }),
  }
}

// ─── Editor types ────────────────────────────────────────────────────────────

export interface EditorPhase {
  name: string
  weeks: string
  color: string
  bgColor: string
}

export interface EditorDay {
  dayId: string
  dayName: string
  focus: string
  type: string
  color: string
  exercises: EditorExercise[]
  cardioActivityType?: import('../types').CardioActivityType
  cardioTargetDistanceKm?: number
  cardioTargetDurationMin?: number
  circuitMode?: 'circuit' | 'timed'
  circuitRounds?: number
  circuitWorkSeconds?: number
  circuitRestSeconds?: number
  circuitRestBetweenExercises?: number
  circuitRestBetweenRounds?: number
}

export interface EditorExercise {
  exerciseId: string
  name: string
  sets: number | string
  reps: string
  rest: number
  muscles: string
  note: string
  youtube: string
  priority: 'high' | 'med' | 'low'
  isTimer: boolean
  timerSeconds: number
  section?: 'warmup' | 'main' | 'cooldown'
  /**
   * Media propia del ejercicio dentro de ESTE programa (#618), que en el
   * reproductor de #608 gana al vídeo/imágenes del catálogo compartido.
   *
   * Los seis campos son opcionales a propósito: un ejercicio recién sacado del
   * catálogo o de una plantilla de estiramientos no tiene media, y obligar a
   * los cuatro sitios que construyen un `EditorExercise` a deletrear seis
   * campos vacíos solo añade ruido. Quien necesite el estado completo pasa por
   * `exerciseMediaOf`.
   */
  demoImages?: string[]
  demoVideo?: string
  pendingImages?: EditorMediaFile[]
  pendingVideo?: EditorMediaFile | null
  removedImages?: string[]
  removeVideo?: boolean
  /**
   * Id de la fila de `program_exercises`, cuando existe. Solo sirve para
   * construir la URL de vista previa de la media ya subida: la identidad entre
   * guardados sigue siendo la clave natural de `programEditorDiff.ts`, no este
   * id, y por eso el editor no lo usa para nada más.
   */
  pbRecordId?: string
}

/**
 * El estado de media de un ejercicio, con los huecos rellenos.
 *
 * Existe para que las reglas de `lib/programMedia.ts` — que son puras y
 * testeables — no tengan que conocer los opcionales del editor.
 */
export function exerciseMediaOf(ex: EditorExercise): ExerciseMediaState {
  return {
    ...emptyExerciseMedia(),
    demoImages: ex.demoImages ?? [],
    demoVideo: ex.demoVideo ?? '',
    pendingImages: ex.pendingImages ?? [],
    pendingVideo: ex.pendingVideo ?? null,
    removedImages: ex.removedImages ?? [],
    removeVideo: ex.removeVideo ?? false,
  }
}

export interface ProgramEditorState {
  programId: string | null
  step: number
  info: {
    name: string
    description: string
    durationWeeks: number
    isOfficial: boolean
    /** Nivel de exposición elegido por el autor (#603). */
    visibility: ProgramVisibility
    difficulty: 'beginner' | 'intermediate' | 'advanced'
    /**
     * Campos de catálogo (#613) — los que alimentan el «PARA TI» del onboarding
     * (`lib/matchPrograms.ts`) y los filtros del catálogo por objetivo y equipo.
     *
     * Hasta ahora solo se podían fijar por script (`scripts/seed-program-catalog.mjs`),
     * así que ningún programa creado desde la UI entraba jamás en el matching.
     *
     * La cadena vacía es «sin fijar»: es como PocketBase representa un `select`
     * opcional sin valor, y mantenerla evita que el ida y vuelta con la base de
     * datos invente un objetivo que el autor no ha elegido.
     */
    goalType: ProgramGoalType | ''
    /** Solo significa algo con `goalType === 'skill'`; si no, se limpia al guardar. */
    skill: ProgramSkill | ''
    intensity: ProgramIntensity | ''
    /**
     * `null` es «derívalo de la fase 1» (ver `deriveDaysPerWeek`). Un número es
     * una elección explícita del autor, y entonces deja de moverse sola cuando
     * se editan los días.
     */
    daysPerWeek: number | null
    equipmentRequired: string[]
    contraindications: string[]
    /**
     * «Cómo seguir este programa» (#618) — las notas del autor sobre cómo
     * llevarlo, que van debajo de la descripción en la ficha. Se guardan en
     * `programs.instructions`, que es un `json` `{ locale: texto }` como
     * `name` y `description`.
     *
     * Es un campo aparte y no un párrafo más de `description` porque la
     * descripción es la frase corta que se pinta en la tarjeta del catálogo.
     */
    instructions: string
    /**
     * Portada: lo que ya está en el servidor (`coverImage` es el nombre de
     * fichero, `coverUrl` la URL con la que se previsualiza) separado de lo que
     * el autor ha tocado en esta sesión.
     *
     * Sin esa separación no se distingue «no la ha tocado» de «la ha borrado»,
     * y son dos peticiones distintas: ninguna, contra una que vacía el campo.
     */
    coverImage: string
    coverUrl: string | null
    coverFile: EditorMediaFile | null
    coverRemoved: boolean
  }
  phases: EditorPhase[]
  days: Record<string, EditorDay>  // key: "phaseIndex_dayId"
  isDirty: boolean
  isSaving: boolean
  error: string | null
}

// ─── Campos de catálogo (#613) ───────────────────────────────────────────────

/** `days_per_week` es `min: 1, max: 7` en `1776600000_add_program_catalog_fields.js`. */
const MIN_DAYS_PER_WEEK = 1
const MAX_DAYS_PER_WEEK = 7

/**
 * Días entrenados por semana, contando los días no-`rest` de la fase 1.
 *
 * Se mira la fase 1 y no el programa entero porque es la que fija el ritmo con
 * el que el usuario empieza, que es justo lo que compara `matchPrograms` contra
 * los días que el usuario dice tener libres.
 *
 * Puede devolver 0 (una fase 1 entera de descanso). Ese 0 NO es un valor que el
 * esquema acepte, así que quien llama decide qué hacer con él; ver
 * `buildProgramCatalogFields`.
 */
export function deriveDaysPerWeek(days: Record<string, EditorDay>): number {
  let count = 0
  for (const [key, day] of Object.entries(days)) {
    // Las claves son `${phaseIndex}_${dayId}`. Se parte por `_` en vez de usar
    // `startsWith('0_')` para que siga siendo correcto si algún día el índice
    // de fase pasa de una cifra.
    if (key.split('_')[0] !== '0') continue
    if (day.type !== 'rest') count++
  }
  return count
}

/**
 * Los seis campos de catálogo tal y como deben viajar al registro `programs`.
 *
 * Se extrae de `saveProgram` para que los tests puedan alcanzarla: los de
 * `packages/core` corren en Node y sin renderizador de React, así que una regla
 * metida dentro del `useCallback` del hook sería inalcanzable.
 */
export function buildProgramCatalogFields(
  info: ProgramEditorState['info'],
  days: Record<string, EditorDay>,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    goal_type: info.goalType,
    // Una skill solo tiene sentido colgando de un objetivo de skill. Si el autor
    // marcó `handstand` y luego se pasó a `fat_loss`, arrastrarla dejaría el
    // programa saliendo como match secundario de una skill que ya no entrena
    // (`matchPrograms.ts` busca por `goal_type === 'skill' && skill === focus`).
    skill: info.goalType === 'skill' ? info.skill : '',
    intensity: info.intensity,
    equipment_required: info.equipmentRequired,
    contraindications: info.contraindications,
  }

  const explicit = info.daysPerWeek
  const value = explicit === null ? deriveDaysPerWeek(days) : explicit
  // Por debajo del mínimo se manda `null` y no el número: «no lo sé» y «entrena
  // 0 días» no son lo mismo, y solo `null` deja el campo vacío de verdad.
  //
  // Comprobado contra PocketBase: el campo es `min: 1` pero NO es `required`, y
  // para un número opcional el 0 es el valor cero, así que PB se salta el `min`
  // y acepta tanto el 0 como el `null` — los dos acaban guardados como vacío.
  // O sea que el 0 no reventaría la escritura; simplemente miente sobre lo que
  // sabemos. `null` dice lo que hay.
  fields.days_per_week = value >= MIN_DAYS_PER_WEEK
    ? Math.min(value, MAX_DAYS_PER_WEEK)
    : null

  return fields
}

// ─── Defaults ────────────────────────────────────────────────────────────────

/**
 * Las cuatro fases con las que arranca un programa nuevo.
 *
 * Aquí solo vive lo que NO depende del idioma —semanas y colores— más la clave
 * i18n del nombre. Resolver el texto en el top-level del módulo es el bug de
 * #588: `useProgramEditor` se importa antes de que i18next esté inicializado, y
 * entonces `t()` no devuelve la traducción. Y como una constante de módulo se
 * evalúa UNA vez, el valor malo se quedaría congelado para toda la vida del
 * proceso: cambiar de idioma después tampoco lo arreglaría.
 */
const DEFAULT_PHASE_DEFS: { nameKey: string; weeks: string; color: string; bgColor: string }[] = [
  { nameKey: 'programEditor.defaultPhase1', weeks: '1-6',   color: '#c8f542', bgColor: 'rgba(200,245,66,0.08)' },
  { nameKey: 'programEditor.defaultPhase2', weeks: '7-13',  color: '#42c8f5', bgColor: 'rgba(66,200,245,0.08)' },
  { nameKey: 'programEditor.defaultPhase3', weeks: '14-20', color: '#f542c8', bgColor: 'rgba(245,66,200,0.08)' },
  { nameKey: 'programEditor.defaultPhase4', weeks: '21-26', color: '#f5c842', bgColor: 'rgba(245,200,66,0.08)' },
]

/**
 * Las fases por defecto con el nombre ya traducido.
 *
 * Se llama en runtime —dentro de un callback o de `createInitialState()`—, que
 * es cuando i18next ya está vivo. Nunca en el top-level del módulo.
 */
export function defaultPhases(): EditorPhase[] {
  return DEFAULT_PHASE_DEFS.map(p => ({
    name: i18n.t(p.nameKey),
    weeks: p.weeks,
    color: p.color,
    bgColor: p.bgColor,
  }))
}

// Color palette for phases beyond the 4 defaults
const EXTRA_PHASE_COLORS: Array<{ color: string; bgColor: string }> = [
  { color: '#f54242', bgColor: 'rgba(245,66,66,0.08)' },
  { color: '#42f5a8', bgColor: 'rgba(66,245,168,0.08)' },
  { color: '#a842f5', bgColor: 'rgba(168,66,245,0.08)' },
  { color: '#f5a842', bgColor: 'rgba(245,168,66,0.08)' },
]

const MAX_PHASES = 8

/**
 * Los siete días con los que se rellena una fase nueva — la parte ESTRUCTURAL.
 *
 * El reparto en dos constantes es deliberado. Aquí solo hay id, tipo, color y
 * las claves i18n: nada que dependa del idioma, así que es seguro evaluarlo en
 * el top-level del módulo. `dayDefaults()` es quien resuelve el texto.
 *
 * Y no es solo higiene. `saveProgram` recorre esta lista para armar las claves
 * `${fase}_${dayId}` y no mira ni el nombre ni el foco; leyendo la constante
 * estructural se ahorra traducir 7 días × N fases en cada guardado para tirar
 * el resultado a la basura.
 *
 * Los nombres reutilizan las claves `day.*` que ya existían; los focos son
 * nuevos porque hasta ahora eran literales en español dentro de core.
 */
const DAY_DEFAULTS: { dayId: string; type: string; color: string; nameKey: string; focusKey: string }[] = [
  { dayId: 'lun', type: 'push',   color: '#c8f542', nameKey: 'day.lun', focusKey: 'programEditor.dayFocusPush' },
  { dayId: 'mar', type: 'pull',   color: '#42c8f5', nameKey: 'day.mar', focusKey: 'programEditor.dayFocusPull' },
  { dayId: 'mie', type: 'lumbar', color: '#f54242', nameKey: 'day.mie', focusKey: 'programEditor.dayFocusLumbar' },
  { dayId: 'jue', type: 'legs',   color: '#f542c8', nameKey: 'day.jue', focusKey: 'programEditor.dayFocusLegs' },
  { dayId: 'vie', type: 'full',   color: '#f5c842', nameKey: 'day.vie', focusKey: 'programEditor.dayFocusFull' },
  { dayId: 'sab', type: 'rest',   color: '#888899', nameKey: 'day.sab', focusKey: 'day.activeWalk' },
  { dayId: 'dom', type: 'rest',   color: '#888899', nameKey: 'day.dom', focusKey: 'day.totalRest' },
]

/** Un día por defecto ya montado: lo estructural más el texto traducido. */
export type DefaultDay = Omit<EditorDay, 'exercises'>

/**
 * Los días por defecto con nombre y foco ya traducidos.
 *
 * Igual que `defaultPhases()`: se llama en runtime, nunca en el top-level.
 */
export function dayDefaults(): DefaultDay[] {
  return DAY_DEFAULTS.map(d => ({
    dayId: d.dayId,
    dayName: i18n.t(d.nameKey),
    focus: i18n.t(d.focusKey),
    type: d.type,
    color: d.color,
  }))
}

function buildDefaultDays(phaseCount: number): Record<string, EditorDay> {
  const days: Record<string, EditorDay> = {}
  const defaults = dayDefaults()
  for (let pi = 0; pi < phaseCount; pi++) {
    for (const d of defaults) {
      days[`${pi}_${d.dayId}`] = { ...d, exercises: [] }
    }
  }
  return days
}

function createInitialState(): ProgramEditorState {
  return {
    programId: null,
    step: 1,
    info: {
      name: '', description: '', durationWeeks: 26, isOfficial: false,
      visibility: 'private', difficulty: 'beginner',
      goalType: '', skill: '', intensity: '',
      daysPerWeek: null, equipmentRequired: [], contraindications: [],
      instructions: '',
      coverImage: '', coverUrl: null, coverFile: null, coverRemoved: false,
    },
    phases: defaultPhases(),
    days: buildDefaultDays(4),
    isDirty: false,
    isSaving: false,
    error: null,
  }
}

function distributeWeeks(totalWeeks: number, phaseCount: number): string[] {
  if (phaseCount <= 0 || totalWeeks <= 0) return []
  const base = Math.floor(totalWeeks / phaseCount)
  const extra = totalWeeks % phaseCount
  const ranges: string[] = []
  let start = 1
  for (let i = 0; i < phaseCount; i++) {
    const size = base + (i < extra ? 1 : 0)
    const end = start + size - 1
    ranges.push(`${start}-${end}`)
    start = end + 1
  }
  return ranges
}

let _idCounter = 0
function genId(): string {
  _idCounter++
  return `ex_${Date.now()}_${_idCounter}`
}

// ─── Validación de los pasos del asistente (#610) ────────────────────────────

/**
 * Un error de validación todavía sin traducir: la clave i18n y sus parámetros.
 *
 * `collectStepErrors` se exporta pura y sin traducir a propósito. Los tests de
 * `packages/core` corren en Node y sin renderizador de React, así que una regla
 * metida dentro del `useCallback` del hook sería inalcanzable; y como i18next
 * no siempre está inicializado en ese entorno, `t()` devolvería `undefined`.
 * Devolviendo la clave, el test afirma sobre un identificador estable y la
 * traducción queda como último paso, ya dentro de `validate`.
 */
export interface ProgramValidationError {
  key: string
  params?: Record<string, string | number>
}

/** Acepta `1-6` y `6`. Devuelve null si el texto no es un rango legible. */
function parseWeekRange(raw: string): { start: number; end: number } | null {
  const m = raw.trim().match(/^(\d+)\s*(?:-\s*(\d+))?$/)
  if (!m) return null
  const start = Number(m[1])
  const end = m[2] === undefined ? start : Number(m[2])
  if (start < 1 || end < start) return null
  return { start, end }
}

/**
 * `sets` es `number | string` porque `StepExercises.tsx:207` guarda el texto
 * crudo cuando no es numérico (`isNaN(n) ? v : n`). Se aceptan los dos
 * mientras representen un entero ≥ 1; el texto libre se rechaza.
 */
function isPositiveInteger(value: number | string): boolean {
  const raw = typeof value === 'number' ? value : String(value).trim()
  if (raw === '') return false
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1
}

/** `12` o `8-12`. El texto libre («al fallo», «máx») no pasa. */
const REPS_PATTERN = /^\d+(-\d+)?$/

const MIN_TIMER_SECONDS = 5

/**
 * Un día de cardio no lleva ejercicios: `StepExercises.tsx:133,161` ni siquiera
 * dibuja el editor, remite al paso 3 para fijar distancia y duración. Exigirle
 * un ejercicio haría imposible guardar cualquier programa con cardio.
 */
function requiresExercises(day: EditorDay): boolean {
  return day.type !== 'rest' && day.type !== 'cardio'
}

/** Los días de una fase. Las claves de `state.days` son `${phaseIndex}_${dayId}`. */
function daysOfPhase(state: ProgramEditorState, phaseIndex: number): EditorDay[] {
  const prefix = `${phaseIndex}_`
  return Object.entries(state.days)
    .filter(([key]) => key.startsWith(prefix))
    .map(([, day]) => day)
}

/**
 * Todos los errores del paso indicado, en orden de lectura.
 *
 * `validate` solo enseña el primero (es el contrato que esperan los dos
 * asistentes), pero la lista completa deja preparado el resumen de errores.
 */
export function collectStepErrors(step: number, state: ProgramEditorState): ProgramValidationError[] {
  const errors: ProgramValidationError[] = []

  if (step === 1) {
    if (!state.info.name.trim()) errors.push({ key: 'programEditor.nameRequired' })
    if (state.info.durationWeeks < 1) errors.push({ key: 'programEditor.minOneWeek' })
  }

  if (step === 2) {
    // Se recorren las fases en orden y se exige que cada una empiece justo
    // donde acabó la anterior. Esa única comprobación cubre a la vez los huecos
    // y los solapes: «1-6» seguido de «4-8» falla porque 4 ≠ 7.
    //
    // `null` significa «ya no sé por qué semana voy»: en cuanto una fase trae un
    // rango ilegible se deja de juzgar la continuidad, porque si no la siguiente
    // fase carga con un error que no es suyo.
    let expectedStart: number | null = 1
    for (let i = 0; i < state.phases.length; i++) {
      const phase = state.phases[i]
      const n = i + 1
      if (!phase.name.trim()) {
        errors.push({ key: 'programEditor.phaseNeedsName', params: { n } })
        expectedStart = null
        continue
      }
      if (!phase.weeks.trim()) {
        errors.push({ key: 'programEditor.phaseNeedsWeeks', params: { n } })
        expectedStart = null
        continue
      }
      const range = parseWeekRange(phase.weeks)
      if (!range) {
        errors.push({ key: 'programEditor.phaseWeeksInvalid', params: { n } })
        expectedStart = null
        continue
      }
      if (expectedStart !== null && range.start !== expectedStart) {
        errors.push({
          key: 'programEditor.phaseWeeksNotContiguous',
          params: { n, expected: expectedStart, found: range.start },
        })
      }
      expectedStart = range.end + 1
    }
    // La cobertura solo se juzga si la cadena está entera: encadenar este
    // mensaje sobre unos rangos ya rotos confunde más de lo que ayuda.
    if (state.phases.length > 0 && errors.length === 0 && expectedStart !== null) {
      const covered = expectedStart - 1
      if (covered !== state.info.durationWeeks) {
        errors.push({
          key: 'programEditor.phaseWeeksMustCoverDuration',
          params: { total: state.info.durationWeeks, covered },
        })
      }
    }
  }

  if (step === 3) {
    for (let i = 0; i < state.phases.length; i++) {
      const days = daysOfPhase(state, i)
      if (!days.some(d => d.type !== 'rest')) {
        errors.push({
          key: 'programEditor.phaseNeedsTrainingDay',
          params: { n: i + 1, name: state.phases[i].name.trim() },
        })
      }
    }
  }

  if (step === 4) {
    for (let i = 0; i < state.phases.length; i++) {
      for (const day of daysOfPhase(state, i)) {
        if (!requiresExercises(day)) continue
        const where = { n: i + 1, day: day.dayName }

        // `section` ausente cuenta como `main`, igual que en el resto del
        // fichero (`:314`, `:628`, `:663`): los programas antiguos no la traen.
        const main = day.exercises.filter(e => !e.section || e.section === 'main')
        if (main.length === 0) {
          errors.push({ key: 'programEditor.dayNeedsExercise', params: where })
          continue
        }

        for (const ex of day.exercises) {
          const exWhere = { ...where, exercise: ex.name.trim() }
          if (!isPositiveInteger(ex.sets)) {
            errors.push({ key: 'programEditor.exerciseSetsInvalid', params: exWhere })
          }
          if (ex.isTimer) {
            if (!(ex.timerSeconds >= MIN_TIMER_SECONDS)) {
              errors.push({
                key: 'programEditor.exerciseTimerTooShort',
                params: { ...exWhere, min: MIN_TIMER_SECONDS },
              })
            }
          } else if (!REPS_PATTERN.test(ex.reps.trim())) {
            errors.push({ key: 'programEditor.exerciseRepsInvalid', params: exWhere })
          }
        }
      }
    }
  }

  return errors
}

// ─── Copiar días y fases, reordenar ejercicios (#621) ────────────────────────
//
// Las reglas viven aquí, en funciones puras a nivel de módulo, y no dentro de
// los `useCallback` del hook. Los tests de `packages/core` corren en Node sin
// renderizador de React, así que una regla metida en un callback sería
// inalcanzable; es el mismo motivo por el que ya están fuera `deriveDaysPerWeek`
// y `buildProgramCatalogFields`.
//
// Todas devuelven **la referencia de entrada** cuando la operación no cambia
// nada. El hook lo usa para no marcar `isDirty` por un gesto que no hizo nada.

export type ExerciseSection = 'warmup' | 'main' | 'cooldown'

/** La sección de un ejercicio; `main` es el valor por defecto histórico. */
function sectionOf(ex: EditorExercise): ExerciseSection {
  return ex.section ?? 'main'
}

/**
 * Un ejercicio listo para vivir en OTRO día, sin la media propia del programa.
 *
 * `demoImages` y `demoVideo` son nombres de fichero que solo resuelven contra
 * el registro de `program_exercises` que los tiene colgados —`getExerciseMedia`
 * construye la URL con `pbRecordId`—, así que arrastrarlos a la copia daría
 * imágenes rotas apuntando a ficheros que el registro nuevo no tiene. Y
 * `pendingImages`/`pendingVideo` son los objetos de una subida a medias:
 * duplicarlos subiría el mismo fichero dos veces.
 *
 * La copia se queda con el contenido de entrenamiento, `youtube` incluido —que
 * es una URL y no un fichero—, y pierde la media. Replicarla de verdad exigiría
 * descargar y volver a subir cada fichero, que es otro problema.
 */
export function cloneExerciseForCopy(ex: EditorExercise): EditorExercise {
  const {
    pbRecordId: _pbRecordId,
    demoImages: _demoImages,
    demoVideo: _demoVideo,
    pendingImages: _pendingImages,
    pendingVideo: _pendingVideo,
    removedImages: _removedImages,
    removeVideo: _removeVideo,
    ...content
  } = ex
  return { ...content }
}

/**
 * El contenido de entrenamiento de un día en el hueco de otro.
 *
 * El destino **conserva su identidad** (`dayId` y `dayName`) y solo recibe qué
 * se entrena: tipo, foco, color, ejercicios y la configuración de cardio y de
 * circuito. Eso no es cosmético. `saveProgram` recorre `DAY_DEFAULTS` y busca
 * cada día por la clave `${fase}_${dayDef.dayId}`, de modo que un día que
 * llevara dentro el `dayId` de otro escribiría `day_id: 'lun'` en el hueco del
 * jueves y rompería la clave natural con la que `programEditorDiff.ts`
 * identifica las filas entre guardados.
 *
 * Copiar el lunes al jueves deja «el jueves entrena como el lunes»; el jueves
 * sigue siendo el jueves.
 */
export function copyDayInto(
  days: Record<string, EditorDay>,
  fromKey: string,
  toKey: string,
): Record<string, EditorDay> {
  if (fromKey === toKey) return days
  const from = days[fromKey]
  const to = days[toKey]
  if (!from || !to) return days
  return {
    ...days,
    [toKey]: {
      ...from,
      dayId: to.dayId,
      dayName: to.dayName,
      exercises: from.exercises.map(cloneExerciseForCopy),
    },
  }
}

/**
 * Los siete días de una fase en los de otra.
 *
 * **No toca el nombre ni las semanas de la fase destino.** `weeks` lo reparte
 * `distributeWeeks` a partir de la duración total del programa, así que
 * pisarlo aquí lo dejaría descuadrado hasta el siguiente reparto; y duplicar el
 * nombre solo deja dos fases indistinguibles en las pestañas del editor.
 */
export function copyPhaseInto(
  days: Record<string, EditorDay>,
  fromIndex: number,
  toIndex: number,
): Record<string, EditorDay> {
  if (fromIndex === toIndex) return days
  let next = days
  for (const d of DAY_DEFAULTS) {
    next = copyDayInto(next, `${fromIndex}_${d.dayId}`, `${toIndex}_${d.dayId}`)
  }
  return next
}

/** Un hueco al que se puede copiar un día, ya listo para pintar. */
export interface CopyDayTarget {
  /** Clave del día en `state.days`: `${indiceDeFase}_${dayId}`. */
  key: string
  phaseIndex: number
  dayId: string
  dayName: string
  /**
   * Cuántos ejercicios hay ya ahí. Copiar **reemplaza y no fusiona**, así que
   * las dos apps lo usan para avisar antes de pisar un día con contenido.
   */
  exerciseCount: number
}

/**
 * Los días a los que tiene sentido copiar `fromKey`: todos los del programa
 * menos él mismo.
 *
 * Vive en core y no en cada app para que el selector de web y el de móvil
 * ofrezcan exactamente lo mismo, y para que el orden salga de `DAY_DEFAULTS`
 * —el mismo que recorre `saveProgram`— en vez de repetirse en dos sitios.
 */
export function copyDayTargets(
  days: Record<string, EditorDay>,
  phaseCount: number,
  fromKey: string,
): CopyDayTarget[] {
  const targets: CopyDayTarget[] = []
  for (let pi = 0; pi < phaseCount; pi++) {
    for (const d of DAY_DEFAULTS) {
      const key = `${pi}_${d.dayId}`
      if (key === fromKey) continue
      const day = days[key]
      if (!day) continue
      targets.push({
        key,
        phaseIndex: pi,
        dayId: day.dayId,
        dayName: day.dayName,
        exerciseCount: day.exercises.length,
      })
    }
  }
  return targets
}

/** Una fase a la que se puede copiar otra, ya lista para pintar. */
export interface CopyPhaseTarget {
  phaseIndex: number
  /** Cuántos ejercicios hay ya repartidos por los siete días de esa fase. */
  exerciseCount: number
}

/**
 * Las fases a las que tiene sentido copiar `fromIndex`: todas menos ella misma.
 *
 * El recuento suma los siete días porque copiar una fase los reemplaza todos;
 * es el número que las dos apps enseñan antes de pisar una fase con contenido.
 */
export function copyPhaseTargets(
  days: Record<string, EditorDay>,
  phaseCount: number,
  fromIndex: number,
): CopyPhaseTarget[] {
  const targets: CopyPhaseTarget[] = []
  for (let pi = 0; pi < phaseCount; pi++) {
    if (pi === fromIndex) continue
    let exerciseCount = 0
    for (const d of DAY_DEFAULTS) {
      exerciseCount += days[`${pi}_${d.dayId}`]?.exercises.length ?? 0
    }
    targets.push({ phaseIndex: pi, exerciseCount })
  }
  return targets
}

/**
 * Reordena un ejercicio **dentro de su sección**, con índices locales a esa
 * sección (los que tiene a mano quien pinta la lista agrupada).
 *
 * Trabaja sobre posiciones locales y no sobre el índice global a propósito: las
 * secciones no están garantizadas contiguas dentro de `day.exercises`. El
 * guardado las ordena calentamiento → principal → vuelta a la calma, pero
 * `addExercise` añade siempre al final, así que en una sesión de edición un
 * calentamiento recién añadido queda detrás del principal. Mapear las
 * posiciones de la sección y reescribir solo esas es correcto aunque estén
 * intercaladas.
 */
export function reorderExerciseWithin(
  exercises: EditorExercise[],
  section: ExerciseSection,
  fromIndex: number,
  toIndex: number,
): EditorExercise[] {
  if (fromIndex === toIndex) return exercises
  const positions: number[] = []
  exercises.forEach((ex, i) => {
    if (sectionOf(ex) === section) positions.push(i)
  })
  if (fromIndex < 0 || fromIndex >= positions.length) return exercises
  if (toIndex < 0 || toIndex >= positions.length) return exercises

  const ordered = positions.map(p => exercises[p])
  const [moving] = ordered.splice(fromIndex, 1)
  ordered.splice(toIndex, 0, moving)

  const next = [...exercises]
  positions.forEach((p, i) => { next[p] = ordered[i] })
  return next
}

/**
 * Sube o baja un ejercicio una posición **dentro de su sección**, a partir de
 * su índice global en el día.
 *
 * Esto arregla un no-op invisible: la versión anterior intercambiaba con el
 * índice adyacente del array completo, pero las dos apps pintan agrupando por
 * el campo `section`. Con un calentamiento `[A, B]` y un principal `[C, D]`
 * —array `[A, B, C, D]`— subir `C` lo intercambiaba con `B` y dejaba
 * `[A, C, B, D]`; al filtrar por sección volvían a salir `[A, B]` y `[C, D]` y
 * la pantalla no cambiaba. Subir el primer ejercicio de una sección, o bajar el
 * último, no hacía nada visible.
 *
 * Se apoya en `reorderExerciseWithin` para que arrastrar y subir/bajar tengan
 * exactamente la misma semántica.
 */
export function moveExerciseWithin(
  exercises: EditorExercise[],
  index: number,
  direction: 'up' | 'down',
): EditorExercise[] {
  const current = exercises[index]
  if (!current) return exercises
  const section = sectionOf(current)
  let localIndex = 0
  for (let i = 0; i < index; i++) {
    if (sectionOf(exercises[i]) === section) localIndex++
  }
  return reorderExerciseWithin(
    exercises,
    section,
    localIndex,
    localIndex + (direction === 'up' ? -1 : 1),
  )
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useProgramEditor() {
  const qc = useQueryClient()
  // El estado del editor es estado de FORMULARIO local (no caché de servidor):
  // permanece en useState. TanStack Query solo se usa para cachear la lectura
  // one-shot de loadProgram y para invalidar el catálogo al guardar.
  const [state, setState] = useState<ProgramEditorState>(createInitialState)

  // ── Step navigation ────────────────────────────────────────────────────────
  const setStep = useCallback((step: number) => {
    setState(s => ({ ...s, step, error: null }))
  }, [])

  // ── Info ────────────────────────────────────────────────────────────────────
  const updateInfo = useCallback((info: Partial<ProgramEditorState['info']>) => {
    setState(s => ({ ...s, info: { ...s.info, ...info }, isDirty: true }))
  }, [])

  // Redistribute phase week ranges based on current durationWeeks — call on blur
  const redistributeWeeks = useCallback(() => {
    setState(s => {
      if (s.info.durationWeeks <= 0) return s
      const ranges = distributeWeeks(s.info.durationWeeks, s.phases.length)
      const newPhases = s.phases.map((p, i) => ({ ...p, weeks: ranges[i] }))
      return { ...s, phases: newPhases }
    })
  }, [])

  // ── Phases ──────────────────────────────────────────────────────────────────
  const addPhase = useCallback(() => {
    setState(s => {
      if (s.phases.length >= MAX_PHASES) return s
      const phaseDefs = DEFAULT_PHASE_DEFS
      const extraIdx = Math.max(0, s.phases.length - phaseDefs.length) % EXTRA_PHASE_COLORS.length
      const { color, bgColor } = s.phases.length < phaseDefs.length
        ? phaseDefs[s.phases.length]
        : EXTRA_PHASE_COLORS[extraIdx]
      // El nombre de una fase añadida a mano se numera; el texto sale del locale
      // porque este hook lo comparte web con móvil y antes decía «Fase N» en
      // español pasara lo que pasara.
      const newPhase: EditorPhase = {
        name: i18n.t('programEditor.phaseNumbered', { n: s.phases.length + 1 }),
        weeks: '', color, bgColor,
      }
      const newPhases = [...s.phases, newPhase]
      const ranges = distributeWeeks(s.info.durationWeeks, newPhases.length)
      const redistributed = newPhases.map((p, i) => ({ ...p, weeks: ranges[i] }))
      const newDays = { ...s.days }
      const pi = newPhases.length - 1
      for (const d of dayDefaults()) {
        newDays[`${pi}_${d.dayId}`] = { ...d, exercises: [] }
      }
      return { ...s, phases: redistributed, days: newDays, isDirty: true }
    })
  }, [])

  const removePhase = useCallback((index: number) => {
    setState(s => {
      if (s.phases.length <= 1) return s
      const newPhases = s.phases.filter((_, i) => i !== index)
      const ranges = distributeWeeks(s.info.durationWeeks, newPhases.length)
      const redistributed = newPhases.map((p, i) => ({ ...p, weeks: ranges[i] }))
      // Rebuild days: remove old phase's days and re-index
      const newDays: Record<string, EditorDay> = {}
      let newIdx = 0
      const defaults = dayDefaults()
      for (let i = 0; i < s.phases.length; i++) {
        if (i === index) continue
        for (const d of defaults) {
          const oldKey = `${i}_${d.dayId}`
          const newKey = `${newIdx}_${d.dayId}`
          newDays[newKey] = s.days[oldKey] || { ...d, exercises: [] }
        }
        newIdx++
      }
      return { ...s, phases: redistributed, days: newDays, isDirty: true }
    })
  }, [])

  const updatePhase = useCallback((index: number, data: Partial<EditorPhase>) => {
    setState(s => {
      const newPhases = [...s.phases]
      newPhases[index] = { ...newPhases[index], ...data }
      return { ...s, phases: newPhases, isDirty: true }
    })
  }, [])

  // ── Days ────────────────────────────────────────────────────────────────────
  const updateDay = useCallback((key: string, data: Partial<EditorDay>) => {
    setState(s => {
      const day = s.days[key]
      if (!day) return s
      const updatedDay = { ...day, ...data }

      // Auto-populate warmup/cooldown when day type changes to a non-rest type
      if (data.type && data.type !== day.type && data.type !== 'rest') {
        const hasWarmup = updatedDay.exercises.some(e => e.section === 'warmup')
        const hasCooldown = updatedDay.exercises.some(e => e.section === 'cooldown')
        if (!hasWarmup && !hasCooldown) {
          const template = stretchTemplates[data.type as DayType]
          if (template) {
            const toEditor = (ex: Exercise, section: 'warmup' | 'cooldown'): EditorExercise => ({
              exerciseId: ex.id,
              name: ex.name,
              sets: ex.sets,
              reps: ex.reps,
              rest: ex.rest,
              muscles: ex.muscles || '',
              note: ex.note || '',
              youtube: ex.youtube || '',
              priority: ex.priority || 'med',
              isTimer: ex.isTimer || false,
              timerSeconds: ex.timerSeconds || 0,
              section,
            })
            const warmupExs = template.warmup.map(e => toEditor(e, 'warmup'))
            const cooldownExs = template.cooldown.map(e => toEditor(e, 'cooldown'))
            const mainExs = updatedDay.exercises.filter(e => !e.section || e.section === 'main')
            updatedDay.exercises = [...warmupExs, ...mainExs, ...cooldownExs]
          }
        }
      }

      return { ...s, days: { ...s.days, [key]: updatedDay }, isDirty: true }
    })
  }, [])

  // ── Exercises ───────────────────────────────────────────────────────────────
  const addExercise = useCallback((dayKey: string, exercise: EditorExercise) => {
    setState(s => {
      const day = s.days[dayKey]
      if (!day) return s
      return {
        ...s,
        days: { ...s.days, [dayKey]: { ...day, exercises: [...day.exercises, exercise] } },
        isDirty: true,
      }
    })
  }, [])

  const removeExercise = useCallback((dayKey: string, exerciseIndex: number) => {
    setState(s => {
      const day = s.days[dayKey]
      if (!day) return s
      const exercises = day.exercises.filter((_, i) => i !== exerciseIndex)
      return { ...s, days: { ...s.days, [dayKey]: { ...day, exercises } }, isDirty: true }
    })
  }, [])

  const updateExercise = useCallback((dayKey: string, exerciseIndex: number, data: Partial<EditorExercise>) => {
    setState(s => {
      const day = s.days[dayKey]
      if (!day) return s
      const exercises = [...day.exercises]
      exercises[exerciseIndex] = { ...exercises[exerciseIndex], ...data }
      return { ...s, days: { ...s.days, [dayKey]: { ...day, exercises } }, isDirty: true }
    })
  }, [])

  const moveExercise = useCallback((dayKey: string, fromIndex: number, direction: 'up' | 'down') => {
    setState(s => {
      const day = s.days[dayKey]
      if (!day) return s
      const exercises = moveExerciseWithin(day.exercises, fromIndex, direction)
      if (exercises === day.exercises) return s
      return { ...s, days: { ...s.days, [dayKey]: { ...day, exercises } }, isDirty: true }
    })
  }, [])

  /** Reordenar arrastrando, con índices locales a la sección (#621). */
  const reorderExercise = useCallback((
    dayKey: string,
    section: ExerciseSection,
    fromIndex: number,
    toIndex: number,
  ) => {
    setState(s => {
      const day = s.days[dayKey]
      if (!day) return s
      const exercises = reorderExerciseWithin(day.exercises, section, fromIndex, toIndex)
      if (exercises === day.exercises) return s
      return { ...s, days: { ...s.days, [dayKey]: { ...day, exercises } }, isDirty: true }
    })
  }, [])

  // ── Copiar (#621) ───────────────────────────────────────────────────────────
  const copyDay = useCallback((fromKey: string, toKey: string) => {
    setState(s => {
      const days = copyDayInto(s.days, fromKey, toKey)
      if (days === s.days) return s
      return { ...s, days, isDirty: true }
    })
  }, [])

  const copyPhase = useCallback((fromIndex: number, toIndex: number) => {
    setState(s => {
      const days = copyPhaseInto(s.days, fromIndex, toIndex)
      if (days === s.days) return s
      return { ...s, days, isDirty: true }
    })
  }, [])

  // ── Validation ──────────────────────────────────────────────────────────────
  // Las reglas viven en `collectStepErrors` (pura, testable). Aquí solo se
  // traduce el primero de los errores, que es lo que los asistentes pintan.
  const validate = useCallback((step: number): string | null => {
    const [first] = collectStepErrors(step, state)
    return first ? i18n.t(first.key, first.params) : null
  }, [state])

  // ── Load program from PB ───────────────────────────────────────────────────
  const loadProgram = useCallback(async (programId: string) => {
    const available = await isPocketBaseAvailable()
    if (!available) return

    try {
      // Lectura cacheada (dedup si se reabre el mismo programa). staleTime
      // Infinity: el editor siembra estado local; no queremos refetch en vivo.
      const { program, phaseItems, exerciseItems, dayConfigItems } = await qc.fetchQuery({
        queryKey: qk.programEditor(programId),
        staleTime: Infinity,
        queryFn: async () => {
          const prog = await pb.collection('programs').getOne(programId, { $autoCancel: false })
          const filter = pb.filter('program = {:pid}', { pid: programId })
          const [phasesRes, exercisesRes, dayConfigRes] = await Promise.all([
            pb.collection('program_phases').getList(1, 20, { filter, sort: 'sort_order', $autoCancel: false }),
            pb.collection('program_exercises').getList(1, 2000, { filter, sort: 'phase_number,sort_order', $autoCancel: false }),
            pb.collection('program_day_config').getList(1, 200, { filter, sort: 'phase_number,sort_order', $autoCancel: false })
              .catch((e: any) => {
                if (e?.status !== 404) console.warn('useProgramEditor: day config fetch failed', e)
                return { items: [] }
              }),
          ])
          return { program: prog, phaseItems: phasesRes.items, exerciseItems: exercisesRes.items, dayConfigItems: dayConfigRes.items }
        },
      })
      const phasesRes = { items: phaseItems }
      const exercisesRes = { items: exerciseItems }
      const dayConfigRes = { items: dayConfigItems }

      const locale = i18n.language
      const loadedPhases: EditorPhase[] = phasesRes.items
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(p => ({
          name: localize(p.name, locale),
          weeks: p.weeks,
          color: p.color,
          bgColor: p.bg_color,
        }))

      const days: Record<string, EditorDay> = {}
      // Pre-fill all days
      const dayFallbacks = dayDefaults()
      for (let pi = 0; pi < loadedPhases.length; pi++) {
        for (const d of dayFallbacks) {
          days[`${pi}_${d.dayId}`] = { ...d, exercises: [] }
        }
      }

      // Apply day config (cardio fields, day metadata)
      const dayConfigKeys = new Set<string>()
      for (const dc of dayConfigRes.items) {
        const phaseIndex = dc.phase_number - 1
        const key = `${phaseIndex}_${dc.day_id}`
        dayConfigKeys.add(key)
        if (days[key]) {
          days[key].dayName = localize(dc.day_name, locale) || days[key].dayName
          days[key].focus = localize(dc.day_focus, locale) || days[key].focus
          days[key].type = dc.day_type || days[key].type
          days[key].color = dc.day_color || days[key].color
          if (dc.day_type === 'cardio') {
            days[key].cardioActivityType = dc.cardio_activity_type || 'running'
            days[key].cardioTargetDistanceKm = dc.cardio_target_distance_km || undefined
            days[key].cardioTargetDurationMin = dc.cardio_target_duration_min || undefined
          }
          if (dc.day_type === 'circuit') {
            days[key].circuitMode = dc.circuit_mode || 'circuit'
            days[key].circuitRounds = dc.circuit_rounds || 3
            days[key].circuitWorkSeconds = dc.circuit_work_seconds || 40
            days[key].circuitRestSeconds = dc.circuit_rest_seconds || 20
            days[key].circuitRestBetweenExercises = dc.circuit_rest_between_exercises || 0
            days[key].circuitRestBetweenRounds = dc.circuit_rest_between_rounds || 60
          }
        }
      }

      // Populate exercises
      for (const r of exercisesRes.items) {
        const phaseIndex = r.phase_number - 1
        const key = `${phaseIndex}_${r.day_id}`
        if (!days[key]) {
          days[key] = {
            dayId: r.day_id,
            dayName: r.day_name,
            focus: r.day_focus,
            type: r.day_type,
            color: r.day_color,
            exercises: [],
          }
        }
        // Update day metadata from first record only if no day config exists
        if (!dayConfigKeys.has(key)) {
          days[key].dayName = localize(r.day_name, locale)
          days[key].focus = localize(r.day_focus, locale)
          days[key].type = r.day_type
          days[key].color = r.day_color
        }

        days[key].exercises.push({
          exerciseId: r.exercise_id,
          name: localize(r.exercise_name, locale),
          sets: r.sets,
          reps: r.reps,
          rest: r.rest_seconds,
          muscles: localize(r.muscles, locale),
          note: localize(r.note, locale),
          youtube: r.youtube,
          priority: r.priority,
          isTimer: r.is_timer || false,
          timerSeconds: r.timer_seconds || 0,
          section: (r.section || 'main') as EditorExercise['section'],
          // Media ya subida (#618). Son NOMBRES DE FICHERO de PocketBase, no
          // URLs: quien las pinta las resuelve con `pb.files.getURL` sobre el
          // registro, igual que hace la cascada de media de #608.
          demoImages: Array.isArray(r.demo_images) ? r.demo_images : [],
          demoVideo: r.demo_video || '',
          pbRecordId: r.id,
        })
      }

      setState({
        programId,
        step: 1,
        info: {
          name: localize(program.name, locale),
          description: localize(program.description, locale) || '',
          durationWeeks: program.duration_weeks || 26,
          isOfficial: program.is_official || false,
          // Las filas anteriores a #603 traen el campo vacío. El backfill de
          // 1785000000 las dejó en `public`, así que un vacío aquí solo puede
          // venir de un cliente viejo que creó el programa sin mandarlo: se
          // trata como privado, que es la dirección segura.
          visibility: (program.visibility as ProgramVisibility) || 'private',
          difficulty: program.difficulty || 'beginner',
          // Campos de catálogo (#613). Los programas anteriores los traen
          // vacíos: se quedan sin fijar en vez de inventarles un objetivo.
          goalType: (program.goal_type as ProgramGoalType) || '',
          skill: (program.skill as ProgramSkill) || '',
          intensity: (program.intensity as ProgramIntensity) || '',
          // Un número guardado se lee como elección explícita del autor, así
          // que reabrir el programa no vuelve a derivarlo por su cuenta.
          daysPerWeek: typeof program.days_per_week === 'number' && program.days_per_week > 0
            ? program.days_per_week
            : null,
          equipmentRequired: Array.isArray(program.equipment_required) ? program.equipment_required : [],
          contraindications: Array.isArray(program.contraindications) ? program.contraindications : [],
          // «Cómo seguir este programa» (#618). Los programas anteriores a la
          // migración `1786000000` no traen el campo, y un programa sin notas
          // es el caso normal: se queda vacío y la ficha no pinta el bloque.
          instructions: localize(program.instructions, locale) || '',
          // Portada ya subida. `coverImage` es el nombre del fichero y
          // `coverUrl` la miniatura con la que el editor la previsualiza; el
          // par pendiente/borrado arranca limpio en cada carga.
          coverImage: program.cover_image || '',
          coverUrl: program.cover_image
            ? pb.files.getURL(program, program.cover_image, { thumb: '400x0' })
            : null,
          coverFile: null,
          coverRemoved: false,
        },
        phases: loadedPhases.length > 0 ? loadedPhases : defaultPhases(),
        days,
        isDirty: false,
        isSaving: false,
        error: null,
      })
    } catch (e: any) {
      if (e?.code === 0) return // auto-cancelled, ignore
      console.error('useProgramEditor: loadProgram error', e)
      setState(s => ({ ...s, error: i18n.t('programEditor.loadError') }))
    }
  }, [qc])

  // ── Save program to PB ─────────────────────────────────────────────────────
  const saveProgram = useCallback(async (userId: string): Promise<string | null> => {
    const available = await isPocketBaseAvailable()
    if (!available) {
      setState(s => ({ ...s, error: 'PocketBase no disponible' }))
      return null
    }

    setState(s => ({ ...s, isSaving: true, error: null }))

    try {
      let programId = state.programId

      const locale = i18n.language

      // Create or update the program record
      const programData: Record<string, unknown> = {
        name: toTranslatable(state.info.name, locale),
        description: toTranslatable(state.info.description, locale),
        duration_weeks: state.info.durationWeeks,
        // `is_active` se queda en true: quien oculta ahora es `visibility`.
        // Ponerlo en false dejaría la fila fuera de TODAS las queries, que
        // siguen filtrando por este campo — incluido el catálogo del autor.
        is_active: true,
        visibility: state.info.visibility,
        // «Cómo seguir este programa» (#618). Viaja como `{ locale: texto }`
        // igual que `name` y `description`; leerlo sin `localize()` imprimiría
        // `[object Object]`.
        instructions: toTranslatable(state.info.instructions, locale),
      }
      // Only set created_by on new programs — don't overwrite ownership on edit
      if (!state.programId) {
        programData.created_by = userId
      }
      // Only include SaaS fields if they have non-default values (avoids errors if PB migration not applied)
      if (state.info.isOfficial) programData.is_official = true
      if (state.info.difficulty && state.info.difficulty !== 'beginner') programData.difficulty = state.info.difficulty

      // Campos de catálogo (#613). Sin ellos el programa no puede aparecer
      // nunca en «PARA TI» ni en los filtros por objetivo/equipo.
      Object.assign(programData, buildProgramCatalogFields(state.info, state.days))

      if (programId) {
        await pb.collection('programs').update(programId, programData)
      } else {
        const created = await pb.collection('programs').create(programData)
        programId = created.id
      }

      // ── Portada (#618) ───────────────────────────────────────────────────
      //
      // Va en una petición aparte y no dentro de `programData` porque un
      // fichero obliga a `multipart/form-data`, y ahí los campos i18n
      // (`name`, `description`, `instructions`) tendrían que ir serializados a
      // mano. Separarlo deja el guardado del texto exactamente como estaba y
      // reduce la subida a un `update` de un solo campo.
      //
      // `buildCoverPayload` devuelve null cuando no hay nada que hacer, que es
      // el caso mayoritario: un guardado que no toca la portada no emite
      // ninguna petición de más.
      const coverPayload = buildCoverPayload(state.info as CoverMediaState)
      if (coverPayload) {
        await pb.collection('programs').update(programId, coverPayload, { requestKey: null })
      }

      // ── Guardado reconciliado (issue #463) ───────────────────────────────
      //
      // Antes esto borraba todas las fases/días/ejercicios y los recreaba uno a
      // uno. Si fallaba una creación a mitad, los borrados ya estaban hechos y
      // el programa del usuario quedaba vacío. Ahora se calcula el diff contra
      // lo que hay en el servidor y se ejecuta con los borrados al final, así
      // que un fallo no puede destruir datos.

      const programFilter = pb.filter('program = {:pid}', { pid: programId })

      // Construir las filas que el editor quiere que existan.
      const desiredPhases: DesiredRow[] = state.phases.map((phase, pi) => ({
        key: phaseKey(pi + 1),
        data: {
          program: programId,
          phase_number: pi + 1,
          name: toTranslatable(phase.name, locale),
          weeks: phase.weeks,
          color: phase.color,
          bg_color: phase.bgColor,
          sort_order: pi + 1,
        },
      }))

      const desiredDayConfig: DesiredRow[] = []
      const desiredExercises: DesiredRow[] = []
      /**
       * Media pendiente por ejercicio, indexada por la MISMA clave natural que
       * usa el reconciliador (#618).
       *
       * Los ficheros no pueden entrar en `desiredExercises`: `diffCollection`
       * compara campo a campo contra lo que devuelve el servidor, y un fichero
       * nunca va a ser igual al nombre de fichero guardado, así que todas las
       * filas de ejercicios se marcarían como cambiadas en cada guardado. Se
       * apartan aquí y se suben después, cuando ya existen las filas.
       */
      const pendingExerciseMedia = new Map<string, ExerciseMediaState>()
      let sortOrder = 0
      let daySortOrder = 0
      for (let pi = 0; pi < state.phases.length; pi++) {
        for (const dayDef of DAY_DEFAULTS) {
          const dayKey = `${pi}_${dayDef.dayId}`
          const day = state.days[dayKey]
          if (!day) continue

          daySortOrder++
          const dayConfigData: Record<string, unknown> = {
            program: programId,
            phase_number: pi + 1,
            day_id: day.dayId,
            day_name: toTranslatable(day.dayName, locale),
            day_type: day.type,
            day_focus: toTranslatable(day.focus, locale),
            day_color: day.color,
            sort_order: daySortOrder,
          }
          // Los campos condicionales se escriben SIEMPRE, con valor vacío
          // cuando no aplican. Con el borrado y recreado de antes se limpiaban
          // solos; al reconciliar hay que decirlo explícitamente, porque el
          // diff solo mira los campos presentes en la fila deseada y si no
          // aparecen se quedaría el valor viejo (p. ej. un día que pasa de
          // cardio a empuje conservaría su distancia objetivo).
          const isCardio = day.type === 'cardio'
          dayConfigData.cardio_activity_type = isCardio ? (day.cardioActivityType || 'running') : ''
          dayConfigData.cardio_target_distance_km = isCardio ? (day.cardioTargetDistanceKm ?? 0) : 0
          dayConfigData.cardio_target_duration_min = isCardio ? (day.cardioTargetDurationMin ?? 0) : 0

          const isCircuit = day.type === 'circuit'
          dayConfigData.circuit_mode = isCircuit ? (day.circuitMode ?? 'circuit') : ''
          dayConfigData.circuit_rounds = isCircuit ? (day.circuitRounds ?? 3) : 0
          dayConfigData.circuit_work_seconds = isCircuit ? (day.circuitWorkSeconds ?? 40) : 0
          dayConfigData.circuit_rest_seconds = isCircuit ? (day.circuitRestSeconds ?? 20) : 0
          dayConfigData.circuit_rest_between_exercises = isCircuit ? (day.circuitRestBetweenExercises ?? 0) : 0
          dayConfigData.circuit_rest_between_rounds = isCircuit ? (day.circuitRestBetweenRounds ?? 60) : 0
          desiredDayConfig.push({ key: dayConfigKey(pi + 1, day.dayId), data: dayConfigData })

          if (day.type === 'cardio' || day.exercises.length === 0) continue

          // Sort exercises by section: warmup → main → cooldown
          const sectionOrder: Record<string, number> = { warmup: 0, main: 1, cooldown: 2 }
          const sortedExercises = [...day.exercises].sort((a, b) =>
            (sectionOrder[a.section || 'main'] || 1) - (sectionOrder[b.section || 'main'] || 1)
          )

          // Contador de repeticiones del mismo ejercicio dentro del día, para
          // que «dominadas» dos veces en el mismo entrenamiento sean dos filas
          // distintas y no colisionen en la misma clave.
          const occurrences = new Map<string, number>()

          for (const ex of sortedExercises) {
            sortOrder++
            const occurrence = occurrences.get(ex.exerciseId) ?? 0
            occurrences.set(ex.exerciseId, occurrence + 1)
            const key = exerciseKey(pi + 1, day.dayId, ex.exerciseId, occurrence)
            const media = exerciseMediaOf(ex)
            if (hasExerciseMediaChanges(media)) pendingExerciseMedia.set(key, media)
            desiredExercises.push({
              key,
              data: {
                program: programId,
                phase_number: pi + 1,
                day_id: day.dayId,
                day_name: toTranslatable(day.dayName, locale),
                day_focus: toTranslatable(day.focus, locale),
                day_type: day.type,
                day_color: day.color,
                exercise_id: ex.exerciseId,
                exercise_name: toTranslatable(ex.name, locale),
                sets: ex.sets,
                reps: ex.reps,
                rest_seconds: ex.rest,
                muscles: toTranslatable(ex.muscles, locale),
                note: toTranslatable(ex.note, locale),
                youtube: ex.youtube,
                priority: ex.priority,
                is_timer: ex.isTimer,
                timer_seconds: ex.timerSeconds,
                workout_title: `${day.focus}`,
                sort_order: sortOrder,
                section: ex.section || 'main',
              },
            })
          }
        }
      }

      // Leer el estado actual. A diferencia de antes, un fallo de lectura ya no
      // se traga en un `catch` silencioso: si no sabemos qué hay en el servidor
      // no podemos reconciliar sin arriesgarnos a duplicar o borrar de más.
      //
      // `$autoCancel: false` por el mismo motivo que en loadProgram: el SDK
      // cancela por defecto las peticiones duplicadas a la misma colección, y
      // un guardado que coincida con una carga en vuelo se abortaría solo.
      const readOpts = { filter: programFilter, $autoCancel: false }
      const [existingPhases, existingExercises] = await Promise.all([
        pb.collection('program_phases').getFullList(readOpts),
        pb.collection('program_exercises').getFullList(readOpts),
      ])

      // `program_day_config` es opcional: puede no existir en despliegues
      // antiguos. Un 404 significa «no hay colección» y se salta; cualquier
      // otro error sí es real y aborta el guardado.
      let hasDayConfig = true
      let existingDayConfig: Array<Record<string, unknown> & { id: string }> = []
      try {
        existingDayConfig = await pb.collection('program_day_config').getFullList(readOpts)
      } catch (e: any) {
        if (e?.status === 404) {
          hasDayConfig = false
        } else {
          throw e
        }
      }

      const diffOpts = { locale, translatableFields: PROGRAM_TRANSLATABLE_FIELDS }
      const collections: PlannedCollection[] = [
        {
          writer: collectionWriter('program_phases'),
          plan: diffCollection(
            existingPhases as ExistingRecord[],
            desiredPhases,
            r => phaseKey(r.phase_number as number),
            diffOpts,
          ),
        },
        {
          writer: collectionWriter('program_exercises'),
          plan: diffCollection(
            // Se ordena por sort_order para que el desempate por repetición
            // cuente en el mismo orden en que se generaron las filas deseadas.
            [...(existingExercises as ExistingRecord[])].sort(
              (a, b) => Number(a.sort_order) - Number(b.sort_order),
            ),
            desiredExercises,
            makeExerciseKeyOf(),
            diffOpts,
          ),
        },
      ]
      if (hasDayConfig) {
        collections.push({
          writer: collectionWriter('program_day_config'),
          plan: diffCollection(
            existingDayConfig as ExistingRecord[],
            desiredDayConfig,
            r => dayConfigKey(r.phase_number as number, r.day_id as string),
            diffOpts,
          ),
        })
      }

      // Escrituras primero, borrados al final. Ver executePlans.
      await executePlans(collections)

      // ── Media por ejercicio (#618) ───────────────────────────────────────
      //
      // Va DESPUÉS de `executePlans` por una razón concreta: `executePlans` no
      // devuelve los registros que crea, así que un ejercicio nuevo no tiene id
      // hasta este punto. Se relee la colección y se reconstruyen las claves
      // naturales con `makeExerciseKeyOf()`, recorriendo en orden de
      // `sort_order` igual que hace el diff — si el orden no coincide, el
      // desempate por repetición se desalinea y la media acabaría en el
      // ejercicio equivocado cuando el mismo aparece dos veces en un día.
      //
      // También va al final a propósito: si una subida falla, el programa ya
      // está guardado entero. El peor caso es «se guardó el texto pero no la
      // foto», nunca al revés.
      if (pendingExerciseMedia.size > 0) {
        const savedExercises = await pb.collection('program_exercises').getFullList(readOpts)
        const keyOf = makeExerciseKeyOf()
        const idByKey = new Map<string, string>()
        for (const record of [...(savedExercises as ExistingRecord[])].sort(
          (a, b) => Number(a.sort_order) - Number(b.sort_order),
        )) {
          const key = keyOf(record)
          // Un duplicado solo puede venir de un guardado anterior a medias, y
          // el diff acaba de marcarlo para borrar: gana el primero, que es el
          // mismo que reutiliza `diffCollection`.
          if (!idByKey.has(key)) idByKey.set(key, record.id)
        }

        const uploads: Promise<unknown>[] = []
        for (const [key, media] of pendingExerciseMedia) {
          const recordId = idByKey.get(key)
          if (!recordId) continue
          const payload = buildExerciseMediaPayload(media)
          if (!payload) continue
          // `requestKey: null` por lo mismo que en `collectionWriter` (#536):
          // el SDK deriva la clave de auto-cancelación de MÉTODO + ruta, y
          // varias subidas en vuelo a la vez se abortarían entre ellas.
          uploads.push(
            pb.collection('program_exercises').update(recordId, payload, { requestKey: null }),
          )
        }
        await Promise.all(uploads)
      }

      // Los ficheros pendientes ya están en el servidor: se limpian para que un
      // segundo guardado sin recargar no los vuelva a subir. Los nombres de
      // fichero (`coverImage`, `demoImages`) se quedan como estaban porque el
      // servidor los renombra al guardarlos y aquí no se conocen los nuevos;
      // ambas pantallas navegan fuera tras guardar y al reabrir el editor
      // `loadProgram` los rehidrata desde PocketBase.
      setState(s => ({
        ...s,
        programId,
        isSaving: false,
        isDirty: false,
        info: { ...s.info, coverFile: null, coverRemoved: false },
        days: Object.fromEntries(
          Object.entries(s.days).map(([key, day]) => [
            key,
            {
              ...day,
              exercises: day.exercises.map(ex => ({
                ...ex,
                pendingImages: [],
                pendingVideo: null,
                removedImages: [],
                removeVideo: false,
              })),
            },
          ]),
        ),
      }))
      // Refresca todo el dominio de programas (catálogo, inscripción y las DOS
      // claves de detalle: `detail` de usePrograms y `detailView` de
      // useProgramDetail, #606) y la caché de edición, que es un dominio aparte.
      qc.invalidateQueries({ queryKey: qk.programs.all })
      if (programId) qc.invalidateQueries({ queryKey: qk.programEditor(programId) })
      // #636 §5: esto solo lo emitía el móvil, así que la mitad de los
      // guardados no se contaba. Vive aquí, en el hook que comparten las dos
      // apps, para que no vuelva a depender de que cada pantalla se acuerde.
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.programEditorSaved, {
        surface: 'program_editor', source: 'editor_save',
        program_id: programId ?? undefined,
        is_new: !state.programId,
        visibility: state.info.visibility,
        day_count: Object.keys(state.days).length,
      })
      return programId
    } catch (e: any) {
      console.error('useProgramEditor: saveProgram error', e)
      const detail = e?.response?.data || e?.data || e?.message || ''
      const msg = detail ? `${i18n.t('programEditor.saveError')} (${JSON.stringify(detail)})` : i18n.t('programEditor.saveError')
      setState(s => ({ ...s, isSaving: false, error: msg }))
      // Report to monitoring (Sentry) so we can see save failures
      getPlatform().reportError?.(e)
      return null
    }
  }, [state.programId, state.info, state.phases, state.days, qc])

  // ── Reset ──────────────────────────────────────────────────────────────────
  const resetEditor = useCallback(() => {
    setState(createInitialState())
  }, [])

  return {
    state,
    setStep,
    updateInfo,
    redistributeWeeks,
    addPhase,
    removePhase,
    updatePhase,
    updateDay,
    addExercise,
    removeExercise,
    updateExercise,
    moveExercise,
    reorderExercise,
    copyDay,
    copyPhase,
    loadProgram,
    saveProgram,
    validate,
    resetEditor,
  }
}
