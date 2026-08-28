/**
 * CoreStorage (síncrono) sobre AsyncStorage: caché en memoria que se hidrata
 * una vez al arrancar (ver bootstrap en app/_layout.tsx). Compatible con Expo Go;
 * cuando pasemos a dev builds se puede reemplazar por MMKV sin tocar core.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Sentry from '@sentry/react-native'
import type { CoreStorage } from '@calistenia/core/platform'

const cache = new Map<string, string>()
let hydrated = false

/**
 * Hidrata la caché en memoria. NUNCA rechaza (#661).
 *
 * En Android AsyncStorage vive en SQLite y una lectura no puede devolver una
 * fila mayor que el CursorWindow (~2 MB). `getMany` lee todas las claves de
 * golpe, así que UNA clave gorda tumbaba la lectura ENTERA con
 * «Row too big to fit into CursorWindow» — y con ella el arranque, porque el
 * boot esperaba esta promesa y se quedaba en el splash para siempre.
 *
 * Ahora el fallo del lote cae a leer clave a clave: las que caben se hidratan y
 * solo se pierde la que no cabe. Y si hasta eso falla, la app arranca con la
 * caché vacía (degradado: se releerá de red) en vez de no arrancar.
 */
export async function hydrateStorage(): Promise<void> {
  if (hydrated) return
  try {
    const keys = await AsyncStorage.getAllKeys()
    if (keys.length > 0) {
      try {
        const pairs = await AsyncStorage.getMany(keys)
        for (const [key, value] of Object.entries(pairs)) {
          if (value != null) cache.set(key, value)
        }
      } catch (batchError) {
        await hydrateOneByOne(keys, batchError)
      }
    }
  } catch (e) {
    console.warn('[storage] hidratación fallida, se arranca sin caché:', e)
    Sentry.captureException(e, { tags: { storage_stage: 'hydrate' } })
  }
  // Se marca hidratado pase lo que pase: reintentarlo volvería a fallar igual y
  // dejaría el arranque colgado, que es justamente el bug.
  hydrated = true
}

/**
 * Fallback del `getMany`: una lectura por clave. Cada `getItem` abre su propio
 * cursor, así que solo revienta la clave que de verdad excede el límite; las
 * demás se salvan. La clave inválida se ELIMINA — si se queda en disco vuelve a
 * romper el arranque siguiente y el usuario no tiene forma de salir del splash
 * salvo reinstalando.
 */
async function hydrateOneByOne(keys: readonly string[], batchError: unknown): Promise<void> {
  const failed: string[] = []
  for (const key of keys) {
    try {
      const value = await AsyncStorage.getItem(key)
      if (value != null) cache.set(key, value)
    } catch {
      failed.push(key)
      await AsyncStorage.removeItem(key).catch(() => {
        /* si ni se puede borrar, al menos no se hidrata */
      })
    }
  }
  console.warn('[storage] getMany falló, claves descartadas:', failed, batchError)
  Sentry.captureException(batchError, {
    tags: { storage_stage: 'hydrate_batch' },
    extra: { failedKeys: failed, totalKeys: keys.length },
  })
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
