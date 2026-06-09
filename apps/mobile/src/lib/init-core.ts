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
import { initCore } from '@calistenia/core/platform'
import { syncStorage } from './storage'

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

initCore({
  storage: syncStorage,
  env: {
    pbUrl,
    aiApiUrl,
    isDev: __DEV__,
  },
  // TODO fase 3: @openpanel/react-native. Por ahora solo log en dev.
  analytics: {
    track: (name, properties) => {
      if (__DEV__) console.log('[analytics]', name, properties ?? '')
    },
    identify: () => {},
    clear: () => {},
  },
  // TODO fase 3: @sentry/react-native
  reportError: (e) => console.error('[core]', e),
  // TODO fase 3: @react-native-community/netinfo para la offline queue
  connectivity: {
    isOnline: () => true,
    onOnline: () => () => {},
  },
  pbAuthStore,
})
