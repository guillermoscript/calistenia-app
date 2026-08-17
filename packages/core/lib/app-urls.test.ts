import { describe, it, expect } from 'vitest'
import { WEB_BASE_URL } from './app-urls'

describe('WEB_BASE_URL', () => {
  it('es el origen de producción', () => {
    expect(WEB_BASE_URL).toBe('https://gym.guille.tech')
  })

  it('no termina en barra: todos los builders le concatenan "/algo"', () => {
    // Con barra final saldrían enlaces "https://…//invite/abc", que se comparten
    // igual y fallan raro. Es el único invariante que el resto del código asume.
    expect(WEB_BASE_URL.endsWith('/')).toBe(false)
  })
})
