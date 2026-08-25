import { describe, expect, it } from 'vitest'
import { screenPattern } from '../screen-pattern'

describe('screenPattern', () => {
  // #636: el bug era mandar la ruta resuelta, así que lo que hay que afirmar es
  // que dos visitas a detalles DISTINTOS producen el mismo nombre de pantalla.
  it('mantiene los corchetes del patrón en vez de resolver el id', () => {
    expect(screenPattern(['challenges', '[id]'])).toBe('/challenges/[id]')
    expect(screenPattern(['races', '[id]'])).toBe('/races/[id]')
  })

  it('quita los grupos de ruta, que no están en la URL', () => {
    expect(screenPattern(['(tabs)', 'index'])).toBe('/index')
    expect(screenPattern(['(tabs)', 'progress'])).toBe('/progress')
  })

  it('la raíz sin segmentos es "/" y no una cadena vacía', () => {
    expect(screenPattern([])).toBe('/')
    expect(screenPattern(['(tabs)'])).toBe('/')
  })
})
