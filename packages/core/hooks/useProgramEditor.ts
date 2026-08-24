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
import type { DayType, Exercise, ProgramVisibility } from '../types'

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
  }
  phases: EditorPhase[]
  days: Record<string, EditorDay>  // key: "phaseIndex_dayId"
  isDirty: boolean
  isSaving: boolean
  error: string | null
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_PHASES: EditorPhase[] = [
  { name: 'Base & Activación',     weeks: '1-6',   color: '#c8f542', bgColor: 'rgba(200,245,66,0.08)' },
  { name: 'Fuerza Fundamental',    weeks: '7-13',  color: '#42c8f5', bgColor: 'rgba(66,200,245,0.08)' },
  { name: 'Intensidad & Skills',   weeks: '14-20', color: '#f542c8', bgColor: 'rgba(245,66,200,0.08)' },
  { name: 'Peak & Consolidación',  weeks: '21-26', color: '#f5c842', bgColor: 'rgba(245,200,66,0.08)' },
]

// Color palette for phases beyond the 4 defaults
const EXTRA_PHASE_COLORS: Array<{ color: string; bgColor: string }> = [
  { color: '#f54242', bgColor: 'rgba(245,66,66,0.08)' },
  { color: '#42f5a8', bgColor: 'rgba(66,245,168,0.08)' },
  { color: '#a842f5', bgColor: 'rgba(168,66,245,0.08)' },
  { color: '#f5a842', bgColor: 'rgba(245,168,66,0.08)' },
]

const MAX_PHASES = 8

const DAY_DEFAULTS: { dayId: string; dayName: string; focus: string; type: string; color: string }[] = [
  { dayId: 'lun', dayName: 'Lunes',     focus: 'Empuje + Core',       type: 'push',   color: '#c8f542' },
  { dayId: 'mar', dayName: 'Martes',    focus: 'Tirón + Movilidad',   type: 'pull',   color: '#42c8f5' },
  { dayId: 'mie', dayName: 'Miércoles', focus: 'Lumbar + Stretching', type: 'lumbar', color: '#f54242' },
  { dayId: 'jue', dayName: 'Jueves',    focus: 'Piernas + Glúteos',   type: 'legs',   color: '#f542c8' },
  { dayId: 'vie', dayName: 'Viernes',   focus: 'Full Body + Core',    type: 'full',   color: '#f5c842' },
  { dayId: 'sab', dayName: i18n.t('day.saturday'),    focus: i18n.t('day.activeWalk'),     type: 'rest',   color: '#888899' },
  { dayId: 'dom', dayName: i18n.t('day.sunday'),   focus: i18n.t('day.totalRest'),      type: 'rest',   color: '#888899' },
]

function buildDefaultDays(phaseCount: number): Record<string, EditorDay> {
  const days: Record<string, EditorDay> = {}
  for (let pi = 0; pi < phaseCount; pi++) {
    for (const d of DAY_DEFAULTS) {
      days[`${pi}_${d.dayId}`] = { ...d, exercises: [] }
    }
  }
  return days
}

function createInitialState(): ProgramEditorState {
  return {
    programId: null,
    step: 1,
    info: { name: '', description: '', durationWeeks: 26, isOfficial: false, visibility: 'private', difficulty: 'beginner' },
    phases: [...DEFAULT_PHASES],
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
      const extraIdx = Math.max(0, s.phases.length - DEFAULT_PHASES.length) % EXTRA_PHASE_COLORS.length
      const { color, bgColor } = s.phases.length < DEFAULT_PHASES.length
        ? DEFAULT_PHASES[s.phases.length]
        : EXTRA_PHASE_COLORS[extraIdx]
      const newPhase: EditorPhase = { name: `Fase ${s.phases.length + 1}`, weeks: '', color, bgColor }
      const newPhases = [...s.phases, newPhase]
      const ranges = distributeWeeks(s.info.durationWeeks, newPhases.length)
      const redistributed = newPhases.map((p, i) => ({ ...p, weeks: ranges[i] }))
      const newDays = { ...s.days }
      const pi = newPhases.length - 1
      for (const d of DAY_DEFAULTS) {
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
      for (let i = 0; i < s.phases.length; i++) {
        if (i === index) continue
        for (const d of DAY_DEFAULTS) {
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
      const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
      if (toIndex < 0 || toIndex >= day.exercises.length) return s
      const exercises = [...day.exercises]
      const temp = exercises[fromIndex]
      exercises[fromIndex] = exercises[toIndex]
      exercises[toIndex] = temp
      return { ...s, days: { ...s.days, [dayKey]: { ...day, exercises } }, isDirty: true }
    })
  }, [])

  // ── Validation ──────────────────────────────────────────────────────────────
  const validate = useCallback((step: number): string | null => {
    if (step === 1) {
      if (!state.info.name.trim()) return i18n.t('programEditor.nameRequired')
      if (state.info.durationWeeks < 1) return i18n.t('programEditor.minOneWeek')
    }
    if (step === 2) {
      for (let i = 0; i < state.phases.length; i++) {
        if (!state.phases[i].name.trim()) return i18n.t('programEditor.phaseNeedsName', { n: i + 1 })
        if (!state.phases[i].weeks.trim()) return i18n.t('programEditor.phaseNeedsWeeks', { n: i + 1 })
      }
    }
    return null
  }, [state.info, state.phases])

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
      for (let pi = 0; pi < loadedPhases.length; pi++) {
        for (const d of DAY_DEFAULTS) {
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
          // 1784900000 las dejó en `public`, así que un vacío aquí solo puede
          // venir de un cliente viejo que creó el programa sin mandarlo: se
          // trata como privado, que es la dirección segura.
          visibility: (program.visibility as ProgramVisibility) || 'private',
          difficulty: program.difficulty || 'beginner',
        },
        phases: loadedPhases.length > 0 ? loadedPhases : [...DEFAULT_PHASES],
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
      }
      // Only set created_by on new programs — don't overwrite ownership on edit
      if (!state.programId) {
        programData.created_by = userId
      }
      // Only include SaaS fields if they have non-default values (avoids errors if PB migration not applied)
      if (state.info.isOfficial) programData.is_official = true
      if (state.info.difficulty && state.info.difficulty !== 'beginner') programData.difficulty = state.info.difficulty

      if (programId) {
        await pb.collection('programs').update(programId, programData)
      } else {
        const created = await pb.collection('programs').create(programData)
        programId = created.id
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
            desiredExercises.push({
              key: exerciseKey(pi + 1, day.dayId, ex.exerciseId, occurrence),
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

      setState(s => ({ ...s, programId, isSaving: false, isDirty: false }))
      // Refresca todo el dominio de programas (catálogo, inscripción y las DOS
      // claves de detalle: `detail` de usePrograms y `detailView` de
      // useProgramDetail, #606) y la caché de edición, que es un dominio aparte.
      qc.invalidateQueries({ queryKey: qk.programs.all })
      if (programId) qc.invalidateQueries({ queryKey: qk.programEditor(programId) })
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
    loadProgram,
    saveProgram,
    validate,
    resetEditor,
  }
}
