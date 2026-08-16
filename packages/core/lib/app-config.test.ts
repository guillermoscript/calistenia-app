import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initCore } from '../platform'

// `app-config.ts` toca `storage` del platform adapter al evaluarse en runtime,
// así que initCore() tiene que correr ANTES del import (los imports estáticos se
// evalúan antes que el cuerpo del archivo) — mismo patrón que buildInsightContext.test.
const memory = new Map<string, string>()

initCore({
  storage: {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => { memory.set(k, v) },
    removeItem: (k) => { memory.delete(k) },
  },
  env: {
    pbUrl: 'http://localhost:8090',
    aiApiUrl: '',
    isDev: true,
    client: { version: '1.9.0', build: 30, platform: 'android' },
  },
  analytics: { track: () => {}, identify: () => {}, clear: () => {} },
  connectivity: { isOnline: () => true, onOnline: () => () => {} },
})

const { evaluateUpdate, isFlagEnabled, fetchAppConfig, readCachedConfig, APP_CONFIG_STORAGE_KEY } =
  await import('./app-config')
type AppConfig = Awaited<ReturnType<typeof fetchAppConfig>>

const config = (over: Partial<NonNullable<AppConfig>> = {}): NonNullable<AppConfig> => ({
  platform: 'android',
  min_supported_build: 0,
  latest_build: 0,
  latest_version: '',
  store_url: '',
  message_key: '',
  flags: {},
  ...over,
})

describe('evaluateUpdate', () => {
  it('sin config no bloquea (falla abierto)', () => {
    expect(evaluateUpdate(30, null)).toBe('ok')
  })

  it('min_supported_build = 0 desactiva el gate aunque el build sea viejo', () => {
    expect(evaluateUpdate(1, config({ min_supported_build: 0, latest_build: 0 }))).toBe('ok')
  })

  it('bloquea por debajo del mínimo soportado', () => {
    expect(evaluateUpdate(29, config({ min_supported_build: 30 }))).toBe('required')
  })

  it('el build igual al mínimo NO se bloquea (el mínimo es inclusivo)', () => {
    expect(evaluateUpdate(30, config({ min_supported_build: 30 }))).toBe('ok')
  })

  it('avisa (sin bloquear) por debajo del último publicado', () => {
    expect(evaluateUpdate(30, config({ min_supported_build: 20, latest_build: 31 }))).toBe('optional')
  })

  it('required gana a optional', () => {
    expect(evaluateUpdate(10, config({ min_supported_build: 30, latest_build: 31 }))).toBe('required')
  })

  it('al día → ok', () => {
    expect(evaluateUpdate(31, config({ min_supported_build: 30, latest_build: 31 }))).toBe('ok')
  })

  // La invariante que impide dejar tirado a nadie: la web manda build 0 y
  // cualquier móvil sin expo-application también.
  it('nunca bloquea a un cliente sin identificar', () => {
    const hard = config({ min_supported_build: 999 })
    expect(evaluateUpdate(0, hard)).toBe('ok')
    expect(evaluateUpdate(-1, hard)).toBe('ok')
    expect(evaluateUpdate(NaN, hard)).toBe('ok')
  })
})

describe('isFlagEnabled', () => {
  it('sin config devuelve el fallback', () => {
    expect(isFlagEnabled(null, 'battles', true)).toBe(true)
    expect(isFlagEnabled(null, 'battles', false)).toBe(false)
  })

  it('un flag ausente devuelve el fallback, no false', () => {
    expect(isFlagEnabled(config(), 'battles', true)).toBe(true)
  })

  it('respeta el valor remoto', () => {
    expect(isFlagEnabled(config({ flags: { battles: false } }), 'battles', true)).toBe(false)
  })

  it('ignora valores que no son booleanos', () => {
    const bad = config({ flags: { battles: 'yes' as unknown as boolean } })
    expect(isFlagEnabled(bad, 'battles', true)).toBe(true)
  })
})

describe('fetchAppConfig', () => {
  const realFetch = globalThis.fetch

  beforeEach(() => { memory.clear() })
  afterEach(() => { globalThis.fetch = realFetch; vi.useRealTimers() })

  it('normaliza la respuesta y la cachea', async () => {
    globalThis.fetch = vi.fn(async () => new Response(
      JSON.stringify({ platform: 'android', min_supported_build: 28, latest_build: '31', latest_version: '1.10.0' }),
      { status: 200 },
    )) as typeof fetch

    const cfg = await fetchAppConfig()
    expect(cfg?.min_supported_build).toBe(28)
    // El servidor mandó un string: se normaliza a número.
    expect(cfg?.latest_build).toBe(31)
    expect(cfg?.flags).toEqual({})
    expect(memory.get(APP_CONFIG_STORAGE_KEY)).toBeTruthy()
  })

  it('un valor absurdo del servidor se normaliza a 0 (gate desactivado)', async () => {
    globalThis.fetch = vi.fn(async () => new Response(
      JSON.stringify({ min_supported_build: 'muchos', latest_build: -5 }),
      { status: 200 },
    )) as typeof fetch

    const cfg = await fetchAppConfig()
    expect(cfg?.min_supported_build).toBe(0)
    expect(cfg?.latest_build).toBe(0)
    expect(evaluateUpdate(1, cfg)).toBe('ok')
  })

  it('sin red cae al último valor conocido', async () => {
    globalThis.fetch = vi.fn(async () => new Response(
      JSON.stringify({ min_supported_build: 28 }), { status: 200 },
    )) as typeof fetch
    await fetchAppConfig()

    globalThis.fetch = vi.fn(async () => { throw new TypeError('Network request failed') }) as typeof fetch
    const cfg = await fetchAppConfig()
    expect(cfg?.min_supported_build).toBe(28)
  })

  it('un 500 también cae al caché en vez de devolver null', async () => {
    globalThis.fetch = vi.fn(async () => new Response(
      JSON.stringify({ min_supported_build: 28 }), { status: 200 },
    )) as typeof fetch
    await fetchAppConfig()

    globalThis.fetch = vi.fn(async () => new Response('boom', { status: 500 })) as typeof fetch
    expect((await fetchAppConfig())?.min_supported_build).toBe(28)
  })

  it('el caché caduca a los 30 días para no bloquear a nadie para siempre', () => {
    memory.set(APP_CONFIG_STORAGE_KEY, JSON.stringify({
      config: config({ min_supported_build: 99 }),
      cached_at: Date.now() - 31 * 24 * 60 * 60 * 1000,
    }))
    expect(readCachedConfig()).toBeNull()
  })

  it('un caché corrupto no revienta la app', () => {
    memory.set(APP_CONFIG_STORAGE_KEY, '{no es json')
    expect(readCachedConfig()).toBeNull()
  })
})
