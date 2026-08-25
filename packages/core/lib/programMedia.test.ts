/**
 * Reglas de la media del editor de programas (#618).
 *
 * Lo que estas afirmaciones protegen no es «que se suban ficheros» sino los dos
 * sitios donde este código puede hacer daño de verdad:
 *
 *   1. Emitir una escritura cuando NO hay nada que cambiar. El editor guarda
 *      con el reconciliador de #463, y una petición de más por ejercicio en
 *      cada guardado es exactamente la regresión que ese diff existe para
 *      evitar.
 *   2. Sustituir la lista entera de `demo_images` al quitar una sola imagen.
 *      PocketBase pisa el campo si se manda con la sintaxis normal; quitar una
 *      pide el sufijo `demo_images-`.
 */

import { describe, it, expect } from 'vitest'
import {
  DEMO_IMAGE_MIME_TYPES,
  DEMO_VIDEO_MIME_TYPES,
  COVER_MIME_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
  buildCoverPayload,
  buildExerciseMediaPayload,
  emptyExerciseMedia,
  hasCoverChanges,
  hasExerciseMediaChanges,
  isWithinSizeLimit,
  mediaFileName,
  normalizeMime,
  remainingImageSlots,
  resolveMime,
  type EditorMediaFile,
} from './programMedia'

const file = (name: string, type = 'image/jpeg'): EditorMediaFile => ({
  blob: new Blob(['x'], { type }),
  name,
  type,
})

/** Todas las partes de un FormData con ese nombre, como texto o marca de fichero. */
function partsOf(form: FormData, field: string): string[] {
  return form.getAll(field).map(v => (typeof v === 'string' ? v : '<blob>'))
}

describe('normalizeMime', () => {
  it('acepta los MIME de la lista tal cual', () => {
    expect(normalizeMime('image/png', COVER_MIME_TYPES)).toBe('image/png')
  })

  it('tolera el sufijo de parámetros y las mayúsculas que devuelven los pickers', () => {
    expect(normalizeMime('IMAGE/PNG; charset=binary', COVER_MIME_TYPES)).toBe('image/png')
  })

  it('canoniza el image/jpg no estándar de algunos Android', () => {
    expect(normalizeMime('image/jpg', COVER_MIME_TYPES)).toBe('image/jpeg')
  })

  it('rechaza un formato fuera de la lista', () => {
    // El HEIC de iOS es el caso real: PocketBase lo rechazaría con un 400 opaco.
    expect(normalizeMime('image/heic', COVER_MIME_TYPES)).toBeNull()
  })

  it('el GIF vale para la demo del ejercicio pero no para la portada', () => {
    expect(normalizeMime('image/gif', DEMO_IMAGE_MIME_TYPES)).toBe('image/gif')
    expect(normalizeMime('image/gif', COVER_MIME_TYPES)).toBeNull()
  })
})

describe('resolveMime', () => {
  it('asume el fallback cuando nadie reporta nada (Android devuelve vacío)', () => {
    expect(resolveMime([undefined, null, ''], COVER_MIME_TYPES, 'image/jpeg')).toBe('image/jpeg')
  })

  it('NO asume el fallback si alguien nombró un formato no soportado', () => {
    // Es la diferencia entre subir un HEIC creyendo que es JPEG y avisar antes.
    expect(resolveMime(['image/heic'], COVER_MIME_TYPES, 'image/jpeg')).toBeNull()
  })

  it('se queda con el primer candidato válido', () => {
    expect(resolveMime([undefined, 'video/webm'], DEMO_VIDEO_MIME_TYPES, 'video/mp4')).toBe('video/webm')
  })
})

describe('mediaFileName', () => {
  it('pone la extensión que corresponde al MIME, no la del fichero original', () => {
    expect(mediaFileName('cover', 'image/webp')).toBe('cover.webp')
    expect(mediaFileName('demo', 'video/mp4')).toBe('demo.mp4')
  })

  it('discrimina para que tres imágenes de la misma petición no colisionen', () => {
    expect(mediaFileName('demo', 'image/png', 0)).toBe('demo-0.png')
    expect(mediaFileName('demo', 'image/png', 1)).toBe('demo-1.png')
  })
})

describe('isWithinSizeLimit', () => {
  it('acepta justo el límite y rechaza un byte más', () => {
    expect(isWithinSizeLimit(MAX_IMAGE_SIZE_BYTES, MAX_IMAGE_SIZE_BYTES)).toBe(true)
    expect(isWithinSizeLimit(MAX_IMAGE_SIZE_BYTES + 1, MAX_IMAGE_SIZE_BYTES)).toBe(false)
  })

  it('rechaza un fichero de 0 bytes', () => {
    expect(isWithinSizeLimit(0, MAX_VIDEO_SIZE_BYTES)).toBe(false)
  })
})

describe('hasCoverChanges', () => {
  const base = { coverImage: '', coverFile: null, coverRemoved: false }

  it('sin tocar nada, no hay cambios', () => {
    expect(hasCoverChanges(base)).toBe(false)
  })

  it('quitar una portada que NUNCA existió no es un cambio', () => {
    // Sin esta regla, un programa sin portada emitiría un update inútil en
    // cada guardado solo por haber pulsado «quitar» una vez.
    expect(hasCoverChanges({ ...base, coverRemoved: true })).toBe(false)
  })

  it('quitar una portada que sí está guardada sí lo es', () => {
    expect(hasCoverChanges({ ...base, coverImage: 'cover.jpg', coverRemoved: true })).toBe(true)
  })
})

describe('buildCoverPayload', () => {
  it('devuelve null cuando no hay nada que hacer — cero peticiones', () => {
    expect(buildCoverPayload({ coverImage: 'cover.jpg', coverFile: null, coverRemoved: false })).toBeNull()
  })

  it('manda el fichero en un FormData bajo cover_image', () => {
    const payload = buildCoverPayload({
      coverImage: '',
      coverFile: file('cover.webp', 'image/webp'),
      coverRemoved: false,
    })
    expect(payload).toBeInstanceOf(FormData)
    expect(partsOf(payload as FormData, 'cover_image')).toEqual(['<blob>'])
  })

  it('vacía el campo con null, que es como PocketBase borra un fichero', () => {
    expect(buildCoverPayload({ coverImage: 'cover.jpg', coverFile: null, coverRemoved: true }))
      .toEqual({ cover_image: null })
  })

  it('elegir una portada nueva gana al borrado: PocketBase ya sustituye la vieja', () => {
    const payload = buildCoverPayload({
      coverImage: 'vieja.jpg',
      coverFile: file('cover.jpg'),
      coverRemoved: true,
    })
    expect(payload).toBeInstanceOf(FormData)
  })
})

describe('remainingImageSlots', () => {
  it('cuenta las guardadas y las pendientes contra el tope de 3', () => {
    expect(remainingImageSlots({ ...emptyExerciseMedia(), demoImages: ['a.png', 'b.png'] })).toBe(1)
    expect(remainingImageSlots({ ...emptyExerciseMedia(), pendingImages: [file('a.jpg'), file('b.jpg')] })).toBe(1)
  })

  it('quitar una guardada libera su hueco antes de guardar', () => {
    expect(remainingImageSlots({
      ...emptyExerciseMedia(),
      demoImages: ['a.png', 'b.png', 'c.png'],
      removedImages: ['b.png'],
    })).toBe(1)
  })

  it('nunca es negativo aunque la fila traiga más de tres', () => {
    expect(remainingImageSlots({ ...emptyExerciseMedia(), demoImages: ['a', 'b', 'c', 'd'] })).toBe(0)
  })
})

describe('buildExerciseMediaPayload', () => {
  it('devuelve null si el ejercicio no ha tocado su media — cero peticiones', () => {
    // Es LA afirmación que protege el reconciliador de #463: un guardado que no
    // toca media no puede emitir una escritura por ejercicio.
    expect(buildExerciseMediaPayload({ ...emptyExerciseMedia(), demoImages: ['a.png'], demoVideo: 'v.mp4' }))
      .toBeNull()
  })

  it('quitar el vídeo que no existe tampoco es un cambio', () => {
    expect(hasExerciseMediaChanges({ ...emptyExerciseMedia(), removeVideo: true })).toBe(false)
    expect(buildExerciseMediaPayload({ ...emptyExerciseMedia(), removeVideo: true })).toBeNull()
  })

  it('quita imágenes concretas con demo_images-, sin pisar las que se quedan', () => {
    const payload = buildExerciseMediaPayload({
      ...emptyExerciseMedia(),
      demoImages: ['a.png', 'b.png', 'c.png'],
      removedImages: ['b.png'],
    }) as FormData
    expect(payload).toBeInstanceOf(FormData)
    expect(partsOf(payload, 'demo_images-')).toEqual(['b.png'])
    // Si esto dejara de estar vacío, mandaríamos la lista entera y PocketBase
    // borraría `a.png` y `c.png` sin que nadie lo haya pedido.
    expect(partsOf(payload, 'demo_images')).toEqual([])
  })

  it('sube y quita en la misma petición', () => {
    const payload = buildExerciseMediaPayload({
      ...emptyExerciseMedia(),
      demoImages: ['a.png'],
      removedImages: ['a.png'],
      pendingImages: [file('demo-0.png', 'image/png')],
    }) as FormData
    expect(partsOf(payload, 'demo_images-')).toEqual(['a.png'])
    expect(partsOf(payload, 'demo_images')).toEqual(['<blob>'])
  })

  it('vacía el vídeo con cadena vacía, no con el literal "null"', () => {
    const payload = buildExerciseMediaPayload({
      ...emptyExerciseMedia(),
      demoVideo: 'viejo.mp4',
      removeVideo: true,
      // Hay una imagen pendiente para que la petición exista igualmente.
      pendingImages: [file('demo-0.jpg')],
    }) as FormData
    expect(partsOf(payload, 'demo_video')).toEqual([''])
  })

  it('un vídeo nuevo sustituye al viejo sin mandar el borrado', () => {
    const payload = buildExerciseMediaPayload({
      ...emptyExerciseMedia(),
      demoVideo: 'viejo.mp4',
      removeVideo: true,
      pendingVideo: file('demo.mp4', 'video/mp4'),
    }) as FormData
    expect(partsOf(payload, 'demo_video')).toEqual(['<blob>'])
  })
})
