import { describe, it, expect } from 'vitest'
import { isIsoTextDatetime, toIsoTextDatetime } from './pbTextDatetime'

describe('toIsoTextDatetime', () => {
  it('convierte la cota con ESPACIO de PocketBase al formato con T que guardan las filas', () => {
    // Es el caso que se comía el último día: 'T' ordena después de ' '.
    expect(toIsoTextDatetime('2026-04-05 23:59:59')).toBe('2026-04-05T23:59:59.000Z')
  })

  it('una cota solo de fecha es medianoche, como ya significaba antes', () => {
    expect(toIsoTextDatetime('2026-04-05')).toBe('2026-04-05T00:00:00.000Z')
  })

  it('rellena SIEMPRE los milisegundos: sin ellos la comparación de texto también miente', () => {
    // 'Z' (0x5A) > '.' (0x2E): sin rellenar, este valor ordenaba DESPUÉS de
    // '2026-06-14T09:15:00.000Z' siendo el mismo instante.
    expect(toIsoTextDatetime('2026-06-14T09:15:00Z')).toBe('2026-06-14T09:15:00.000Z')
  })

  it('deja intacto lo que ya es canónico', () => {
    expect(toIsoTextDatetime('2026-04-05T00:05:22.003Z')).toBe('2026-04-05T00:05:22.003Z')
  })

  it('trunca una fracción más larga a milisegundos', () => {
    expect(toIsoTextDatetime('2026-04-05T00:05:22.123456Z')).toBe('2026-04-05T00:05:22.123Z')
  })

  it('acepta hora sin segundos', () => {
    expect(toIsoTextDatetime('2026-04-05 07:30')).toBe('2026-04-05T07:30:00.000Z')
  })

  it('ordena correctamente una vez normalizado (que es todo el objetivo)', () => {
    const fila = toIsoTextDatetime('2026-04-05T00:05:22.003Z')
    const cotaBaja = toIsoTextDatetime('2026-04-05')
    const cotaAlta = toIsoTextDatetime('2026-04-05 23:59:59')
    expect(fila >= cotaBaja && fila <= cotaAlta).toBe(true)
  })

  it('vacío o nulo devuelve cadena vacía en vez de lanzar', () => {
    expect(toIsoTextDatetime('')).toBe('')
    expect(toIsoTextDatetime(null)).toBe('')
    expect(toIsoTextDatetime(undefined)).toBe('')
  })

  it('lo que no reconoce lo devuelve tal cual, sin romper el filtro', () => {
    expect(toIsoTextDatetime('mañana')).toBe('mañana')
  })
})

describe('isIsoTextDatetime', () => {
  it('distingue la forma canónica de las que hay que normalizar', () => {
    expect(isIsoTextDatetime('2026-04-05T00:05:22.003Z')).toBe(true)
    expect(isIsoTextDatetime('2026-08-22 19:57:21.000Z')).toBe(false)
    expect(isIsoTextDatetime('2026-06-14T09:15:00Z')).toBe(false)
    expect(isIsoTextDatetime('')).toBe(false)
  })
})
