/**
 * CoreStorage (síncrono) sobre AsyncStorage: caché en memoria que se hidrata
 * una vez al arrancar (ver bootstrap en app/_layout.tsx). Compatible con Expo Go;
 * cuando pasemos a dev builds se puede reemplazar por MMKV sin tocar core.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { CoreStorage } from '@calistenia/core/platform'

const cache = new Map<string, string>()
let hydrated = false

export async function hydrateStorage(): Promise<void> {
  if (hydrated) return
  const keys = await AsyncStorage.getAllKeys()
  if (keys.length > 0) {
    const pairs = await AsyncStorage.multiGet(keys)
    for (const [key, value] of pairs) {
      if (value != null) cache.set(key, value)
    }
  }
  hydrated = true
}

export const syncStorage: CoreStorage = {
  getItem: (key) => cache.get(key) ?? null,
  setItem: (key, value) => {
    cache.set(key, value)
    AsyncStorage.setItem(key, value).catch((e) =>
      console.warn('[storage] setItem falló:', key, e)
    )
  },
  removeItem: (key) => {
    cache.delete(key)
    AsyncStorage.removeItem(key).catch((e) =>
      console.warn('[storage] removeItem falló:', key, e)
    )
  },
}
