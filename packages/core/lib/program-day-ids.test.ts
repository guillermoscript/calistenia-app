import { describe, it, expect } from 'vitest'
import { normalizeProgramDayIds } from './program-day-ids'

const ex = (phase_number: number, day_id: string, sort_order = 1) => ({ phase_number, day_id, sort_order, exercise_name: 'x' })

describe('normalizeProgramDayIds (#575)', () => {
  it('deja intactas las filas con day_id válido y no remapea nada', () => {
    const exercises = [ex(1, 'lun'), ex(1, 'mie'), ex(1, 'vie')]
    const r = normalizeProgramDayIds(exercises, [])
    expect(r.remapped).toEqual({})
    expect(r.exercises).toBe(exercises)
  })

  it('remapea d1..d3 a lun/mie/vie (programa de 3 días)', () => {
    const r = normalizeProgramDayIds([ex(1, 'd1'), ex(1, 'd2'), ex(1, 'd3')], [])
    expect(r.remapped).toEqual({ 1: { d1: 'lun', d2: 'mie', d3: 'vie' } })
    expect(r.exercises.map(e => e.day_id)).toEqual(['lun', 'mie', 'vie'])
  })

  it('remapea d1..d4 a lun/mar/jue/vie y d1..d5 a lun..vie', () => {
    const r4 = normalizeProgramDayIds([ex(1, 'd1'), ex(1, 'd2'), ex(1, 'd3'), ex(1, 'd4')], [])
    expect(Object.values(r4.remapped[1])).toEqual(['lun', 'mar', 'jue', 'vie'])
    const r5 = normalizeProgramDayIds(['d1', 'd2', 'd3', 'd4', 'd5'].map(d => ex(1, d)), [])
    expect(Object.values(r5.remapped[1])).toEqual(['lun', 'mar', 'mie', 'jue', 'vie'])
  })

  it('ordena numéricamente (d10 después de d2) y remapea por fase de forma independiente', () => {
    const r = normalizeProgramDayIds(
      [ex(2, 'd2'), ex(2, 'd10'), ex(2, 'd1'), ex(1, 'd1')],
      [],
    )
    expect(r.remapped[2]).toEqual({ d1: 'lun', d2: 'mie', d10: 'vie' })
    expect(r.remapped[1]).toEqual({ d1: 'lun' })
  })

  it('no pisa días válidos que la fase ya use', () => {
    const r = normalizeProgramDayIds([ex(1, 'lun'), ex(1, 'd1'), ex(1, 'd2')], [])
    const ids = new Set(r.exercises.map(e => e.day_id))
    expect(ids.size).toBe(3)
    expect(ids.has('lun')).toBe(true)
    expect(r.remapped[1].d1).not.toBe('lun')
  })

  it('aplica el mismo mapa a program_day_config y no muta la entrada', () => {
    const exercises = [ex(1, 'd1')]
    const dayConfigs = [{ phase_number: 1, day_id: 'd1', day_type: 'push' }]
    const r = normalizeProgramDayIds(exercises, dayConfigs)
    expect(r.dayConfigs[0].day_id).toBe('lun')
    expect(exercises[0].day_id).toBe('d1')
    expect(dayConfigs[0].day_id).toBe('d1')
  })
})
