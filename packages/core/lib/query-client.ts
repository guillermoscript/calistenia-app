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

/** Persister sobre el storage síncrono inyectado (localStorage / MMKV). */
export function createCorePersister() {
  return createSyncStoragePersister({
    storage,
    key: 'calistenia_rq_cache',
    throttleTime: 1000,
  })
}

/** maxAge del caché persistido: 24h. Pasar a PersistQueryClientProvider. */
export const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000
