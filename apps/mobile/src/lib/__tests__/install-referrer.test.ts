import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isAbsoluteHttpUrl,
  normalizeReferrer,
  parseInstallReferrer,
  pathWithAttribution,
  referrerUrlFor,
} from '../install-referrer'

const mocks = vi.hoisted(() => ({
  platform: { OS: 'android' } as { OS: string },
  getItem: vi.fn<(key: string) => Promise<string | null>>(),
  setItem: vi.fn<(key: string, value: string) => Promise<void>>(),
  getInstallReferrerAsync: vi.fn<() => Promise<string>>(),
}))

vi.mock('react-native', () => ({ Platform: mocks.platform }))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: mocks.getItem, setItem: mocks.setItem },
}))

vi.mock('expo-application', () => ({
  getInstallReferrerAsync: mocks.getInstallReferrerAsync,
}))

// El caso mayoritario en el panel: instalación orgánica desde la ficha de Play.
const ORGANIC = 'utm_source=google-play&utm_medium=organic'
// El otro caso mayoritario: Play no sabe de dónde salió la instalación.
const NOT_SET = 'utm_source=(not%20set)&utm_medium=(not%20set)'

describe('parseInstallReferrer', () => {
  it('traduce la instalación orgánica de Play a una fuente con dominio', () => {
    const attribution = parseInstallReferrer(ORGANIC)
    expect(attribution).not.toBeNull()
    // `google-play` no casa ni con la tabla de referrers de OpenPanel ni con su
    // regex de dominio → saldría sin icono. El dominio de la tienda sí.
    expect(attribution!.params).toEqual({
      utm_source: 'play.google.com',
      utm_medium: 'organic',
    })
    expect(attribution!.referrerUrl).toBe('https://play.google.com')
    expect(attribution!.raw).toBe(ORGANIC)
  })

  it('descarta los (not set) de Play: sin atribución es «Direct», como en web', () => {
    expect(parseInstallReferrer(NOT_SET)).toBeNull()
    expect(parseInstallReferrer('utm_source=(not set)&utm_medium=(not set)')).toBeNull()
  })

  it('conserva las campañas reales tal cual, para que OpenPanel las resuelva', () => {
    const attribution = parseInstallReferrer(
      'utm_source=facebook&utm_medium=cpc&utm_campaign=verano&utm_term=dominadas&utm_content=video',
    )
    expect(attribution!.params).toEqual({
      utm_source: 'facebook',
      utm_medium: 'cpc',
      utm_campaign: 'verano',
      utm_term: 'dominadas',
      utm_content: 'video',
    })
    // `facebook` a secas no da URL: el nombre y el icono los pone OpenPanel
    // desde `utm_source` (su tabla ya traduce facebook → Facebook, social).
    expect(attribution!.referrerUrl).toBeUndefined()
  })

  it('mezcla fuente buena con medio (not set)', () => {
    const attribution = parseInstallReferrer('utm_source=google-play&utm_medium=(not set)')
    expect(attribution!.params).toEqual({ utm_source: 'play.google.com' })
  })

  it('acepta la cadena entera percent-encoded', () => {
    const attribution = parseInstallReferrer('utm_source%3Dfacebook%26utm_medium%3Dcpc')
    expect(attribution!.params).toEqual({ utm_source: 'facebook', utm_medium: 'cpc' })
  })

  it('acepta un deep link de campaña completo y se queda con su query', () => {
    const attribution = parseInstallReferrer(
      'https://gym.guille.tech/?utm_source=newsletter&utm_medium=email',
    )
    expect(attribution!.params).toEqual({ utm_source: 'newsletter', utm_medium: 'email' })
  })

  it('devuelve null sin atribución utilizable', () => {
    expect(parseInstallReferrer(null)).toBeNull()
    expect(parseInstallReferrer(undefined)).toBeNull()
    expect(parseInstallReferrer('')).toBeNull()
    expect(parseInstallReferrer('   ')).toBeNull()
    expect(parseInstallReferrer('formato-inesperado-de-play')).toBeNull()
    expect(parseInstallReferrer('gclid=abc123')).toBeNull()
  })
})

describe('referrerUrlFor', () => {
  it('mapea las tiendas y las fuentes que ya son un dominio', () => {
    expect(referrerUrlFor('play.google.com')).toBe('https://play.google.com')
    expect(referrerUrlFor('apps.apple.com')).toBe('https://apps.apple.com')
    expect(referrerUrlFor('m.facebook.com')).toBe('https://m.facebook.com')
  })

  it('no se inventa una URL para una fuente que no es un dominio', () => {
    expect(referrerUrlFor('facebook')).toBeUndefined()
    expect(referrerUrlFor('newsletter')).toBeUndefined()
    expect(referrerUrlFor(undefined)).toBeUndefined()
    expect(referrerUrlFor('(not set)')).toBeUndefined()
  })
})

describe('normalizeReferrer', () => {
  const attribution = parseInstallReferrer(ORGANIC)

  it('sustituye el query string crudo del SDK por la URL de la atribución', () => {
    expect(normalizeReferrer(ORGANIC, attribution)).toBe('https://play.google.com')
  })

  it('nunca deja pasar algo que no sea una URL absoluta', () => {
    expect(normalizeReferrer(ORGANIC, null)).toBeUndefined()
    expect(normalizeReferrer(NOT_SET, null)).toBeUndefined()
    expect(normalizeReferrer('play.google.com', null)).toBeUndefined()
    expect(normalizeReferrer(undefined, null)).toBeUndefined()
    expect(normalizeReferrer(42, null)).toBeUndefined()
  })

  it('respeta una URL absoluta que ya venía puesta', () => {
    expect(normalizeReferrer('https://gym.guille.tech/programas', null)).toBe(
      'https://gym.guille.tech/programas',
    )
  })

  it('isAbsoluteHttpUrl solo acepta http(s) absolutas', () => {
    expect(isAbsoluteHttpUrl('https://play.google.com')).toBe(true)
    expect(isAbsoluteHttpUrl('play.google.com')).toBe(false)
    expect(isAbsoluteHttpUrl('calistenia://programas')).toBe(false)
    expect(isAbsoluteHttpUrl(ORGANIC)).toBe(false)
  })
})

describe('pathWithAttribution', () => {
  const attribution = parseInstallReferrer(ORGANIC)

  it('cuelga los utm del query, dejando la ruta intacta para el informe de Pages', () => {
    expect(pathWithAttribution('/history', attribution)).toBe(
      '/history?utm_source=play.google.com&utm_medium=organic',
    )
    expect(pathWithAttribution('/', attribution)).toBe(
      '/?utm_source=play.google.com&utm_medium=organic',
    )
  })

  it('no toca la ruta cuando la atribución ya se gastó', () => {
    expect(pathWithAttribution('/history', null)).toBe('/history')
  })

  it('no toca rutas que el worker no parsearía como URL', () => {
    // `parsePath` solo separa el query si la ruta empieza por `/`.
    expect(pathWithAttribution('history', attribution)).toBe('history')
    expect(pathWithAttribution('/history?x=1', attribution)).toBe('/history?x=1')
  })
})

describe('attachInstallAttribution', () => {
  const load = () => import('../install-referrer')

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.platform.OS = 'android'
    mocks.getItem.mockResolvedValue(null)
    mocks.setItem.mockResolvedValue(undefined)
    mocks.getInstallReferrerAsync.mockResolvedValue(ORGANIC)
  })

  /** Doble del SDK: guarda lo que le llega a `setGlobalProperties`. */
  function fakeSdk() {
    const writes: Record<string, unknown>[] = []
    return {
      writes,
      op: { setGlobalProperties: (properties: Record<string, unknown>) => { writes.push(properties) } },
    }
  }

  it('nunca deja que el install referrer crudo del SDK llegue al panel', async () => {
    const { attachInstallAttribution } = await load()
    const { op, writes } = fakeSdk()
    const ready = attachInstallAttribution(op)

    // Lo que hace el SDK en su constructor y en cada vuelta a primer plano.
    op.setGlobalProperties({ __version: '1.13.1', __buildNumber: '41', __referrer: ORGANIC })
    await ready

    expect(writes[0]).toEqual({ __version: '1.13.1', __buildNumber: '41', __referrer: undefined })
    expect(writes.some(w => w.__referrer === ORGANIC)).toBe(false)
  })

  it('fija la URL de la tienda y el referrer crudo al resolver', async () => {
    const { attachInstallAttribution, currentInstallAttribution } = await load()
    const { op, writes } = fakeSdk()

    const attribution = await attachInstallAttribution(op)
    expect(attribution!.referrerUrl).toBe('https://play.google.com')
    expect(currentInstallAttribution()).toBe(attribution)
    expect(writes).toContainEqual({
      __referrer: 'https://play.google.com',
      install_referrer: ORGANIC,
    })
  })

  it('gasta la atribución en la primera sesión y no vuelve a atribuir', async () => {
    const first = await load()
    await first.attachInstallAttribution(fakeSdk().op)
    expect(mocks.setItem).toHaveBeenCalledWith('analytics_install_attributed', expect.any(String))

    // Siguiente arranque: la marca ya está en disco.
    vi.resetModules()
    mocks.getItem.mockResolvedValue('2026-09-10T00:00:00.000Z')
    const second = await load()
    const { op, writes } = fakeSdk()
    expect(await second.attachInstallAttribution(op)).toBeNull()
    expect(second.currentInstallAttribution()).toBeNull()
    // Ni siquiera se le pregunta a Play.
    expect(mocks.getInstallReferrerAsync).toHaveBeenCalledTimes(1)

    op.setGlobalProperties({ __referrer: ORGANIC })
    expect(writes[0]).toEqual({ __referrer: undefined })
  })

  it('no atribuye cuando Play no sabe de dónde vino la instalación', async () => {
    mocks.getInstallReferrerAsync.mockResolvedValue(NOT_SET)
    const { attachInstallAttribution } = await load()
    expect(await attachInstallAttribution(fakeSdk().op)).toBeNull()
    // Aun así se gasta: el hueco de Play no mejora en el segundo arranque.
    expect(mocks.setItem).toHaveBeenCalled()
  })

  it('aguanta que getInstallReferrerAsync lance (sin Play Store, servicio caído)', async () => {
    mocks.getInstallReferrerAsync.mockRejectedValue(
      new Error('ERR_APPLICATION_INSTALL_REFERRER_UNAVAILABLE'),
    )
    const { attachInstallAttribution } = await load()
    const { op, writes } = fakeSdk()
    expect(await attachInstallAttribution(op)).toBeNull()

    // Y las demás propiedades por defecto del SDK siguen pasando.
    op.setGlobalProperties({ __version: '1.13.1', __referrer: ORGANIC })
    expect(writes[0]).toEqual({ __version: '1.13.1', __referrer: undefined })
  })

  it('no le pregunta a Play fuera de Android', async () => {
    mocks.platform.OS = 'ios'
    const { attachInstallAttribution } = await load()
    expect(await attachInstallAttribution(fakeSdk().op)).toBeNull()
    expect(mocks.getInstallReferrerAsync).not.toHaveBeenCalled()
    expect(mocks.getItem).not.toHaveBeenCalled()
  })
})
