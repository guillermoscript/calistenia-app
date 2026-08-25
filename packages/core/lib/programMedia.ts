/**
 * programMedia — reglas de la media que el autor sube desde el editor (#618).
 *
 * Cubre los tres campos de fichero del dominio de programas, que existían en
 * PocketBase desde `1774000014` / `1774000002` pero que nadie escribía:
 *
 *   · `programs.cover_image`          — 1 imagen, 5 MB, jpeg/png/webp
 *   · `program_exercises.demo_images` — hasta 3 imágenes, 5 MB, + gif
 *   · `program_exercises.demo_video`  — 1 vídeo, 50 MB, mp4/webm
 *
 * El módulo es puro a propósito — sin React, sin PocketBase y sin nada de
 * Expo — por dos razones. La primera es que es la única capa de la feature que
 * los tests de `packages/core` pueden ejercitar: corren en Node y sin
 * renderizador, así que una regla metida dentro del `useCallback` de
 * `useProgramEditor` sería inalcanzable. La segunda es que web y móvil eligen
 * el fichero de formas incompatibles (`<input type=file>` contra
 * `expo-image-picker` + `uriToBlob`) y aquí se encuentran en una sola forma.
 */

/** Tamaño máximo de `cover_image` y de cada `demo_images` en PocketBase. */
export const MAX_IMAGE_SIZE_BYTES = 5_242_880

/** Tamaño máximo de `demo_video` en PocketBase. */
export const MAX_VIDEO_SIZE_BYTES = 52_428_800

/** `maxSelect` de `program_exercises.demo_images`. */
export const MAX_DEMO_IMAGES = 3

/** MIME aceptados por `programs.cover_image`. */
export const COVER_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** MIME aceptados por `program_exercises.demo_images` — incluye GIF. */
export const DEMO_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

/** MIME aceptados por `program_exercises.demo_video`. */
export const DEMO_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'] as const

export type CoverMimeType = (typeof COVER_MIME_TYPES)[number]
export type DemoImageMimeType = (typeof DEMO_IMAGE_MIME_TYPES)[number]
export type DemoVideoMimeType = (typeof DEMO_VIDEO_MIME_TYPES)[number]

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
}

/**
 * Un fichero elegido por el autor y todavía sin subir.
 *
 * `name` y `type` viajan **aparte del blob** a propósito: en web un `File` los
 * trae dentro, pero el Blob que `uriToBlob` produce en nativo no tiene `.name`
 * (issue #434) y PocketBase valida la subida por la extensión del nombre de la
 * parte multipart. Guardarlos por separado deja que las dos plataformas usen la
 * forma de tres argumentos `FormData.append(campo, blob, nombre)`, que es la
 * única que funciona en ambas.
 */
export interface EditorMediaFile {
  blob: Blob
  name: string
  type: string
  /**
   * URI con la que previsualizar el fichero antes de subirlo.
   *
   * En nativo es el `uri` local que devuelve `expo-image-picker`, que sigue
   * siendo válido durante toda la sesión y se puede pintar directamente. En web
   * se queda vacío: allí la vista previa es un blob URL, que hay que revocar, y
   * eso vive en el componente que lo crea en vez de en el estado del editor.
   */
  previewUri?: string
}

/**
 * Normaliza un MIME contra una lista permitida, o `null` si no encaja.
 *
 * Tolera lo que devuelven los pickers reales: el sufijo de parámetros
 * (`image/jpeg; charset=…`), las mayúsculas, y el `image/jpg` no estándar de
 * algunos Android.
 */
export function normalizeMime(
  mimeType: string | null | undefined,
  allowed: readonly string[],
): string | null {
  if (!mimeType) return null
  const clean = mimeType.split(';')[0].trim().toLowerCase()
  const canonical = clean === 'image/jpg' ? 'image/jpeg' : clean
  return allowed.includes(canonical) ? canonical : null
}

/**
 * Elige el MIME con el que subir a partir de los candidatos que reporten el
 * picker y el propio blob, en ese orden de confianza.
 *
 * Devuelve `null` SOLO cuando algún candidato nombró un formato que PocketBase
 * rechazaría (un HEIC de iOS, por ejemplo): ahí conviene avisar antes de gastar
 * la subida. Si nadie reportó nada — Android a veces devuelve `mimeType`
 * vacío — se asume `fallback`, que es lo que produce el picker en la práctica.
 *
 * Es el mismo criterio que `resolveAvatarMime` en móvil (#434), generalizado a
 * las tres listas de este dominio.
 */
export function resolveMime(
  candidates: (string | null | undefined)[],
  allowed: readonly string[],
  fallback: string,
): string | null {
  let sawUnsupported = false
  for (const candidate of candidates) {
    if (!candidate) continue
    const mime = normalizeMime(candidate, allowed)
    if (mime) return mime
    sawUnsupported = true
  }
  return sawUnsupported ? null : fallback
}

/**
 * Nombre de fichero para la parte del `FormData`.
 *
 * PocketBase valida por extensión y el Blob nativo no aporta ninguna, así que
 * hay que dárselo explícito o rechaza la subida con un 400 que no dice por qué.
 * El discriminante evita que tres imágenes del mismo ejercicio lleguen con el
 * mismo nombre en la misma petición.
 */
export function mediaFileName(prefix: string, mimeType: string, discriminant?: number | string): string {
  const ext = EXTENSIONS[mimeType] || 'bin'
  return discriminant == null ? `${prefix}.${ext}` : `${prefix}-${discriminant}.${ext}`
}

/** ¿Cabe este fichero en su campo? Se comprueba antes de subir, no después. */
export function isWithinSizeLimit(size: number, max: number): boolean {
  return size > 0 && size <= max
}

// ─── Estado de media del editor ──────────────────────────────────────────────

/**
 * La media de una entidad del editor, separando lo que **ya está en el
 * servidor** de lo que el autor ha tocado en esta sesión.
 *
 * Sin esa separación no se puede distinguir «no la ha tocado» de «la ha
 * borrado», que son dos peticiones distintas (ninguna, contra una que vacía el
 * campo). Y confundirlas es justo el fallo que reescribiría filas en cada
 * guardado.
 */
export interface CoverMediaState {
  /** Nombre del fichero tal y como lo devuelve PocketBase, o '' si no hay. */
  coverImage: string
  /** Elegido en esta sesión y pendiente de subir. */
  coverFile: EditorMediaFile | null
  /** El autor pulsó «quitar» sobre la portada que ya estaba guardada. */
  coverRemoved: boolean
}

export interface ExerciseMediaState {
  /** Nombres de fichero de `demo_images` que ya están en el servidor. */
  demoImages: string[]
  /** Nombre de fichero de `demo_video` que ya está en el servidor, o ''. */
  demoVideo: string
  /** Imágenes elegidas en esta sesión y pendientes de subir. */
  pendingImages: EditorMediaFile[]
  /** Vídeo elegido en esta sesión y pendiente de subir. */
  pendingVideo: EditorMediaFile | null
  /** Nombres de `demoImages` que el autor ha quitado. */
  removedImages: string[]
  /** El autor quitó el vídeo que ya estaba guardado. */
  removeVideo: boolean
}

/** Estado de media vacío, para un ejercicio recién añadido. */
export function emptyExerciseMedia(): ExerciseMediaState {
  return {
    demoImages: [],
    demoVideo: '',
    pendingImages: [],
    pendingVideo: null,
    removedImages: [],
    removeVideo: false,
  }
}

/** ¿Hay algo que subir o que borrar en la portada? */
export function hasCoverChanges(state: CoverMediaState): boolean {
  if (state.coverFile) return true
  // Quitar una portada que nunca existió no es un cambio: sin esto, un programa
  // sin portada emitiría una escritura inútil en cada guardado.
  return state.coverRemoved && !!state.coverImage
}

/** ¿Hay algo que subir o que borrar en la media de este ejercicio? */
export function hasExerciseMediaChanges(state: ExerciseMediaState): boolean {
  if (state.pendingImages.length > 0) return true
  if (state.pendingVideo) return true
  if (state.removedImages.length > 0) return true
  return state.removeVideo && !!state.demoVideo
}

/**
 * Cuántas imágenes más admite el ejercicio, contando las que ya están, las
 * pendientes y descontando las que se han quitado.
 */
export function remainingImageSlots(state: ExerciseMediaState): number {
  const kept = state.demoImages.filter(f => !state.removedImages.includes(f)).length
  return Math.max(0, MAX_DEMO_IMAGES - kept - state.pendingImages.length)
}

// ─── Construcción del cuerpo de la petición ──────────────────────────────────

/**
 * Cuerpo de la escritura de PocketBase para un campo de fichero.
 *
 * Es `FormData` cuando hay algo que subir y un objeto plano cuando solo hay que
 * vaciar el campo (`{ campo: null }` es la convención de PocketBase para
 * borrar un fichero). `null` significa «no hay nada que escribir» y quien llama
 * debe saltarse la petición entera: emitirla igualmente es lo que convertiría
 * un guardado sin cambios en N escrituras inútiles.
 */
export type MediaPayload = FormData | Record<string, null> | null

/**
 * Cuerpo de la actualización de `programs` con la portada.
 *
 * Sube y borra no se combinan porque no pueden coincidir: elegir una portada
 * nueva ya sustituye a la anterior en PocketBase (`maxSelect: 1`), así que el
 * borrado explícito solo aplica cuando no hay fichero nuevo.
 */
export function buildCoverPayload(state: CoverMediaState): MediaPayload {
  if (state.coverFile) {
    const form = new FormData()
    form.append('cover_image', state.coverFile.blob, state.coverFile.name)
    return form
  }
  if (state.coverRemoved && state.coverImage) return { cover_image: null }
  return null
}

/**
 * Cuerpo de la actualización de una fila de `program_exercises` con su media.
 *
 * Las altas van con la sintaxis normal del campo y los borrados con el sufijo
 * `-` que PocketBase entiende como «quita este fichero concreto de la lista»
 * (`demo_images-`). Sin ese sufijo, mandar `demo_images` sustituiría la lista
 * entera y perdería las imágenes que el autor no ha tocado.
 */
export function buildExerciseMediaPayload(state: ExerciseMediaState): MediaPayload {
  if (!hasExerciseMediaChanges(state)) return null

  // Siempre multipart, aunque solo haya borrados: mezclar en una misma petición
  // un array (`demo_images-`) y un fichero no se puede expresar en JSON, y
  // tener un único camino evita que el caso «quitar una imagen y subir otra»
  // se comporte distinto que cada mitad por separado.
  const form = new FormData()
  for (const name of state.removedImages) form.append('demo_images-', name)
  for (const file of state.pendingImages) {
    form.append('demo_images', file.blob, file.name)
  }
  if (state.pendingVideo) {
    form.append('demo_video', state.pendingVideo.blob, state.pendingVideo.name)
  } else if (state.removeVideo && state.demoVideo) {
    // Vaciar un campo de fichero dentro de un multipart se hace con la cadena
    // vacía; un `null` ahí llegaría al servidor como el literal "null".
    form.append('demo_video', '')
  }
  return form
}
