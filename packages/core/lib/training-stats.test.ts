import { describe, it, expect } from 'vitest'
import { computeTrainingStats, isoWeekStart, shiftDate, weekdayIndex, WEEKLY_BUCKETS } from './training-stats'
import type { ExerciseResolver, ResolvedExercise } from './exercise-resolver'
import type { ProgressMap, SetData } from '../types'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const TODAY = '2026-08-24' // lunes

const CATALOG: Record<string, Omit<ResolvedExercise, 'key'>> = {
  pullups:  { name: 'Dominadas', muscleGroups: ['espalda', 'biceps'], resolved: true, isTimer: false },
  pushups:  { name: 'Flexiones', muscleGroups: ['pecho', 'triceps', 'hombros'], resolved: true, isTimer: false },
  squats:   { name: 'Sentadillas', muscleGroups: ['cuadriceps', 'gluteos'], resolved: true, isTimer: false },
  plank:    { name: 'Plancha', muscleGroups: ['core'], resolved: true, isTimer: true },
  nomuscle: { name: 'Raro', muscleGroups: [], resolved: true, isTimer: false },
}

/** Resolver de fixture: ids del catálogo, el slot `lun_1_1` es «pushups» por nombre, el resto desconocido. */
const resolve: ExerciseResolver = (exerciseId) => {
  if (exerciseId === 'lun_1_1') return { key: 'pushups', ...CATALOG.pushups }
  const hit = CATALOG[exerciseId]
  if (hit) return { key: exerciseId, ...hit }
  return { key: exerciseId, name: exerciseId, muscleGroups: [], resolved: false, isTimer: false }
}

function set(reps: string, weight?: number): SetData {
  return { reps, note: '', weight, timestamp: 0 }
}

function session(date: string, workoutKey = 'free_1', extra: Record<string, unknown> = {}): ProgressMap {
  return { [`done_${date}_${workoutKey}`]: { done: true, date, workoutKey, note: '', ...extra } }
}

function log(date: string, exerciseId: string, sets: SetData[], workoutKey = 'free_1'): ProgressMap {
  return { [`${date}_${workoutKey}_${exerciseId}`]: { date, workoutKey, exerciseId, sets } }
}

function merge(...parts: ProgressMap[]): ProgressMap {
  return Object.assign({}, ...parts)
}

function stats(progress: ProgressMap, period: '4w' | '3m' | '1y' | 'all' = 'all', today = TODAY) {
  return computeTrainingStats({ progress, resolve, period, today })
}

// ── Fechas ───────────────────────────────────────────────────────────────────

describe('helpers de fecha', () => {
  it('shiftDate cruza meses y años', () => {
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31')
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('isoWeekStart devuelve el lunes de la semana ISO', () => {
    expect(isoWeekStart('2026-08-24')).toBe('2026-08-24') // lunes
    expect(isoWeekStart('2026-08-30')).toBe('2026-08-24') // domingo
    expect(isoWeekStart('2026-01-01')).toBe('2025-12-29') // jueves, semana que cruza año
  })

  it('weekdayIndex: lunes = 0, domingo = 6', () => {
    expect(weekdayIndex('2026-08-24')).toBe(0)
    expect(weekdayIndex('2026-08-30')).toBe(6)
  })
})

// ── Rango ────────────────────────────────────────────────────────────────────

describe('rango por periodo', () => {
  const p = merge(
    session('2026-08-24'), // hoy
    session('2026-07-28'), // hace 27 días → dentro de 4w
    session('2026-07-27'), // hace 28 días → fuera de 4w, dentro de 3m
    session('2026-05-27'), // hace 89 días → dentro de 3m
    session('2026-05-26'), // hace 90 días → fuera de 3m, dentro de 1y
    session('2025-08-25'), // hace 364 días → dentro de 1y
    session('2025-08-24'), // hace 365 días → fuera de 1y
    session('2026-08-25'), // mañana → nunca
  )

  it('4w = 28 días inclusive', () => {
    const s = stats(p, '4w')
    expect(s.range).toEqual({ from: '2026-07-28', to: TODAY })
    expect(s.totals.sessions).toBe(2)
  })

  it('3m = 90 días', () => {
    expect(stats(p, '3m').totals.sessions).toBe(4)
  })

  it('1y = 365 días', () => {
    expect(stats(p, '1y').totals.sessions).toBe(6)
  })

  it('all no tiene from pero sigue excluyendo el futuro', () => {
    const s = stats(p, 'all')
    expect(s.range.from).toBeNull()
    expect(s.totals.sessions).toBe(7)
  })
})

// ── Sesiones ─────────────────────────────────────────────────────────────────

describe('sesiones', () => {
  it('respeta count, suma minutos y reparte por día de la semana', () => {
    const p = merge(
      session('2026-08-24', 'p1_lun', { count: 2, durationSeconds: 1800 }),
      session('2026-08-23', 'free_1', { durationSeconds: 600 }), // domingo
    )
    const s = stats(p)
    expect(s.totals.sessions).toBe(3)
    expect(s.totals.minutes).toBe(40)
    expect(s.totals.avgMinutesPerSession).toBe(13)
    expect(s.weekdays).toEqual([2, 0, 0, 0, 0, 0, 1])
  })

  it('ignora los marcadores derivados de cardio en todo', () => {
    const p = merge(session('2026-08-24', 'p1_lun', { cardioSessionId: 'abc', durationSeconds: 999 }))
    const s = stats(p)
    expect(s.totals.sessions).toBe(0)
    expect(s.totals.minutes).toBe(0)
    expect(s.weekly[WEEKLY_BUCKETS - 1].sessions).toBe(0)
    expect(s.weekdays).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it('las medias son 0 sin sesiones, nunca NaN', () => {
    const s = stats(log('2026-08-24', 'pullups', [set('10')]))
    expect(s.totals.sets).toBe(1)
    expect(s.totals.avgSetsPerSession).toBe(0)
    expect(s.totals.avgMinutesPerSession).toBe(0)
  })
})

// ── Series, reps y volumen ───────────────────────────────────────────────────

describe('series', () => {
  it('parsea reps como el mayor entero y las no numéricas aportan 0', () => {
    const p = merge(
      session('2026-08-24'),
      log('2026-08-24', 'pullups', [set('8-12'), set('max'), set('10')]),
    )
    const s = stats(p)
    expect(s.totals.sets).toBe(3)
    expect(s.totals.reps).toBe(22)
    expect(s.totals.avgSetsPerSession).toBe(3)
  })

  it('el volumen sólo cuenta series con peso', () => {
    const p = log('2026-08-24', 'pullups', [set('10', 20), set('8'), set('5', 0)])
    expect(stats(p).totals.volumeKg).toBe(200)
  })

  it('las series fuera del rango no cuentan en totales', () => {
    const p = merge(log('2026-08-24', 'pullups', [set('10')]), log('2026-01-01', 'pullups', [set('10')]))
    expect(stats(p, '4w').totals.sets).toBe(1)
  })
})

// ── Músculos ─────────────────────────────────────────────────────────────────

describe('músculos', () => {
  it('una serie suma a cada grupo del ejercicio y share va sobre series únicas', () => {
    const p = merge(
      log('2026-08-24', 'pullups', [set('10'), set('10')]), // espalda+biceps ×2
      log('2026-08-24', 'plank', [set('60')]),               // core ×1
    )
    const s = stats(p)
    expect(s.muscles.groups).toEqual([
      { group: 'biceps', sets: 2, reps: 20, share: 2 / 3 },
      { group: 'espalda', sets: 2, reps: 20, share: 2 / 3 },
      { group: 'core', sets: 1, reps: 0, share: 1 / 3 }, // plancha = temporizador: segundos, no reps
    ])
    expect(s.muscles.unassignedSets).toBe(0)
  })

  it('desempata por el orden canónico de MUSCLE_GROUPS', () => {
    const s = stats(log('2026-08-24', 'pushups', [set('10')]))
    expect(s.muscles.groups.map(g => g.group)).toEqual(['pecho', 'hombros', 'triceps'])
  })

  it('cuenta las series sin grupo aunque la identidad sea conocida', () => {
    const p = merge(log('2026-08-24', 'nomuscle', [set('10')]), log('2026-08-24', 'plank', [set('30')]))
    const s = stats(p)
    expect(s.muscles.unassignedSets).toBe(1)
    expect(s.unknownExerciseSets).toBe(0)
    expect(s.muscles.groups[0]).toMatchObject({ group: 'core', share: 1 })
  })

  it('el balance suma 100 por mayor resto', () => {
    const p = merge(
      log('2026-08-24', 'pullups', [set('10')]),  // pull
      log('2026-08-24', 'pushups', [set('10')]),  // push
      log('2026-08-24', 'squats', [set('10')]),   // legs
    )
    const b = stats(p).muscles.balance
    expect(b.push + b.pull + b.legs + b.core).toBe(100)
    expect(b).toEqual({ push: 34, pull: 33, legs: 33, core: 0 })
  })

  it('el balance es todo 0 sin series asignadas', () => {
    expect(stats(session('2026-08-24')).muscles.balance).toEqual({ push: 0, pull: 0, legs: 0, core: 0 })
  })

  it('una serie que toca dos familias cuenta en las dos', () => {
    const two: ExerciseResolver = () => ({ key: 'x', name: 'X', muscleGroups: ['pecho', 'core'], resolved: true, isTimer: false })
    const s = computeTrainingStats({ progress: log('2026-08-24', 'x', [set('10')]), resolve: two, period: 'all', today: TODAY })
    expect(s.muscles.balance).toEqual({ push: 50, pull: 0, legs: 0, core: 50 })
  })
})

// ── Ranking ──────────────────────────────────────────────────────────────────

describe('ranking de ejercicios', () => {
  it('fusiona el slot del programa con el id de catálogo y cuenta sesiones distintas', () => {
    const p = merge(
      log('2026-08-24', 'lun_1_1', [set('10'), set('10')], 'p1_lun'),
      log('2026-08-22', 'pushups', [set('12')], 'free_1'),
      log('2026-08-22', 'pullups', [set('5')], 'free_1'),
    )
    const s = stats(p)
    expect(s.exercises.map(e => e.key)).toEqual(['pushups', 'pullups'])
    expect(s.exercises[0]).toMatchObject({ name: 'Flexiones', sessions: 2, sets: 3, reps: 32, lastDate: '2026-08-24' })
  })

  it('ordena por sesiones, luego series, luego nombre', () => {
    const p = merge(
      log('2026-08-24', 'squats', [set('10')]),
      log('2026-08-24', 'pullups', [set('10'), set('10')]),
      log('2026-08-24', 'plank', [set('10')]),
    )
    expect(stats(p).exercises.map(e => e.key)).toEqual(['pullups', 'plank', 'squats'])
  })

  it('las identidades desconocidas van a totales y a unknownExerciseSets, no al ranking', () => {
    const p = merge(log('2026-08-24', 'mie_2_3', [set('10'), set('10')], 'p2_mie'), log('2026-08-24', 'plank', [set('30')]))
    const s = stats(p)
    expect(s.totals.sets).toBe(3)
    expect(s.unknownExerciseSets).toBe(2)
    expect(s.muscles.unassignedSets).toBe(2)
    expect(s.exercises.map(e => e.key)).toEqual(['plank'])
    expect(s.records.map(r => r.key)).toEqual(['plank'])
  })
})

// ── Récords ──────────────────────────────────────────────────────────────────

describe('récords', () => {
  it('reps: la mejor serie, empate → fecha más antigua', () => {
    const p = merge(
      log('2026-08-24', 'pullups', [set('12')]),
      log('2026-08-10', 'pullups', [set('12')]),
      log('2026-08-01', 'pullups', [set('8')]),
    )
    expect(stats(p).records[0]).toEqual({ key: 'pullups', name: 'Dominadas', best: { kind: 'reps', reps: 12, date: '2026-08-10' }, isNew: true })
  })

  it('el peso gana a las reps y usa el 1RM de Epley', () => {
    const p = merge(
      log('2026-08-24', 'pullups', [set('20')]),
      log('2026-08-01', 'pullups', [set('5', 20)]),   // 20×(1+5/30) = 23.3
      log('2026-08-02', 'pullups', [set('3', 22)]),   // 22×(1+3/30) = 24.2
    )
    expect(stats(p).records[0].best).toEqual({ kind: 'weight', weight: 22, reps: 3, e1rm: 24.2, date: '2026-08-02' })
  })

  it('se calculan sobre todo el histórico y isNew depende del rango', () => {
    const p = merge(log('2025-01-01', 'pullups', [set('15')]), log('2026-08-24', 'pullups', [set('10')]))
    const s = stats(p, '4w')
    expect(s.records).toHaveLength(1)
    expect(s.records[0]).toMatchObject({ best: { reps: 15, date: '2025-01-01' }, isNew: false })
  })

  it('ordena por fecha del récord desc y luego nombre', () => {
    const p = merge(
      log('2026-08-20', 'pullups', [set('10')]),
      log('2026-08-22', 'squats', [set('10')]),
      log('2026-08-22', 'plank', [set('10')]),
    )
    expect(stats(p).records.map(r => r.key)).toEqual(['plank', 'squats', 'pullups'])
  })

  it('el ranking enlaza su récord', () => {
    const s = stats(log('2026-08-24', 'pullups', [set('7')]))
    expect(s.exercises[0].best).toEqual({ kind: 'reps', reps: 7, date: '2026-08-24' })
  })

  it('temporizador: las reps son segundos, no suman a reps y el récord es de tiempo', () => {
    const p = merge(
      log('2026-08-24', 'plank', [set('45s'), set('20-30s')]),
      log('2026-08-20', 'pullups', [set('10')]),
    )
    const s = stats(p)
    expect(s.totals.reps).toBe(10)
    expect(s.exercises.find(e => e.key === 'plank')).toMatchObject({ isTimer: true, sets: 2, reps: 0, seconds: 75 })
    expect(s.records.find(r => r.key === 'plank')?.best).toEqual({ kind: 'time', seconds: 45, date: '2026-08-24' })
    expect(s.weekly[11].reps).toBe(0)
  })
})

// ── Tendencia ────────────────────────────────────────────────────────────────

describe('tendencia semanal', () => {
  it('12 cubos rellenos a 0 acabando en la semana de hoy', () => {
    const s = stats({}, 'all', '2026-01-07') // miércoles
    expect(s.weekly).toHaveLength(12)
    expect(s.weekly[11].weekStart).toBe('2026-01-05')
    expect(s.weekly[0].weekStart).toBe('2025-10-20')
    expect(s.weekly.every(w => w.sessions === 0 && w.sets === 0)).toBe(true)
  })

  it('agrega sesiones y series por semana ISO, independiente del periodo', () => {
    const p = merge(
      session('2026-08-24'),
      log('2026-08-24', 'pullups', [set('10'), set('10')]),
      session('2026-08-16'), // domingo → semana del 10
      log('2026-08-16', 'pullups', [set('5')]),
      session('2026-06-01'), // hace 12 semanas → fuera de los cubos
    )
    const s = stats(p, '4w')
    expect(s.weekly[11]).toEqual({ weekStart: '2026-08-24', sessions: 1, sets: 2, reps: 20 })
    expect(s.weekly[9]).toEqual({ weekStart: '2026-08-10', sessions: 1, sets: 1, reps: 5 })
    expect(s.weekly.reduce((a, w) => a + w.sessions, 0)).toBe(2)
  })
})
