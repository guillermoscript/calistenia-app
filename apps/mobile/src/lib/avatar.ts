/**
 * Reglas puras de la foto de perfil (campo `avatar` de `users`).
 *
 * Los límites son los del propio campo en PocketBase (migración
 * `1774000040_add_avatar_to_users.js`): 5 MB y solo jpeg/png/webp. Validarlos
 * aquí evita subir la imagen entera para recibir un 400 opaco del servidor.
 *
 * Este módulo es puro a propósito (sin RN, sin Expo, sin `pb`): es la única
 * capa de la feature que los tests de mobile pueden ejercitar.
 */

/** Tamaño máximo aceptado por `users.avatar` en PocketBase. */
export const MAX_AVATAR_SIZE_BYTES = 5_242_880

/** MIME types aceptados por `users.avatar` en PocketBase. */
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type AvatarMimeType = (typeof AVATAR_MIME_TYPES)[number]

const EXTENSIONS: Record<AvatarMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * Normaliza un MIME al que acepta PocketBase, o null si no es ninguno.
 * Tolera el sufijo de parámetros (`image/jpeg; charset=…`), las mayúsculas y
 * el `image/jpg` no estándar que devuelven algunos pickers de Android.
 */
export function normalizeAvatarMime(mimeType: string | null | undefined): AvatarMimeType | null {
  if (!mimeType) return null
  const clean = mimeType.split(';')[0].trim().toLowerCase()
  if (clean === 'image/jpg') return 'image/jpeg'
  return (AVATAR_MIME_TYPES as readonly string[]).includes(clean) ? (clean as AvatarMimeType) : null
}

/**
 * Elige el MIME con el que subir, a partir de los candidatos que reporten el
 * picker y el blob (en ese orden de confianza).
 *
 * Devuelve null SOLO cuando algún candidato dijo un formato que PocketBase
 * rechazaría (HEIC de iOS, GIF…): ahí conviene avisar antes de subir. Si nadie
 * reportó nada — Android a veces devuelve `mimeType` vacío — asumimos JPEG,
 * que es lo que produce el recorte de expo-image-picker.
 */
export function resolveAvatarMime(candidates: (string | null | undefined)[]): AvatarMimeType | null {
  let sawUnsupported = false
  for (const candidate of candidates) {
    if (!candidate) continue
    const mime = normalizeAvatarMime(candidate)
    if (mime) return mime
    sawUnsupported = true
  }
  return sawUnsupported ? null : 'image/jpeg'
}

/**
 * Nombre de archivo para la parte del FormData. Un Blob nativo no tiene `.name`
 * (a diferencia del File de la web) y PocketBase valida por extensión, así que
 * hay que dárselo explícito o rechaza la subida.
 */
export function avatarFileName(mimeType: AvatarMimeType): string {
  return `avatar.${EXTENSIONS[mimeType]}`
}

/**
 * Añade un token de caché a la URL del avatar.
 *
 * `expo-image` cachea por URI en memoria+disco. El token es el `updated` del
 * registro: cambia cuando cambia la foto y solo entonces, así que la nueva se
 * ve al instante sin tirar la caché en cada render (lo que haría `Date.now()`).
 */
export function withCacheToken(url: string | null, token: string | null | undefined): string | null {
  if (!url) return null
  if (!token) return url
  return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(token)}`
}
