/**
 * Version gate + feature flags remotos, compartido por web y móvil.
 *
 * La lógica de decisión vive en `lib/app-config.ts` (pura); aquí solo se
 * orquesta TanStack Query y se expone el estado que la UI necesita.
 *
 * Se refresca al volver a foreground (`refetchOnWindowFocus`) porque ése es el
 * momento útil: si Guillermo sube `min_supported_build` mientras el usuario
 * tiene la app abierta en segundo plano, el gate aparece al volver, no en el
 * siguiente arranque en frío.
 */
import { useQuery } from '@tanstack/react-query'
import { getClientInfo } from '../platform'
import { qk } from '../lib/query-keys'
import {
  evaluateUpdate,
  fetchAppConfig,
  isFlagEnabled,
  readCachedConfig,
  type AppConfig,
  type UpdateStatus,
} from '../lib/app-config'

export interface UseAppConfigResult {
  config: AppConfig | null
  status: UpdateStatus
  /** Build del cliente actual (Android: versionCode; web: 0). */
  build: number
  /** Última versión visible publicada, para el texto del aviso. */
  latestVersion: string
  storeUrl: string
  /** Clave i18n del motivo, vacía si el servidor no puso ninguna. */
  messageKey: string
  isFlagEnabled: (flag: string, fallback?: boolean) => boolean
}

export function useAppConfig(): UseAppConfigResult {
  const { build } = getClientInfo()

  const { data } = useQuery({
    queryKey: qk.appConfig,
    queryFn: fetchAppConfig,
    // El caché en disco resuelve el primer render sin parpadeo: sin esto la app
    // arranca 1 frame en 'ok' y el gate aparecería DESPUÉS de la petición.
    initialData: () => readCachedConfig(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    // fetchAppConfig ya cae al caché por dentro y nunca lanza; reintentar solo
    // añadiría ruido de red en un gimnasio sin cobertura.
    retry: false,
  })

  const config = data ?? null

  return {
    config,
    status: evaluateUpdate(build, config),
    build,
    latestVersion: config?.latest_version ?? '',
    storeUrl: config?.store_url ?? '',
    messageKey: config?.message_key ?? '',
    isFlagEnabled: (flag, fallback = true) => isFlagEnabled(config, flag, fallback),
  }
}
