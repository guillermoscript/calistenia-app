/**
 * `compressImage` no puede colgarse en silencio.
 *
 * El bug real: no había `img.onerror`. Un fichero que el navegador no sabe
 * decodificar —HEIC de iPhone en Chrome, y el input es `accept="image/*"`, así
 * que se puede elegir— dejaba la promesa SIN RESOLVER. `handleFileChange` la
 * espera con `await`, de modo que la foto se evaporaba: ni preview, ni error, ni
 * petición al servidor. Cero rastro en Sentry, porque nada lanzaba.
 *
 * jsdom no decodifica imágenes ni implementa `canvas.toBlob`, así que aquí se
 * sustituye `Image` por un doble que dispara `onload`/`onerror` a voluntad. Es
 * exactamente lo que hay que controlar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UnreadableImageError, compressImage } from './meal-logger-shared'

/** Dispara `onerror` (el navegador no supo con el fichero) o `onload` con un tamaño. */
function stubImage(outcome: { fail: true } | { fail: false; width: number; height: number }) {
  class FakeImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    width = outcome.fail ? 0 : outcome.width
    height = outcome.fail ? 0 : outcome.height
    set src(_v: string) {
      queueMicrotask(() => (outcome.fail ? this.onerror?.() : this.onload?.()))
    }
  }
  vi.stubGlobal('Image', FakeImage)
}

beforeEach(() => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:fake'),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Gana la promesa o gana el reloj: si gana el reloj, se colgó. */
async function settlesWithin(p: Promise<unknown>, ms = 50) {
  const timeout = Symbol('timeout')
  const race = await Promise.race([
    p.then(() => 'resolved' as const, (e: unknown) => e),
    new Promise((r) => setTimeout(() => r(timeout), ms)),
  ])
  return race === timeout ? 'hung' : race
}

describe('compressImage', () => {
  it('avisa en vez de colgarse cuando el navegador no puede decodificar la foto', async () => {
    stubImage({ fail: true })
    const heic = new File(['no-soy-decodificable'], 'IMG_0001.HEIC', { type: 'image/heic' })

    const outcome = await settlesWithin(compressImage(heic))

    expect(outcome).not.toBe('hung')
    expect(outcome).toBeInstanceOf(UnreadableImageError)
    expect((outcome as UnreadableImageError).mimeType).toBe('image/heic')
  })

  it('deja pasar tal cual un JPEG que ya cabe: no hay nada que hacerle', async () => {
    stubImage({ fail: false, width: 800, height: 600 })
    const jpeg = new File(['datos'], 'comida.jpg', { type: 'image/jpeg' })

    const result = await compressImage(jpeg)

    expect(result).toBe(jpeg)
  })

  /**
   * El segundo bug: el atajo "ya cabe en 1536px" devolvía el fichero con su tipo
   * ORIGINAL. Un HEIC pequeño se subía tal cual y el servidor lo rechazaba con
   * 400 "Tipo de archivo no soportado". Que quepa no basta: el tipo tiene que
   * estar en la lista que acepta la API.
   */
  it('no deja escapar un tipo que el servidor rechaza solo porque sea pequeño', async () => {
    stubImage({ fail: false, width: 800, height: 600 })
    const smallHeic = new File(['datos'], 'IMG_0002.heic', { type: 'image/heic' })

    const outcome = await settlesWithin(compressImage(smallHeic))

    // No puede resolverse con el HEIC intacto: o re-codifica a JPEG, o avisa.
    expect(outcome).not.toBe('hung')
    if (outcome === 'resolved') throw new Error('devolvió el HEIC tal cual')
  })
})
