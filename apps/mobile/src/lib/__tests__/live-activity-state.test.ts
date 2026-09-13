import { describe, it, expect } from 'vitest'
import { mapPhaseToActivity, liveNotificationActions, type LiveActivityState } from '../live-activity-state'

const step = { exerciseName: 'Dominadas', setNumber: 2, totalSets: 4 }

describe('mapPhaseToActivity', () => {
  it('exercise → work sin restEndsAt', () => {
    expect(mapPhaseToActivity({ phase: 'exercise', ...step })).toEqual({
      kind: 'update',
      state: { exerciseName: 'Dominadas', setIndex: 2, setTotal: 4, phase: 'work', restEndsAt: null },
    })
  })

  it('rest → rest con restEndsAt epoch ms', () => {
    const res = mapPhaseToActivity({ phase: 'rest', ...step, restEndsAt: 1770000000000 })
    expect(res).toEqual({
      kind: 'update',
      state: { exerciseName: 'Dominadas', setIndex: 2, setTotal: 4, phase: 'rest', restEndsAt: 1770000000000 },
    })
  })

  it('paso sin series (warmup cronometrado): setTotal 0 = omitir línea SERIE', () => {
    const res = mapPhaseToActivity({ phase: 'exercise', exerciseName: 'Jumping jacks', setNumber: 1, totalSets: 1 })
    expect(res).toEqual({
      kind: 'update',
      state: { exerciseName: 'Jumping jacks', setIndex: 0, setTotal: 0, phase: 'work', restEndsAt: null },
    })
  })

  it('section-transition → work con nombre de sección y sin serie', () => {
    const res = mapPhaseToActivity({ phase: 'section-transition', exerciseName: 'EJERCICIOS PRINCIPALES', setNumber: 1, totalSets: 3 })
    expect(res).toEqual({
      kind: 'update',
      state: { exerciseName: 'EJERCICIOS PRINCIPALES', setIndex: 0, setTotal: 0, phase: 'work', restEndsAt: null },
    })
  })

  it('note y celebrate → end', () => {
    expect(mapPhaseToActivity({ phase: 'note', ...step })).toEqual({ kind: 'end' })
    expect(mapPhaseToActivity({ phase: 'celebrate', ...step })).toEqual({ kind: 'end' })
  })
})

describe('liveNotificationActions', () => {
  const labels = { work: 'SERIE HECHA', rest: 'SALTAR DESCANSO', transition: 'CONTINUAR', stop: 'DETENER' }
  const work: LiveActivityState = { exerciseName: 'Dominadas', setIndex: 2, setTotal: 4, phase: 'work', restEndsAt: null }

  it('serie en curso → «serie hecha» y «detener»', () => {
    expect(liveNotificationActions(work, labels)).toEqual([
      { id: 'live-next', title: 'SERIE HECHA' },
      { id: 'live-stop', title: 'DETENER' },
    ])
  })

  it('descanso → «saltar descanso» y «detener»', () => {
    const rest = { ...work, phase: 'rest' as const, restEndsAt: 1770000000000 }
    expect(liveNotificationActions(rest, labels).map((a) => a.title)).toEqual(['SALTAR DESCANSO', 'DETENER'])
  })

  it('paso sin series o transición → «continuar» y «detener»', () => {
    const transition = { ...work, setIndex: 0, setTotal: 0 }
    expect(liveNotificationActions(transition, labels).map((a) => a.title)).toEqual(['CONTINUAR', 'DETENER'])
  })

  it('«detener» va siempre el último, en todas las fases', () => {
    for (const state of [work, { ...work, phase: 'rest' as const }, { ...work, setTotal: 0 }]) {
      expect(liveNotificationActions(state, labels).at(-1)).toEqual({ id: 'live-stop', title: 'DETENER' })
    }
  })

  it('sin etiquetas → sin botones', () => {
    expect(liveNotificationActions(work, null)).toEqual([])
  })
})
