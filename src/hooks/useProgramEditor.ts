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
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { PHASES as FALLBACK_PHASES, WEEK_DAYS as FALLBACK_WEEK_DAYS, WORKOUTS } from '../data/workouts'

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
}

export interface ProgramEditorState {
  programId: string | null
  step: number
  info: {
    name: string
    description: string
    durationWeeks: number
    isOfficial: boolean
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

const DAY_DEFAULTS: { dayId: string; dayName: string; focus: string; type: string; color: string }[] = [
  { dayId: 'lun', dayName: 'Lunes',     focus: 'Empuje + Core',       type: 'push',   color: '#c8f542' },
  { dayId: 'mar', dayName: 'Martes',    focus: 'Tirón + Movilidad',   type: 'pull',   color: '#42c8f5' },
  { dayId: 'mie', dayName: 'Miércoles', focus: 'Lumbar + Stretching', type: 'lumbar', color: '#f54242' },
  { dayId: 'jue', dayName: 'Jueves',    focus: 'Piernas + Glúteos',   type: 'legs',   color: '#f542c8' },
  { dayId: 'vie', dayName: 'Viernes',   focus: 'Full Body + Core',    type: 'full',   color: '#f5c842' },
  { dayId: 'sab', dayName: 'Sábado',    focus: 'Caminata activa',     type: 'rest',   color: '#888899' },
  { dayId: 'dom', dayName: 'Domingo',   focus: 'Descanso total',      type: 'rest',   color: '#888899' },
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
    info: { name: '', description: '', durationWeeks: 26, isOfficial: false, difficulty: 'beginner' },
    phases: [...DEFAULT_PHASES],
    days: buildDefaultDays(4),
    isDirty: false,
    isSaving: false,
    error: null,
  }
}

let _idCounter = 0
function genId(): string {
  _idCounter++
  return `ex_${Date.now()}_${_idCounter}`
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useProgramEditor() {
  const [state, setState] = useState<ProgramEditorState>(createInitialState)

  // ── Step navigation ────────────────────────────────────────────────────────
  const setStep = useCallback((step: number) => {
    setState(s => ({ ...s, step, error: null }))
  }, [])

  // ── Info ────────────────────────────────────────────────────────────────────
  const updateInfo = useCallback((info: Partial<ProgramEditorState['info']>) => {
    setState(s => ({ ...s, info: { ...s.info, ...info }, isDirty: true }))
  }, [])

  // ── Phases ──────────────────────────────────────────────────────────────────
  const addPhase = useCallback(() => {
    setState(s => {
      if (s.phases.length >= 4) return s
      const newPhase: EditorPhase = { name: `Fase ${s.phases.length + 1}`, weeks: '', color: '#c8f542', bgColor: 'rgba(200,245,66,0.08)' }
      const newPhases = [...s.phases, newPhase]
      const newDays = { ...s.days }
      const pi = newPhases.length - 1
      for (const d of DAY_DEFAULTS) {
        newDays[`${pi}_${d.dayId}`] = { ...d, exercises: [] }
      }
      return { ...s, phases: newPhases, days: newDays, isDirty: true }
    })
  }, [])

  const removePhase = useCallback((index: number) => {
    setState(s => {
      if (s.phases.length <= 1) return s
      const newPhases = s.phases.filter((_, i) => i !== index)
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
      return { ...s, phases: newPhases, days: newDays, isDirty: true }
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
      return { ...s, days: { ...s.days, [key]: { ...day, ...data } }, isDirty: true }
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
      if (!state.info.name.trim()) return 'El nombre del programa es obligatorio'
      if (state.info.durationWeeks < 1) return 'La duración debe ser al menos 1 semana'
    }
    if (step === 2) {
      for (let i = 0; i < state.phases.length; i++) {
        if (!state.phases[i].name.trim()) return `La fase ${i + 1} necesita un nombre`
        if (!state.phases[i].weeks.trim()) return `La fase ${i + 1} necesita las semanas`
      }
    }
    return null
  }, [state.info, state.phases])

  // ── Load program from PB ───────────────────────────────────────────────────
  const loadProgram = useCallback(async (programId: string) => {
    const available = await isPocketBaseAvailable()
    if (!available) return

    try {
      const program = await pb.collection('programs').getOne(programId)
      const [phasesRes, exercisesRes] = await Promise.all([
        pb.collection('program_phases').getList(1, 20, {
          filter: pb.filter('program = {:pid}', { pid: programId }),
          sort: 'sort_order',
        }),
        pb.collection('program_exercises').getList(1, 2000, {
          filter: pb.filter('program = {:pid}', { pid: programId }),
          sort: 'phase_number,sort_order',
        }),
      ])

      const loadedPhases: EditorPhase[] = phasesRes.items
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(p => ({
          name: p.name,
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
        // Update day metadata from first record
        days[key].dayName = r.day_name
        days[key].focus = r.day_focus
        days[key].type = r.day_type
        days[key].color = r.day_color

        days[key].exercises.push({
          exerciseId: r.exercise_id,
          name: r.exercise_name,
          sets: r.sets,
          reps: r.reps,
          rest: r.rest_seconds,
          muscles: r.muscles,
          note: r.note,
          youtube: r.youtube,
          priority: r.priority,
          isTimer: r.is_timer || false,
          timerSeconds: r.timer_seconds || 0,
        })
      }

      setState({
        programId,
        step: 1,
        info: {
          name: program.name,
          description: program.description || '',
          durationWeeks: program.duration_weeks || 26,
          isOfficial: program.is_official || false,
          difficulty: program.difficulty || 'beginner',
        },
        phases: loadedPhases.length > 0 ? loadedPhases : [...DEFAULT_PHASES],
        days,
        isDirty: false,
        isSaving: false,
        error: null,
      })
    } catch (e) {
      console.error('useProgramEditor: loadProgram error', e)
      setState(s => ({ ...s, error: 'Error al cargar el programa' }))
    }
  }, [])

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

      // Create or update the program record
      const programData = {
        name: state.info.name,
        description: state.info.description,
        duration_weeks: state.info.durationWeeks,
        is_active: true,
        created_by: userId,
        is_official: state.info.isOfficial,
        difficulty: state.info.difficulty,
      }

      if (programId) {
        await pb.collection('programs').update(programId, programData)
      } else {
        const created = await pb.collection('programs').create(programData)
        programId = created.id
      }

      // Delete existing phases and exercises for this program
      try {
        const existingPhases = await pb.collection('program_phases').getList(1, 50, {
          filter: pb.filter('program = {:pid}', { pid: programId }),
        })
        for (const p of existingPhases.items) {
          await pb.collection('program_phases').delete(p.id)
        }
      } catch { /* no existing phases */ }

      try {
        const existingExercises = await pb.collection('program_exercises').getList(1, 2000, {
          filter: pb.filter('program = {:pid}', { pid: programId }),
        })
        for (const e of existingExercises.items) {
          await pb.collection('program_exercises').delete(e.id)
        }
      } catch { /* no existing exercises */ }

      // Create phases
      for (let pi = 0; pi < state.phases.length; pi++) {
        const phase = state.phases[pi]
        await pb.collection('program_phases').create({
          program: programId,
          phase_number: pi + 1,
          name: phase.name,
          weeks: phase.weeks,
          color: phase.color,
          bg_color: phase.bgColor,
          sort_order: pi + 1,
        })
      }

      // Create exercises
      let sortOrder = 0
      for (let pi = 0; pi < state.phases.length; pi++) {
        for (const dayDef of DAY_DEFAULTS) {
          const dayKey = `${pi}_${dayDef.dayId}`
          const day = state.days[dayKey]
          if (!day || day.exercises.length === 0) continue

          for (const ex of day.exercises) {
            sortOrder++
            await pb.collection('program_exercises').create({
              program: programId,
              phase_number: pi + 1,
              day_id: day.dayId,
              day_name: day.dayName,
              day_focus: day.focus,
              day_type: day.type,
              day_color: day.color,
              exercise_id: ex.exerciseId,
              exercise_name: ex.name,
              sets: ex.sets,
              reps: ex.reps,
              rest_seconds: ex.rest,
              muscles: ex.muscles,
              note: ex.note,
              youtube: ex.youtube,
              priority: ex.priority,
              is_timer: ex.isTimer,
              timer_seconds: ex.timerSeconds,
              workout_title: `${day.focus}`,
              sort_order: sortOrder,
            })
          }
        }
      }

      setState(s => ({ ...s, programId, isSaving: false, isDirty: false }))
      return programId
    } catch (e) {
      console.error('useProgramEditor: saveProgram error', e)
      setState(s => ({ ...s, isSaving: false, error: 'Error al guardar el programa' }))
      return null
    }
  }, [state.programId, state.info, state.phases, state.days])

  // ── Reset ──────────────────────────────────────────────────────────────────
  const resetEditor = useCallback(() => {
    setState(createInitialState())
  }, [])

  return {
    state,
    setStep,
    updateInfo,
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
