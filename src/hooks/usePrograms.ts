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
import { nowLocalForPB } from '../lib/dateUtils'
import type { Phase, WeekDay, Workout, WorkoutsMap, Exercise, ProgramMeta, DayId, CardioDayConfig, CardioActivityType } from '../types'
import i18n from '../lib/i18n'
import { localize } from '../lib/i18n-db'

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Build PHASES array from program_phases PB records.
 */
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
 * Build WEEK_DAYS array from program_exercises PB records.
 * Uses day config records as primary source when available, falls back to exercise records.
 */
function buildWeekDays(exerciseRecords: RecordModel[], dayConfigRecords: RecordModel[] = []): WeekDay[] {
  const ORDER: string[] = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']
  const locale = i18n.language
  const seen: Record<string, WeekDay> = {}

  // Primary source: day config records
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
      seen[dc.day_id] = day
    }
  })

  // Fallback: exercise records for days not covered by day config
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
  return ORDER.map(id => seen[id]).filter(Boolean)
}

/**
 * Build cardio day configs keyed by "p{phase}_{dayId}".
 */
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
 * Build WORKOUTS map from program_exercises PB records.
 * Shape: { 'p1_lun': { phase, day, title, exercises: [...] }, ... }
 */
function buildWorkoutsMap(exerciseRecords: RecordModel[]): WorkoutsMap {
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
    map[key].exercises.push({
      id:           r.exercise_id,
      name:         localize(r.exercise_name, locale),
      sets:         r.sets,
      reps:         r.reps,
      rest:         r.rest_seconds,
      muscles:      localize(r.muscles, locale),
      note:         localize(r.note, locale),
      youtube:      r.youtube,
      priority:     r.priority,
      isTimer:      r.is_timer,
      timerSeconds: r.timer_seconds,
      pbRecordId:   r.id,
      demoImages:   r.demo_images || [],
      demoVideo:    r.demo_video || '',
      section:      (r.section || 'main') as Exercise['section'],
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
  cardioDayConfigs: Record<string, CardioDayConfig>
  getWorkout: (phaseNumber: number, dayId: string) => Workout | null
  selectProgram: (programId: string) => Promise<boolean>
  duplicateProgram: (programId: string) => Promise<string | null>
  deleteProgram: (programId: string) => Promise<boolean>
  refreshPrograms: () => Promise<void>
  programsReady: boolean
}

// ─── hook ────────────────────────────────────────────────────────────────────

export function usePrograms(userId: string | null = null): UseProgramsReturn {
  const [programs, setPrograms]           = useState<ProgramMeta[]>([])
  const [activeProgram, setActiveProgram] = useState<ProgramMeta | null>(null)
  const [phases, setPhases]               = useState<Phase[]>(FALLBACK_PHASES)
  const [weekDays, setWeekDays]           = useState<WeekDay[]>(FALLBACK_WEEK_DAYS)
  const [workoutsMap, setWorkoutsMap]     = useState<WorkoutsMap>({})
  const [cardioDayConfigs, setCardioDayConfigs] = useState<Record<string, CardioDayConfig>>({})
  const [programsReady, setProgramsReady] = useState(false)
  const [usePB, setUsePB]                 = useState(false)

  const initialized = useRef(false)
  const lastUserId  = useRef<string | null>(null)
  const selectingRef = useRef(false)
  const programsRef = useRef<ProgramMeta[]>([])

  // Keep programsRef in sync so selectProgram always reads latest
  useEffect(() => { programsRef.current = programs }, [programs])

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
      setCardioDayConfigs({})
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
      } catch (e: any) {
        if (e?.code === 0) return // auto-cancelled, ignore
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
      expand: 'created_by',
      $autoCancel: false,
    })
    const locale = i18n.language
    // Fetch day configs for all programs to determine discipline (yoga vs calistenia)
    const programIds = catalogRes.items.map(p => p.id)
    let allDayConfigs: RecordModel[] = []
    if (programIds.length > 0) {
      try {
        const dcRes = await pb.collection('program_day_config').getList(1, 2000, {
          filter: programIds.map(id => pb.filter('program = {:id}', { id })).join(' || '),
          fields: 'program,day_type',
          $autoCancel: false,
        })
        allDayConfigs = dcRes.items
      } catch { /* ignore — discipline defaults to calistenia */ }
    }
    const disciplineByProgram = new Map<string, 'yoga' | 'calistenia'>()
    for (const pid of programIds) {
      const days = allDayConfigs.filter(dc => dc.program === pid)
      const nonRest = days.filter(dc => dc.day_type !== 'rest')
      disciplineByProgram.set(pid, nonRest.length > 0 && nonRest.every(dc => dc.day_type === 'yoga') ? 'yoga' : 'calistenia')
    }

    const catalog: ProgramMeta[] = catalogRes.items.map(p => ({
      id:             p.id,
      name:           localize(p.name, locale),
      description:    localize(p.description, locale),
      duration_weeks: p.duration_weeks,
      created_by:     p.created_by || undefined,
      created_by_name: (p.expand as any)?.created_by?.display_name || undefined,
      is_official:    p.is_official || false,
      is_featured:    p.is_featured || false,
      difficulty:     p.difficulty || 'beginner',
      cover_image:    p.cover_image || undefined,
      cover_image_url: p.cover_image ? pb.files.getURL(p, p.cover_image, { thumb: '400x0' }) : undefined,
      discipline:     disciplineByProgram.get(p.id) || 'calistenia',
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
          started_at: nowLocalForPB(),
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
    const filter = pb.filter('program = {:pid}', { pid: programId })
    const [phasesRes, exercisesRes, dayConfigRes] = await Promise.all([
      pb.collection('program_phases').getList(1, 20, {
        filter,
        sort:   'sort_order',
        $autoCancel: false,
      }),
      pb.collection('program_exercises').getList(1, 2000, {
        filter,
        sort:   'phase_number,sort_order',
        $autoCancel: false,
      }),
      pb.collection('program_day_config').getList(1, 200, {
        filter,
        sort:   'phase_number,sort_order',
        $autoCancel: false,
      }).catch((e: any) => {
        if (e?.status !== 404) console.warn('usePrograms: day config fetch failed', e)
        return { items: [] }
      }),
    ])

    const builtPhases  = buildPhases(phasesRes.items)
    const builtDays    = buildWeekDays(exercisesRes.items, dayConfigRes.items)
    const builtWorkouts = buildWorkoutsMap(exercisesRes.items)
    const builtCardioConfigs = buildCardioDayConfigs(dayConfigRes.items)

    if (builtPhases.length > 0)    setPhases(builtPhases)
    if (builtDays.length > 0)      setWeekDays(builtDays)
    if (Object.keys(builtWorkouts).length > 0) setWorkoutsMap(builtWorkouts)
    setCardioDayConfigs(builtCardioConfigs)
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
  const selectProgram = useCallback(async (programId: string): Promise<boolean> => {
    if (!usePB || !userId) return false
    if (selectingRef.current) return false
    selectingRef.current = true

    try {
      // 1. Set new program current FIRST (safe: a mid-failure leaves 2 current
      //    records rather than 0, resolved on next load)
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
          started_at: nowLocalForPB(),
          is_current: true,
        })
      }

      // 2. Unset old current program(s) in parallel
      const currentList = await pb.collection('user_programs').getList(1, 100, {
        filter: pb.filter('user = {:uid} && is_current = true && program != {:pid}', { uid: userId, pid: programId }),
      })
      await Promise.all(
        currentList.items.map(rec =>
          pb.collection('user_programs').update(rec.id, { is_current: false })
        )
      )

      // 3. Update local state (use ref to avoid stale closure)
      const newActive = programsRef.current.find(p => p.id === programId) || null
      setActiveProgram(newActive)

      // 4. Reload exercises/phases for new program
      await loadProgramData(programId)
      return true
    } catch (e) {
      console.error('usePrograms: selectProgram error', e)
      return false
    } finally {
      selectingRef.current = false
    }
  }, [usePB, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── duplicateProgram ──────────────────────────────────────────────────────
  const duplicateProgram = useCallback(async (programId: string): Promise<string | null> => {
    if (!usePB || !userId) return null

    try {
      // 1. Fetch original program
      const original = await pb.collection('programs').getOne(programId)

      // 2. Create new program (copy) — duplicates are always personal, not official
      // Only include SaaS fields if they exist on the original (avoids errors if PB migration not applied)
      const newProgramData: Record<string, unknown> = {
        name:           `${original.name} (copia)`,
        description:    original.description,
        duration_weeks: original.duration_weeks,
        is_active:      true,
        created_by:     userId,
      }
      if ('is_official' in original) newProgramData.is_official = false
      if ('is_featured' in original) newProgramData.is_featured = false
      if (original.difficulty) newProgramData.difficulty = original.difficulty
      const newProgram = await pb.collection('programs').create(newProgramData)

      // 3. Copy phases
      const phasesRes = await pb.collection('program_phases').getList(1, 20, {
        filter: pb.filter('program = {:pid}', { pid: programId }),
        sort:   'sort_order',
      })
      for (const p of phasesRes.items) {
        await pb.collection('program_phases').create({
          program:      newProgram.id,
          phase_number: p.phase_number,
          name:         p.name,
          weeks:        p.weeks,
          color:        p.color,
          bg_color:     p.bg_color,
          sort_order:   p.sort_order,
        })
      }

      // 4. Copy day config
      try {
        const dayConfigRes = await pb.collection('program_day_config').getList(1, 200, {
          filter: pb.filter('program = {:pid}', { pid: programId }),
          sort: 'phase_number,sort_order',
        })
        for (const dc of dayConfigRes.items) {
          const data: Record<string, unknown> = {
            program:      newProgram.id,
            phase_number: dc.phase_number,
            day_id:       dc.day_id,
            day_name:     dc.day_name,
            day_type:     dc.day_type,
            day_focus:    dc.day_focus,
            day_color:    dc.day_color,
            sort_order:   dc.sort_order,
          }
          if (dc.cardio_activity_type) data.cardio_activity_type = dc.cardio_activity_type
          if (dc.cardio_target_distance_km) data.cardio_target_distance_km = dc.cardio_target_distance_km
          if (dc.cardio_target_duration_min) data.cardio_target_duration_min = dc.cardio_target_duration_min
          await pb.collection('program_day_config').create(data)
        }
      } catch { /* no day config to copy */ }

      // 5. Copy exercises
      const exercisesRes = await pb.collection('program_exercises').getList(1, 2000, {
        filter: pb.filter('program = {:pid}', { pid: programId }),
        sort:   'phase_number,sort_order',
      })
      for (const e of exercisesRes.items) {
        await pb.collection('program_exercises').create({
          program:       newProgram.id,
          phase_number:  e.phase_number,
          day_id:        e.day_id,
          day_name:      e.day_name,
          day_focus:     e.day_focus,
          day_type:      e.day_type,
          day_color:     e.day_color,
          exercise_id:   e.exercise_id,
          exercise_name: e.exercise_name,
          sets:          e.sets,
          reps:          e.reps,
          rest_seconds:  e.rest_seconds,
          muscles:       e.muscles,
          note:          e.note,
          youtube:       e.youtube,
          priority:      e.priority,
          is_timer:      e.is_timer,
          timer_seconds: e.timer_seconds,
          workout_title: e.workout_title,
          sort_order:    e.sort_order,
          section:       e.section || 'main',
        })
      }

      // 6. Update local programs list
      const locale = i18n.language
      const newMeta: ProgramMeta = {
        id:             newProgram.id,
        name:           localize(newProgram.name, locale),
        description:    localize(newProgram.description, locale),
        duration_weeks: newProgram.duration_weeks,
      }
      setPrograms(prev => [...prev, newMeta])

      return newProgram.id
    } catch (e) {
      console.error('usePrograms: duplicateProgram error', e)
      return null
    }
  }, [usePB, userId])

  // ── deleteProgram ──────────────────────────────────────────────────────
  const deleteProgram = useCallback(async (programId: string): Promise<boolean> => {
    if (!usePB || !userId) return false

    try {
      // Delete exercises for this program
      try {
        const exercises = await pb.collection('program_exercises').getList(1, 2000, {
          filter: pb.filter('program = {:pid}', { pid: programId }),
        })
        for (const e of exercises.items) {
          await pb.collection('program_exercises').delete(e.id)
        }
      } catch { /* no exercises */ }

      // Delete day config for this program
      try {
        const dayConfigs = await pb.collection('program_day_config').getList(1, 200, {
          filter: pb.filter('program = {:pid}', { pid: programId }),
        })
        for (const dc of dayConfigs.items) {
          await pb.collection('program_day_config').delete(dc.id)
        }
      } catch { /* no day config */ }

      // Delete phases for this program
      try {
        const phases = await pb.collection('program_phases').getList(1, 20, {
          filter: pb.filter('program = {:pid}', { pid: programId }),
        })
        for (const p of phases.items) {
          await pb.collection('program_phases').delete(p.id)
        }
      } catch { /* no phases */ }

      // Delete user_programs entries
      try {
        const userProgs = await pb.collection('user_programs').getList(1, 100, {
          filter: pb.filter('program = {:pid}', { pid: programId }),
        })
        for (const up of userProgs.items) {
          await pb.collection('user_programs').delete(up.id)
        }
      } catch { /* no user_programs */ }

      // Delete the program itself
      await pb.collection('programs').delete(programId)

      // Update local state
      const remaining = programsRef.current.filter(p => p.id !== programId)
      setPrograms(remaining)

      if (activeProgram?.id === programId) {
        if (remaining.length > 0) {
          // Auto-select first remaining program
          const fallback = remaining[0]
          setActiveProgram(fallback)
          try {
            let fbExisting: RecordModel | null = null
            try {
              fbExisting = await pb.collection('user_programs').getFirstListItem(
                pb.filter('user = {:uid} && program = {:pid}', { uid: userId, pid: fallback.id })
              )
            } catch { /* not found */ }
            if (fbExisting) {
              await pb.collection('user_programs').update(fbExisting.id, { is_current: true })
            } else {
              await pb.collection('user_programs').create({
                user: userId, program: fallback.id, started_at: nowLocalForPB(), is_current: true,
              })
            }
            await loadProgramData(fallback.id)
          } catch (e) {
            console.warn('usePrograms: fallback selection after delete failed', e)
          }
        } else {
          setActiveProgram(null)
          setPhases(FALLBACK_PHASES)
          setWeekDays(FALLBACK_WEEK_DAYS)
          setWorkoutsMap({})
          setCardioDayConfigs({})
        }
      }

      return true
    } catch (e) {
      console.error('usePrograms: deleteProgram error', e)
      return false
    }
  }, [usePB, userId, activeProgram])

  // ── refreshPrograms — re-fetch catalog from PB ──────────────────────────
  const refreshPrograms = useCallback(async () => {
    if (!userId || !usePB) return
    try {
      await loadFromPB(userId)
    } catch (e) {
      console.error('usePrograms: refreshPrograms error', e)
    }
  }, [userId, usePB]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    programs,
    activeProgram,
    phases,
    weekDays,
    cardioDayConfigs,
    getWorkout,
    selectProgram,
    duplicateProgram,
    deleteProgram,
    refreshPrograms,
    programsReady,
  }
}
