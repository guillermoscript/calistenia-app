import { describe, expect, it, vi } from 'vitest'
import {
  setupNotificationTapRouting,
  type NotificationResponseLike,
  type NotificationTapRouterDeps,
} from '../notification-tap-router'

function response(over: Partial<{ identifier: string; url: string }> = {}): NotificationResponseLike {
  return {
    notification: {
      request: {
        identifier: over.identifier ?? 'req-1',
        content: {
          title: 'Recordatorio',
          data: { url: over.url ?? '/workout' },
        },
      },
    },
  }
}

/** Deps con fakes; captura llamadas para asercionar sobre ellas. */
function makeDeps(overrides: Partial<NotificationTapRouterDeps<NotificationResponseLike>> = {}) {
  const listeners: Array<(response: NotificationResponseLike) => void> = []
  const remove = vi.fn()

  const deps: NotificationTapRouterDeps<NotificationResponseLike> = {
    getLastNotificationResponseAsync: vi.fn(async () => null),
    addNotificationResponseReceivedListener: vi.fn((listener) => {
      listeners.push(listener)
      return { remove }
    }),
    clearLastNotificationResponse: vi.fn(),
    resolveNotifUrl: vi.fn((url) => (url ? `/(tabs)?autostart=1` : null)),
    track: vi.fn(),
    push: vi.fn(),
    ...overrides,
  }

  return { deps, listeners, remove }
}

describe('setupNotificationTapRouting — cold start', () => {
  it('trackea y navega cuando getLastNotificationResponseAsync trae una respuesta', async () => {
    const r = response()
    const { deps } = makeDeps({ getLastNotificationResponseAsync: vi.fn(async () => r) })

    setupNotificationTapRouting(deps)
    await flushMicrotasks()

    expect(deps.track).toHaveBeenCalledTimes(1)
    expect(deps.track).toHaveBeenCalledWith(r, 'cold_start')
    expect(deps.push).toHaveBeenCalledTimes(1)
    expect(deps.push).toHaveBeenCalledWith('/(tabs)?autostart=1')
  })

  it('limpia la respuesta nativa DESPUÉS de trackear/navegar (#822)', async () => {
    const r = response()
    const { deps } = makeDeps({ getLastNotificationResponseAsync: vi.fn(async () => r) })

    setupNotificationTapRouting(deps)
    await flushMicrotasks()

    expect(deps.clearLastNotificationResponse).toHaveBeenCalledTimes(1)
    // Orden: trackear/navegar antes que limpiar (limpiar antes perdería el tap real).
    const trackOrder = (deps.track as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]
    const clearOrder = (deps.clearLastNotificationResponse as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0]
    expect(trackOrder).toBeLessThan(clearOrder)
  })

  it('no trackea, no navega y no limpia cuando no hay respuesta (null)', async () => {
    const { deps } = makeDeps({ getLastNotificationResponseAsync: vi.fn(async () => null) })

    setupNotificationTapRouting(deps)
    await flushMicrotasks()

    expect(deps.track).not.toHaveBeenCalled()
    expect(deps.push).not.toHaveBeenCalled()
    expect(deps.clearLastNotificationResponse).not.toHaveBeenCalled()
  })

  it('no navega si resolveNotifUrl no da ruta, pero sigue trackeando y limpiando', async () => {
    const r = response()
    const { deps } = makeDeps({
      getLastNotificationResponseAsync: vi.fn(async () => r),
      resolveNotifUrl: vi.fn(() => null),
    })

    setupNotificationTapRouting(deps)
    await flushMicrotasks()

    expect(deps.track).toHaveBeenCalledTimes(1)
    expect(deps.push).not.toHaveBeenCalled()
    expect(deps.clearLastNotificationResponse).toHaveBeenCalledTimes(1)
  })

  it('un getLastNotificationResponseAsync que rechaza no rompe el registro del listener', async () => {
    const { deps } = makeDeps({
      getLastNotificationResponseAsync: vi.fn(async () => {
        throw new Error('native module unavailable')
      }),
    })

    expect(() => setupNotificationTapRouting(deps)).not.toThrow()
    await flushMicrotasks()

    expect(deps.track).not.toHaveBeenCalled()
  })
})

describe('setupNotificationTapRouting — tap en caliente (listener)', () => {
  it('trackea, navega y limpia tras un tap con la app en segundo plano', async () => {
    const { deps, listeners } = makeDeps()

    setupNotificationTapRouting(deps)
    await flushMicrotasks()

    const r = response({ identifier: 'req-warm' })
    listeners[0](r)

    expect(deps.track).toHaveBeenCalledTimes(1)
    expect(deps.track).toHaveBeenCalledWith(r, 'tap')
    expect(deps.push).toHaveBeenCalledTimes(1)
    // El tap en caliente también deja la respuesta como "última" a nivel
    // nativo — sin limpiar aquí, el SIGUIENTE arranque en frío la repetiría.
    expect(deps.clearLastNotificationResponse).toHaveBeenCalledTimes(1)
  })

  it('la función de cleanup quita el listener (sub.remove)', async () => {
    const { deps, remove } = makeDeps()

    const cleanup = setupNotificationTapRouting(deps)
    cleanup()

    expect(remove).toHaveBeenCalledTimes(1)
  })
})

describe('setupNotificationTapRouting — dedupe cold start vs listener', () => {
  it('si el cold start y el listener reportan LA MISMA respuesta, trackea y navega una sola vez', async () => {
    const r = response({ identifier: 'req-race' })
    const { deps, listeners } = makeDeps({ getLastNotificationResponseAsync: vi.fn(async () => r) })

    setupNotificationTapRouting(deps)
    // El listener "ve" el mismo evento nativo que el cold-start ya está leyendo
    // (carrera real en Android si el intent se procesa tarde).
    listeners[0](r)
    await flushMicrotasks()

    expect(deps.track).toHaveBeenCalledTimes(1)
    expect(deps.push).toHaveBeenCalledTimes(1)
    // Ambas rutas intentan limpiar; la nativa es idempotente, así que puede
    // llamarse más de una vez — lo que importa es que NO se dobla el track.
    const clearCalls = (deps.clearLastNotificationResponse as ReturnType<typeof vi.fn>).mock.calls.length
    expect(clearCalls).toBeGreaterThanOrEqual(1)
  })

  it('dos respuestas con identifier DISTINTO sí trackean y navegan dos veces', async () => {
    const r1 = response({ identifier: 'req-a' })
    const r2 = response({ identifier: 'req-b' })
    const { deps, listeners } = makeDeps({ getLastNotificationResponseAsync: vi.fn(async () => r1) })

    setupNotificationTapRouting(deps)
    await flushMicrotasks()
    listeners[0](r2)

    expect(deps.track).toHaveBeenCalledTimes(2)
    expect(deps.push).toHaveBeenCalledTimes(2)
  })
})

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
