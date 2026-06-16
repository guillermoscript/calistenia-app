/**
 * Inicialización de @calistenia/core para React Native.
 *
 * DEBE ser el PRIMER import de app/_layout.tsx: los módulos de core
 * (pocketbase.ts, ai-api.ts) leen el platform adapter al evaluarse.
 */
import { AsyncAuthStore } from 'pocketbase'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import Constants from 'expo-constants'
import EventSource from 'react-native-sse'
import { OpenPanel } from '@openpanel/react-native'
import { initCore } from '@calistenia/core/platform'
import { Sentry } from './instrument'
import { syncStorage } from './storage'
import { isOnline, onOnline } from './connectivity'

// PocketBase realtime (lo usa el flujo OAuth2 del SDK) necesita EventSource,
// que no existe en React Native.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).EventSource = EventSource

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

// Mismo proyecto OpenPanel que la web: OpenPanel identifica por profileId (el id
// de usuario de PocketBase, idéntico en web y móvil) → un único perfil por
// persona y funnels cross-platform intactos. Los eventos llevan platform:'mobile'
// para segmentar dentro del mismo proyecto. clientSecret NO se usa (solo eventos
// server-side; además un secreto en el bundle no es secreto). En dev solo
// logueamos para no ensuciar las métricas.
// storage + networkInfo = buffering offline: los eventos se persisten en disco y
// se reenvían al recuperar conexión (clave para un gym sin señal).
const op = new OpenPanel({
  apiUrl: 'https://openpanel.guille.tech/api',
  clientId: process.env.EXPO_PUBLIC_OPENPANEL_CLIENT_ID || '95f75c3f-fb38-4c0b-a401-a3a63f8b91f5',
  storage: AsyncStorage,
  networkInfo: NetInfo,
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
