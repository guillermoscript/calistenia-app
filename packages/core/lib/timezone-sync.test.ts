import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const update = vi.fn().mockResolvedValue({})
vi.mock('./pocketbase', () => ({
  pb: { collection: () => ({ update }) },
}))

import { syncUserTimezone } from './timezone-sync'
import { getTimezone, setTimezone, todayStr } from './dateUtils'

function mockDeviceTimezone(timeZone: string) {
  const real = Intl.DateTimeFormat
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation((function (...args: ConstructorParameters<typeof Intl.DateTimeFormat>) {
    // `function` y no flecha: tzDate lo construye con `new`.
    const f = new real(...args)
    if (args.length === 0) {
      return { ...f, resolvedOptions: () => ({ ...f.resolvedOptions(), timeZone }) } as Intl.DateTimeFormat
    }
    return f
  }) as unknown as typeof Intl.DateTimeFormat)
}

describe('syncUserTimezone', () => {
  beforeEach(() => {
    update.mockClear()
    setTimezone('UTC')
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('la zona del dispositivo gana a la guardada y se reescribe en users.timezone', async () => {
    mockDeviceTimezone('America/New_York')
    const tz = await syncUserTimezone('u1', 'Europe/Madrid')
    expect(tz).toBe('America/New_York')
    expect(getTimezone()).toBe('America/New_York')
    expect(update).toHaveBeenCalledWith('u1', { timezone: 'America/New_York' })
  })

  it('a las 18:00 de Nueva York sigue siendo hoy aunque guardara Madrid', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-16T22:00:00Z')) // 18:00 EDT, 00:00 en Madrid
    mockDeviceTimezone('America/New_York')
    await syncUserTimezone('u1', 'Europe/Madrid')
    expect(getTimezone()).toBe('America/New_York')
    expect(todayStr()).toBe('2026-10-16')
  })

  it('no escribe si la guardada ya coincide', async () => {
    mockDeviceTimezone('America/Caracas')
    await syncUserTimezone('u1', 'America/Caracas')
    expect(update).not.toHaveBeenCalled()
    expect(getTimezone()).toBe('America/Caracas')
  })

  it('rellena una zona vacía', async () => {
    mockDeviceTimezone('Europe/Madrid')
    await syncUserTimezone('u1', '')
    expect(update).toHaveBeenCalledWith('u1', { timezone: 'Europe/Madrid' })
  })

  it('con zona del dispositivo inválida usa la guardada y no toca el registro', async () => {
    mockDeviceTimezone('Etc/Unknown')
    const tz = await syncUserTimezone('u1', 'Europe/Madrid')
    expect(tz).toBe('Europe/Madrid')
    expect(getTimezone()).toBe('Europe/Madrid')
    expect(update).not.toHaveBeenCalled()
  })
})
