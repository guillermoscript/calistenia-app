import { describe, it, expect } from 'vitest'
import { toBcp47, safeLocale } from './i18n-safe'

/**
 * Regresión de GYM-GUILLE-21: un iPhone con la región en modo POSIX reportaba
 * `navigator.language === 'en-US@posix'`, i18next lo propagaba tal cual a
 * `i18n.language` y el primer `toLocaleDateString(locale)` del dashboard —el
 * `weekLabel` de useCardioStats— lanzaba `RangeError: Invalid language tag`,
 * que subía hasta el ErrorBoundary y dejaba la app en blanco.
 */
describe('toBcp47', () => {
  it('acepta etiquetas ya válidas sin tocarlas', () => {
    expect(toBcp47('es')).toBe('es')
    expect(toBcp47('en-US')).toBe('en-US')
  })

  it('quita el modificador POSIX y conserva la región', () => {
    // `en-US@posix` es exactamente el valor que reportó el iPhone del crash.
    expect(toBcp47('en-US@posix')).toBe('en-US')
  })

  it('cae a la subetiqueta primaria si el resto sigue siendo inválido', () => {
    expect(toBcp47('en-u-')).toBe('en')
  })

  it('limpia el codeset y el separador POSIX', () => {
    expect(toBcp47('es_ES.UTF-8')).toBe('es-ES')
    expect(toBcp47('es_ES.UTF-8@euro')).toBe('es-ES')
  })

  it('devuelve null cuando no hay nada rescatable', () => {
    expect(toBcp47(null)).toBeNull()
    expect(toBcp47(undefined)).toBeNull()
    expect(toBcp47('')).toBeNull()
    expect(toBcp47('   ')).toBeNull()
    expect(toBcp47('@posix')).toBeNull()
    expect(toBcp47('!!!')).toBeNull()
  })
})

describe('safeLocale', () => {
  it('nunca devuelve algo que Intl rechace', () => {
    for (const tag of ['en-US@posix', 'es_ES.UTF-8', '!!!', '', null]) {
      const locale = safeLocale(tag)
      expect(() => new Intl.DateTimeFormat(locale)).not.toThrow()
      expect(() => new Date().toLocaleDateString(locale, { month: 'short' })).not.toThrow()
    }
  })

  it('respalda al idioma por defecto de la app', () => {
    expect(safeLocale('!!!')).toBe('es')
    expect(safeLocale(null)).toBe('es')
  })
})
