/**
 * usePrograms — catálogo de programas + programa activo del usuario.
 *
 * Migrado a TanStack Query con una cadena de queries dependientes:
 *   1. catalog        (qk.programs.catalog)               — catálogo de programas
 *   2. activeEnrollment (qk.programs.activeEnrollment(uid)) — programId actual o null
 *   3. detail         (qk.programs.detail(programId))      — phases/weekDays/workouts/cardio
 *
 * Cae a los workouts hardcodeados cuando no hay programa/PB. Forma pública
 * estable (programs, activeProgram, phases, weekDays, cardioDayConfigs,
 * getWorkout, selectProgram, abandonProgram, duplicateProgram, deleteProgram,
 * refreshPrograms, programsReady).
 */

import { useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RecordModel } from 'pocketbase'
import { pb } from '../lib/pocketbase'
import {
  PHASES as FALLBACK_PHASES,
  WEEK_DAYS as FALLBACK_WEEK_DAYS,
  getWorkout as fallbackGetWorkout,
} from '../data/workouts'
import { nowLocalForPB } from '../lib/dateUtils'
import { op } from '../lib/analytics'
import { qk } from '../lib/query-keys'
import type { Phase, WeekDay, Workout, WorkoutsMap, Exercise, ProgramMeta, DayId, CardioDayConfig, CardioActivityType } from '../types'
import i18n from 'i18next'
import { localize } from '../lib/i18n-db'

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
        day.circuitConfig = {
          id: `${dc.day_id}_circuit`,
          name: { es: 'Circuito', en: 'Circuit' },
          mode: dc.circuit_mode ?? 'circuit',
          exercises: [],
          rounds: dc.circuit_rounds ?? 3,
          restBetweenExercises: dc.circuit_rest_between_exercises ?? 0,
          restBetweenRounds: dc.circuit_rest_between_rounds ?? 60,
          workSeconds: dc.circuit_work_seconds,
          restSeconds: dc.circuit_rest_seconds,
        }
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
  return map
}

/** Catálogo (+ disciplina por programa) desde PB. */
async function fetchCatalog(): Promise<ProgramMeta[]> {
  const catalogRes = await pb.collection('programs').getList(1, 100, {
    filter: 'is_active = true', sort: 'name', expand: 'created_by', $autoCancel: false,
  })
  const locale = i18n.language
  const programIds = catalogRes.items.map(p => p.id)
  let allDayConfigs: RecordModel[] = []
  if (programIds.length > 0) {
    try {
      const dcRes = await pb.collection('program_day_config').getList(1, 2000, {
        filter: programIds.map(id => pb.filter('program = {:id}', { id })).join(' || '),
        fields: 'program,day_type', $autoCancel: false,
      })
      allDayConfigs = dcRes.items
    } catch { /* discipline defaults to calistenia */ }
  }
  const disciplineByProgram = new Map<string, 'yoga' | 'calistenia'>()
  for (const pid of programIds) {
    const days = allDayConfigs.filter(dc => dc.program === pid)
    const nonRest = days.filter(dc => dc.day_type !== 'rest')
    disciplineByProgram.set(pid, nonRest.length > 0 && nonRest.every(dc => dc.day_type === 'yoga') ? 'yoga' : 'calistenia')
  }

  return catalogRes.items.map(p => ({
    id:             p.id,
    name:           localize(p.name, locale),
    description:    localize(p.description, locale),
    duration_weeks: p.duration_weeks,
    created_by:     p.created_by || undefined,
    created_by_name: (p.expand as any)?.created_by?.display_name || undefined,
    is_official:    p.is_official || false,
    is_featured:    p.is_featured || false,
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
  }))
}

interface ProgramDetail {
  phases: Phase[]
  weekDays: WeekDay[]
  workoutsMap: WorkoutsMap
  cardioDayConfigs: Record<string, CardioDayConfig>
}

/** phases + exercises + day config del programa → estructuras derivadas. */
async function fetchProgramDetail(programId: string): Promise<ProgramDetail> {
  const filter = pb.filter('program = {:pid}', { pid: programId })
  const [phasesRes, exercisesRes, dayConfigRes] = await Promise.all([
    pb.collection('program_phases').getList(1, 20, { filter, sort: 'sort_order', $autoCancel: false }),
    pb.collection('program_exercises').getList(1, 2000, { filter, sort: 'phase_number,sort_order', $autoCancel: false }),
    pb.collection('program_day_config').getList(1, 200, { filter, sort: 'phase_number,sort_order', $autoCancel: false })
      .catch((e: any) => { if (e?.status !== 404) console.warn('usePrograms: day config fetch failed', e); return { items: [] } }),
  ])
  return {
    phases: buildPhases(phasesRes.items),
    weekDays: buildWeekDays(exercisesRes.items, dayConfigRes.items),
    workoutsMap: buildWorkoutsMap(exercisesRes.items),
    cardioDayConfigs: buildCardioDayConfigs(dayConfigRes.items),
  }
}

/** Lee el programId activo (user_programs is_current) o null. */
async function fetchActiveEnrollment(uid: string): Promise<string | null> {
  try {
    const rec = await pb.collection('user_programs').getFirstListItem(
      pb.filter('user = {:uid} && is_current = true', { uid }),
    )
    return rec.program as string
  } catch {
    return null // sin programa activo aún
  }
}

interface UseProgramsReturn {
  programs: ProgramMeta[]
  activeProgram: ProgramMeta | null
  phases: Phase[]
  weekDays: WeekDay[]
  cardioDayConfigs: Record<string, CardioDayConfig>
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

  const catalogQuery = useQuery({
    queryKey: qk.programs.catalog,
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    // Reintento ante fallos transitorios en cold-start (red/DNS/5xx/429).
    retry: (failureCount, error: any) => {
      const status = error?.status
      const transient = status === 0 || status === 429 || (typeof status === 'number' && status >= 500)
      return transient && failureCount < 3
    },
    retryDelay: (attempt) => 400 * (attempt + 1),
    queryFn: fetchCatalog,
  })

  const enrollmentQuery = useQuery({
    queryKey: qk.programs.activeEnrollment(userId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchActiveEnrollment(userId!),
  })

  const activeProgramId = enrollmentQuery.data ?? null

  const detailQuery = useQuery({
    queryKey: qk.programs.detail(activeProgramId),
    enabled: !!userId && !!activeProgramId,
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

  const programsReady = !userId
    ? true
    : catalogQuery.isFetched && enrollmentQuery.isFetched && (!activeProgramId || detailQuery.isFetched)

  const getWorkout = useCallback((phaseNumber: number, dayId: string): Workout | null => {
    const key = `p${phaseNumber}_${dayId}`
    if (Object.keys(workoutsMap).length > 0) return workoutsMap[key] || null
    return fallbackGetWorkout(phaseNumber, dayId as any)
  }, [workoutsMap])

  const selectProgram = useCallback(async (programId: string): Promise<boolean> => {
    if (!userId) return false
    if (selectingRef.current) return false
    selectingRef.current = true
    try {
      let existing: RecordModel | null = null
      try {
        existing = await pb.collection('user_programs').getFirstListItem(
          pb.filter('user = {:uid} && program = {:pid}', { uid: userId, pid: programId }),
        )
      } catch { /* not found */ }

      if (existing) {
        await pb.collection('user_programs').update(existing.id, { is_current: true, status: 'active', ended_at: '' })
      } else {
        await pb.collection('user_programs').create({
          user: userId, program: programId, started_at: nowLocalForPB(), is_current: true, status: 'active',
        })
      }

      const currentList = await pb.collection('user_programs').getList(1, 100, {
        filter: pb.filter('user = {:uid} && is_current = true && program != {:pid}', { uid: userId, pid: programId }),
      })
      await Promise.all(currentList.items.map(rec =>
        pb.collection('user_programs').update(rec.id, { is_current: false }),
      ))

      // Optimista: fijamos el programId activo → la detail query corre para el nuevo.
      qc.setQueryData(qk.programs.activeEnrollment(userId), programId)
      await qc.invalidateQueries({ queryKey: qk.programs.detail(programId) })

      const newActive = (qc.getQueryData<ProgramMeta[]>(qk.programs.catalog) || []).find(p => p.id === programId) || null
      op.track('program_selected', { program_id: programId, program_name: newActive?.name || '' })
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
        qc.setQueryData(qk.programs.activeEnrollment(userId), null)
      }

      op.track('program_abandoned', {
        program_id: programId,
        program_name: (qc.getQueryData<ProgramMeta[]>(qk.programs.catalog) || []).find(p => p.id === programId)?.name || '',
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
    try {
      const original = await pb.collection('programs').getOne(programId)
      const newProgramData: Record<string, unknown> = {
        name: `${original.name} (copia)`, description: original.description,
        duration_weeks: original.duration_weeks, is_active: true, created_by: userId,
      }
      if ('is_official' in original) newProgramData.is_official = false
      if ('is_featured' in original) newProgramData.is_featured = false
      if (original.difficulty) newProgramData.difficulty = original.difficulty
      const newProgram = await pb.collection('programs').create(newProgramData)

      const phasesRes = await pb.collection('program_phases').getList(1, 20, {
        filter: pb.filter('program = {:pid}', { pid: programId }), sort: 'sort_order',
      })
      for (const p of phasesRes.items) {
        await pb.collection('program_phases').create({
          program: newProgram.id, phase_number: p.phase_number, name: p.name,
          weeks: p.weeks, color: p.color, bg_color: p.bg_color, sort_order: p.sort_order,
        })
      }

      try {
        const dayConfigRes = await pb.collection('program_day_config').getList(1, 200, {
          filter: pb.filter('program = {:pid}', { pid: programId }), sort: 'phase_number,sort_order',
        })
        for (const dc of dayConfigRes.items) {
          const data: Record<string, unknown> = {
            program: newProgram.id, phase_number: dc.phase_number, day_id: dc.day_id,
            day_name: dc.day_name, day_type: dc.day_type, day_focus: dc.day_focus,
            day_color: dc.day_color, sort_order: dc.sort_order,
          }
          if (dc.cardio_activity_type) data.cardio_activity_type = dc.cardio_activity_type
          if (dc.cardio_target_distance_km) data.cardio_target_distance_km = dc.cardio_target_distance_km
          if (dc.cardio_target_duration_min) data.cardio_target_duration_min = dc.cardio_target_duration_min
          if (dc.circuit_mode) data.circuit_mode = dc.circuit_mode
          if (dc.circuit_rounds) data.circuit_rounds = dc.circuit_rounds
          if (dc.circuit_work_seconds) data.circuit_work_seconds = dc.circuit_work_seconds
          if (dc.circuit_rest_seconds) data.circuit_rest_seconds = dc.circuit_rest_seconds
          if (dc.circuit_rest_between_exercises) data.circuit_rest_between_exercises = dc.circuit_rest_between_exercises
          if (dc.circuit_rest_between_rounds) data.circuit_rest_between_rounds = dc.circuit_rest_between_rounds
          await pb.collection('program_day_config').create(data)
        }
      } catch { /* no day config to copy */ }

      const exercisesRes = await pb.collection('program_exercises').getList(1, 2000, {
        filter: pb.filter('program = {:pid}', { pid: programId }), sort: 'phase_number,sort_order',
      })
      for (const e of exercisesRes.items) {
        await pb.collection('program_exercises').create({
          program: newProgram.id, phase_number: e.phase_number, day_id: e.day_id,
          day_name: e.day_name, day_focus: e.day_focus, day_type: e.day_type, day_color: e.day_color,
          exercise_id: e.exercise_id, exercise_name: e.exercise_name, sets: e.sets, reps: e.reps,
          rest_seconds: e.rest_seconds, muscles: e.muscles, note: e.note, youtube: e.youtube,
          priority: e.priority, is_timer: e.is_timer, timer_seconds: e.timer_seconds,
          workout_title: e.workout_title, sort_order: e.sort_order, section: e.section || 'main',
        })
      }

      // Refrescamos el catálogo para incluir la copia.
      await qc.invalidateQueries({ queryKey: qk.programs.catalog })
      return newProgram.id
    } catch (e) {
      console.error('usePrograms: duplicateProgram error', e)
      return null
    }
  }, [userId, qc])

  const deleteProgram = useCallback(async (programId: string): Promise<boolean> => {
    if (!userId) return false
    try {
      try {
        const exercises = await pb.collection('program_exercises').getList(1, 2000, { filter: pb.filter('program = {:pid}', { pid: programId }) })
        for (const e of exercises.items) await pb.collection('program_exercises').delete(e.id)
      } catch { /* no exercises */ }
      try {
        const dayConfigs = await pb.collection('program_day_config').getList(1, 200, { filter: pb.filter('program = {:pid}', { pid: programId }) })
        for (const dc of dayConfigs.items) await pb.collection('program_day_config').delete(dc.id)
      } catch { /* no day config */ }
      try {
        const phasesR = await pb.collection('program_phases').getList(1, 20, { filter: pb.filter('program = {:pid}', { pid: programId }) })
        for (const p of phasesR.items) await pb.collection('program_phases').delete(p.id)
      } catch { /* no phases */ }
      try {
        const userProgs = await pb.collection('user_programs').getList(1, 100, { filter: pb.filter('program = {:pid}', { pid: programId }) })
        for (const up of userProgs.items) await pb.collection('user_programs').delete(up.id)
      } catch { /* no user_programs */ }

      await pb.collection('programs').delete(programId)

      const remaining = (qc.getQueryData<ProgramMeta[]>(qk.programs.catalog) || []).filter(p => p.id !== programId)
      qc.setQueryData(qk.programs.catalog, remaining)

      if (activeProgramId === programId) {
        if (remaining.length > 0) {
          const fallback = remaining[0]
          try {
            let fbExisting: RecordModel | null = null
            try {
              fbExisting = await pb.collection('user_programs').getFirstListItem(
                pb.filter('user = {:uid} && program = {:pid}', { uid: userId, pid: fallback.id }),
              )
            } catch { /* not found */ }
            if (fbExisting) {
              await pb.collection('user_programs').update(fbExisting.id, { is_current: true, status: 'active', ended_at: '' })
            } else {
              await pb.collection('user_programs').create({
                user: userId, program: fallback.id, started_at: nowLocalForPB(), is_current: true, status: 'active',
              })
            }
            qc.setQueryData(qk.programs.activeEnrollment(userId), fallback.id)
          } catch (e) {
            console.warn('usePrograms: fallback selection after delete failed', e)
          }
        } else {
          qc.setQueryData(qk.programs.activeEnrollment(userId), null)
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
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.programs.catalog }),
      qc.invalidateQueries({ queryKey: qk.programs.activeEnrollment(userId) }),
      qc.invalidateQueries({ queryKey: ['programs', 'detail'] }),
    ])
  }, [userId, qc])

  return {
    programs,
    activeProgram,
    phases,
    weekDays,
    cardioDayConfigs,
    getWorkout,
    selectProgram,
    abandonProgram,
    duplicateProgram,
    deleteProgram,
    refreshPrograms,
    programsReady,
  }
}
