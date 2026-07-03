/**
 * Shared image-upload plumbing for native. Extracted from the nutrition feature
 * so progress-photos (and any future image feature) can reuse the exact same
 * URI→Blob read + permission flow instead of re-implementing it.
 *
 * Why uriToBlob exists: Expo SDK 56's global fetch/FormData is the WinterCG
 * (expo/fetch) implementation, which only accepts string | Blob | File in
 * FormData parts — NOT React Native's { uri, name, type } shape (it throws
 * "Unsupported FormDataPart implementation" otherwise). XMLHttpRequest uses RN's
 * native networking, which DOES resolve file:// / content:// / ph:// schemes, so
 * we read the local URI into a real Blob first, then normalize its content-type.
 */
import { Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'

/**
 * Max photo size accepted by PocketBase's `body_photos.photo` field (and the
 * nutrition photos field): 5 MB. Screens should reject larger picks up-front.
 */
export const MAX_PHOTO_SIZE_BYTES = 5_242_880

/** Read a single local image URI into a real Blob with an explicit content-type. */
export async function uriToBlob(uri: string, mimeType?: string): Promise<Blob> {
  const blob: Blob = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.onload = () => resolve(xhr.response as Blob)
    xhr.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada'))
    // Una lectura de archivo local es instantánea; el timeout sólo evita que un
    // uri corrupto / sin permiso deje el spinner colgado para siempre.
    xhr.timeout = 20_000
    xhr.ontimeout = () => reject(new Error('La lectura de la imagen tardó demasiado'))
    xhr.responseType = 'blob'
    xhr.open('GET', uri, true)
    xhr.send(null)
  })
  // Garantiza un content-type explícito (algunos uris devuelven type vacío → 415).
  if (mimeType && blob.type !== mimeType) return new Blob([blob], { type: mimeType })
  if (!blob.type) return new Blob([blob], { type: 'image/jpeg' })
  return blob
}

/** Read many local photo URIs into real Blobs (parity with web's File[] flow). */
export async function urisToBlobs(photoUris: string[]): Promise<Blob[]> {
  return Promise.all(photoUris.map((uri) => uriToBlob(uri, 'image/jpeg')))
}

export interface PermissionAlertText {
  title: string
  message: string
}

/**
 * Request camera permission. Returns whether it was granted. If denied and
 * `alertText` is provided, shows a localized Alert (i18n stays with the caller
 * so this module carries no translation dependency).
 */
export async function requestCameraPermission(alertText?: PermissionAlertText): Promise<boolean> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync()
  if (status !== 'granted') {
    if (alertText) Alert.alert(alertText.title, alertText.message)
    return false
  }
  return true
}

/** Request media-library (gallery) permission. See requestCameraPermission. */
export async function requestMediaPermission(alertText?: PermissionAlertText): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (status !== 'granted') {
    if (alertText) Alert.alert(alertText.title, alertText.message)
    return false
  }
  return true
}
