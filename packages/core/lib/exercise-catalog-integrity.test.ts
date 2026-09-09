import { describe, it, expect } from 'vitest'
import catalog from '../data/exercise-catalog.json'

/**
 * Invariantes del catálogo empaquetado (issue #714).
 *
 * `validate:catalog` y `test:catalog` no corren en CI; este fichero sí (vitest
 * de core). Cada aserción es un dato que ENGAÑABA al validador de programas o a
 * la progresión automática y que se corrigió en el origen (base.json, seeds o
 * seeds/exercisedb/_overrides.json). Si un `pnpm build:catalog` los revierte,
 * esto lo para antes de mergear.
 */

type Entry = {
  id: string
  category: string
  family?: string
  difficulty: string
  equipment: string[]
  isTimer?: boolean
  timerSeconds?: number
  source: string
  name: { es: string; en: string }
  description?: { es: string; en: string }
}

const all: Entry[] = Object.values(
  (catalog as { categories: Record<string, { exercises: Entry[] }> }).categories,
).flatMap(c => c.exercises)
const byId = new Map(all.map(e => [e.id, e]))
const get = (id: string): Entry => {
  const e = byId.get(id)
  if (!e) throw new Error(`falta ${id} en exercise-catalog.json`)
  return e
}

describe('catálogo de ejercicios · integridad (#714)', () => {
  it('chinup pertenece a la familia pull_up y ningún ejercicio de tirón cae en handstand', () => {
    expect(get('chinup').family).toBe('pull_up')
    const leaked = all.filter(e => e.category === 'pull' && e.family === 'handstand').map(e => e.id)
    expect(leaked).toEqual([])
  })

  it('la cadena del nordic no invierte la dificultad', () => {
    expect(get('nordic_curl').difficulty).toBe('intermediate')
    expect(get('nordic_adv').difficulty).toBe('advanced')
    expect(get('nordic_full').difficulty).toBe('advanced')
    expect(get('nordic_full').name.es).not.toBe(get('nordic_adv').name.es)
    expect(get('nordic_curl').description?.es).toBeTruthy()
  })

  it('el pino libre y los nuevos colgados se miden en segundos', () => {
    for (const id of ['handstand_free', 'false_grip_hang', 'german_hang']) {
      const e = get(id)
      expect(e.isTimer, id).toBe(true)
      expect(e.timerSeconds, id).toBeGreaterThan(0)
    }
    expect(get('false_grip_row').isTimer).toBe(false)
  })

  it('existen los escalones que los roadmaps prometen', () => {
    expect(get('false_grip_hang').category).toBe('pull')
    expect(get('false_grip_row').category).toBe('pull')
    expect(get('german_hang').category).toBe('skill')
  })

  it('el material declarado no miente sobre polea, mancuerna, kettlebell, rueda ni TRX', () => {
    expect(get('goblet_squat').equipment).toEqual(['kettlebell'])
    expect(get('ab_wheel_rollout').equipment).toEqual(['rueda_abdominal'])
    expect(get('facepull').equipment).toEqual(['polea'])
    expect(get('bodyweight_standing_row').equipment).toEqual(['polea'])
    expect(get('bodyweight_standing_one_arm_row').equipment).toEqual(['mancuernas'])
    expect(get('suspended_row').equipment).toEqual(['trx'])
    expect(get('scapular_pull_up').equipment).toEqual(['barra_dominadas'])
    expect(get('jump_rope').equipment).toEqual(['cuerda'])
  })

  it('ninguna entrada sin material cuelga de una barra de dominadas según su propia descripción', () => {
    const liars = all
      .filter(e => e.equipment.length === 1 && e.equipment[0] === 'ninguno')
      .filter(e => /cu[eé]lgate de una barra de dominadas|hang(ing)? from a pull-up bar/i.test(`${e.description?.es ?? ''} ${e.description?.en ?? ''}`))
      .map(e => e.id)
    expect(liars).toEqual([])
  })
})
