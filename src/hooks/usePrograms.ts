/**
 * usePrograms — manages program catalog + active program for a user.
 *
 * On mount (when userId is set and PocketBase is available):
 *   1. Fetches all programs from the `programs` collection (catalog)
 *   2. Finds the user's current program via `user_programs` (is_current = true)
 *   3. Fetches `program_phases` + `program_exercises` for the active program
 *   4. Builds in-memory WORKOUTS map, PHASES array, WEEK_DAYS array
 *
 * Falls back to hardcoded workouts.js when PocketBase is unavailable.
 *
 * Exposes:
 *   programs        — catalog array [{ id, name, description, duration_weeks }]
 *   activeProgram   — { id, name, description, duration_weeks } or null
 *   phases          — [{ id, name, weeks, color, bg }]
 *   weekDays        — [{ id, name, focus, type, color }]
 *   getWorkout      — (phaseNumber, dayId) => workout object or null
 *   selectProgram   — async (programId) => void
 *   programsReady   — boolean
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { RecordModel } from 'pocketbase'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import {
  PHASES as FALLBACK_PHASES,
  WEEK_DAYS as FALLBACK_WEEK_DAYS,
  getWorkout as fallbackGetWorkout,
} from '../data/workouts'
import type { Phase, WeekDay, Workout, WorkoutsMap, Exercise, ProgramMeta, DayId } from '../types'

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Build PHASES array from program_phases PB records.
 */
function buildPhases(phaseRecords: RecordModel[]): Phase[] {
  return [...phaseRecords]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(p => ({
      id:    p.phase_number,
      name:  p.name,
      weeks: p.weeks,
      color: p.color,
      bg:    p.bg_color,
    }))
}

/**
 * Build WEEK_DAYS array from program_exercises PB records.
 * Uses the first exercise record per day_id for metadata.
 */
function buildWeekDays(exerciseRecords: RecordModel[]): WeekDay[] {
  const ORDER: string[] = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']
  const seen: Record<string, WeekDay> = {}
  exerciseRecords.forEach(r => {
    if (!seen[r.day_id]) {
      seen[r.day_id] = {
        id:    r.day_id as DayId,
        name:  r.day_name,
        focus: r.day_focus,
        type:  r.day_type,
        color: r.day_color,
      }
    }
  })
  // also include rest days (sab/dom) even if they have no exercises — use defaults
  const defaults: Record<string, WeekDay> = {
    sab: { id: 'sab', name: 'Sábado',  focus: 'Caminata activa', type: 'rest', color: '#888899' },
    dom: { id: 'dom', name: 'Domingo', focus: 'Descanso total',  type: 'rest', color: '#888899' },
  }
  for (const id of ['sab', 'dom']) {
    if (!seen[id]) seen[id] = defaults[id]
  }
  return ORDER.map(id => seen[id]).filter(Boolean)
}

/**
 * Build WORKOUTS map from program_exercises PB records.
 * Shape: { 'p1_lun': { phase, day, title, exercises: [...] }, ... }
 */
function buildWorkoutsMap(exerciseRecords: RecordModel[]): WorkoutsMap {
  const map: WorkoutsMap = {}
  exerciseRecords.forEach(r => {
    const key = `p${r.phase_number}_${r.day_id}`
    if (!map[key]) {
      map[key] = {
        phase: r.phase_number,
        day:   r.day_id as DayId,
        title: r.workout_title,
        exercises: [],
      }
    }
    map[key].exercises.push({
      id:           r.exercise_id,
      name:         r.exercise_name,
      sets:         r.sets,
      reps:         r.reps,
      rest:         r.rest_seconds,
      muscles:      r.muscles,
      note:         r.note,
      youtube:      r.youtube,
      priority:     r.priority,
      isTimer:      r.is_timer,
      timerSeconds: r.timer_seconds,
    } as Exercise)
  })
  // Sort exercises by sort_order (stored in the full record list order from PB)
  // PB already returns them in insertion order (sort_order), but just in case:
  Object.values(map).forEach(w => {
    w.exercises.sort((_a, _b) => {
      // We don't have sort_order in the mapped shape, but PB returns them in order
      return 0
    })
  })
  return map
}

// ─── hook types ──────────────────────────────────────────────────────────────

interface UseProgramsReturn {
  programs: ProgramMeta[]
  activeProgram: ProgramMeta | null
  phases: Phase[]
  weekDays: WeekDay[]
  getWorkout: (phaseNumber: number, dayId: string) => Workout | null
  selectProgram: (programId: string) => Promise<void>
  programsReady: boolean
}

// ─── hook ────────────────────────────────────────────────────────────────────

export function usePrograms(userId: string | null = null): UseProgramsReturn {
  const [programs, setPrograms]           = useState<ProgramMeta[]>([])
  const [activeProgram, setActiveProgram] = useState<ProgramMeta | null>(null)
  const [phases, setPhases]               = useState<Phase[]>(FALLBACK_PHASES)
  const [weekDays, setWeekDays]           = useState<WeekDay[]>(FALLBACK_WEEK_DAYS)
  const [workoutsMap, setWorkoutsMap]     = useState<WorkoutsMap>({})
  const [programsReady, setProgramsReady] = useState(false)
  const [usePB, setUsePB]                 = useState(false)

  const initialized = useRef(false)
  const lastUserId  = useRef<string | null>(null)

  // ── reset on user change ──────────────────────────────────────────────────
  useEffect(() => {
    if (lastUserId.current !== userId) {
      lastUserId.current = userId
      initialized.current = false
      setPrograms([])
      setActiveProgram(null)
      setPhases(FALLBACK_PHASES)
      setWeekDays(FALLBACK_WEEK_DAYS)
      setWorkoutsMap({})
      setProgramsReady(false)
    }

    if (initialized.current) return
    initialized.current = true

    const init = async () => {
      if (!userId) {
        // Not logged in — use fallback, mark ready immediately
        setProgramsReady(true)
        return
      }

      const available = await isPocketBaseAvailable()
      setUsePB(available)

      if (!available) {
        setProgramsReady(true)
        return
      }

      try {
        await loadFromPB(userId)
      } catch (e) {
        console.error('usePrograms: PB load error, falling back', e)
        // fallback values already set
      }
      setProgramsReady(true)
    }

    init()
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── loadFromPB ───────────────────────────────────────────────────────────
  const loadFromPB = async (uid: string): Promise<void> => {
    // 1. Fetch program catalog
    const catalogRes = await pb.collection('programs').getList(1, 100, {
      filter: 'is_active = true',
      sort: 'name',
    })
    const catalog: ProgramMeta[] = catalogRes.items.map(p => ({
      id:             p.id,
      name:           p.name,
      description:    p.description,
      duration_weeks: p.duration_weeks,
    }))
    setPrograms(catalog)

    // 2. Find user's current program
    let userProgramRecord: RecordModel | null = null
    try {
      userProgramRecord = await pb.collection('user_programs').getFirstListItem(
        pb.filter('user = {:uid} && is_current = true', { uid })
      )
    } catch {
      // No current program yet — auto-enroll in first active program if available
      if (catalog.length > 0) {
        userProgramRecord = await pb.collection('user_programs').create({
          user:       uid,
          program:    catalog[0].id,
          started_at: new Date().toISOString().replace('T', ' '),
          is_current: true,
        })
      }
    }

    if (!userProgramRecord) {
      // No programs available at all
      return
    }

    const activeProgramMeta = catalog.find(p => p.id === userProgramRecord!.program) || null
    setActiveProgram(activeProgramMeta)

    // 3. Fetch phases + exercises for the active program
    await loadProgramData(userProgramRecord.program)
  }

  // ── loadProgramData ──────────────────────────────────────────────────────
  const loadProgramData = async (programId: string): Promise<void> => {
    const [phasesRes, exercisesRes] = await Promise.all([
      pb.collection('program_phases').getList(1, 20, {
        filter: pb.filter('program = {:pid}', { pid: programId }),
        sort:   'sort_order',
      }),
      pb.collection('program_exercises').getList(1, 2000, {
        filter: pb.filter('program = {:pid}', { pid: programId }),
        sort:   'phase_number,sort_order',
      }),
    ])

    const builtPhases  = buildPhases(phasesRes.items)
    const builtDays    = buildWeekDays(exercisesRes.items)
    const builtWorkouts = buildWorkoutsMap(exercisesRes.items)

    if (builtPhases.length > 0)    setPhases(builtPhases)
    if (builtDays.length > 0)      setWeekDays(builtDays)
    if (Object.keys(builtWorkouts).length > 0) setWorkoutsMap(builtWorkouts)
  }

  // ── getWorkout ───────────────────────────────────────────────────────────
  const getWorkout = useCallback((phaseNumber: number, dayId: string): Workout | null => {
    const key = `p${phaseNumber}_${dayId}`
    // If we have PB data, use it; otherwise fall back to hardcoded
    if (Object.keys(workoutsMap).length > 0) {
      return workoutsMap[key] || null
    }
    return fallbackGetWorkout(phaseNumber, dayId as any)
  }, [workoutsMap])

  // ── selectProgram ────────────────────────────────────────────────────────
  const selectProgram = useCallback(async (programId: string): Promise<void> => {
    if (!usePB || !userId) return

    try {
      // Unset current program(s)
      const currentList = await pb.collection('user_programs').getList(1, 100, {
        filter: pb.filter('user = {:uid} && is_current = true', { uid: userId }),
      })
      for (const rec of currentList.items) {
        await pb.collection('user_programs').update(rec.id, { is_current: false })
      }

      // Create (or re-use) entry for new program
      let existing: RecordModel | null = null
      try {
        existing = await pb.collection('user_programs').getFirstListItem(
          pb.filter('user = {:uid} && program = {:pid}', { uid: userId, pid: programId })
        )
      } catch { /* not found */ }

      if (existing) {
        await pb.collection('user_programs').update(existing.id, { is_current: true })
      } else {
        await pb.collection('user_programs').create({
          user:       userId,
          program:    programId,
          started_at: new Date().toISOString().replace('T', ' '),
          is_current: true,
        })
      }

      // Update local state
      const newActive = programs.find(p => p.id === programId) || null
      setActiveProgram(newActive)

      // Reload exercises/phases for new program
      await loadProgramData(programId)
    } catch (e) {
      console.error('usePrograms: selectProgram error', e)
    }
  }, [usePB, userId, programs]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    programs,
    activeProgram,
    phases,
    weekDays,
    getWorkout,
    selectProgram,
    programsReady,
  }
}
