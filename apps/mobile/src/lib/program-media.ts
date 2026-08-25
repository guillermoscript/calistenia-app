/**
 * Adaptador nativo del selector de media del editor de programas (#618).
 *
 * Es el mismo camino que la foto de perfil de #434: `expo-image-picker` da un
 * `uri` local, `uriToBlob` lo lee a un Blob de verdad con XMLHttpRequest (el
 * `fetch` de Expo SDK 56 no acepta la forma `{ uri, name, type }` de React
 * Native en un FormData) y las reglas compartidas de
 * `@calistenia/core/lib/programMedia` deciden si vale.
 *
 * El nombre del fichero se construye aquí y viaja aparte del blob porque **un
 * Blob nativo no tiene `.name`** y PocketBase valida la subida por la extensión
 * de la parte multipart.
 */
import * as ImagePicker from 'expo-image-picker'

import { requestCameraPermission, requestMediaPermission, uriToBlob } from '@/lib/image-upload'
import {
  COVER_MIME_TYPES,
  DEMO_IMAGE_MIME_TYPES,
  DEMO_VIDEO_MIME_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
  isWithinSizeLimit,
  mediaFileName,
  resolveMime,
  type EditorMediaFile,
} from '@calistenia/core/lib/programMedia'

export type MediaSource = 'camera' | 'gallery'

/** Por qué se ha rechazado, para que la pantalla elija el mensaje. */
export type MediaRejection = 'type' | 'size' | 'read'

export type PickResult =
  | { ok: true; files: EditorMediaFile[] }
  | { ok: false; reason: MediaRejection }
  /** El usuario canceló o denegó el permiso: no es un error que haya que contar. */
  | { ok: null }

export interface PermissionAlertText {
  title: string
  message: string
}

async function ensurePermission(source: MediaSource, alertText: PermissionAlertText): Promise<boolean> {
  const ask = source === 'camera' ? requestCameraPermission : requestMediaPermission
  return ask(alertText)
}

/**
 * Convierte un asset del picker en `EditorMediaFile`, validando MIME y tamaño.
 *
 * El tamaño se comprueba dos veces a propósito: primero con lo que reporta el
 * picker, para no leer 40 MB a memoria solo para tirarlos, y después sobre el
 * blob real, porque no todos los pickers rellenan `fileSize`.
 */
async function toMediaFile(
  asset: ImagePicker.ImagePickerAsset,
  allowed: readonly string[],
  maxBytes: number,
  fallbackMime: string,
  prefix: string,
  discriminant?: number,
): Promise<PickResult> {
  const mime = resolveMime([asset.mimeType], allowed, fallbackMime)
  if (!mime) return { ok: false, reason: 'type' }
  if (asset.fileSize != null && !isWithinSizeLimit(asset.fileSize, maxBytes)) {
    return { ok: false, reason: 'size' }
  }
  let blob: Blob
  try {
    blob = await uriToBlob(asset.uri, mime)
  } catch {
    return { ok: false, reason: 'read' }
  }
  if (!isWithinSizeLimit(blob.size, maxBytes)) return { ok: false, reason: 'size' }
  return {
    ok: true,
    // `previewUri` es el uri local del picker: sigue siendo legible durante toda
    // la sesión, así que la vista previa no tiene que reconstruirse desde el
    // blob (que en React Native no se puede pintar).
    files: [{ blob, name: mediaFileName(prefix, mime, discriminant), type: mime, previewUri: asset.uri }],
  }
}

/** Portada del programa: 1 imagen recortada a 16:9, 5 MB. */
export async function pickCover(source: MediaSource, alertText: PermissionAlertText): Promise<PickResult> {
  if (!(await ensurePermission(source, alertText))) return { ok: null }
  const options = {
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    // La portada se pinta apaisada en la tarjeta del catálogo; recortar en el
    // propio picker evita que el thumb 400x0 corte por donde no toca.
    aspect: [16, 9] as [number, number],
    quality: 0.85,
  }
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: false })
  if (result.canceled || !result.assets?.[0]) return { ok: null }
  return toMediaFile(result.assets[0], COVER_MIME_TYPES, MAX_IMAGE_SIZE_BYTES, 'image/jpeg', 'cover')
}

/**
 * Imágenes de demostración de un ejercicio: hasta `limit` de golpe, 5 MB cada
 * una. Sin recorte, porque una demo puede ser vertical u horizontal según el
 * movimiento.
 */
export async function pickDemoImages(
  source: MediaSource,
  limit: number,
  alertText: PermissionAlertText,
): Promise<PickResult> {
  if (limit <= 0) return { ok: null }
  if (!(await ensurePermission(source, alertText))) return { ok: null }
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 })
    : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: limit,
        quality: 0.85,
      })
  if (result.canceled || !result.assets?.length) return { ok: null }

  const files: EditorMediaFile[] = []
  for (const [i, asset] of result.assets.slice(0, limit).entries()) {
    const one = await toMediaFile(asset, DEMO_IMAGE_MIME_TYPES, MAX_IMAGE_SIZE_BYTES, 'image/jpeg', 'demo', i)
    // Un asset malo aborta la tanda entera: es más claro que subir tres de
    // cinco sin decir cuáles se han quedado fuera.
    if (one.ok !== true) return one
    files.push(...one.files)
  }
  return { ok: true, files }
}

/** Vídeo de demostración de un ejercicio: 1, 50 MB, mp4/webm. */
export async function pickDemoVideo(source: MediaSource, alertText: PermissionAlertText): Promise<PickResult> {
  if (!(await ensurePermission(source, alertText))) return { ok: null }
  const options = { mediaTypes: ImagePicker.MediaTypeOptions.Videos, quality: 0.85 }
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: false })
  if (result.canceled || !result.assets?.[0]) return { ok: null }
  return toMediaFile(result.assets[0], DEMO_VIDEO_MIME_TYPES, MAX_VIDEO_SIZE_BYTES, 'video/mp4', 'demo')
}
