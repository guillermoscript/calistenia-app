import { describe, expect, it } from 'vitest'
import {
  computeProgramProgress,
  dayIdFromDateStr,
  parsePhaseWeeks,
  phaseForWeek,
  resolvePhase,
  completedWorkoutsFromProgress,
  type CompletedWorkout,
  type ProgramProgressInput,
} from './programProgress'
import type { Phase, ProgressMap, WeekDay } from '../types'

// Todas las fechas son fijas: `today` y `utcToLocalDay` entran por parámetro,
// así que ningún test depende del reloj ni de la zona horaria de la máquina.

/** Los timestamps de PB llegan como `YYYY-MM-DD HH:mm:ss.SSSZ`. */
const utcToLocalDay = (utc: string) => utc.slice(0, 10)

const PHASES: Phase[] = [
  { id: 1, name: 'Base', weeks: '1-4', color: '#000', bg: '#000' },
  { id: 2, name: 'Fuerza', weeks: '5-8', color: '#000', bg: '#000' },
  { id: 3, name: 'Peak', weeks: '9-12', color: '#000', bg: '#000' },
]

/** 4 días entrenables (lun, mar, jue, vie) + 3 de descanso. */
const WEEK_DAYS: WeekDay[] = [
  { id: 'lun', name: 'Lunes', focus: 'Push', type: 'push', color: '#000' },
  { id: 'mar', name: 'Martes', focus: 'Pull', type: 'pull', color: '#000' },
  { id: 'mie', name: 'Miércoles', focus: 'Descanso', type: 'rest', color: '#000' },
  { id: 'jue', name: 'Jueves', focus: 'Legs', type: 'legs', color: '#000' },
  { id: 'vie', name: 'Viernes', focus: 'Core', type: 'full', color: '#000' },
  { id: 'sab', name: 'Sábado', focus: 'Descanso', type: 'rest', color: '#000' },
  { id: 'dom', name: 'Domingo', focus: 'Descanso', type: 'rest', color: '#000' },
]

// Inscripción a mitad de semana a propósito: la semana 1 va de miércoles a
// martes, que es justo lo que NO se puede calcular con la semana del calendario.
// Programa de 12 semanas: W1 03–09 jun, W2 10–16 jun, W3 17–23 jun,
// W12 19–25 ago, primer día fuera 26 ago.
const STARTED_AT = '2026-06-03 08:30:00.000Z'

function input(overrides: Partial<ProgramProgressInput> = {}): ProgramProgressInput {
  return {
    startedAt: STARTED_AT,
    durationWeeks: 12,
    phases: PHASES,
    weekDays: WEEK_DAYS,
    completed: [],
    utcToLocalDay,
    today: '2026-06-03',
    ...overrides,
  }
}

function done(day: string, dayId: string, phase = 1): CompletedWorkout {
  return { day, workoutKey: `p${phase}_${dayId}` }
}

describe('dayIdFromDateStr', () => {
  it('deriva el día de la semana sin depender de la zona del dispositivo', () => {
    expect(dayIdFromDateStr('2026-06-03')).toBe('mie')
    expect(dayIdFromDateStr('2026-08-24')).toBe('lun')
    expect(dayIdFromDateStr('2026-08-23')).toBe('dom')
  })

  it('rechaza fechas rotas en vez de redondearlas al mes siguiente', () => {
    expect(dayIdFromDateStr('2026-02-31')).toBeNull()
    expect(dayIdFromDateStr('')).toBeNull()
    expect(dayIdFromDateStr('24/08/2026')).toBeNull()
  })
})

describe('parsePhaseWeeks', () => {
  it('lee el rango que teclea quien crea el programa', () => {
    expect(parsePhaseWeeks('1-6')).toEqual({ from: 1, to: 6 })
    expect(parsePhaseWeeks(' 7 - 13 ')).toEqual({ from: 7, to: 13 })
    expect(parsePhaseWeeks('14–20')).toEqual({ from: 14, to: 20 }) // guion largo
    expect(parsePhaseWeeks('5')).toEqual({ from: 5, to: 5 })
  })

  it('normaliza un rango invertido y devuelve null sin números', () => {
    expect(parsePhaseWeeks('6-1')).toEqual({ from: 1, to: 6 })
    expect(parsePhaseWeeks('todas')).toBeNull()
    expect(parsePhaseWeeks('')).toBeNull()
  })
})

describe('phaseForWeek', () => {
  it('devuelve la fase cuyo rango contiene la semana', () => {
    expect(phaseForWeek(PHASES, 1)).toBe(1)
    expect(phaseForWeek(PHASES, 4)).toBe(1)
    expect(phaseForWeek(PHASES, 5)).toBe(2)
    expect(phaseForWeek(PHASES, 12)).toBe(3)
  })

  it('cae a la última fase empezada cuando la semana queda fuera de todo rango', () => {
    // Semana 99: más allá del último rango → la última fase, no null.
    expect(phaseForWeek(PHASES, 99)).toBe(3)
    // Hueco entre rangos: 1-2 y 5-6 dejan la semana 3 huérfana.
    const gapped: Phase[] = [
      { id: 1, name: 'A', weeks: '1-2', color: '#000', bg: '#000' },
      { id: 2, name: 'B', weeks: '5-6', color: '#000', bg: '#000' },
    ]
    expect(phaseForWeek(gapped, 3)).toBe(1)
  })

  it('devuelve null sin fases', () => {
    expect(phaseForWeek([], 1)).toBeNull()
  })
})

describe('resolvePhase', () => {
  it('el override manual gana sobre la derivada', () => {
    expect(resolvePhase(PHASES, 1, 3)).toEqual({ phase: 3, source: 'override' })
  })

  it('ignora overrides no válidos y deriva de la semana', () => {
    expect(resolvePhase(PHASES, 6, 0)).toEqual({ phase: 2, source: 'derived' })
    expect(resolvePhase(PHASES, 6, null)).toEqual({ phase: 2, source: 'derived' })
    expect(resolvePhase(PHASES, 6, -1)).toEqual({ phase: 2, source: 'derived' })
  })

  it('sin semana ni fases devuelve la fase 1', () => {
    expect(resolvePhase([], null)).toEqual({ phase: 1, source: 'fallback' })
  })
})

describe('completedWorkoutsFromProgress', () => {
  it('extrae los marcadores done_ e ignora los logs de series', () => {
    const progress: ProgressMap = {
      'done_2026-06-04_p1_jue': { done: true, date: '2026-06-04', workoutKey: 'p1_jue', note: '' },
      'done_2026-06-05_p1_vie': { done: true, date: '2026-06-05', workoutKey: 'p1_vie', note: '', count: 2 },
      // Log de series: misma forma de clave pero sin `done_`.
      '2026-06-04_p1_jue_pullups': { sets: [], date: '2026-06-04', workoutKey: 'p1_jue', exerciseId: 'pullups' },
    }
    expect(completedWorkoutsFromProgress(progress)).toEqual([
      { day: '2026-06-04', workoutKey: 'p1_jue' },
      { day: '2026-06-05', workoutKey: 'p1_vie' },
    ])
  })

  it('incluye los días de cardio del programa', () => {
    // Un día de cardio del programa deja un marcador done_ con cardioSessionId:
    // cuenta como entreno de la semana igual que uno de fuerza.
    const progress: ProgressMap = {
      'done_2026-06-04_p1_mie': {
        done: true, date: '2026-06-04', workoutKey: 'p1_mie', note: '', cardioSessionId: 'abc123',
      },
    }
    expect(completedWorkoutsFromProgress(progress)).toEqual([{ day: '2026-06-04', workoutKey: 'p1_mie' }])
  })

  it('no revienta con un progreso vacío o con entradas rotas', () => {
    expect(completedWorkoutsFromProgress({})).toEqual([])
    const broken = { 'done_x': { done: true, date: '', workoutKey: '', note: '' } } as ProgressMap
    expect(completedWorkoutsFromProgress(broken)).toEqual([])
  })
})

describe('computeProgramProgress', () => {
  it('el primer día del programa ya es la semana 1', () => {
    const r = computeProgramProgress(input({ today: '2026-06-03' }))
    expect(r.hasStarted).toBe(true)
    expect(r.isCompleted).toBe(false)
    expect(r.currentWeek).toBe(1)
    expect(r.totalWeeks).toBe(12)
    expect(r.weekWindow).toMatchObject({ week: 1, startDay: '2026-06-03', endDay: '2026-06-09' })
    expect(r.currentPhase).toBe(1)
    expect(r.phaseSource).toBe('derived')
    expect(r.plannedThisWeek).toBe(4)
    expect(r.sessionsThisWeek).toBe(0)
  })

  it('la semana NO es la del calendario: el domingo sigue siendo la semana 1', () => {
    // Domingo 7 de junio: la semana del calendario ya cambió, la del programa no.
    const r = computeProgramProgress(input({ today: '2026-06-07' }))
    expect(r.currentWeek).toBe(1)
    // El lunes 8 de junio TAMBIÉN pertenece a la ventana que empezó el miércoles.
    const monday = computeProgramProgress(input({ today: '2026-06-08' }))
    expect(monday.currentWeek).toBe(1)
    expect(monday.weekWindow?.endDay).toBe('2026-06-09')
    // Y el miércoles 10 arranca la semana 2.
    const next = computeProgramProgress(input({ today: '2026-06-10' }))
    expect(next.currentWeek).toBe(2)
  })

  it('antes de empezar no hay semana en curso ni barra', () => {
    const r = computeProgramProgress(input({ today: '2026-06-01' }))
    expect(r.hasStarted).toBe(false)
    expect(r.currentWeek).toBeNull()
    expect(r.percent).toBe(0)
    expect(r.nextDay).toBeNull()
    // La ventana es la primera para que la cabecera pueda pintar «Semana 1 de 12».
    expect(r.weekWindow?.week).toBe(1)
    // Sin semana en curso la fase cae a la primera, no a `null`.
    expect(r.currentPhase).toBe(1)
    expect(r.phaseSource).toBe('fallback')
  })

  it('el día siguiente al final marca el programa como completado al 100%', () => {
    const r = computeProgramProgress(input({ today: '2026-08-26' }))
    expect(r.isCompleted).toBe(true)
    expect(r.percent).toBe(100)
    expect(r.currentWeek).toBe(12)
    expect(r.weekWindow).toMatchObject({ week: 12, endDay: '2026-08-25' })
    // Un programa terminado no propone «hoy toca».
    expect(r.nextDay).toBeNull()
  })

  it('el último día del programa todavía NO está completado', () => {
    const r = computeProgramProgress(input({ today: '2026-08-25' }))
    expect(r.isCompleted).toBe(false)
    expect(r.currentWeek).toBe(12)
    expect(r.percent).toBe(100) // 84 de 84 días transcurridos
  })

  it('avanza de fase sola al cruzar el rango de semanas', () => {
    // Semana 5 → 03 jun + 28 días = 1 de julio.
    const r = computeProgramProgress(input({ today: '2026-07-01' }))
    expect(r.currentWeek).toBe(5)
    expect(r.currentPhase).toBe(2)
    expect(r.phaseSource).toBe('derived')
  })

  it('el override manual congela la fase sin tocar la semana', () => {
    const r = computeProgramProgress(input({ today: '2026-07-01', phaseOverride: 1 }))
    expect(r.currentWeek).toBe(5)
    expect(r.currentPhase).toBe(1)
    expect(r.phaseSource).toBe('override')
  })

  it('cuenta los entrenos de la ventana y deduplica el doble registro', () => {
    const r = computeProgramProgress(input({
      today: '2026-06-05',
      completed: [
        done('2026-06-04', 'jue'),
        done('2026-06-04', 'jue'), // mismo entreno registrado dos veces
        done('2026-06-05', 'vie'),
        done('2026-06-02', 'mar'), // anterior a apuntarse: fuera de la ventana
        done('2026-06-11', 'jue'), // semana siguiente
      ],
    }))
    expect(r.sessionsThisWeek).toBe(2)
    expect(r.plannedThisWeek).toBe(4)
  })

  it('«hoy toca» es hoy si es entrenable y está pendiente', () => {
    // Jueves 4 de junio, día de piernas y sin hacer.
    const r = computeProgramProgress(input({ today: '2026-06-04' }))
    expect(r.nextDay).toBe('jue')
  })

  it('«hoy toca» salta al siguiente pendiente cuando hoy ya está hecho', () => {
    const r = computeProgramProgress(input({
      today: '2026-06-04',
      completed: [done('2026-06-04', 'jue')],
    }))
    expect(r.nextDay).toBe('vie')
  })

  it('en día de descanso propone el siguiente entrenable', () => {
    // Sábado 6 de junio: sáb y dom son descanso → lunes.
    const r = computeProgramProgress(input({ today: '2026-06-06' }))
    expect(r.nextDay).toBe('lun')
  })

  it('la semana completa deja «hoy toca» en null', () => {
    // Lunes 8 de junio, última jornada entrenable de la ventana W1 (03–09 jun).
    const r = computeProgramProgress(input({
      today: '2026-06-08',
      completed: [
        done('2026-06-04', 'jue'),
        done('2026-06-05', 'vie'),
        done('2026-06-08', 'lun'),
        done('2026-06-09', 'mar'),
      ],
    }))
    expect(r.sessionsThisWeek).toBe(4)
    expect(r.nextDay).toBeNull()
  })

  it('el día se lee del sufijo de workout_key, no del prefijo de fase', () => {
    // Sesión guardada con la fase 1 mientras el usuario ya va por la fase 2:
    // debe seguir contando como «jueves hecho».
    const r = computeProgramProgress(input({
      today: '2026-06-04',
      phaseOverride: 2,
      completed: [done('2026-06-04', 'jue', 1)],
    }))
    expect(r.currentPhase).toBe(2)
    expect(r.nextDay).toBe('vie')
  })

  it('el porcentaje avanza con los días transcurridos', () => {
    // 84 días en total; el primer día ya cuenta como transcurrido.
    expect(computeProgramProgress(input({ today: '2026-06-03' })).percent).toBe(1)
    // 42 días → la mitad exacta.
    expect(computeProgramProgress(input({ today: '2026-07-14' })).percent).toBe(50)
  })

  it('un programa sin duración devuelve estado seguro, pero conserva la fase', () => {
    const r = computeProgramProgress(input({ durationWeeks: 0, today: '2026-06-10', phaseOverride: 2 }))
    expect(r.totalWeeks).toBe(0)
    expect(r.currentWeek).toBeNull()
    expect(r.weekWindow).toBeNull()
    expect(r.percent).toBe(0)
    expect(r.plannedThisWeek).toBe(0)
    expect(r.currentPhase).toBe(2)
    expect(r.phaseSource).toBe('override')
  })

  it('un enrollment sin started_at no revienta', () => {
    const r = computeProgramProgress(input({ startedAt: '', today: '2026-06-10' }))
    expect(r.hasStarted).toBe(false)
    expect(r.currentWeek).toBeNull()
    expect(r.weekWindow).toBeNull()
    expect(r.currentPhase).toBe(1)
  })

  it('un programa sin días entrenables no propone ninguno', () => {
    const allRest = WEEK_DAYS.map(d => ({ ...d, type: 'rest' as const }))
    const r = computeProgramProgress(input({ today: '2026-06-04', weekDays: allRest }))
    expect(r.plannedThisWeek).toBe(0)
    expect(r.nextDay).toBeNull()
  })
})
