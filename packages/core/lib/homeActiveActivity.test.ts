import { describe, expect, it } from 'vitest'
import { resolveHomeActiveActivity, type HomeActivitySources } from './homeActiveActivity'

const NONE: HomeActivitySources = {
  battleOngoing: false,
  strength: { isActive: false, hasWorkout: false, source: 'program', startedAt: 0, workoutKey: '' },
  cardio: { state: 'idle', startedAt: null, programDayKey: null },
  circuit: { isActive: false, hasCircuit: false, startedAt: null, programDayKey: null },
}

// Mediodía local de días fijos: el día sale igual en cualquier zona razonable.
const MON_NOON = new Date(2026, 8, 28, 12, 0, 0).getTime()
const TUE_NOON = new Date(2026, 8, 29, 12, 0, 0).getTime()
const TUE_LATER = TUE_NOON + 30 * 60_000

const strength = (over: Partial<HomeActivitySources['strength']> = {}): HomeActivitySources['strength'] =>
  ({ isActive: true, hasWorkout: true, source: 'program', startedAt: TUE_NOON, workoutKey: 'p1_mar', ...over })
const cardio = (over: Partial<HomeActivitySources['cardio']> = {}): HomeActivitySources['cardio'] =>
  ({ state: 'tracking', startedAt: TUE_NOON, programDayKey: null, ...over })
const circuit = (over: Partial<HomeActivitySources['circuit']> = {}): HomeActivitySources['circuit'] =>
  ({ isActive: true, hasCircuit: true, startedAt: TUE_NOON, programDayKey: null, ...over })

describe('resolveHomeActiveActivity', () => {
  it('sin nada en curso devuelve null', () => {
    expect(resolveHomeActiveActivity(NONE)).toBeNull()
  })

  it('fuerza del programa lleva su clave y el día en que empezó', () => {
    expect(resolveHomeActiveActivity({ ...NONE, strength: strength() }))
      .toEqual({ type: 'strength', startedDay: '2026-09-29', workoutKey: 'p1_mar' })
  })

  it('una sesión libre (o el primer entreno) es `free` y sin clave de programa', () => {
    expect(resolveHomeActiveActivity({ ...NONE, strength: strength({ source: 'free', workoutKey: 'free_123' }) }))
      .toEqual({ type: 'free', startedDay: '2026-09-29', workoutKey: null })
  })

  it('una sesión o un circuito activos pero sin entreno cargado no cuentan', () => {
    expect(resolveHomeActiveActivity({ ...NONE, strength: strength({ hasWorkout: false }) })).toBeNull()
    expect(resolveHomeActiveActivity({ ...NONE, circuit: circuit({ hasCircuit: false }) })).toBeNull()
  })

  it('cardio en marcha o pausado cuenta, con su día; terminado o sin empezar no', () => {
    expect(resolveHomeActiveActivity({ ...NONE, cardio: cardio({ state: 'paused', programDayKey: 'p1_jue', startedAt: MON_NOON }) }))
      .toEqual({ type: 'cardio', startedDay: '2026-09-28', workoutKey: 'p1_jue' })
    expect(resolveHomeActiveActivity({ ...NONE, cardio: cardio({ state: 'finished' }) })).toBeNull()
    expect(resolveHomeActiveActivity({ ...NONE, cardio: cardio({ state: 'idle' }) })).toBeNull()
  })

  it('circuito lleva el día del programa si lo es', () => {
    expect(resolveHomeActiveActivity({ ...NONE, circuit: circuit({ programDayKey: 'p2_vie' }) }))
      .toEqual({ type: 'circuit', startedDay: '2026-09-29', workoutKey: 'p2_vie' })
  })

  it('sin hora de inicio conocida no hay día de inicio', () => {
    expect(resolveHomeActiveActivity({ ...NONE, cardio: cardio({ startedAt: null }) })?.startedDay).toBeNull()
    expect(resolveHomeActiveActivity({ ...NONE, strength: strength({ startedAt: 0 }) })?.startedDay).toBeNull()
  })

  it('la batalla gana a todo, aunque se empezara antes', () => {
    expect(resolveHomeActiveActivity({
      battleOngoing: true, strength: strength({ startedAt: TUE_LATER }), cardio: cardio(), circuit: circuit(),
    })).toEqual({ type: 'battle', startedDay: null, workoutKey: null })
  })

  it('una fuerza que quedó abierta y un cardio empezado después: gana el cardio', () => {
    expect(resolveHomeActiveActivity({
      ...NONE, strength: strength({ startedAt: MON_NOON }), cardio: cardio({ startedAt: TUE_NOON }),
    })?.type).toBe('cardio')
  })

  it('un cardio pausado de ayer y una fuerza empezada hoy: gana la fuerza', () => {
    expect(resolveHomeActiveActivity({
      ...NONE, strength: strength({ startedAt: TUE_NOON }), cardio: cardio({ state: 'paused', startedAt: MON_NOON }),
    })?.type).toBe('strength')
  })

  it('un circuito empezado después de la fuerza gana a la fuerza', () => {
    expect(resolveHomeActiveActivity({
      ...NONE, strength: strength({ startedAt: TUE_NOON }), circuit: circuit({ startedAt: TUE_LATER }),
    })?.type).toBe('circuit')
  })

  it('sin hora de inicio cuenta como la más antigua', () => {
    expect(resolveHomeActiveActivity({
      ...NONE, strength: strength({ startedAt: MON_NOON }), cardio: cardio({ startedAt: null }),
    })?.type).toBe('strength')
  })

  it('a igual hora: cardio > circuito > fuerza', () => {
    const all = { ...NONE, strength: strength(), cardio: cardio(), circuit: circuit() }
    expect(resolveHomeActiveActivity(all)?.type).toBe('cardio')
    expect(resolveHomeActiveActivity({ ...all, cardio: NONE.cardio })?.type).toBe('circuit')
    expect(resolveHomeActiveActivity({ ...all, cardio: NONE.cardio, circuit: NONE.circuit })?.type).toBe('strength')
  })
})
