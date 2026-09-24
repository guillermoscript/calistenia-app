/**
 * #815 hallazgo #1/#3: `send()` (usada por `notifyRestStart`/`notifySetComplete`
 * desde `RestScreen.tsx`/`SessionView.tsx`, sin gesto del usuario) NO debe pedir
 * el permiso nativo del navegador cuando todavía está `default` — eso decidiría
 * el permiso antes de que el usuario llegue a la celebración del primer
 * entreno, donde vive el único prompt (`PushPermissionCard`). Solo
 * `requestPermission()` (llamado tras un toque explícito) puede preguntar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class FakeNotification {
  static permission: NotificationPermission = 'default'
  static requestPermission = vi.fn(async (): Promise<NotificationPermission> => 'granted')
  constructor(public title: string, public options?: NotificationOptions) {}
}

function installFakeNotification(permission: NotificationPermission): void {
  FakeNotification.permission = permission
  FakeNotification.requestPermission = vi.fn(async (): Promise<NotificationPermission> => 'granted')
  for (const target of [globalThis, window]) {
    Object.defineProperty(target, 'Notification', {
      value: FakeNotification,
      writable: true,
      configurable: true,
    })
  }
}

beforeEach(() => {
  // Módulo con caché a nivel de módulo (`_permissionGranted`): reimportar
  // fresco en cada test para no arrastrar el estado del anterior.
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('lib/notifications — permiso perezoso (#815)', () => {
  it('send() (vía notifySetComplete) NO pide el permiso cuando está "default"', async () => {
    installFakeNotification('default')
    const notif = await import('./notifications')
    notif.notifySetComplete('Sentadilla', 1, 2, 1)
    // send() es async por dentro (microtask); dejar que corra.
    await Promise.resolve()
    await Promise.resolve()
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled()
  })

  it('send() (vía notifyRestStart) NO pide el permiso cuando está "default"', async () => {
    installFakeNotification('default')
    const notif = await import('./notifications')
    notif.notifyRestStart(30, 'Flexión')
    await Promise.resolve()
    await Promise.resolve()
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled()
  })

  it('requestPermission() explícito SÍ pide el permiso cuando está "default"', async () => {
    installFakeNotification('default')
    const notif = await import('./notifications')
    const granted = await notif.requestPermission()
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1)
    expect(granted).toBe(true)
  })

  it('con el permiso ya concedido, send() sigue funcionando sin volver a preguntar', async () => {
    installFakeNotification('granted')
    const notif = await import('./notifications')
    notif.notifySetComplete('Sentadilla', 1, 2, 1)
    await Promise.resolve()
    await Promise.resolve()
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled()
  })
})
