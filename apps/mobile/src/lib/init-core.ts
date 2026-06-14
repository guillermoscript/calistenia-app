/**
 * Inicialización de @calistenia/core para React Native.
 *
 * DEBE ser el PRIMER import de app/_layout.tsx: los módulos de core
 * (pocketbase.ts, ai-api.ts) leen el platform adapter al evaluarse.
 */
import { AsyncAuthStore } from 'pocketbase'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import EventSource from 'react-native-sse'
import { OpenPanel } from '@openpanel/react-native'
import { initCore } from '@calistenia/core/platform'
import { Sentry } from './instrument'
import { syncStorage } from './storage'
import { isOnline, onOnline } from './connectivity'
import { registerPushTokenAsync } from './push-registration'

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

const aiApiUrl = process.env.EXPO_PUBLIC_AI_API_URL || 'https://test.guille.tech'

// Promesa exportada para que el bootstrap espere la sesión persistida
// antes de decidir login vs home.
export const pbAuthHydration: Promise<string | null> = AsyncStorage.getItem('pb_auth')

const pbAuthStore = new AsyncAuthStore({
  save: async (serialized) => AsyncStorage.setItem('pb_auth', serialized),
  initial: pbAuthHydration,
  clear: async () => AsyncStorage.removeItem('pb_auth'),
})

// Mismo proyecto OpenPanel que la web (los eventos llevan props de dispositivo
// del SDK RN). En dev solo logueamos para no ensuciar las métricas.
const op = new OpenPanel({
  apiUrl: 'https://openpanel.guille.tech/api',
  clientId: process.env.EXPO_PUBLIC_OPENPANEL_CLIENT_ID || '95f75c3f-fb38-4c0b-a401-a3a63f8b91f5',
})

initCore({
  storage: syncStorage,
  env: {
    pbUrl,
    aiApiUrl,
    isDev: __DEV__,
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
    if (__DEV__) console.error('[core]', e)
    else Sentry.captureException(e)
  },
  connectivity: { isOnline, onOnline },
  pbAuthStore,
})

// ─── Push token registration ──────────────────────────────────────────────────
// Registra el token de Expo Push cuando el usuario está autenticado.
// Fire-and-forget: no bloquea el init. Se lanza también en cada cambio de
// authStore (login con OAuth2, refresh) para cubrir la primera sesión y
// reinstalaciones.
import('@calistenia/core/lib/pocketbase').then(({ pb }) => {
  const tryRegister = () => {
    if (pb.authStore.isValid) {
      const user = (pb.authStore as any).record ?? (pb.authStore as any).model
      if (user?.id) {
        registerPushTokenAsync(pb, user.id).catch(() => {/* silenciar */})
      }
    }
  }
  // Intentar inmediatamente (hydration ya completada en el momento en que
  // este módulo se ejecuta gracias a `initial: pbAuthHydration`).
  tryRegister()
  // Escuchar cambios futuros (login, logout, refresh).
  pb.authStore.onChange(tryRegister)
})
