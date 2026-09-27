import { describe, expect, it } from 'vitest'
import { localizeReps } from './localize-reps'

describe('localizeReps (#847)', () => {
  it('traduce las cadenas de los programas oficiales', () => {
    const cases: Array<[string, string]> = [
      ['10 por lado', '10 per side'],
      ['10-12 c/pierna', '10-12 per leg'],
      ['8 c/lado', '8 per side'],
      ['20-30 seg c/lado', '20-30 s per side'],
      ['20-30s por lado', '20-30s per side'],
      ['30 s (15 s por brazo)', '30 s (15 s per arm)'],
      ['40 s (20 s por dirección)', '40 s (20 s per direction)'],
      ['45 s de intentos', '45 s of attempts'],
      ['5 (8 s de bajada)', '5 (8 s lowering)'],
      ['5 negativas (5s cada una)', '5 negatives (5s each)'],
      ['10 s libres', '10 s free'],
      ['3 (descenso 4 s)', '3 (4 s lowering)'],
      ['30 s cada posición', '30 s per position'],
      ['10 repeticiones', '10 reps'],
      ['16 (8 por lado)', '16 (8 per side)'],
      ['8-12', '8-12'],
      ['45 s', '45 s'],
    ]
    for (const [es, en] of cases) expect(localizeReps(es, 'en')).toBe(en)
  })

  it('en español o sin idioma devuelve el texto intacto', () => {
    expect(localizeReps('10 por lado', 'es')).toBe('10 por lado')
    expect(localizeReps('10 por lado', 'es-ES')).toBe('10 por lado')
    expect(localizeReps('10 por lado', undefined)).toBe('10 por lado')
  })

  it('tolera vacío y null', () => {
    expect(localizeReps(null, 'en')).toBe('')
    expect(localizeReps('', 'en')).toBe('')
  })
})
