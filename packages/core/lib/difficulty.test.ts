import { describe, it, expect } from 'vitest'
import { inferDifficulty, DIFFICULTY_COLORS } from './difficulty'

describe('inferDifficulty', () => {
  it('sin keywords conocidas devuelve beginner por defecto', () => {
    expect(inferDifficulty([{ name: 'Push-up' }])).toBe('beginner')
  })

  it('detecta advanced por nombre (muscle-up)', () => {
    expect(inferDifficulty([{ name: 'Muscle-up' }])).toBe('advanced')
  })

  it('detecta intermediate por nombre (pistol squat)', () => {
    expect(inferDifficulty([{ name: 'Pistol squat' }])).toBe('intermediate')
  })

  it('busca las keywords también en id y note, no solo en name', () => {
    expect(inferDifficulty([{ id: 'planche_lean', name: 'Ejercicio genérico' }])).toBe('advanced')
    expect(inferDifficulty([{ name: 'Ejercicio genérico', note: 'variante con lastre (mochila)' }])).toBe('intermediate')
  })

  it('advanced gana sobre intermediate si ambas keywords aparecen en la lista de ejercicios', () => {
    const exercises = [{ name: 'Pistol squat' }, { name: 'Front lever' }]
    expect(inferDifficulty(exercises)).toBe('advanced')
  })

  it('evalúa el texto concatenado de todos los ejercicios, no solo el primero', () => {
    const exercises = [{ name: 'Push-up' }, { name: 'Handstand push up' }]
    expect(inferDifficulty(exercises)).toBe('advanced')
  })

  it('lista vacía devuelve beginner', () => {
    expect(inferDifficulty([])).toBe('beginner')
  })

  it('es case-insensitive', () => {
    expect(inferDifficulty([{ name: 'MUSCLE-UP' }])).toBe('advanced')
  })
})

describe('DIFFICULTY_COLORS', () => {
  it('define clases text/bg/border para los 3 niveles de dificultad', () => {
    for (const level of ['beginner', 'intermediate', 'advanced'] as const) {
      expect(DIFFICULTY_COLORS[level]).toEqual(
        expect.objectContaining({
          text: expect.any(String),
          bg: expect.any(String),
          border: expect.any(String),
        }),
      )
    }
  })

  it('cada nivel tiene un set de clases distinto de los otros', () => {
    const sets = (['beginner', 'intermediate', 'advanced'] as const).map(
      l => JSON.stringify(DIFFICULTY_COLORS[l]),
    )
    expect(new Set(sets).size).toBe(3)
  })
})
