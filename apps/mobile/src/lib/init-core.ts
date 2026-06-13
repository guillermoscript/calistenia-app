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

// PocketBase realtime (lo usa el flujo OAuth2 del SDK) necesita EventSource,
// que no existe en React Native.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).EventSource = EventSource

// En dev, apuntar PB a la misma máquina que sirve Metro (funciona en
// simulador y en dispositivo físico en la misma red). En expo web no hay
// hostUri — usar el hostname del navegador.
const devHost =
  Constants.expoConfig?.hostUri?.split(':')[0] ??
  (typeof window !== 'undefined' ? window.location.hostname : undefined)

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
