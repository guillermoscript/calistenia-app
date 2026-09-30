import { describe, expect, it } from 'vitest'
import { isHomeTabPath, resolveHomeActiveActivity, type HomeActivitySources } from '../home-active-activity'

const NONE: HomeActivitySources = {
  battleOngoing: false,
  cardio: { state: 'idle', programDayKey: null },
  circuit: { isActive: false, startedAt: null },
  strength: { isActive: false, hasWorkout: false, source: 'program', startedAt: 0, workoutKey: '' },
}

// 12:00 local de un día fijo: el día sale igual en cualquier zona razonable.
const NOON = new Date(2026, 8, 29, 12, 0, 0).getTime()

describe('resolveHomeActiveActivity', () => {
  it('sin nada en curso devuelve null', () => {
    expect(resolveHomeActiveActivity(NONE)).toBeNull()
  })

  it('fuerza del programa lleva su clave y el día en que empezó', () => {
    expect(resolveHomeActiveActivity({
      ...NONE,
      strength: { isActive: true, hasWorkout: true, source: 'program', startedAt: NOON, workoutKey: 'p1_mar' },
    })).toEqual({ type: 'strength', startedDay: '2026-09-29', workoutKey: 'p1_mar' })
  })

  it('una sesión libre (o el primer entreno) es `free` y sin clave de programa', () => {
    expect(resolveHomeActiveActivity({
      ...NONE,
      strength: { isActive: true, hasWorkout: true, source: 'free', startedAt: NOON, workoutKey: 'free_123' },
    })).toEqual({ type: 'free', startedDay: '2026-09-29', workoutKey: null })
  })

  it('una sesión marcada activa pero sin entreno cargado no cuenta', () => {
    expect(resolveHomeActiveActivity({
      ...NONE,
      strength: { isActive: true, hasWorkout: false, source: 'program', startedAt: NOON, workoutKey: 'p1_mar' },
    })).toBeNull()
  })

  it('cardio pausado cuenta; terminado no', () => {
    expect(resolveHomeActiveActivity({ ...NONE, cardio: { state: 'paused', programDayKey: 'p1_jue' } }))
      .toEqual({ type: 'cardio', workoutKey: 'p1_jue' })
    expect(resolveHomeActiveActivity({ ...NONE, cardio: { state: 'finished', programDayKey: null } })).toBeNull()
  })

  it('prioridad: batalla > cardio > circuito > fuerza', () => {
    const all: HomeActivitySources = {
      battleOngoing: true,
      cardio: { state: 'tracking', programDayKey: null },
      circuit: { isActive: true, startedAt: NOON },
      strength: { isActive: true, hasWorkout: true, source: 'program', startedAt: NOON, workoutKey: 'p1_mar' },
    }
    expect(resolveHomeActiveActivity(all)?.type).toBe('battle')
    expect(resolveHomeActiveActivity({ ...all, battleOngoing: false })?.type).toBe('cardio')
    expect(resolveHomeActiveActivity({ ...all, battleOngoing: false, cardio: NONE.cardio })?.type).toBe('circuit')
  })
})

describe('isHomeTabPath', () => {
  it('solo la raíz es Hoy', () => {
    expect(isHomeTabPath('/')).toBe(true)
    expect(isHomeTabPath('/community')).toBe(false)
    expect(isHomeTabPath(null)).toBe(false)
  })
})
