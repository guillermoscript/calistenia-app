/**
 * Normalización del *install referrer* de Google Play para OpenPanel (#746).
 *
 * `@openpanel/react-native` mete el install referrer CRUDO en la propiedad
 * `__referrer`:
 *
 *   __referrer: Platform.OS === 'android' ? await getInstallReferrerAsync() : undefined
 *
 * y eso no es una URL sino un query string —las docs de Expo lo avisan: «in
 * practice, the referrer URL may not be a complete, absolute URL»—. El worker
 * de OpenPanel espera una URL: hace `new URL(__referrer).hostname` para buscar
 * el referrer en su tabla y, al fallar, cae a enseñar la cadena entera como
 * nombre (`referrerName: utmReferrer?.name || referrer?.name || referrer?.url`).
 * Por eso la pestaña Refs del móvil enseñaba `utm_source=google-play&utm_medium=organic`
 * en vez de una URL con favicon: el icono se resuelve a partir de ESE nombre y
 * solo hay favicon si contiene `http` o tiene pinta de dominio.
 *
 * Aquí se traduce ese query string a lo que el panel sabe leer:
 *
 * 1. `__referrer` pasa a ser una URL absoluta (o nada). Ver `referrerUrlFor()`.
 * 2. Los `utm_*` se cuelgan del query de `__path` (ver `pathWithAttribution()`),
 *    que es de donde el worker saca Source/Medium/Campaign. Separa `query` de
 *    `path`, así que el informe de Pages NO se ensucia.
 *
 * Todo esto es puro y testeado; el pegamento con el SDK está en
 * `attachInstallAttribution()`, al final del archivo.
 */
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Application from 'expo-application'

/** Atribución de instalación ya parseada y lista para mandar. */
export type InstallAttribution = {
  /** La cadena tal cual la devolvió Play (para depurar formatos raros). */
  raw: string
  /** `utm_*` útiles: sin los `(not set)` y sin claves vacías. */
  params: Record<string, string>
  /** URL absoluta para `__referrer`, si la fuente da para una. */
  referrerUrl?: string
}

/**
 * Valores con los que Play dice «no sé de dónde vino»: no son una fuente, son
 * el hueco. Si se mandaran, el panel enseñaría `(not set)` como si fuera una
 * campaña; mejor no mandar nada y que salga «Direct / Not set», igual que en web.
 */
const NOT_SET = new Set(['', '(not set)', '(not%20set)', 'not set', '(none)', 'null', 'undefined'])

/** Claves del install referrer que nos interesan (el resto es ruido de Play). */
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const

/**
 * Play manda `utm_source=google-play` en las instalaciones orgánicas. Ese valor
 * no casa con ninguna entrada de la tabla de referrers de OpenPanel NI con su
 * regex de dominio, así que saldría como texto pelado y sin icono. El dominio
 * real de la tienda sí pinta favicon y significa exactamente lo mismo.
 */
const SOURCE_ALIASES: Record<string, string> = {
  'google-play': 'play.google.com',
  'google play': 'play.google.com',
  googleplay: 'play.google.com',
  'apple-app-store': 'apps.apple.com',
  'app store': 'apps.apple.com',
}

/** Dominio de la ficha de la app: el referrer real de una instalación orgánica. */
const PLAY_STORE_URL = 'https://play.google.com'
const APP_STORE_URL = 'https://apps.apple.com'

function isNotSet(value: string | undefined): boolean {
  return value == null || NOT_SET.has(value.trim().toLowerCase())
}

/** ¿La cadena es una URL absoluta http(s)? Es lo único que el panel sabe leer. */
export function isAbsoluteHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return false
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

/**
 * Parsea el install referrer de Play (`utm_source=x&utm_medium=y&…`).
 *
 * Devuelve `null` cuando no hay atribución que mandar: cadena vacía, formato
 * inesperado o todo `(not set)` (que es el caso mayoritario — Play no sabe de
 * dónde salió la instalación).
 */
export function parseInstallReferrer(raw: string | null | undefined): InstallAttribution | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null

  // Play a veces manda la cadena entera percent-encoded (`utm_source%3Dx%26…`).
  let text = raw.trim()
  if (!text.includes('=') && text.includes('%3D')) {
    try { text = decodeURIComponent(text) } catch { /* se usa tal cual */ }
  }
  // Y a veces es una URL completa (deep link de campaña): nos quedamos su query.
  if (isAbsoluteHttpUrl(text)) {
    try { text = new URL(text).search.replace(/^\?/, '') } catch { /* tal cual */ }
  }

  const search = new URLSearchParams(text)
  const params: Record<string, string> = {}
  for (const key of UTM_KEYS) {
    const value = search.get(key)?.trim()
    if (value == null || isNotSet(value)) continue
    params[key] = key === 'utm_source' ? normalizeSource(value) : value
  }

  if (Object.keys(params).length === 0) return null

  return { raw, params, referrerUrl: referrerUrlFor(params.utm_source) }
}

/** `google-play` → `play.google.com`; el resto se respeta tal cual (en minúsculas). */
function normalizeSource(source: string): string {
  const key = source.toLowerCase()
  return SOURCE_ALIASES[key] ?? key
}

/**
 * URL absoluta para `__referrer` a partir de la fuente.
 *
 * Solo se inventa una URL cuando se sabe de verdad cuál es: las tiendas y las
 * fuentes que YA son un dominio. Para el resto se devuelve `undefined` y el
 * nombre lo pone `utm_source` desde el query de `__path` — OpenPanel ya sabe
 * traducir `facebook` → «Facebook» con su icono y su tipo `social`.
 */
export function referrerUrlFor(source: string | undefined): string | undefined {
  if (source == null || isNotSet(source)) return undefined
  const key = source.toLowerCase()
  if (key === 'play.google.com') return PLAY_STORE_URL
  if (key === 'apps.apple.com') return APP_STORE_URL
  // Con pinta de dominio (`example.com`, `m.facebook.com`) → se usa como host.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(key) && /\.[a-z]{2,}$/.test(key)) {
    return `https://${key}`
  }
  return undefined
}

/**
 * Valor final de `__referrer`.
 *
 * Invariante: al panel NUNCA llega algo que no sea una URL absoluta. Si el SDK
 * (o quien sea) ya puso una URL válida se respeta; si puso el query string de
 * Play se sustituye por la URL de la atribución; y si no hay atribución vigente
 * se manda `undefined` → «Direct / Not set», como la web sin referrer.
 */
export function normalizeReferrer(
  value: unknown,
  attribution: InstallAttribution | null,
): string | undefined {
  if (isAbsoluteHttpUrl(value)) return value
  return attribution?.referrerUrl
}

/**
 * Cuelga los `utm_*` del query de la ruta que se manda como `__path`.
 *
 * El worker hace `parsePath(__path)` y devuelve `path` y `query` por separado:
 * el informe de Pages sigue viendo `/history`, y Source/Medium/Campaign —que
 * en móvil estaban vacías— se llenan desde el query. Ojo: `parsePath` solo
 * parsea el query si la ruta empieza por `/` (si no, la trata como ruta con
 * nombre y la deja intacta), y `screenPattern()` siempre devuelve una así.
 */
export function pathWithAttribution(route: string, attribution: InstallAttribution | null): string {
  if (attribution == null || !route.startsWith('/') || route.includes('?')) return route
  const query = new URLSearchParams(attribution.params).toString()
  return query === '' ? route : `${route}?${query}`
}

// ─── Pegamento con el SDK ─────────────────────────────────────────────────────

/**
 * Marca de que el install referrer YA se gastó.
 *
 * El install referrer de Play es permanente: si se adjuntara a todos los
 * eventos, el 100 % de las sesiones móviles quedaría atribuido a Play para
 * siempre y no habría forma de ver nada más. Se atribuye solo la PRIMERA
 * sesión, que es lo que hace la web con los utm de la landing. El resto de
 * eventos de esa sesión no lo necesitan: el worker hereda el referrer del
 * `session_start` para todos los eventos de la sesión.
 */
const ATTRIBUTED_KEY = 'analytics_install_attributed'

let attribution: InstallAttribution | null = null

/** La atribución vigente, o `null` si ya se gastó (o nunca hubo). */
export function currentInstallAttribution(): InstallAttribution | null {
  return attribution
}

/**
 * Resuelve la atribución de instalación. Arranca en cuanto se llama a
 * `attachInstallAttribution()`, lo antes posible en el arranque, porque compite
 * con el primer evento: el referrer de la sesión lo fija su `session_start`.
 *
 * No se apoya en el valor del SDK aunque también lo pida: `getInstallReferrerAsync()`
 * puede lanzar seis errores distintos (sin Play Store, fallo de conexión al
 * servicio…) y el SDK lo llama SIN guarda —si peta, se lleva por delante
 * `__version` y `__buildNumber` de esa tanda—. Aquí va con su try/catch.
 */
async function resolveAttribution(): Promise<InstallAttribution | null> {
  if (Platform.OS !== 'android') return null
  try {
    if (await AsyncStorage.getItem(ATTRIBUTED_KEY)) return null
  } catch {
    // Sin poder leer la marca, mejor no atribuir que atribuir cada arranque.
    return null
  }
  let raw: string | null = null
  try {
    raw = await Application.getInstallReferrerAsync()
  } catch {
    // Sin Play Store (sideload, Huawei) o servicio caído: no hay atribución.
  }
  const parsed = parseInstallReferrer(raw)
  try {
    await AsyncStorage.setItem(ATTRIBUTED_KEY, new Date().toISOString())
  } catch {
    // Si no se puede marcar, se atribuiría otra vez al siguiente arranque. Es
    // el mal menor frente a perder la atribución de la instalación.
  }
  return parsed
}

/**
 * Envuelve `setGlobalProperties` (API pública del SDK) para que el install
 * referrer crudo no llegue nunca al panel, ni el del arranque ni el que el SDK
 * vuelve a fijar en cada vuelta a primer plano.
 *
 * Devuelve la promesa de la atribución para poder esperarla antes de soltar la
 * cola de eventos: si el primer evento sale sin referrer, la sesión entera se
 * queda sin él.
 */
export function attachInstallAttribution(op: {
  setGlobalProperties: (properties: Record<string, unknown>) => void
}): Promise<InstallAttribution | null> {
  const setGlobalProperties = op.setGlobalProperties.bind(op)

  op.setGlobalProperties = (properties: Record<string, unknown>) => {
    setGlobalProperties({
      ...properties,
      ...('__referrer' in properties
        ? { __referrer: normalizeReferrer(properties.__referrer, attribution) }
        : {}),
    })
  }

  const ready = resolveAttribution()
  ready.then((resolved) => {
    attribution = resolved
    if (resolved == null) return
    // Reescribir con la atribución ya resuelta: puede haber llegado después de
    // que el SDK fijara sus propiedades por defecto.
    setGlobalProperties({ __referrer: resolved.referrerUrl, install_referrer: resolved.raw })
  })
  return ready
}
