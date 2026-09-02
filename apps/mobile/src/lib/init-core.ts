/**
 * Inicialización de @calistenia/core para React Native.
 *
 * DEBE ser el PRIMER import de app/_layout.tsx: los módulos de core
 * (pocketbase.ts, ai-api.ts) leen el platform adapter al evaluarse.
 */
import { Platform } from 'react-native'
import { AsyncAuthStore } from 'pocketbase'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import Constants from 'expo-constants'
import * as Application from 'expo-application'
import EventSource from 'react-native-sse'
import { OpenPanel } from '@openpanel/react-native'
import { initCore } from '@calistenia/core/platform'
import { primeCatalogIndex, type RawCatalog } from '@calistenia/core/lib/catalogIndex'
import exerciseCatalog from '@calistenia/core/data/exercise-catalog.json'
import { Sentry } from './instrument'
import { syncStorage } from './storage'
import { isOnline, onOnline, onConnectivityChange } from './connectivity'
import { isForeground, onForeground, onBackground } from './lifecycle'
import { registerPushTokenAsync } from './push-registration'
import { CANONICAL_ANALYTICS_EVENTS, setActiveAnalyticsProfileId, shouldSendAnalytics, trackCanonicalEvent } from '@calistenia/core/lib/analytics'

// El catálogo de ejercicios va en el bundle de RN de todas formas, así que se
// indexa aquí, en el arranque (#486). Las APIs síncronas de core que dependen de
// él —`resolveExerciseId()` sobre todo, que da la identidad con la que se
// registran las series— responden desde la primera llamada, sin la ventana de
// carga perezosa que sí tiene la web.
primeCatalogIndex(exerciseCatalog as unknown as RawCatalog)

// PocketBase realtime (lo usa el flujo OAuth2 del SDK) necesita EventSource,
// que no existe en React Native.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).EventSource = EventSource

// ─── Timeout global para requests de datos a PocketBase ──────────────────────
// Sin esto, un fallo de DNS o una red lenta dejan la request colgada ~65s
// (UnknownHostException tarda en propagarse) y la pantalla "carga para siempre".
// Acotamos SOLO a las llamadas de datos de PB (collections / health). Excluimos
// /api/realtime (SSE de larga duración) y el host de IA (streaming) para no
// cortarlos. Respeta cualquier signal de auto-cancelación del SDK reenviando su
// abort. En __DEV__ además loguea status+duración de cada request.
if (!(globalThis as any).__pbFetchPatched) {
  ;(globalThis as any).__pbFetchPatched = true
  const PB_TIMEOUT_MS = 15_000
  const _origFetch = globalThis.fetch
  ;(globalThis as any).fetch = async (input: any, init?: any) => {
    const url: string = typeof input === 'string' ? input : input?.url ?? ''
    const isPBData =
      (url.includes('/api/collections/') || /\/api\/health(\?|$)/.test(url)) &&
      !url.includes('/api/realtime')

    if (!isPBData) return _origFetch(input, init)

    const method = init?.method ?? (typeof input !== 'string' ? input?.method : undefined) ?? 'GET'
    const t0 = Date.now()
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(new Error(`PB request timeout after ${PB_TIMEOUT_MS}ms`)), PB_TIMEOUT_MS)
    // Reenviar el abort del signal existente (auto-cancelación del SDK) al nuestro.
    const existing: AbortSignal | undefined = init?.signal
    if (existing) {
      if (existing.aborted) ctrl.abort()
      else existing.addEventListener('abort', () => ctrl.abort(), { once: true })
    }
    try {
      const res = await _origFetch(input, { ...init, signal: ctrl.signal })
      if (__DEV__) console.log(`[pb] ${res.status} ${Date.now() - t0}ms ${method} ${url.replace(/^https?:\/\/[^/]+/, '')}`)
      return res
    } catch (e: any) {
      if (__DEV__) console.log(`[pb] ERR ${Date.now() - t0}ms ${method} ${url.replace(/^https?:\/\/[^/]+/, '')} → ${e?.message ?? e}`)
      throw e
    } finally {
      clearTimeout(timer)
    }
  }
}
// ──────────────────────────────────────────────────────────────────────────────

// En dev, apuntar PB a la misma máquina que sirve Metro (funciona en
// simulador y en dispositivo físico en la misma red). En expo web no hay
// hostUri — usar el hostname del navegador.
const devHost =
  Constants.expoConfig?.hostUri?.split(':')[0] ??
  (typeof window !== 'undefined' && window.location != null ? window.location.hostname : undefined)

const pbUrl =
  process.env.EXPO_PUBLIC_PB_URL ||
  (__DEV__ && devHost ? `http://${devHost}:8090` : 'https://gym.guille.tech')

const aiApiUrl =
  process.env.EXPO_PUBLIC_AI_API_URL ||
  (__DEV__ && devHost ? `http://${devHost}:3001` : 'https://gym-server.guille.tech')

// ─── Identidad del cliente (version gate + telemetría de versiones) ──────────
// `nativeBuildVersion` es el entero que de verdad identifica el build instalado
// (Android: versionCode; iOS: CFBundleVersion) y llega como STRING. Es el que
// compara el gate; `version` es solo para leerlo con ojos humanos.
//
// En Expo Go y en web ambos vienen null: se cae a 0 y `evaluateUpdate` trata el
// 0 como "cliente sin identificar → nunca bloquear". El gate no puede dejar
// tirado a nadie por un fallo de detección.
const nativeBuild = Number.parseInt(Application.nativeBuildVersion ?? '', 10)
const appPlatform: 'android' | 'ios' | 'web' =
  Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web'

const clientInfo = {
  version: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0',
  build: Number.isFinite(nativeBuild) && nativeBuild > 0 ? nativeBuild : 0,
  platform: appPlatform,
} as const

// Promesa exportada para que el bootstrap espere la sesión persistida
// antes de decidir login vs home.
export const pbAuthHydration: Promise<string | null> = AsyncStorage.getItem('pb_auth')

const pbAuthStore = new AsyncAuthStore({
  save: async (serialized) => AsyncStorage.setItem('pb_auth', serialized),
  initial: pbAuthHydration,
  clear: async () => AsyncStorage.removeItem('pb_auth'),
})

// Proyecto OpenPanel propio del móvil (separado del de la web) → métricas
// nativas aisladas. OpenPanel sigue identificando por profileId (el id de
// usuario de PocketBase, idéntico en web y móvil), así que el mismo perfil
// existe en ambos proyectos; los eventos llevan platform:'mobile'. El
// clientSecret habilita los eventos del proyecto móvil; aunque viaje en el
// bundle no es un secreto real (como ya pasa con el clientId público). En dev
// solo logueamos para no ensuciar las métricas.
// storage + networkInfo = buffering offline: los eventos se persisten en disco y
// se reenvían al recuperar conexión (clave para un gym sin señal).
const op = new OpenPanel({
  apiUrl: 'https://openpanel.guille.tech/api',
  clientId: process.env.EXPO_PUBLIC_OPENPANEL_CLIENT_ID || '896084a4-5808-472e-a329-cc2863d3a0ed',
  // El secret NO va hardcodeado: lo inyecta CI (secret EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET).
  // En dev queda undefined → no pasa nada, los eventos solo se loguean (ver gating __DEV__).
  clientSecret: process.env.EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET,
  storage: AsyncStorage,
  networkInfo: NetInfo,
  // Los eventos se encolan hasta identify() (o ready() si no hay sesión): así
  // los primeros screen_view del arranque llevan profileId en vez de salir
  // anónimos. Ver identifyFromAuthStore() más abajo.
  waitForProfile: true,
  // #696: la cuenta demo del revisor de Play no cuenta. El SDK evalúa el filtro
  // antes de encolar y otra vez al vaciar la cola (ya con profileId), así que
  // ni los screen_view del arranque ni el identify llegan al panel.
  filter: shouldSendAnalytics,
})

/**
 * Screen view de OpenPanel respetando el gating de __DEV__ (igual que track).
 * La web auto-trackea screen views; en RN hay que llamarlo a mano desde el layout.
 */
export function trackScreen(route: string, properties?: Record<string, unknown>) {
  if (__DEV__) {
    console.log('[analytics] screen_view', route, properties ?? '')
    return
  }
  op.screenView(route, properties)
}

initCore({
  storage: syncStorage,
  env: {
    pbUrl,
    aiApiUrl,
    isDev: __DEV__,
    client: clientInfo,
  },
  analytics: {
    track: (name, properties) => {
      if (__DEV__) {
        console.log('[analytics]', name, properties ?? '')
        return
      }
      op.track(name, properties)
    },
    identify: (payload) => {
      if (!__DEV__) op.identify(payload as Parameters<typeof op.identify>[0])
    },
    clear: () => {
      if (!__DEV__) op.clear()
    },
  },
  reportError: (e) => {
    // Sentry primero: captureException devuelve el event id y ese id viaja en
    // el `page_error` de OpenPanel — es el puente entre una sesión del panel
    // y el evento exacto en Sentry (antes cruzar era dispositivo + hora).
    const sentryEventId = __DEV__ ? undefined : Sentry.captureException(e)
    if (__DEV__) console.error('[core]', e)
    // Paridad con el `page_error` de web (#636 §5): hasta ahora el móvil solo
    // lo mandaba a Sentry, así que la tasa de errores por plataforma no se
    // podía comparar. Sentry sigue siendo el sitio para depurarlo; esto solo
    // pone el número en el mismo embudo que el resto.
    try {
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.pageError, {
        surface: 'app', source: 'core_report',
        error_type: 'reported',
        message: e instanceof Error ? e.message : String(e),
        ...(sentryEventId ? { sentry_event_id: sentryEventId } : {}),
      })
    } catch { /* informar de un error no puede provocar otro */ }
  },
  connectivity: { isOnline, onOnline, onChange: onConnectivityChange },
  lifecycle: { isForeground, onForeground, onBackground },
  pbAuthStore,
})

// ─── Push token registration ──────────────────────────────────────────────────
// Registra el token de Expo Push cuando el usuario está autenticado.
// Fire-and-forget: no bloquea el init. Se lanza también en cada cambio de
// authStore (login con OAuth2, refresh) para cubrir la primera sesión y
// reinstalaciones.
import('@calistenia/core/lib/pocketbase').then(({ pb }) => {
  // ── Identidad de analytics ──────────────────────────────────────────────
  // `op.identify()` solo se llamaba desde useAuth, que en móvil se monta
  // únicamente en la pantalla de login. Con sesión restaurada al arrancar no
  // corría nunca y el SDK guarda el profileId solo en memoria → TODOS los
  // eventos de un usuario ya logueado salían como «Anonymous» en OpenPanel.
  // Se identifica aquí, en cada arranque y en cada cambio del authStore.
  let identifiedAs: string | null = null
  const identifyFromAuthStore = () => {
    const user = pb.authStore.isValid
      ? ((pb.authStore as any).record ?? (pb.authStore as any).model)
      : null
    if (user?.id) {
      if (identifiedAs === user.id) return
      identifiedAs = user.id
      // Mismo id (PB) en Sentry que el profileId de OpenPanel: permite cruzar
      // un issue con la sesión/perfil del panel. Solo el id, sin email
      // (sendDefaultPii sigue en false).
      Sentry.setUser({ id: user.id })
      // Aquí se llama al SDK directamente (no al facade de core), así que el
      // respaldo del filtro #696 hay que fijarlo a mano.
      setActiveAnalyticsProfileId(user.id)
      if (__DEV__) { console.log('[analytics] identify', user.id); return }
      op.identify({
        profileId: user.id,
        firstName: user.display_name || user.name || '',
        email: user.email,
        properties: { tier: user.tier || 'free', role: user.role || 'user', platform: 'mobile' },
      })
    } else {
      identifiedAs = null
      Sentry.setUser(null)
      setActiveAnalyticsProfileId(null)
      // Invitado: soltar la cola para no perder los eventos de onboarding/login.
      if (!__DEV__) op.ready()
    }
  }

  const tryRegister = () => {
    identifyFromAuthStore()
    if (pb.authStore.isValid) {
      const user = (pb.authStore as any).record ?? (pb.authStore as any).model
      if (user?.id) {
        registerPushTokenAsync(pb, user.id).catch((e) => { Sentry.captureException(e, { tags: { feature: 'push', op: 'register_push_token' } }) /* silenciar */ })
        // Zona horaria: el servidor la necesita para enviar los recordatorios a
        // la hora local correcta. Va AQUÍ y no en useAuth porque en móvil
        // useAuth solo se monta en la pantalla de login (mismo motivo que la
        // identidad de analytics de más arriba): con sesión ya iniciada nunca
        // llegaría a ejecutarse y `users.timezone` se quedaría vacío.
        import('@calistenia/core/lib/timezone-sync').then(({ syncUserTimezone }) =>
          syncUserTimezone(user.id, user.timezone),
        ).catch((e) => { Sentry.captureException(e, { tags: { feature: 'reminders', op: 'sync_timezone' } }) /* silenciar */ })
      }
    }
  }
  // Intentar inmediatamente (hydration ya completada en el momento en que
  // este módulo se ejecuta gracias a `initial: pbAuthHydration`).
  tryRegister()
  // Escuchar cambios futuros (login, logout, refresh).
  pb.authStore.onChange(tryRegister)
})
