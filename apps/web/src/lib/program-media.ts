/**
 * Adaptador web del selector de media del editor de programas (#618).
 *
 * Traduce el `File` de un `<input type=file>` a la forma `EditorMediaFile` que
 * consume `useProgramEditor`, aplicando antes las reglas de
 * `@calistenia/core/lib/programMedia` — que son puras y compartidas con móvil,
 * donde el fichero llega como un Blob de `expo-image-picker`.
 *
 * La validación se hace aquí y no en el servidor porque PocketBase rechaza un
 * fichero fuera de rango con un 400 cuyo cuerpo no dice cuál de los dos límites
 * ha fallado; validando antes se puede decir «pesa demasiado» o «ese formato
 * no» sin gastar la subida.
 */
import {
  COVER_MIME_TYPES,
  DEMO_IMAGE_MIME_TYPES,
  DEMO_VIDEO_MIME_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
  isWithinSizeLimit,
  mediaFileName,
  normalizeMime,
  type EditorMediaFile,
} from '@calistenia/core/lib/programMedia'

/** Por qué se ha rechazado el fichero, para que la UI elija el mensaje. */
export type MediaRejection = 'type' | 'size'

export type PickResult =
  | { ok: true; file: EditorMediaFile }
  | { ok: false; reason: MediaRejection }

function pick(
  file: File,
  allowed: readonly string[],
  maxBytes: number,
  prefix: string,
): PickResult {
  // En web el navegador siempre reporta un `type`, así que no hace falta el
  // fallback que sí necesita Android; un MIME que no encaje es un rechazo.
  const mime = normalizeMime(file.type, allowed)
  if (!mime) return { ok: false, reason: 'type' }
  if (!isWithinSizeLimit(file.size, maxBytes)) return { ok: false, reason: 'size' }
  // El nombre se reconstruye en vez de reenviar `file.name`: PocketBase valida
  // por extensión y un `.jpg` con contenido PNG (o un nombre sin extensión)
  // llegaría al servidor a chocar contra la lista de MIME.
  return { ok: true, file: { blob: file, name: mediaFileName(prefix, mime), type: mime } }
}

/** Portada del programa: 1 imagen, 5 MB, jpeg/png/webp. */
export function pickCover(file: File): PickResult {
  return pick(file, COVER_MIME_TYPES, MAX_IMAGE_SIZE_BYTES, 'cover')
}

/** Imagen de demostración de un ejercicio: 5 MB, jpeg/png/webp/gif. */
export function pickDemoImage(file: File, discriminant: number): PickResult {
  return pick(file, DEMO_IMAGE_MIME_TYPES, MAX_IMAGE_SIZE_BYTES, `demo-${discriminant}`)
}

/** Vídeo de demostración de un ejercicio: 50 MB, mp4/webm. */
export function pickDemoVideo(file: File): PickResult {
  return pick(file, DEMO_VIDEO_MIME_TYPES, MAX_VIDEO_SIZE_BYTES, 'demo')
}

/** `accept` del `<input type=file>` para cada campo. */
export const COVER_ACCEPT = COVER_MIME_TYPES.join(',')
export const DEMO_IMAGE_ACCEPT = DEMO_IMAGE_MIME_TYPES.join(',')
export const DEMO_VIDEO_ACCEPT = DEMO_VIDEO_MIME_TYPES.join(',')
