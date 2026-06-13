import { describe, it, expect } from 'vitest'
import { mapPhaseToActivity } from '../live-activity-state'

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
