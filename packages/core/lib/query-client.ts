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
import { QueryClient, defaultShouldDehydrateQuery, onlineManager } from '@tanstack/react-query'
import type { DehydrateOptions, Query } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { getPlatform, storage } from '../platform'
import { qk } from './query-keys'

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
// v4: las migraciones de datos de #689/#690 cambiaron `exercise_name` e
// `is_timer` de filas que se cachean bajo las MISMAS query keys, así que sin
// tirar el caché los clientes seguían enseñando `arm_circles` y ningún
// cronómetro durante horas después del deploy.
export const PERSIST_BUSTER = 'v4-program-repair-690'

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
 * Recorta un caché persistido que se pasa del tope quitando las queries MÁS
 * GRANDES (por tamaño serializado) hasta que quepa. Devuelve el JSON recortado
 * o `null` si no se puede recortar (no parsea, no tiene la forma esperada, o
 * ni vaciando las queries cabe).
 *
 * Por qué recortar y no descartar: en producción hay usuarios cuyo caché
 * supera el tope en CADA escritura (CALISTENIA-APP-10: 2,3M caracteres contra
 * 600k). Con el descarte total esos usuarios no tenían NUNCA caché offline y
 * además reportábamos el mismo error en bucle. Perder las 2-3 queries más
 * gordas (que se refetchean al abrirlas) es mucho más barato que perderlo todo.
 */
export function trimPersistedCache(value: string): string | null {
  let parsed: any
  try {
    parsed = JSON.parse(value)
  } catch {
    return null
  }
  const queries = parsed?.clientState?.queries
  if (!Array.isArray(queries) || queries.length === 0) return null

  // Tamaño serializado de cada query, ordenado de mayor a menor. El descarte
  // es exacto: quitar una query resta su longitud + 1 coma del total.
  const sized = queries
    .map((query: unknown) => ({ query, len: JSON.stringify(query).length }))
    .sort((a, b) => b.len - a.len)

  let estimate = value.length
  const dropped = new Set<unknown>()
  for (const { query, len } of sized) {
    if (estimate <= PERSIST_MAX_CHARS) break
    estimate -= len + 1
    dropped.add(query)
  }

  // Se conserva el orden original de las queries que sobreviven.
  parsed.clientState.queries = queries.filter((q: unknown) => !dropped.has(q))
  const out = JSON.stringify(parsed)
  return out.length <= PERSIST_MAX_CHARS ? out : null
}

/**
 * Queries que NO se persisten en disco (denylist por prefijo de key).
 *
 * Por qué (Sentry «caché persistido descartado: 2,3M > 600k»): sin
 * `dehydrateOptions` se persistía TODA la caché y el tope de
 * `PERSIST_MAX_CHARS` se comía el trabajo útil. Solo vale la pena persistir lo
 * que da un primer pintado offline y NO tiene ya otra fuente local. Excluidas:
 *  - Las que arrancan con `initialData` desde localStorage (progreso/sesiones,
 *    peso, sueño, medidas, agua, plan semanal, recordatorios): persistirlas
 *    duplica lo que el hook ya lee de LS.
 *  - El catálogo de ejercicios: `useCatalogExerciseList` cae a la lista
 *    estática del bundle (`query.data ?? getStaticCatalogList()`).
 *  - Listas grandes o efímeras que se refetchean al abrir la pantalla (muro,
 *    reacciones, comentarios, detalles/estadísticas de programa, cardio,
 *    búsquedas de comida, nutrición por fecha/rango, detalle de reto y de
 *    programa de comunidad, PRs de carreras, usuarios sugeridos).
 * Se conservan, entre otras: programs.catalog / enrollment / detail /
 * overrides, streak-days / account-sessions, app-config, feed.meta y
 * nutrition today / goals.
 *
 * Cada prefijo sale de un constructor de `qk` (nada de strings sueltos): si se
 * renombra una key, el test de `query-client.persist-filter.test.ts` falla en
 * vez de volver a persistirlo todo en silencio. Un prefijo casa por SEGMENTOS
 * (`['feed','sessions']` excluye `['feed','sessions',uid,ids]` pero no
 * `['feed','meta',uid]`).
 */
export const NO_PERSIST_KEY_PREFIXES: readonly (readonly unknown[])[] = [
  // — con initialData desde localStorage —
  qk.sessions(null, null).slice(0, 1),
  qk.weight(null).slice(0, 1),
  qk.sleep(null).slice(0, 1),
  qk.bodyMeasurements(null).slice(0, 1),
  qk.weeklyMealPlan.active(null).slice(0, 1), // también `days`
  qk.water.day(null, '').slice(0, 1),
  qk.workoutReminders(null).slice(0, 1),
  // — catálogo con fallback estático en el bundle —
  qk.exerciseCatalog,
  // — programas: vistas de detalle / estadísticas / vista previa pública —
  qk.programs.detailView(null).slice(0, 2),
  qk.programs.stats([]).slice(0, 2),
  qk.programs.publicPreview(null).slice(0, 2),
  // — social: páginas del muro (el `feed.meta` pequeño SÍ se persiste) —
  qk.feed.sessions(null, []).slice(0, 2),
  qk.feed.users([]).slice(0, 2),
  qk.reactions(null, []).slice(0, 1),
  qk.comments.all,
  qk.commentReactions('', null).slice(0, 1),
  qk.suggestedUsers(null).slice(0, 1),
  // — cardio, comida, nutrición salvo today/goals —
  qk.cardioSessions(null).slice(0, 1),
  qk.foods.search('').slice(0, 1),
  qk.wgerSearch('', '').slice(0, 1),
  qk.nutrition.byDate(null, '').slice(0, 2),
  qk.nutrition.range(null, '', '').slice(0, 2),
  qk.nutrition.badges(null).slice(0, 2),
  qk.nutrition.insightDaily(null, '').slice(0, 2),
  // — retos, programas de comunidad y carreras: detalle —
  qk.challenge('').slice(0, 1),
  qk.challengeLeaderboard('', null).slice(0, 1),
  qk.expressProgress('').slice(0, 1),
  qk.communityProgram('', null).slice(0, 1),
  qk.races.prsFinished(null).slice(0, 3),
]

function startsWithSegments(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  if (key.length < prefix.length) return false
  for (let i = 0; i < prefix.length; i++) if (key[i] !== prefix[i]) return false
  return true
}

/** `true` si la query con esa key no debe escribirse en el caché persistido. */
export function isNoPersistKey(queryKey: readonly unknown[]): boolean {
  return NO_PERSIST_KEY_PREFIXES.some((prefix) => startsWithSegments(queryKey, prefix))
}

/**
 * `dehydrateOptions` COMPARTIDO por web y mobile (se pasa dentro de
 * `persistOptions`): una sola fuente para que las apps no diverjan.
 *
 * - Queries: lo normal de React Query (solo las `success`) menos la denylist.
 * - Mutaciones: NUNCA. Ninguna mutación del código registra `mutationFn` por
 *   defecto (`setMutationDefaults`) ni se llama a `resumePausedMutations`, así
 *   que una mutación pausada rehidratada no tiene función con la que
 *   reanudarse: persistirla solo ensancha el envelope sin servir de nada. El
 *   trabajo offline lo cubre `offlineQueue`, no la caché de React Query.
 */
export const CORE_DEHYDRATE_OPTIONS: DehydrateOptions = {
  shouldDehydrateQuery: (query: Query) =>
    defaultShouldDehydrateQuery(query) && !isNoPersistKey(query.queryKey),
  shouldDehydrateMutation: () => false,
}

/**
 * Storage del persister con guard de tamaño. Exportado para poder testear el
 * recorte sin montar un persister entero. Si el caché serializado se pasa del
 * tope se recorta (ver `trimPersistedCache`); si ni recortando cabe, no se
 * escribe y además se BORRA el anterior: dejar en disco una versión vieja
 * significaría rehidratar datos rancios indefinidamente, porque ya nunca se
 * sobrescribiría.
 */
export const cappedStorage = {
  getItem: (key: string) => storage.getItem(key),
  removeItem: (key: string) => storage.removeItem(key),
  setItem: (key: string, value: string) => {
    if (key === PERSIST_KEY && value.length > PERSIST_MAX_CHARS) {
      const trimmed = trimPersistedCache(value)
      if (trimmed !== null) {
        storage.setItem(key, trimmed)
        return
      }
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
