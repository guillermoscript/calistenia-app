/**
 * usePrograms — catálogo de programas + programa activo del usuario.
 *
 * Migrado a TanStack Query con una cadena de queries dependientes:
 *   1. catalog        (qk.programs.catalog(userId))      — catálogo de programas
 *   2. enrollment      (qk.programs.enrollment(uid))       — inscripción activa o null
 *   3. detail         (qk.programs.detail(programId))      — phases/weekDays/workouts/cardio
 *
 * Cae a los workouts hardcodeados cuando no hay programa/PB. Forma pública
 * estable (programs, activeProgram, phases, weekDays, cardioDayConfigs,
 * circuitDayConfigs, getWorkout, selectProgram, abandonProgram,
 * duplicateProgram, deleteProgram, refreshPrograms, programsReady).
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RecordModel } from 'pocketbase'
import { pb } from '../lib/pocketbase'
import {
  PHASES as FALLBACK_PHASES,
  WEEK_DAYS as FALLBACK_WEEK_DAYS,
  getWorkout as fallbackGetWorkout,
} from '../data/workouts'
import { nowLocalForPB } from '../lib/dateUtils'
import { fetchProgramDetailRows } from '../lib/programDetailQuery'
import { normalizeProgramDayIds, type DayRowLike } from '../lib/program-day-ids'
import { programSelectionEvents } from '../lib/program-selection-events'
import { getPlatform } from '../platform'
import { CANONICAL_ANALYTICS_EVENTS, op, setAnalyticsProgramId, trackCanonicalEvent } from '../lib/analytics'
import { qk } from '../lib/query-keys'
import type { Phase, WeekDay, Workout, WorkoutsMap, Exercise, ProgramMeta, DayId, CardioDayConfig, CardioActivityType, CircuitDefinition, CircuitExercise } from '../types'
import i18n from 'i18next'
import { duplicatedName, localize } from '../lib/i18n-db'
import { resolveExerciseDisplayName, resolveExerciseNameField } from '../lib/exercise-resolver'
import { inferTimerFromReps } from '../lib/exercise-timer-inference'
import { loadCatalogIndex } from '../lib/catalogIndex'
import { authorDisplayName } from '../lib/author-name'
import { applyOverrides } from '../lib/programOverrides'
import { useProgramOverrides } from './useAutoProgression'

// ─── helpers ────────────────────────────────────────────────────────────────

function buildPhases(phaseRecords: RecordModel[]): Phase[] {
  const locale = i18n.language
  return [...phaseRecords]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(p => ({
      id:    p.phase_number,
      name:  localize(p.name, locale),
      weeks: p.weeks,
      color: p.color,
      bg:    p.bg_color,
    }))
}

/**
 * Filas de `program_exercises` → `CircuitExercise[]` (#625).
 *
 * `exercise_name` viaja CRUDO (es el `json {es,en}` de PB, que es justo lo que
 * `CircuitDefinition.name` espera): localizarlo aquí lo congelaría en el idioma
 * que hubiera al construir el detalle del programa.
 *
 * `rest_seconds` NO se mapea a `restSecondsOverride` a propósito. Es el descanso
 * entre series de un ejercicio de fuerza (90 s típicos); como override de
 * circuito destrozaría la cadencia. El descanso de un circuito se configura a
 * nivel de día (`circuit_rest_between_exercises` / `circuit_rest_seconds`).
 */
export function toCircuitExercises(exerciseRecords: RecordModel[]): CircuitExercise[] {
  return exerciseRecords.map(r => {
    const exercise: CircuitExercise = {
      exerciseId: r.exercise_id,
      // Sigue siendo el campo `{es,en}` (no se localiza aquí), pero pasado por
      // el resolutor: un slug de catálogo en `exercise_name` se pintaría crudo.
      name: resolveExerciseNameField(r.exercise_name, r.exercise_id),
    }
    if (r.reps) exercise.reps = r.reps
    // Un ejercicio por tiempo guarda su duración en `timer_seconds`; en modo
    // `timed` es exactamente el trabajo de esa estación.
    //
    // Una fila mal sembrada (#690) llega con `is_timer: false` y la duración
    // metida en el texto de `reps` («45s»); sin deducirla, esa estación se
    // queda sin trabajo que cronometrar aunque el propio texto cante los
    // segundos. Sólo se toca la duración: `exerciseId`, `name` y `reps` siguen
    // saliendo tal cual.
    const inferred = r.is_timer ? null : inferTimerFromReps(r.reps)
    if (r.is_timer && r.timer_seconds) exercise.workSecondsOverride = r.timer_seconds
    else if (inferred) exercise.workSecondsOverride = r.timer_seconds || inferred.timerSeconds
    return exercise
  })
}

/** Una fila de `program_day_config` de tipo `circuit` → `CircuitDefinition`. */
function toCircuitDefinition(dayConfig: RecordModel, exerciseRecords: RecordModel[]): CircuitDefinition {
  const rows = exerciseRecords.filter(
    r => r.day_id === dayConfig.day_id && r.phase_number === dayConfig.phase_number,
  )
  return {
    id: `${dayConfig.day_id}_circuit`,
    name: { es: 'Circuito', en: 'Circuit' },
    mode: dayConfig.circuit_mode ?? 'circuit',
    exercises: toCircuitExercises(rows),
    rounds: dayConfig.circuit_rounds ?? 3,
    restBetweenExercises: dayConfig.circuit_rest_between_exercises ?? 0,
    restBetweenRounds: dayConfig.circuit_rest_between_rounds ?? 60,
    workSeconds: dayConfig.circuit_work_seconds,
    restSeconds: dayConfig.circuit_rest_seconds,
  }
}

function buildWeekDays(exerciseRecords: RecordModel[], dayConfigRecords: RecordModel[] = []): WeekDay[] {
  const ORDER: string[] = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']
  const locale = i18n.language
  const seen: Record<string, WeekDay> = {}

  dayConfigRecords.forEach(dc => {
    if (!seen[dc.day_id]) {
      const day: WeekDay = {
        id:    dc.day_id as DayId,
        name:  localize(dc.day_name, locale),
        focus: localize(dc.day_focus, locale),
        type:  dc.day_type,
        color: dc.day_color,
      }
      if (dc.day_type === 'cardio' && dc.cardio_activity_type) {
        day.cardioConfig = {
          activityType: dc.cardio_activity_type as CardioActivityType,
          targetDistanceKm: dc.cardio_target_distance_km || undefined,
          targetDurationMin: dc.cardio_target_duration_min || undefined,
        }
      }
      if (dc.day_type === 'circuit') {
        // `exercises` sale de `program_exercises` de ESTA fase: un día de
        // circuito con ejercicios genera esas filas igual que uno de fuerza
        // (`useProgramEditor` solo se salta el cardio). Hasta #625 se dejaba
        // vacío y el runner no tenía nada que ejecutar.
        day.circuitConfig = toCircuitDefinition(dc, exerciseRecords)
      }
      seen[dc.day_id] = day
    }
  })

  exerciseRecords.forEach(r => {
    if (!seen[r.day_id]) {
      seen[r.day_id] = {
        id:    r.day_id as DayId,
        name:  localize(r.day_name, locale),
        focus: localize(r.day_focus, locale),
        type:  r.day_type,
        color: r.day_color,
      }
    }
  })

  const defaults: Record<string, WeekDay> = {
    sab: { id: 'sab', name: i18n.t('day.saturday'),  focus: i18n.t('day.activeWalk'), type: 'rest', color: '#888899' },
    dom: { id: 'dom', name: i18n.t('day.sunday'), focus: i18n.t('day.totalRest'),  type: 'rest', color: '#888899' },
  }
  for (const id of ['sab', 'dom']) {
    if (!seen[id]) seen[id] = defaults[id]
  }
  // Nunca descartar días en silencio: si llega un id fuera de `lun..dom` es un
  // dato roto (#575) y `fetchProgramDetail` ya lo ha saneado antes de llegar aquí.
  const unknown = Object.keys(seen).filter(id => !ORDER.includes(id))
  if (unknown.length) console.error(`[programs] buildWeekDays: day_id desconocidos ignorados: ${unknown.join(', ')}`)
  return ORDER.map(id => seen[id]).filter(Boolean)
}

function buildCardioDayConfigs(dayConfigRecords: RecordModel[]): Record<string, CardioDayConfig> {
  const configs: Record<string, CardioDayConfig> = {}
  dayConfigRecords.forEach(dc => {
    if (dc.day_type === 'cardio' && dc.cardio_activity_type) {
      const key = `p${dc.phase_number}_${dc.day_id}`
      configs[key] = {
        activityType: dc.cardio_activity_type as CardioActivityType,
        targetDistanceKm: dc.cardio_target_distance_km || undefined,
        targetDurationMin: dc.cardio_target_duration_min || undefined,
      }
    }
  })
  return configs
}

/**
 * Circuitos del programa indexados por `p{fase}_{día}` (#625).
 *
 * Existe por el mismo motivo que `buildCardioDayConfigs`: `weekDays` es plano y
 * no tiene fase, así que `weekDays[].circuitConfig` se queda con la fila de la
 * fase más baja. Un día que es circuito en la fase 1 y en la fase 2 con
 * distintas rondas necesita que quien arranca (que SÍ sabe la fase) pida la
 * suya. Este mapa es la fuente de la verdad para arrancar; el `circuitConfig`
 * del `WeekDay` se queda para pintar la semana.
 */
export function buildCircuitDayConfigs(
  dayConfigRecords: RecordModel[],
  exerciseRecords: RecordModel[],
): Record<string, CircuitDefinition> {
  const configs: Record<string, CircuitDefinition> = {}
  dayConfigRecords.forEach(dc => {
    if (dc.day_type !== 'circuit') return
    configs[`p${dc.phase_number}_${dc.day_id}`] = toCircuitDefinition(dc, exerciseRecords)
  })
  return configs
}

/**
 * Filas de `program_exercises` → `WorkoutsMap`, la forma que consume la sesión.
 *
 * Exportada sólo para poder testearla sin montar el hook, igual que
 * `toCircuitExercises` y `buildCircuitDayConfigs`.
 */
export function buildWorkoutsMap(exerciseRecords: RecordModel[]): WorkoutsMap {
  const locale = i18n.language
  const map: WorkoutsMap = {}
  exerciseRecords.forEach(r => {
    const key = `p${r.phase_number}_${r.day_id}`
    if (!map[key]) {
      map[key] = {
        phase: r.phase_number,
        day:   r.day_id as DayId,
        title: localize(r.workout_title, locale),
        exercises: [],
      }
    }
    // #690: hay filas en producción con `is_timer: false` y `timer_seconds: 0`
    // cuyo `reps` es una duración pura («30-45 seg»). Sin esto la pantalla de
    // ejercicio pinta ese texto y NINGÚN cronómetro, porque sólo lo enseña
    // cuando `isTimer` es cierto. Sólo se corrigen esos dos campos: `id`,
    // `name` y `reps` se quedan como están (el `id` es la clave del historial).
    const inferred = r.is_timer ? null : inferTimerFromReps(r.reps)
    map[key].exercises.push({
      id:           r.exercise_id,
      // Un `exercise_name` que es un slug del catálogo (o va vacío) se cambia
      // por el nombre localizado del catálogo; el `id` se queda crudo a
      // propósito: es la clave del historial de series y PRs.
      name:         resolveExerciseDisplayName(r.exercise_name, r.exercise_id, locale),
      sets:         r.sets,
      reps:         r.reps,
      rest:         r.rest_seconds,
      muscles:      localize(r.muscles, locale),
      note:         localize(r.note, locale),
      youtube:      r.youtube,
      priority:     r.priority,
      isTimer:      r.is_timer || !!inferred,
      timerSeconds: inferred ? (r.timer_seconds || inferred.timerSeconds) : r.timer_seconds,
      // `demoImages`/`demoVideo` son los NOMBRES DE FICHERO de PocketBase, no URLs.
      // Se exponen crudos a propósito: son la entrada que espera `getExerciseMedia()`
      // (y así los consume también el `ExerciseScreen` móvil). Resolverlos aquí
      // duplicaría la construcción de URLs fuera de core. Para pintarlos hay que
      // pasar por `useExerciseMedia`/`ExerciseThumbnail`, nunca por un `src` directo (#608).
      pbRecordId:   r.id,
      demoImages:   r.demo_images || [],
      demoVideo:    r.demo_video || '',
      section:      (r.section || 'main') as Exercise['section'],
    } as Exercise)
  })
  return map
}

// ─── topes y lotes (#614) ───────────────────────────────────────────────────

/**
 * Tamaño de página con el que `getFullList` recorre las listas de catálogo.
 * No es un tope: `getFullList` sigue pidiendo páginas hasta agotar el filtro.
 */
const CATALOG_PAGE_SIZE = 500

/**
 * Cuántos ids de programa caben en un mismo `OR` antes de partir la consulta.
 * El filtro viaja en la query string, así que sin trocear el catálogo acabaría
 * generando una URL que el servidor rechaza (414) o que un proxy trunca.
 */
const DISCIPLINE_ID_CHUNK = 50

/**
 * Altas por petición batch. Tiene que ir igual o por debajo del
 * `batch.maxRequests` del servidor —1000, fijado en
 * `pb_migrations/1785100000_enable_batch_api.js`—: un lote más largo lo rechaza
 * PocketBase entero con un 400, no lo recorta.
 */
const BATCH_MAX_REQUESTS = 1000

interface BatchCreate {
  collection: string
  data: Record<string, unknown>
}

/**
 * El servidor no tiene la API batch habilitada. Se distingue del resto de
 * errores porque tiene arreglo desde el cliente: quien la reciba puede caer al
 * camino secuencial en vez de fallar.
 */
class BatchUnavailableError extends Error {
  constructor() { super('PocketBase batch API is disabled (POST /api/batch → 403)') }
}

/**
 * Un PocketBase con `batch.enabled = false` responde **403** «Batch requests are
 * not allowed.» — comprobado contra el binario, no deducido: el 404 que uno
 * esperaría de un endpoint apagado no es lo que manda.
 *
 * Y 403 es una señal limpia porque el otro fallo posible del batch tiene OTRO
 * código: una sub-petición que no pasa la create rule devuelve **400** con
 * `batch_request_failed` y el detalle por petición. Así que aquí un 403 solo
 * puede significar «este servidor no tiene la migración aplicada».
 */
function isBatchDisabled(e: any): boolean {
  return e?.status === 403
}

/**
 * Crea todas las filas pedidas usando la API batch de PocketBase.
 *
 * Cada lote es UNA petición y UNA transacción de servidor: dentro de un lote, o
 * entran todas las filas o no entra ninguna. Entre lotes no hay transacción —
 * por eso quien llama tiene que saber deshacer lo ya escrito (en `duplicateProgram`
 * el rollback es borrar el programa nuevo, que cascadea sobre las hijas).
 *
 * El 403 solo se traduce a `BatchUnavailableError` en el PRIMER lote. Si llega en
 * el tercero, la API estaba habilitada hace un segundo y el 403 significa otra
 * cosa: se propaga tal cual en vez de disfrazarse de «no está habilitada».
 */
async function createAllInBatches(creates: BatchCreate[]): Promise<void> {
  for (let i = 0; i < creates.length; i += BATCH_MAX_REQUESTS) {
    const slice = creates.slice(i, i + BATCH_MAX_REQUESTS)
    const batch = pb.createBatch()
    for (const c of slice) batch.collection(c.collection).create(c.data)
    try {
      await batch.send({ $autoCancel: false })
    } catch (e: any) {
      if (i === 0 && isBatchDisabled(e)) throw new BatchUnavailableError()
      throw e
    }
  }
}

/** Catálogo (+ disciplina por programa) desde PB. */
async function fetchCatalog(userId: string | null): Promise<ProgramMeta[]> {
  // Guard: sin token válido, el listRule `@request.auth.id != ""` de PocketBase
  // devuelve 200 con lista VACÍA (no 401). Si dejáramos pasar eso, React Query
  // cachearía —y el persister lo guardaría en disco hasta 24h— un catálogo vacío,
  // y la pantalla de Programas quedaría vacía hasta que el caché expire. Lanzar
  // aquí mantiene la query en error (los errores no se persisten) y se reintenta
  // en cuanto el auth esté listo. enabled ya filtra el caso normal; esto cubre la
  // carrera de rehidratación del authStore al arrancar la app.
  if (!pb.authStore.isValid) {
    throw new Error('programs catalog: fetch attempted without a valid auth token')
  }
  // Solo lo publicado y lo propio (#603). Los borradores del autor tienen que
  // seguir saliendo: este catálogo es la ÚNICA lista de programas de la app, y
  // filtrar a `visibility = "public"` a secas los dejaría inalcanzables.
  // El servidor ya recorta lo ajeno privado (las reglas de 1785000000 devuelven
  // 0 filas, no 403); este filtro es lo que hace que TÚ veas tus borradores.
  const visibilityFilter = userId
    ? pb.filter('(visibility = "public" || created_by = {:uid})', { uid: userId })
    : 'visibility = "public"'
  // `getFullList` y no `getList(1, 100)` (#614): el tope de 100 no daba error al
  // alcanzarse, devolvía los primeros 100 y se callaba. Este catálogo es la ÚNICA
  // lista de programas de la app y no tiene scroll infinito, así que el programa
  // 101 sencillamente no existía para nadie. Con 7 programas en la base el tope no
  // mordía todavía; el problema era que el día que mordiera nadie se iba a enterar.
  // `sort: 'name'` y no `'-created'`: `programs` no tiene autodate, así que
  // ordenar por `created` devuelve 400. El orden por seguidores que pide #620
  // para la sección Comunidad se hace en cliente, sobre este catálogo ya
  // completo, porque los conteos viven en otra colección (`view_program_stats`)
  // y PocketBase no sabe ordenar una lista por una columna que no es suya.
  //
  // `forked_from.created_by` en el expand: el crédito «basado en X de Y»
  // necesita el nombre del programa original Y el de su autor, y son dos saltos
  // de relación. PocketBase los resuelve en la misma petición; pedirlos aparte
  // serían dos viajes más por cada duplicado del catálogo.
  const catalogItems = await pb.collection('programs').getFullList({
    batch: CATALOG_PAGE_SIZE,
    filter: `is_active = true && ${visibilityFilter}`,
    sort: 'name',
    expand: 'created_by,forked_from,forked_from.created_by',
    $autoCancel: false,
  })
  const locale = i18n.language
  const programIds = catalogItems.map(p => p.id)
  // Un `OR` con TODOS los ids del catálogo va en la query string, así que crece
  // con el catálogo hasta chocar contra el límite de longitud de URL (un 414, o
  // peor, un proxy que trunca). Se trocea: cada trozo es su propia consulta y van
  // en paralelo. `fields` deja el cuerpo en dos columnas — de esto solo se saca
  // si el programa es de yoga o de calistenia.
  const idChunks: string[][] = []
  for (let i = 0; i < programIds.length; i += DISCIPLINE_ID_CHUNK) {
    idChunks.push(programIds.slice(i, i + DISCIPLINE_ID_CHUNK))
  }
  const dayConfigChunks = await Promise.all(idChunks.map(chunk =>
    pb.collection('program_day_config').getFullList({
      batch: CATALOG_PAGE_SIZE,
      filter: chunk.map(id => pb.filter('program = {:id}', { id })).join(' || '),
      fields: 'program,day_type', $autoCancel: false,
    }).catch(() => [] as RecordModel[]), // la disciplina cae a calistenia
  ))
  const allDayConfigs: RecordModel[] = dayConfigChunks.flat()
  const disciplineByProgram = new Map<string, 'yoga' | 'calistenia'>()
  for (const pid of programIds) {
    const days = allDayConfigs.filter(dc => dc.program === pid)
    const nonRest = days.filter(dc => dc.day_type !== 'rest')
    disciplineByProgram.set(pid, nonRest.length > 0 && nonRest.every(dc => dc.day_type === 'yoga') ? 'yoga' : 'calistenia')
  }

  return catalogItems.map(p => {
    // El original del que salió esta copia (#620). Puede faltar por tres vías
    // distintas y ninguna es un error: el programa es un original, es un
    // duplicado anterior a #620 (el vínculo no se guardaba), o su original se
    // borró y PocketBase vació la relación no-cascade.
    const forkedFrom = (p.expand as any)?.forked_from
    return {
    id:             p.id,
    name:           localize(p.name, locale),
    description:    localize(p.description, locale),
    duration_weeks: p.duration_weeks,
    created_by:     p.created_by || undefined,
    // `display_name || name || email` y no solo `display_name` (#620): quien se
    // dio de alta con Google llega con `name` y sin `display_name`, y salía sin
    // nombre. Los tres campos son los que sobreviven al recorte de #411.
    created_by_name: authorDisplayName((p.expand as any)?.created_by) || undefined,
    forked_from:      p.forked_from || undefined,
    // `localize` es obligatorio: el nombre es un `json {es,en}` y meterlo crudo
    // en la frase del crédito pintaría «Basado en [object Object]».
    forked_from_name: forkedFrom ? localize(forkedFrom.name, locale) || undefined : undefined,
    forked_from_author: forkedFrom
      ? authorDisplayName(forkedFrom.expand?.created_by) || undefined
      : undefined,
    is_official:    p.is_official || false,
    is_featured:    p.is_featured || false,
    visibility:     p.visibility || undefined,
    difficulty:     p.difficulty || undefined,
    cover_image:    p.cover_image || undefined,
    cover_image_url: p.cover_image ? pb.files.getURL(p, p.cover_image, { thumb: '400x0' }) : undefined,
    discipline:     disciplineByProgram.get(p.id) || 'calistenia',
    goal_type:      p.goal_type || undefined,
    skill:          p.skill || undefined,
    intensity:      p.intensity || undefined,
    days_per_week:  typeof p.days_per_week === 'number' ? p.days_per_week : undefined,
    equipment_required: Array.isArray(p.equipment_required) ? p.equipment_required : undefined,
    contraindications:  Array.isArray(p.contraindications) ? p.contraindications : undefined,
    }
  })
}

export interface ProgramDetail {
  phases: Phase[]
  weekDays: WeekDay[]
  workoutsMap: WorkoutsMap
  cardioDayConfigs: Record<string, CardioDayConfig>
  circuitDayConfigs: Record<string, CircuitDefinition>
}

/**
 * phases + exercises + day config del programa → estructuras derivadas.
 *
 * Exportada (#474): `ProgramDetailPage` tenía su propia copia de esta consulta,
 * idéntica salvo en la forma de la salida. La consulta vive ahora en
 * `lib/programDetailQuery.ts` y la comparten las dos.
 */
export async function fetchProgramDetail(programId: string): Promise<ProgramDetail> {
  // Deja el índice del catálogo listo ANTES de construir los mapas: los
  // resolutores de nombre (`resolveExerciseDisplayName`) son síncronos y sin
  // índice dejan pasar los slugs crudos. Si la carga falla, se construye igual
  // con los nombres tal cual vienen.
  await loadCatalogIndex().catch(() => null)
  const rows = await fetchProgramDetailRows(programId)
  // RecordModel solo tiene índice genérico; day_id/phase_number existen en estas colecciones.
  const { exercises, dayConfigs, remapped } = normalizeProgramDayIds(
    rows.exercises as (RecordModel & DayRowLike)[],
    rows.dayConfigs as (RecordModel & DayRowLike)[],
  )
  if (Object.keys(remapped).length) {
    // #575: el programa sigue con day_id legacy en BD. Se corrige en lectura para
    // que el usuario tenga semana, pero el dato hay que arreglarlo en origen
    // (`node scripts/update-program-content.mjs`).
    const detail = JSON.stringify(remapped)
    console.warn(`[programs] ${programId}: day_id legacy remapeados ${detail}`)
    getPlatform().reportError?.(new Error(`program ${programId} con day_id legacy: ${detail}`))
  }
  const { phases } = rows
  return {
    phases: buildPhases(phases),
    weekDays: buildWeekDays(exercises, dayConfigs),
    workoutsMap: buildWorkoutsMap(exercises),
    cardioDayConfigs: buildCardioDayConfigs(dayConfigs),
    circuitDayConfigs: buildCircuitDayConfigs(dayConfigs, exercises),
  }
}

/**
 * Inscripción activa del usuario (`user_programs` con `is_current = true`), o
 * null. Devuelve el REGISTRO y no solo `program` porque `started_at` y
 * `current_phase` son la entrada del progreso dentro del programa (#616), y
 * pedirlos aparte sería una segunda consulta a la misma fila.
 */
export interface ActiveEnrollment {
  id: string
  program: string
  /** Timestamp UTC de PB. Vacío en inscripciones anteriores a que se guardara. */
  started_at: string
  status: 'active' | 'completed' | 'abandoned' | ''
  /** Override manual de fase. 0 = automática (derivada de `started_at`). */
  current_phase: number
  /** Opt-in de la progresión automática (#617). Apagado salvo que se pida. */
  auto_progress: boolean
}

function toEnrollment(rec: RecordModel): ActiveEnrollment {
  return {
    id: rec.id,
    program: rec.program as string,
    started_at: (rec.started_at as string) || '',
    status: (rec.status as ActiveEnrollment['status']) || '',
    current_phase: typeof rec.current_phase === 'number' ? rec.current_phase : 0,
    auto_progress: rec.auto_progress === true,
  }
}

/**
 * Expande `program` para no fiarse de la relación a ciegas: si el programa ya no
 * existe, la fila es un «programa activo fantasma» (#605) y aquí vale como «sin
 * programa». Devolver la inscripción dejaba a `fetchProgramDetail` pidiendo un
 * `programs` inexistente, y con él caía el «hoy toca» de home y del onboarding.
 *
 * El hook `pb_hooks/programs_delete_cleanup.pb.js` cierra estas filas al borrar
 * el programa, así que de aquí en adelante no deberían aparecer. Esta guarda es
 * para las que YA están en producción: su `programs` desapareció antes de que el
 * hook existiera, así que nada las va a cerrar nunca.
 *
 * Exportada solo para el test: el hook no se renderiza (core corre en vitest/node,
 * sin testing-library), así que la guarda se prueba sobre la función.
 */
export async function fetchActiveEnrollment(uid: string): Promise<ActiveEnrollment | null> {
  try {
    const rec = await pb.collection('user_programs').getFirstListItem(
      pb.filter('user = {:uid} && is_current = true', { uid }),
      { requestKey: null, expand: 'program' },
    )
    if (!rec.program) return null
    // `programs` es visible para cualquier usuario autenticado (`viewRule`
    // `@request.auth.id != ""`), así que un expand vacío significa que la fila
    // apunta a un programa borrado, no que nos falte permiso para verlo.
    if (!rec.expand?.program) return null
    return toEnrollment(rec)
  } catch {
    return null // sin programa activo aún
  }
}

interface UseProgramsReturn {
  programs: ProgramMeta[]
  activeProgram: ProgramMeta | null
  /** Inscripción activa: `started_at` y `current_phase` para el progreso (#616). */
  activeEnrollment: ActiveEnrollment | null
  phases: Phase[]
  weekDays: WeekDay[]
  cardioDayConfigs: Record<string, CardioDayConfig>
  /** Circuitos del programa por `p{fase}_{día}`. Vacío sin programa activo (#625). */
  circuitDayConfigs: Record<string, CircuitDefinition>
  getWorkout: (phaseNumber: number, dayId: string) => Workout | null
  selectProgram: (programId: string) => Promise<boolean>
  abandonProgram: (programId: string) => Promise<boolean>
  duplicateProgram: (programId: string) => Promise<string | null>
  deleteProgram: (programId: string) => Promise<boolean>
  refreshPrograms: () => Promise<void>
  programsReady: boolean
}

// ─── hook ────────────────────────────────────────────────────────────────────

export function usePrograms(userId: string | null = null): UseProgramsReturn {
  const qc = useQueryClient()
  const selectingRef = useRef(false)

  // Solo corremos las queries con un token válido: evita el 200-lista-vacía de
  // PocketBase cuando el authStore aún no se rehidrató (ver fetchCatalog).
  const authReady = !!userId && pb.authStore.isValid

  const catalogQuery = useQuery({
    queryKey: qk.programs.catalog(userId),
    enabled: authReady,
    staleTime: 5 * 60 * 1000,
    // Reintento ante fallos transitorios en cold-start (red/DNS/5xx/429).
    retry: (failureCount, error: any) => {
      const status = error?.status
      const transient = status === 0 || status === 429 || (typeof status === 'number' && status >= 500)
      return transient && failureCount < 3
    },
    retryDelay: (attempt) => 400 * (attempt + 1),
    queryFn: () => fetchCatalog(userId),
  })

  const enrollmentQuery = useQuery({
    queryKey: qk.programs.enrollment(userId),
    enabled: authReady,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchActiveEnrollment(userId!),
  })

  const activeEnrollment = enrollmentQuery.data ?? null
  const activeProgramId = activeEnrollment?.program ?? null

  // Espejo del programa activo para los eventos del embudo de entreno (#636).
  // Se escribe aquí porque este hook es el único dueño del dato en las dos
  // apps; el contexto de la sesión activa lo LEE en el momento de emitir, sin
  // suscribirse a nada — suscribir el provider que envuelve toda la app a un
  // valor que cambia en cada serie es la regresión del #475.
  useEffect(() => {
    setAnalyticsProgramId(activeProgramId)
  }, [activeProgramId])

  const detailQuery = useQuery({
    queryKey: qk.programs.detail(activeProgramId),
    enabled: authReady && !!activeProgramId,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchProgramDetail(activeProgramId!),
  })

  const programs = catalogQuery.data ?? []
  const activeProgram = activeProgramId ? (programs.find(p => p.id === activeProgramId) || null) : null
  const detail = detailQuery.data
  const phases = detail?.phases?.length ? detail.phases : FALLBACK_PHASES
  const weekDays = detail?.weekDays?.length ? detail.weekDays : FALLBACK_WEEK_DAYS
  const workoutsMap = detail?.workoutsMap ?? {}
  const cardioDayConfigs = detail?.cardioDayConfigs ?? {}
  // `?? {}` también cubre la caché en disco previa a #625, que no tiene el campo.
  const circuitDayConfigs = detail?.circuitDayConfigs ?? {}

  const programsReady = !userId
    ? true
    : catalogQuery.isFetched && enrollmentQuery.isFetched && (!activeProgramId || detailQuery.isFetched)

  // La progresión aceptada sobre un programa AJENO no está en `program_exercises`
  // —no se puede escribir ahí— sino en `user_program_overrides` (#617). Se
  // superpone aquí, en el único sitio por el que pasan todos los consumidores
  // del día: hacerlo en cada pantalla habría dejado la sesión progresando y las
  // tarjetas del programa mostrando lo viejo.
  //
  // `applyOverrides` devuelve el MISMO mapa si no hay nada que aplicar, que es
  // el caso normal, así que este `useMemo` no invalida nada para quien no ha
  // aceptado ninguna sugerencia.
  const { overrides } = useProgramOverrides(userId, activeProgramId)
  const effectiveWorkouts = useMemo(
    () => applyOverrides(workoutsMap, overrides),
    [workoutsMap, overrides],
  )

  const getWorkout = useCallback((phaseNumber: number, dayId: string): Workout | null => {
    const key = `p${phaseNumber}_${dayId}`
    if (Object.keys(effectiveWorkouts).length > 0) return effectiveWorkouts[key] || null
    return fallbackGetWorkout(phaseNumber, dayId as any)
  }, [effectiveWorkouts])

  const selectProgram = useCallback(async (programId: string): Promise<boolean> => {
    if (!userId) return false
    if (selectingRef.current) return false
    selectingRef.current = true
    try {
      let existing: RecordModel | null = null
      try {
        existing = await pb.collection('user_programs').getFirstListItem(
          pb.filter('user = {:uid} && program = {:pid}', { uid: userId, pid: programId }),
          { requestKey: null },
        )
      } catch { /* not found */ }
      // #579: `selected` solo si el activo cambia de verdad; `joined` solo al
      // crear el enrollment. Se decide ANTES de escribir en PB.
      const events = programSelectionEvents(existing ? { is_current: existing.is_current === true } : null)

      // Re-inscribirse reinicia `started_at`: la semana 1 empieza HOY, no en la
      // fecha en que se apuntó la primera vez (#616). Si no, quien retoma un
      // programa que abandonó hace tres meses vería «Semana 14 de 12».
      const enrollmentAfterSelect = existing
        ? await pb.collection('user_programs').update(existing.id, {
            is_current: true, status: 'active', ended_at: '',
            ...(existing.status === 'active' && existing.started_at ? {} : { started_at: nowLocalForPB(), current_phase: 0 }),
          })
        : await pb.collection('user_programs').create({
            user: userId, program: programId, started_at: nowLocalForPB(), is_current: true, status: 'active',
          })

      const currentList = await pb.collection('user_programs').getList(1, 100, {
        requestKey: null,
        filter: pb.filter('user = {:uid} && is_current = true && program != {:pid}', { uid: userId, pid: programId }),
      })
      await Promise.all(currentList.items.map(rec =>
        pb.collection('user_programs').update(rec.id, { is_current: false }),
      ))

      // Precargar el detail ANTES de voltear el enrollment: si la detail query
      // del nuevo programa nunca se fetcheó, programsReady caería a false y
      // App desmontaría el árbol entero hacia el AppLoader — en onboarding eso
      // resetea el wizard al paso 0 tras elegir programa.
      await qc.fetchQuery({
        queryKey: qk.programs.detail(programId),
        queryFn: () => fetchProgramDetail(programId),
        staleTime: 0,
      }).catch(() => { /* sin detail fresco seguimos: el enrollment ya está en PB */ })
      // El registro que acabamos de escribir/actualizar, con la forma de la
      // query: si aquí pusiéramos solo el id, `started_at` llegaría vacío y la
      // cabecera pintaría «sin empezar» hasta el siguiente refetch.
      qc.setQueryData(qk.programs.enrollment(userId), toEnrollment(enrollmentAfterSelect))

      const newActive = (qc.getQueryData<ProgramMeta[]>(qk.programs.catalog(userId)) || []).find(p => p.id === programId) || null
      if (events.selected) {
        op.track('program_selected', { program_id: programId, program_name: newActive?.name || '' })
      }
      if (events.joined) {
        trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.programJoined, {
          surface: 'programs',
          source: 'program_picker',
          program_id: programId,
          result: 'joined',
        })
      }
      return true
    } catch (e) {
      console.error('usePrograms: selectProgram error', e)
      return false
    } finally {
      selectingRef.current = false
    }
  }, [userId, qc])

  const abandonProgram = useCallback(async (programId: string): Promise<boolean> => {
    if (!userId) return false
    try {
      let upRecord: RecordModel | null = null
      try {
        upRecord = await pb.collection('user_programs').getFirstListItem(
          pb.filter('user = {:uid} && program = {:pid}', { uid: userId, pid: programId }),
          { requestKey: null },
        )
      } catch { /* not found */ }
      if (!upRecord) return false

      let sessionsCompleted = 0
      try {
        const sessionsRes = await pb.collection('sessions').getList(1, 1, {
          filter: pb.filter('user = {:uid} && program = {:pid}', { uid: userId, pid: programId }),
          $autoCancel: false,
        })
        sessionsCompleted = sessionsRes.totalItems
      } catch { /* ignore */ }

      await pb.collection('user_programs').update(upRecord.id, {
        status: 'abandoned', ended_at: nowLocalForPB(), is_current: false,
      })

      if (activeProgramId === programId) {
        qc.setQueryData(qk.programs.enrollment(userId), null)
      }

      op.track('program_abandoned', {
        program_id: programId,
        program_name: (qc.getQueryData<ProgramMeta[]>(qk.programs.catalog(userId)) || []).find(p => p.id === programId)?.name || '',
        sessions_completed: sessionsCompleted,
      })
      return true
    } catch (e) {
      console.error('usePrograms: abandonProgram error', e)
      return false
    }
  }, [userId, qc, activeProgramId])

  const duplicateProgram = useCallback(async (programId: string): Promise<string | null> => {
    if (!userId) return null
    // El id de la copia se guarda fuera del `try` porque es lo que hace falta para
    // deshacerla si algo revienta a medias (#614): borrar el programa nuevo
    // cascadea sobre fases, day-configs y ejercicios, así que un solo DELETE
    // limpia lo que hubiera entrado. Antes no había rollback ninguno y un fallo a
    // mitad del bucle dejaba una copia incompleta y viva en el catálogo.
    let newProgramId: string | null = null
    try {
      const original = await pb.collection('programs').getOne(programId)
      const newProgramData: Record<string, unknown> = {
        name: duplicatedName(original.name, i18n.language), description: original.description,
        duration_weeks: original.duration_weeks, is_active: true, created_by: userId,
      }
      if ('is_official' in original) newProgramData.is_official = false
      if ('is_featured' in original) newProgramData.is_featured = false
      // La copia nace privada aunque el original fuera público (#603): duplicar
      // el programa de otra persona no debe republicarlo a tu nombre.
      newProgramData.visibility = 'private'
      // De dónde salió (#620). Se guarda el id del programa que se está
      // copiando, NO su `forked_from`: una copia de una copia acredita a su
      // fuente directa, que es la que esa persona vio y eligió. Encadenar hasta
      // el original convertiría el crédito en una genealogía que nadie pidió y
      // borraría del mapa a quien de verdad hizo el trabajo intermedio.
      newProgramData.forked_from = programId
      if (original.difficulty) newProgramData.difficulty = original.difficulty
      const newProgram = await pb.collection('programs').create(newProgramData)
      newProgramId = newProgram.id

      // Las tres colecciones hijas se leen enteras y en paralelo. `getFullList`
      // en vez de los `getList(1, 20 / 200 / 2000)` de antes: eran topes mudos,
      // y un programa que los pasara se habría duplicado incompleto sin decirlo.
      const srcFilter = pb.filter('program = {:pid}', { pid: programId })
      const [srcPhases, srcDayConfigs, srcExercises] = await Promise.all([
        pb.collection('program_phases').getFullList({
          batch: CATALOG_PAGE_SIZE, filter: srcFilter, sort: 'sort_order', $autoCancel: false,
        }),
        // `program_day_config` se añadió después que el resto: un 404 aquí es
        // «este servidor no tiene la colección», no un error que deba abortar.
        pb.collection('program_day_config').getFullList({
          batch: CATALOG_PAGE_SIZE, filter: srcFilter, sort: 'phase_number,sort_order', $autoCancel: false,
        }).catch(() => [] as RecordModel[]),
        pb.collection('program_exercises').getFullList({
          batch: CATALOG_PAGE_SIZE, filter: srcFilter, sort: 'phase_number,sort_order', $autoCancel: false,
        }),
      ])

      // El orden importa: fases, luego day-configs, luego ejercicios. Es el que
      // tenía el código secuencial y el que conserva la API batch dentro del lote.
      const creates: BatchCreate[] = [
        ...srcPhases.map(p => ({
          collection: 'program_phases',
          data: {
            program: newProgram.id, phase_number: p.phase_number, name: p.name,
            weeks: p.weeks, color: p.color, bg_color: p.bg_color, sort_order: p.sort_order,
          } as Record<string, unknown>,
        })),
        ...srcDayConfigs.map(dc => {
          const data: Record<string, unknown> = {
            program: newProgram.id, phase_number: dc.phase_number, day_id: dc.day_id,
            day_name: dc.day_name, day_type: dc.day_type, day_focus: dc.day_focus,
            day_color: dc.day_color, sort_order: dc.sort_order,
          }
          // Los campos de cardio y de circuito solo se copian si venían puestos:
          // mandar un `circuit_rounds: 0` o un `cardio_activity_type: ''` no es lo
          // mismo que no mandarlo, y PocketBase rechaza el vacío en los enums.
          if (dc.cardio_activity_type) data.cardio_activity_type = dc.cardio_activity_type
          if (dc.cardio_target_distance_km) data.cardio_target_distance_km = dc.cardio_target_distance_km
          if (dc.cardio_target_duration_min) data.cardio_target_duration_min = dc.cardio_target_duration_min
          if (dc.circuit_mode) data.circuit_mode = dc.circuit_mode
          if (dc.circuit_rounds) data.circuit_rounds = dc.circuit_rounds
          if (dc.circuit_work_seconds) data.circuit_work_seconds = dc.circuit_work_seconds
          if (dc.circuit_rest_seconds) data.circuit_rest_seconds = dc.circuit_rest_seconds
          if (dc.circuit_rest_between_exercises) data.circuit_rest_between_exercises = dc.circuit_rest_between_exercises
          if (dc.circuit_rest_between_rounds) data.circuit_rest_between_rounds = dc.circuit_rest_between_rounds
          return { collection: 'program_day_config', data }
        }),
        ...srcExercises.map(e => ({
          collection: 'program_exercises',
          data: {
            program: newProgram.id, phase_number: e.phase_number, day_id: e.day_id,
            day_name: e.day_name, day_focus: e.day_focus, day_type: e.day_type, day_color: e.day_color,
            exercise_id: e.exercise_id, exercise_name: e.exercise_name, sets: e.sets, reps: e.reps,
            rest_seconds: e.rest_seconds, muscles: e.muscles, note: e.note, youtube: e.youtube,
            priority: e.priority, is_timer: e.is_timer, timer_seconds: e.timer_seconds,
            workout_title: e.workout_title, sort_order: e.sort_order, section: e.section || 'main',
          } as Record<string, unknown>,
        })),
      ]

      try {
        await createAllInBatches(creates)
      } catch (e) {
        if (!(e instanceof BatchUnavailableError)) throw e
        // Servidor sin `pb_migrations/1785100000_enable_batch_api.js` aplicada
        // (`/api/batch` devolvió 403 «Batch requests are not allowed.»).
        // Se copia como se copiaba antes —lento y sin transacción—, porque un
        // duplicado lento es mejor que un botón que no funciona. El rollback del
        // `catch` de fuera sigue cubriendo el fallo a mitad.
        console.warn('usePrograms: batch API disabled, falling back to sequential copy')
        for (const c of creates) await pb.collection(c.collection).create(c.data)
      }

      // Refrescamos el catálogo para incluir la copia.
      await qc.invalidateQueries({ queryKey: qk.programs.catalog(userId) })
      return newProgram.id
    } catch (e) {
      console.error('usePrograms: duplicateProgram error', e)
      if (newProgramId) {
        try {
          await pb.collection('programs').delete(newProgramId)
        } catch (cleanupError) {
          // Si ni el rollback sale, se registra: queda una copia a medias en el
          // catálogo y sin esta línea nadie sabría de dónde salió.
          console.error('usePrograms: duplicateProgram rollback failed, orphan program left behind', newProgramId, cleanupError)
        }
      }
      return null
    }
  }, [userId, qc])

  const deleteProgram = useCallback(async (programId: string): Promise<boolean> => {
    if (!userId) return false
    try {
      // Los ejercicios, los day-configs y las fases NO se borran desde aquí (#614).
      // Las tres colecciones declaran `program` como relación con
      // `cascadeDelete: true` —`1773251039_created_program_exercises.js:26`,
      // `1773251039_created_program_phases.js:26`,
      // `1774378002_created_program_day_config.js:28`, y ninguna migración
      // posterior lo cambia—, así que PocketBase ya se las lleva por delante
      // dentro de la transacción del DELETE del padre.
      //
      // Los bucles que había aquí (uno por fila: ~760 peticiones en el programa
      // más grande de la base) re-borraban filas que el servidor iba a borrar de
      // todas formas, y eran ELLOS los que abrían la ventana de «programa a medio
      // borrar»: si el navegador se cerraba a mitad, las hijas ya no estaban y el
      // padre seguía en el catálogo. Sin bucles no hay ventana que cerrar.
      //
      // Las inscripciones tampoco se tocan desde aqui (#605). El `deleteRule` de
      // `user_programs` es `user = @request.auth.id`: el bucle que había solo
      // borraba la fila del propio autor y las de los demás inscritos fallaban
      // con un 403 que el `catch` se tragaba, dejándoles un programa activo
      // apuntando a un registro inexistente. Ahora las cierra el servidor con
      // `$app` en `pb_hooks/programs_delete_cleanup.pb.js`, para TODOS los
      // inscritos.

      await pb.collection('programs').delete(programId)

      // Actualiza el catálogo en caché eliminando el programa borrado.
      const catalogNow = (qc.getQueryData<ProgramMeta[]>(qk.programs.catalog(userId)) || []).filter(p => p.id !== programId)
      qc.setQueryData(qk.programs.catalog(userId), catalogNow)

      if (activeProgramId === programId) {
        // Busca una inscripción activa del usuario en cualquier otro programa
        // (no en el catálogo global — el usuario podría no estar inscrito en esos).
        let nextEnrollmentProgramId: string | null = null
        try {
          const userEnrollments = await pb.collection('user_programs').getList(1, 1, {
            requestKey: null,
            filter: pb.filter('user = {:uid} && program != {:pid} && status = "active"', { uid: userId, pid: programId }),
            sort: '-started_at',
          })
          if (userEnrollments.items.length > 0) {
            nextEnrollmentProgramId = userEnrollments.items[0].program
          }
        } catch { /* sin inscripciones activas restantes */ }

        if (nextEnrollmentProgramId) {
          try {
            // Marcar esa inscripción como current en PB.
            const nextEnrollment = await pb.collection('user_programs').getFirstListItem(
              pb.filter('user = {:uid} && program = {:pid}', { uid: userId, pid: nextEnrollmentProgramId }),
              { requestKey: null },
            )
            await pb.collection('user_programs').update(nextEnrollment.id, { is_current: true, status: 'active', ended_at: '' })
            qc.setQueryData(qk.programs.enrollment(userId), toEnrollment(nextEnrollment))
          } catch (e) {
            console.warn('usePrograms: fallback de inscripción tras delete falló', e)
          }
        } else {
          // Sin inscripciones activas restantes: limpiar el programa activo.
          qc.setQueryData(qk.programs.enrollment(userId), null)
        }
      }
      return true
    } catch (e) {
      console.error('usePrograms: deleteProgram error', e)
      return false
    }
  }, [userId, qc, activeProgramId])

  const refreshPrograms = useCallback(async () => {
    if (!userId) return
    // La raíz del dominio (`['programs']`) cubre catalog, enrollment,
    // detail y detailView. Antes eran tres invalidaciones, una de ellas con la
    // clave literal `['programs', 'detail']`, que se quedaba corta en cuanto el
    // dominio ganaba una sub-clave — justo lo que pasó con `detailView` (#606).
    await qc.invalidateQueries({ queryKey: qk.programs.all })
  }, [userId, qc])

  return {
    programs,
    activeProgram,
    activeEnrollment,
    phases,
    weekDays,
    cardioDayConfigs,
    circuitDayConfigs,
    getWorkout,
    selectProgram,
    abandonProgram,
    duplicateProgram,
    deleteProgram,
    refreshPrograms,
    programsReady,
  }
}
