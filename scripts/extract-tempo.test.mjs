/**
 * extract-tempo.test.mjs — Unit tests for the parseTempo() pure function.
 *
 * Run with: node --experimental-vm-modules apps/mobile/node_modules/.bin/vitest run scripts/extract-tempo.test.mjs
 * Or: cd <root> && pnpm --filter @calistenia/mobile test -- scripts/extract-tempo.test.mjs
 */

import { describe, it, expect } from 'vitest'
import { parseTempo } from './extract-tempo.mjs'

describe('parseTempo — eccentric detection', () => {
  it('reps "5 (5s bajada)" → { eccentric: 5 }', () => {
    expect(parseTempo('5 (5s bajada)')).toMatchObject({ eccentric: 5 })
  })

  it('note "baja MUY lento 5 segundos" → { eccentric: 5 }', () => {
    expect(parseTempo('baja MUY lento 5 segundos')).toMatchObject({ eccentric: 5 })
  })

  it('combined reps+note "5 (5s bajada) Sube con silla, baja MUY lento 5 segundos" → { eccentric: 5 }', () => {
    const result = parseTempo('5 (5s bajada) Sube con silla, baja MUY lento 5 segundos.')
    expect(result).not.toBeNull()
    expect(result?.eccentric).toBe(5)
  })

  it('"baja lento 3s" → { eccentric: 3 }', () => {
    expect(parseTempo('baja lento 3s')).toMatchObject({ eccentric: 3 })
  })

  it('"3s bajada" → { eccentric: 3 }', () => {
    expect(parseTempo('3s bajada')).toMatchObject({ eccentric: 3 })
  })
})

describe('parseTempo — pauseTop detection', () => {
  it('"Pausa 1s arriba" → { pauseTop: 1 }', () => {
    expect(parseTempo('Pausa 1s arriba')).toMatchObject({ pauseTop: 1 })
  })

  it('"pausa isométrica 3s arriba" → { pauseTop: 3 }', () => {
    expect(parseTempo('pausa isométrica 3s arriba')).toMatchObject({ pauseTop: 3 })
  })

  it('"(3s arriba)" → { pauseTop: 3 }', () => {
    expect(parseTempo('10 (3s arriba)')).toMatchObject({ pauseTop: 3 })
  })

  it('"2s de pausa arriba" → { pauseTop: 2 }', () => {
    expect(parseTempo('2s de pausa arriba')).toMatchObject({ pauseTop: 2 })
  })

  it('"1s pausa" (standalone, no arriba/abajo) → { pauseTop: 1 }', () => {
    expect(parseTempo('Aprieta fuerte arriba, 1s pausa.')).toMatchObject({ pauseTop: 1 })
  })
})

describe('parseTempo — concentric detection', () => {
  it('"explosivo" → { concentric: 1 }', () => {
    expect(parseTempo('Sube explosivo')).toMatchObject({ concentric: 1 })
  })

  it('"fuerte" → { concentric: 1 }', () => {
    expect(parseTempo('Sube fuerte, baja controlado')).toMatchObject({ concentric: 1 })
  })
})

describe('parseTempo — no-numeric guard', () => {
  it('"lento" alone (no number) → null', () => {
    expect(parseTempo('lento y controlado')).toBeNull()
  })

  it('"controlado" alone → null', () => {
    expect(parseTempo('Movimiento controlado')).toBeNull()
  })

  it('empty string → null', () => {
    expect(parseTempo('')).toBeNull()
  })

  it('null input → null', () => {
    expect(parseTempo(null)).toBeNull()
  })

  it('unrelated text → null', () => {
    expect(parseTempo('Mantén la espalda recta y el core activo')).toBeNull()
  })
})

describe('parseTempo — combined patterns', () => {
  it('"5 (5s bajada) + baja MUY lento 5 segundos" → eccentric:5 only once', () => {
    const result = parseTempo('5 (5s bajada) baja MUY lento 5 segundos')
    expect(result?.eccentric).toBe(5)
    // should not produce any NaN
    for (const v of Object.values(result || {})) {
      expect(typeof v).toBe('number')
      expect(isNaN(v)).toBe(false)
    }
  })

  it('"pausa isométrica 3s arriba. Si es fácil: unilateral." → { pauseTop: 3 }', () => {
    expect(parseTempo('pausa isométrica 3s arriba. Si es fácil: unilateral.')).toMatchObject({ pauseTop: 3 })
  })
})
