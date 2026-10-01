import { describe, expect, it } from 'vitest'
import { activityDaysFromProgress, getMissedDaysNote, getWeekDoneDays, getWeekSummary } from './weekSummary'
import type { DayId, DayType, ProgressMap, WeekDay } from '../types'

const day = (id: DayId, type: DayType): WeekDay => ({ id, name: id, focus: id, type, color: '#fff' })

// lun fuerza · mar descanso · mié cardio · jue circuito · vie fuerza · sáb/dom descanso
const WEEK: WeekDay[] = [
  day('lun', 'push'), day('mar', 'rest'), day('mie', 'cardio'), day('jue', 'circuit'),
  day('vie', 'pull'), day('sab', 'rest'), day('dom', 'rest'),
]
// Miércoles 30-09-2026 → semana del 28-09 al 04-10.
const TODAY = '2026-09-30'

describe('getWeekSummary', () => {
  it('semana de calendario de lunes a domingo', () => {
    const s = getWeekSummary({ today: TODAY, activityDays: [], weekDays: WEEK })
    expect(s.weekStart).toBe('2026-09-28')
    expect(s.weekEnd).toBe('2026-10-04')
    expect(s.cells.map(c => c.dayId)).toEqual(['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'])
  })

  it('cuenta cardio y circuito y no duplica dos sesiones del mismo día', () => {
    const progress: ProgressMap = {
      'done_2026-09-28_p1_lun': { done: true, date: '2026-09-28', workoutKey: 'p1_lun', note: '' },
      'done_2026-09-28_free': { done: true, date: '2026-09-28', workoutKey: 'free', note: '' },
      'done_2026-09-29_p1_mie': { done: true, date: '2026-09-29', workoutKey: 'p1_mie', note: '', cardioSessionId: 'c1' },
      'done_2026-09-30_p1_jue': { done: true, date: '2026-09-30', workoutKey: 'p1_jue', note: '', circuitSessionId: 'k1' } as never,
      'ex_1': { exerciseId: 'x', sets: [], date: '2026-09-28', workoutKey: 'p1_lun' },
    }
    const days = activityDaysFromProgress(progress)
    expect(days).toEqual(['2026-09-28', '2026-09-29', '2026-09-30'])
    const s = getWeekSummary({ today: TODAY, activityDays: [...days, '2026-09-28'], weekDays: WEEK })
    expect(s.done).toBe(3)
  })

  it('no cuenta como hechas las fechas posteriores a hoy', () => {
    const s = getWeekSummary({ today: TODAY, activityDays: ['2026-09-29', '2026-10-01', '2026-10-03'], weekDays: WEEK })
    expect(s.done).toBe(1)
    expect(s.cells.find(c => c.day === '2026-10-01')?.state).not.toBe('done')
  })

  it('ignora actividad fuera de la semana y fechas inválidas', () => {
    const s = getWeekSummary({ today: TODAY, activityDays: ['2026-09-27', '2026-10-05', 'x', '2026-09-29'], weekDays: WEEK })
    expect(s.done).toBe(1)
  })

  it('planned = días entrenables del programa en la semana', () => {
    expect(getWeekSummary({ today: TODAY, activityDays: [], weekDays: WEEK }).planned).toBe(4)
    expect(getWeekSummary({ today: TODAY, activityDays: [], weekDays: [] }).planned).toBe(0)
  })

  it('planned respeta las fechas del programa', () => {
    const s = getWeekSummary({
      today: TODAY, activityDays: [], weekDays: WEEK,
      programStartDay: '2026-09-30', programEndDay: '2026-10-01',
    })
    // Solo mié y jue caen dentro.
    expect(s.planned).toBe(2)
    expect(s.cells[0]).toMatchObject({ dayId: 'lun', trainable: false, state: 'rest' })
  })

  it('estados de las celdas', () => {
    const s = getWeekSummary({ today: TODAY, activityDays: ['2026-09-28'], weekDays: WEEK })
    expect(s.cells.map(c => c.state)).toEqual(['done', 'rest', 'today', 'planned', 'planned', 'rest', 'rest'])
    expect(s.missed).toBe(0)
    expect(s.cells[2]).toMatchObject({ isToday: true, isPast: false })
    expect(s.cells[1]).toMatchObject({ isToday: false, isPast: true })
  })

  it('un día pasado entrenable sin hacer es missed (#809)', () => {
    const s = getWeekSummary({ today: TODAY, activityDays: [], weekDays: WEEK })
    expect(s.cells[0]).toMatchObject({ state: 'missed', isPast: true })
    expect(s.missed).toBe(1)
    // Lo perdido sigue planificado: `planned` no cambia de significado.
    expect(s.planned).toBe(4)
  })

  it('ni hoy, ni un día futuro, ni un descanso pasado cuentan como perdidos', () => {
    // Viernes: lun perdido, mar descanso, mié (cardio) y jue (circuito) perdidos, vie hoy.
    const s = getWeekSummary({ today: '2026-10-02', activityDays: [], weekDays: WEEK })
    expect(s.cells.map(c => c.state)).toEqual(['missed', 'rest', 'missed', 'missed', 'today', 'rest', 'rest'])
    expect(s.missed).toBe(3)
  })

  it('cualquier actividad ese día lo salva, aunque sea de otra fase u otro tipo', () => {
    // El usuario cambió de fase el martes: el lunes se registró con la clave de la fase 1.
    const progress: ProgressMap = {
      'done_2026-09-28_p1_lun': { done: true, date: '2026-09-28', workoutKey: 'p1_lun', note: '' },
      'done_2026-09-29_p2_mie': { done: true, date: '2026-09-29', workoutKey: 'p2_mie', note: '' },
    }
    const s = getWeekSummary({ today: '2026-10-02', activityDays: activityDaysFromProgress(progress), weekDays: WEEK })
    expect(s.cells[0].state).toBe('done')
    // Mié (cardio) y jue (circuito) siguen perdidos: la sesión del martes no se mueve de día.
    expect(s.cells.filter(c => c.state === 'missed').map(c => c.dayId)).toEqual(['mie', 'jue'])
  })

  it('antes del alta o fuera de las fechas del programa no hay perdidos', () => {
    const signup = getWeekSummary({ today: '2026-10-02', activityDays: [], weekDays: WEEK, signupDay: '2026-10-01' })
    expect(signup.cells.slice(0, 3).map(c => c.state)).toEqual(['before_start', 'before_start', 'before_start'])
    expect(signup.cells[3].state).toBe('missed')
    const program = getWeekSummary({ today: '2026-10-02', activityDays: [], weekDays: WEEK, programStartDay: '2026-10-01' })
    expect(program.missed).toBe(1)
  })

  it('marca before_start los días anteriores al alta', () => {
    const s = getWeekSummary({ today: TODAY, activityDays: [], weekDays: WEEK, signupDay: '2026-09-30' })
    expect(s.cells.map(c => c.state)).toEqual(['before_start', 'before_start', 'today', 'planned', 'planned', 'rest', 'rest'])
  })

  it('in_progress en la celda de hoy; hecho gana a en curso', () => {
    const running = getWeekSummary({ today: TODAY, activityDays: [], weekDays: WEEK, inProgressToday: true })
    expect(running.cells[2].state).toBe('in_progress')
    const done = getWeekSummary({ today: TODAY, activityDays: [TODAY], weekDays: WEEK, inProgressToday: true })
    expect(done.cells[2].state).toBe('done')
  })

  it('hoy en día de descanso sigue siendo today', () => {
    const s = getWeekSummary({ today: '2026-09-29', activityDays: [], weekDays: WEEK })
    expect(s.cells[1]).toMatchObject({ state: 'today', trainable: false })
  })
})

describe('getMissedDaysNote (#809)', () => {
  it('nombra el más reciente y lista todos', () => {
    const note = getMissedDaysNote(getWeekSummary({ today: '2026-10-02', activityDays: [], weekDays: WEEK }))
    expect(note?.days.map(c => c.dayId)).toEqual(['lun', 'mie', 'jue'])
    expect(note?.latest.dayId).toBe('jue')
  })

  it('no dice nada sin días perdidos', () => {
    expect(getMissedDaysNote(getWeekSummary({ today: '2026-09-28', activityDays: [], weekDays: WEEK }))).toBeNull()
  })

  it('no dice nada si hoy ya ha entrenado o está entrenando', () => {
    const done = getWeekSummary({ today: TODAY, activityDays: [TODAY], weekDays: WEEK })
    expect(getMissedDaysNote(done)).toBeNull()
    const running = getWeekSummary({ today: TODAY, activityDays: [], weekDays: WEEK, inProgressToday: true })
    expect(getMissedDaysNote(running)).toBeNull()
  })

  it('sí habla en un día de descanso: retomar vale con cualquier actividad', () => {
    expect(getMissedDaysNote(getWeekSummary({ today: '2026-10-03', activityDays: [], weekDays: WEEK }))?.days).toHaveLength(4)
  })
})

describe('getWeekDoneDays', () => {
  it('suma el progreso y las fechas extra (cardio libre) sin repetir días', () => {
    const progress: ProgressMap = {
      'done_2026-09-28_p1_lun': { done: true, date: '2026-09-28', workoutKey: 'p1_lun', note: '' },
      'done_2026-09-29_p1_mie': { done: true, date: '2026-09-29', workoutKey: 'p1_mie', note: '', cardioSessionId: 'c1' },
    }
    expect(getWeekDoneDays(TODAY, progress)).toBe(2)
    expect(getWeekDoneDays(TODAY, progress, ['2026-09-29', '2026-09-30', '2026-10-02'])).toBe(3)
  })
})
