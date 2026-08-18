/**
 * El facade `lifecycle` de la plataforma (#482).
 *
 * Lo que se prueba aquí es sobre todo el modo degradado: `lifecycle` es
 * opcional en `CorePlatform` porque muchísimos tests de core llaman a
 * `initCore()` con una plataforma mínima. Si el facade lanzara al no
 * encontrarlo, cualquier hook compartido que lo use rompería esos tests; y si
 * `isForeground()` respondiera `false`, habría código esperando para siempre un
 * evento que nadie va a emitir.
 */
import { describe, it, expect, vi } from 'vitest'
import { initCore, lifecycle, type CorePlatform } from './platform'

function minimalPlatform(overrides: Partial<CorePlatform> = {}): CorePlatform {
  return {
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    env: { pbUrl: '', aiApiUrl: '', isDev: true },
    analytics: { track: () => {}, identify: () => {}, clear: () => {} },
    connectivity: { isOnline: () => true, onOnline: () => () => {} },
    ...overrides,
  }
}

describe('facade lifecycle', () => {
  it('sin lifecycle en la plataforma, se asume primer plano', () => {
    initCore(minimalPlatform())
    expect(lifecycle.isForeground()).toBe(true)
  })

  it('sin lifecycle en la plataforma, suscribirse no lanza y devuelve un unsubscribe', () => {
    initCore(minimalPlatform())
    const handler = vi.fn()

    const offForeground = lifecycle.onForeground(handler)
    const offBackground = lifecycle.onBackground(handler)

    expect(() => { offForeground(); offBackground() }).not.toThrow()
    expect(handler).not.toHaveBeenCalled()
  })

  it('delega en la implementación inyectada', () => {
    const foreground = new Set<() => void>()
    const background = new Set<() => void>()
    initCore(minimalPlatform({
      lifecycle: {
        isForeground: () => false,
        onForeground: (h) => { foreground.add(h); return () => foreground.delete(h) },
        onBackground: (h) => { background.add(h); return () => background.delete(h) },
      },
    }))

    const onFg = vi.fn()
    const onBg = vi.fn()
    const offForeground = lifecycle.onForeground(onFg)
    lifecycle.onBackground(onBg)

    expect(lifecycle.isForeground()).toBe(false)

    foreground.forEach(h => h())
    background.forEach(h => h())
    expect(onFg).toHaveBeenCalledTimes(1)
    expect(onBg).toHaveBeenCalledTimes(1)

    // El unsubscribe que devuelve el facade tiene que ser el de la plataforma,
    // no uno vacío: si no, los handlers sobrevivirían al desmontaje.
    offForeground()
    foreground.forEach(h => h())
    expect(onFg).toHaveBeenCalledTimes(1)
  })
})
