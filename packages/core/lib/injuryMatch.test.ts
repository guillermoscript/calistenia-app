import { describe, it, expect } from 'vitest'
import { exerciseInjuryFlags } from './injuryMatch'

describe('exerciseInjuryFlags', () => {
  it('devuelve [] si el usuario no reportó lesiones', () => {
    expect(exerciseInjuryFlags('Push-up', [])).toEqual([])
  })

  it('detecta shoulder en flexiones (keyword en inglés y en español)', () => {
    expect(exerciseInjuryFlags('Push-up', ['shoulder'])).toEqual(['shoulder'])
    expect(exerciseInjuryFlags('Flexión de pecho', ['shoulder'])).toEqual(['shoulder'])
  })

  it('es case-insensitive', () => {
    expect(exerciseInjuryFlags('PUSH-UP DIAMANTE', ['shoulder'])).toEqual(['shoulder'])
  })

  it('ignora "other" aunque esté en la lista de lesiones del usuario', () => {
    expect(exerciseInjuryFlags('Push-up', ['other'])).toEqual([])
  })

  it('un ejercicio puede activar varias lesiones a la vez', () => {
    const flags = exerciseInjuryFlags('Push-up diamante', ['shoulder', 'wrist', 'elbow'])
    expect(flags).toEqual(['shoulder', 'wrist', 'elbow'])
  })

  it('preserva el orden de userInjuries en el resultado, no el de las keywords internas', () => {
    const flags = exerciseInjuryFlags('Push-up', ['elbow', 'shoulder'])
    expect(flags).toEqual(['elbow', 'shoulder'])
  })

  it('no marca lesiones cuyas keywords no aparecen en el nombre', () => {
    expect(exerciseInjuryFlags('Sentadilla', ['shoulder', 'wrist'])).toEqual([])
    expect(exerciseInjuryFlags('Sentadilla', ['knee'])).toEqual(['knee'])
  })

  it('detecta lower_back en ejercicios de core (l-sit, hollow)', () => {
    expect(exerciseInjuryFlags('L-sit', ['lower_back'])).toEqual(['lower_back'])
    expect(exerciseInjuryFlags('Hollow body hold', ['lower_back'])).toEqual(['lower_back'])
  })

  it('detecta ankle en ejercicios de salto', () => {
    expect(exerciseInjuryFlags('Burpee', ['ankle'])).toEqual(['ankle'])
  })

  it('un mismo keyword ("push-up") puede activar shoulder, wrist y elbow simultáneamente', () => {
    const flags = exerciseInjuryFlags('Push-up', ['shoulder', 'wrist', 'elbow', 'knee'])
    expect(flags).toEqual(['shoulder', 'wrist', 'elbow'])
  })
})
