/**
 * `duplicatedName` — el nombre que `usePrograms.duplicateProgram` guarda al
 * duplicar un programa (issue #602).
 *
 * `programs.name` es un campo `json` i18n `{es, en}` desde la migración
 * `1774378015_i18n_program_fields.js`. La versión anterior interpolaba el campo
 * (`` `${original.name} (copia)` ``), así que el programa duplicado se llamaba
 * literalmente «[object Object] (copia)» y, al ser un string plano en una
 * columna `json`, `localize()` tampoco lo arreglaba al leerlo.
 *
 * El hook no se renderiza: los tests de core corren en vitest/node sin
 * testing-library, así que se testea la función pura que construye el nombre.
 */
import { describe, expect, it } from 'vitest'
import { duplicatedName, localize } from './i18n-db'

describe('duplicatedName', () => {
  it('sufija cada locale del nombre i18n con su propia palabra (#602)', () => {
    expect(duplicatedName({ es: 'Fuerza Total', en: 'Full Strength' }, 'es')).toEqual({
      es: 'Fuerza Total (copia)',
      en: 'Full Strength (copy)',
    })
  })

  it('no depende del locale activo: el mapa resultante es el mismo', () => {
    const name = { es: 'Fuerza Total', en: 'Full Strength' }
    expect(duplicatedName(name, 'en')).toEqual(duplicatedName(name, 'es'))
  })

  it('nunca produce «[object Object]» y sigue siendo legible por localize()', () => {
    const copy = duplicatedName({ es: 'Fuerza Total', en: 'Full Strength' }, 'es')
    expect(JSON.stringify(copy)).not.toContain('[object Object]')
    expect(localize(copy, 'es')).toBe('Fuerza Total (copia)')
    expect(localize(copy, 'en')).toBe('Full Strength (copy)')
  })

  it('conserva los locales que trae el original, sin inventar otros', () => {
    expect(duplicatedName({ es: 'Solo español' }, 'en')).toEqual({ es: 'Solo español (copia)' })
  })

  it('cae al sufijo español en un locale sin traducción', () => {
    expect(duplicatedName({ fr: 'Force' }, 'fr')).toEqual({ fr: 'Force (copia)' })
  })

  it('envuelve un string plano pre-migración bajo el locale activo', () => {
    expect(duplicatedName('Fuerza Total', 'es')).toEqual({ es: 'Fuerza Total (copia)' })
    expect(duplicatedName('Full Strength', 'en')).toEqual({ en: 'Full Strength (copy)' })
  })

  it('tolera nombre ausente o mapa vacío sin dejar espacios sueltos', () => {
    expect(duplicatedName(undefined, 'es')).toEqual({ es: '(copia)' })
    expect(duplicatedName({}, 'en')).toEqual({ en: '(copy)' })
  })
})
