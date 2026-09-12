import { describe, it, expect, beforeAll } from 'vitest'
import { setTimezone } from './dateUtils'
import { buildSkills, programWeek, SKILL_DEFS, DEFAULT_PROGRAM_WEEKS } from './athlete-card'

beforeAll(() => {
  setTimezone('UTC')
})

describe('buildSkills', () => {
  it('no devuelve nada cuando no hay marcas: sin empezar no es «en camino»', () => {
    expect(buildSkills(null)).toEqual([])
    expect(buildSkills({})).toEqual([])
  })

  it('deja fuera las que siguen a cero y conserva las empezadas', () => {
    const skills = buildSkills({ pr_pushups: 15, pr_lsit: 0 })
    expect(skills.map(s => s.key)).toEqual(['pr_pushups'])
    expect(skills.length).toBeLessThan(SKILL_DEFS.length)
  })

  it('marca como desbloqueada la que llega al objetivo', () => {
    const skills = buildSkills({ pr_pullups: 20, pr_pushups: 25 })
    const pullups = skills.find(s => s.key === 'pr_pullups')!
    const pushups = skills.find(s => s.key === 'pr_pushups')!
    expect(pullups.achieved).toBe(true)
    expect(pullups.pct).toBe(100)
    expect(pushups.achieved).toBe(false)
    expect(pushups.pct).toBe(50)
  })

  it('tapa el porcentaje en 100 cuando la marca supera el objetivo', () => {
    const [top] = buildSkills({ pr_pistol: 8 })
    expect(top.key).toBe('pr_pistol')
    expect(top.pct).toBe(100)
  })

  it('ordena desbloqueadas primero y luego por cercanía al objetivo', () => {
    const skills = buildSkills({ pr_pullups: 20, pr_lsit: 3, pr_pushups: 40 })
    expect(skills.map(s => s.key)).toEqual([
      'pr_pullups', // 100 %, desbloqueada
      'pr_pushups', // 80 %
      'pr_lsit',    // 10 %
    ])
  })

  it('ignora valores basura en vez de pintarlos como skill', () => {
    expect(buildSkills({ pr_pullups: -4, pr_lsit: Number.NaN })).toEqual([])
  })
})

describe('programWeek', () => {
  it('devuelve null sin fecha de inicio: no se inventa la semana 1', () => {
    expect(programWeek(null, 12, '2026-08-22')).toBeNull()
    expect(programWeek('', 12, '2026-08-22')).toBeNull()
  })

  it('el primer día es la semana 1', () => {
    expect(programWeek('2026-08-22', 12, '2026-08-22')).toEqual({ current: 1, total: 12 })
  })

  it('cuenta una semana cada siete días', () => {
    expect(programWeek('2026-08-01', 12, '2026-08-07')).toEqual({ current: 1, total: 12 })
    expect(programWeek('2026-08-01', 12, '2026-08-08')).toEqual({ current: 2, total: 12 })
  })

  it('no pasa del total aunque el programa se haya alargado', () => {
    expect(programWeek('2026-01-01', 12, '2026-08-22')).toEqual({ current: 12, total: 12 })
  })

  it('cae al total por defecto cuando el programa no declara duración', () => {
    expect(programWeek('2026-08-22', null, '2026-08-22')?.total).toBe(DEFAULT_PROGRAM_WEEKS)
    expect(programWeek('2026-08-22', 0, '2026-08-22')?.total).toBe(DEFAULT_PROGRAM_WEEKS)
  })
})
