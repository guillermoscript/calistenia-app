/**
 * QueryClient compartido entre web y mobile.
 *
 * Cada app crea su client con `createQueryClient()` y monta el provider de
 * `@tanstack/react-query` en su árbol (web: App.tsx, mobile: _layout.tsx). El
 * client en sí es agnóstico de plataforma — la red y el almacenamiento entran
 * por el adapter de `platform.ts`, así que la misma config corre en ambos.
 *
 * Persistencia offline-first: `createCorePersister()` envuelve el `storage`
 * síncrono (localStorage en web, MMKV en mobile) en un persister de React Query.
 * La app lo pasa a PersistQueryClientProvider.
 */
import { QueryClient, onlineManager } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { getPlatform, storage } from '../platform'

/** Errores de PocketBase con status HTTP — para decidir si reintentar. */
function statusOf(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const s = (error as { status?: unknown }).status
    if (typeof s === 'number') return s
  }
  return undefined
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Datos de servidor cambian despacio; 30s evita refetch en cada montaje
        // (los hooks suben/bajan por dominio). gcTime alto para que el persister
        // pueda rehidratar tras cerrar la app.
        staleTime: 30_000,
        gcTime: 24 * 60 * 60 * 1000, // 24h
        // No reintentar 4xx (auth/validación/404): son determinísticos.
        retry: (failureCount, error) => {
          const status = statusOf(error)
          if (status && status >= 400 && status < 500) return false
          return failureCount < 2
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        // RN no tiene foco de ventana; en web el refetch al enfocar molesta más
        // que ayuda con staleTime 30s. Refetch explícito por hook si hace falta.
        refetchOnWindowFocus: false,
        // Pausa queries sin red y las reanuda al reconectar (vía onlineManager).
        networkMode: 'online',
      },
      mutations: {
        networkMode: 'online',
        retry: false,
      },
    },
  })
}

/**
 * Conecta el onlineManager de React Query al adapter de conectividad de la
 * plataforma. Llamar UNA vez al boot, después de initCore(). Prefiere onChange
 * (ambas direcciones); cae a onOnline si la plataforma no lo expone.
 */
export function setupOnlineManager(): void {
  const conn = getPlatform().connectivity
  onlineManager.setEventListener((setOnline) => {
    setOnline(conn.isOnline())
    if (conn.onChange) return conn.onChange((online) => setOnline(online))
    // Fallback: solo detectamos reconexión; offline lo infiere networkMode al
    // fallar un fetch. Menos preciso pero funcional.
    return conn.onOnline(() => setOnline(true))
  })
}

/**
 * Versión de la FORMA de los datos cacheados. Súbela cuando cambie el tipo de
 * algo que se persiste y la query key NO cambie.
 *
 * Por qué existe: el caché persistido sobrevive al deploy, así que un build
 * nuevo rehidrata objetos escritos por el build viejo. Si la clave es la misma
 * (`['feed','sessions',…]`) y el tipo cambió, el componente pinta el dato
 * ANTIGUO con el código NUEVO antes de que llegue el refetch. Pasó de verdad:
 * #588 añadió `exerciseNames` a `FeedItem` y el muro de un usuario con caché
 * previo tumbaba el dashboard entero con "Cannot read properties of undefined
 * (reading 'length')" (GYM-GUILLE-1X/1Z). React Query descarta el caché entero
 * cuando el buster no coincide, que es exactamente lo que hace falta.
 *
 * Coste de subirla: los usuarios pierden UNA vez el caché offline y la primera
 * carga tras el deploy va a red. Barato al lado de un dashboard en blanco.
 */
// v3: la v1.12.1 (vc37) persistió settings.startDate = «Invalid Date» (dayjs
// roto en Hermes); rehidratarlo tumbaba la Home. Se desecha esa caché.
export const PERSIST_BUSTER = 'v3-dayjs-660'

/** Clave única donde el persister serializa TODA la caché de queries. */
export const PERSIST_KEY = 'calistenia_rq_cache'

/**
 * Tope de tamaño del caché persistido, en caracteres.
 *
 * Por qué existe (#661): en Android AsyncStorage es SQLite y una fila no puede
 * superar el CursorWindow (~2 MB); al leerla salta
 * «Row too big to fit into CursorWindow» y se lleva por delante la lectura
 * entera del storage — y con ella el arranque de la app. Como el persister mete
 * toda la caché en UNA clave y el gcTime es de 24 h, esa clave crecía sin techo
 * (catálogo + programas + muro + detalles de sesión) hasta cruzar el límite.
 *
 * El tope se cuenta en CARACTERES, no en bytes: `String.length` está siempre
 * disponible (Hermes y navegador) y no obliga a un TextEncoder. 600k caracteres
 * son ~600 KB en JSON ASCII y ~1,2 MB en el peor caso de texto acentuado —
 * holgado por debajo de los 2 MB en ambos.
 */
export const PERSIST_MAX_CHARS = 600_000

/**
 * Storage del persister con guard de tamaño. Exportado para poder testear el
 * descarte sin montar un persister entero. Si el caché serializado se pasa
 * del tope no se escribe y además se BORRA el anterior: dejar en disco una
 * versión vieja significaría rehidratar datos rancios indefinidamente, porque
 * ya nunca se sobrescribiría.
 */
export const cappedStorage = {
  getItem: (key: string) => storage.getItem(key),
  removeItem: (key: string) => storage.removeItem(key),
  setItem: (key: string, value: string) => {
    if (key === PERSIST_KEY && value.length > PERSIST_MAX_CHARS) {
      storage.removeItem(key)
      try {
        getPlatform().reportError?.(
          new Error(
            `[query-client] caché persistido descartado: ${value.length} caracteres > ${PERSIST_MAX_CHARS}`
          )
        )
      } catch {
        /* informar de un descarte no puede tumbar la escritura */
      }
      return
    }
    storage.setItem(key, value)
  },
}

/** Persister sobre el storage síncrono inyectado (localStorage / MMKV). */
export function createCorePersister() {
  return createSyncStoragePersister({
    storage: cappedStorage,
    key: PERSIST_KEY,
    throttleTime: 1000,
  })
}

/** maxAge del caché persistido: 24h. Pasar a PersistQueryClientProvider. */
export const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000
