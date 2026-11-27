import { describe, expect, it } from 'vitest'
import { recommendNextPrograms } from './nextProgram'
import type { ProgramMeta } from '../types'

const p = (over: Partial<ProgramMeta> & { id: string }): ProgramMeta => ({
  name: over.id,
  description: '',
  duration_weeks: 12,
  is_official: true,
  ...over,
})

const fundamentos = p({ id: 'fund', slug: 'principiante-fundamentos', difficulty: 'beginner', goal_type: 'maintain', next_programs: ['principiante-ganar-musculo', 'pull-up-roadmap'] })
const ganar = p({ id: 'ganar', slug: 'principiante-ganar-musculo', difficulty: 'beginner', goal_type: 'muscle_gain', next_programs: ['intermedio-hipertrofia'] })
const pullup = p({ id: 'pullup', slug: 'pull-up-roadmap', difficulty: 'beginner', goal_type: 'skill', next_programs: ['muscle-up-roadmap'] })
const muscleup = p({ id: 'mu', slug: 'muscle-up-roadmap', difficulty: 'intermediate', goal_type: 'skill', next_programs: [] })
const hiper = p({ id: 'hiper', slug: 'intermedio-hipertrofia', difficulty: 'intermediate', goal_type: 'muscle_gain', next_programs: [] })
const balance = p({ id: 'bal', slug: 'intermedio-balance-total', difficulty: 'intermediate', goal_type: 'maintain', next_programs: [] })
const volumen = p({ id: 'vol', slug: 'avanzado-volumen', difficulty: 'advanced', goal_type: 'muscle_gain', next_programs: [] })
const fuerza = p({ id: 'fuerza', slug: 'avanzado-fuerza-total', difficulty: 'advanced', goal_type: 'maintain', next_programs: [] })
const toning = p({ id: 'toning', slug: 'mujer-full-body-toning', difficulty: 'beginner', goal_type: 'maintain', for_women: true, next_programs: [] })
const mio = p({ id: 'mio', is_official: false, difficulty: 'intermediate', goal_type: 'maintain' })

const ALL = [balance, fuerza, fundamentos, ganar, hiper, mio, muscleup, pullup, toning, volumen]
const ids = (list: ProgramMeta[]) => list.map(x => x.id)

describe('recommendNextPrograms', () => {
  it('con ruta declarada: primero la ruta, en su orden', () => {
    const out = recommendNextPrograms(ALL, { completed: fundamentos })
    expect(ids(out).slice(0, 2)).toEqual(['ganar', 'pullup'])
  })

  it('Pull-up Roadmap lleva a Muscle-up Roadmap', () => {
    expect(recommendNextPrograms(ALL, { completed: pullup })[0].id).toBe('mu')
  })

  it('nunca devuelve el terminado ni los excluidos', () => {
    const out = recommendNextPrograms(ALL, { completed: fundamentos, excludeIds: ['ganar'] })
    expect(ids(out)).not.toContain('fund')
    expect(ids(out)).not.toContain('ganar')
    expect(out[0].id).toBe('pullup')
  })

  it('un slug de la ruta que no está en el catálogo se salta sin romper', () => {
    const roto = { ...ganar, next_programs: ['no-existe', 'intermedio-hipertrofia'] }
    expect(recommendNextPrograms(ALL, { completed: roto })[0].id).toBe('hiper')
  })

  it('la ruta solo casa con oficiales, aunque un programa de usuario copie el slug', () => {
    const copia = p({ id: 'copia', is_official: false, slug: 'intermedio-hipertrofia', difficulty: 'intermediate' })
    expect(recommendNextPrograms([copia, ...ALL], { completed: ganar })[0].id).toBe('hiper')
  })

  it('sin ruta: mismo objetivo un nivel más arriba gana', () => {
    const sinRuta = { ...ganar, next_programs: [] }
    expect(recommendNextPrograms(ALL, { completed: sinRuta })[0].id).toBe('hiper')
  })

  it('sin ruta: los más fáciles van al final', () => {
    const out = recommendNextPrograms(ALL, { completed: hiper })
    const tail = ids(out).slice(-4)
    expect(tail.sort()).toEqual(['fund', 'ganar', 'pullup', 'toning'].sort())
    expect(out[0].id).toBe('vol')
  })

  it('último nivel sin ruta: primero los avanzados, oficiales antes que los de usuario', () => {
    const out = recommendNextPrograms(ALL, { completed: volumen })
    expect(out[0].id).toBe('fuerza')
    expect(ids(out).indexOf('bal')).toBeLessThan(ids(out).indexOf('mio'))
    // Todos los demás son más fáciles: dentro de ese grupo, el de usuario va el último.
    expect(ids(out).at(-1)).toBe('mio')
  })

  it('a igualdad, prefiere la misma variante («Mujer ·» o no) que el terminado', () => {
    const mujerSinRuta = { ...toning, id: 'toning2', next_programs: [] }
    const out = recommendNextPrograms([fundamentos, toning, ...[balance]], { completed: mujerSinRuta })
    expect(ids(out).indexOf('toning')).toBeLessThan(ids(out).indexOf('fund'))
  })

  it('sin programa terminado: los de tu nivel primero, el resto en su orden', () => {
    const out = recommendNextPrograms(ALL, { level: 'intermedio' })
    expect(ids(out).slice(0, 4)).toEqual(['bal', 'hiper', 'mio', 'mu'])
    expect(ids(out).slice(4)).toEqual(['fuerza', 'fund', 'ganar', 'pullup', 'toning', 'vol'])
  })

  it('sin nivel cuenta como principiante, y una lista vacía o null no rompe', () => {
    expect(recommendNextPrograms(ALL, {})[0].id).toBe('fund')
    expect(recommendNextPrograms(null, { completed: fundamentos })).toEqual([])
    expect(recommendNextPrograms([], {})).toEqual([])
  })
})
