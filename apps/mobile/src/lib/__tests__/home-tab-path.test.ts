import { describe, expect, it } from 'vitest'
import { isHomeTabPath } from '../home-tab-path'

describe('isHomeTabPath', () => {
  it('solo la raíz es Hoy', () => {
    expect(isHomeTabPath('/')).toBe(true)
    expect(isHomeTabPath('/community')).toBe(false)
    expect(isHomeTabPath(null)).toBe(false)
  })
})
