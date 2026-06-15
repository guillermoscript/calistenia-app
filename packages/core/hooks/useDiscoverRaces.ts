import { useQuery } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import type { Race } from '../types/race'

export interface DiscoverFilter {
  search: string
  nearLat?: number | null
  nearLng?: number | null
  radiusKm?: number
  /**
   * @deprecated Ya no es necesario. Usa el `refetch` que devuelve el hook para
   * forzar una recarga (p.ej. pull-to-refresh). Se mantiene en la interfaz para
   * compatibilidad con llamadores existentes, pero se ignora internamente.
   */
  reloadToken?: number
}

export interface DiscoverRace extends Race {
  distanceKm: number | null  // distancia al usuario, si se proporcionó nearLat/lng
}

// Metros por grado aproximado a latitudes medias. Suficiente para el pre-filtro
// de bounding-box; la distancia exacta se calcula con haversine.
const KM_PER_DEG = 111

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/**
 * Descubre carreras públicas con filtros opcionales de texto y proximidad.
 *
 * Migrado a TanStack Query. El filtrado haversine permanece dentro de queryFn.
 * Forma pública: { races, loading, error, refetch }.
 * - `loading` mapea a `isFetching` para mantener la semántica de "en vuelo".
 * - `error` es string | null igual que en la implementación anterior.
 * - `reloadToken` en DiscoverFilter se ignora; usa `refetch` en su lugar.
 */
export function useDiscoverRaces(filter: DiscoverFilter): {
  races: DiscoverRace[]
  loading: boolean
  error: string | null
  refetch: () => void
} {
  const { search, nearLat, nearLng, radiusKm = 50 } = filter

  // La key incluye los parámetros que afectan el resultado. `reloadToken` se
  // omite adrede: usamos `refetch` de RQ en su lugar.
  const queryKey = qk.races.discover({ search, nearLat, nearLng, radiusKm })

  const { data, isFetching, error: rqError, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      // — Filtros base: solo carreras públicas en estado activo —
      const baseFilter: string[] = ['is_public = true', '(status = "waiting" || status = "countdown")']

      if (search.trim()) {
        baseFilter.push(`name ~ "${search.replace(/"/g, '')}"`)
      }

      // Pre-filtro de bounding-box si hay coordenadas, para reducir resultados
      // antes del filtro haversine exacto.
      if (nearLat != null && nearLng != null) {
        const degRadius = radiusKm / KM_PER_DEG
        baseFilter.push(`origin_lat >= ${nearLat - degRadius}`)
        baseFilter.push(`origin_lat <= ${nearLat + degRadius}`)
        // El grado de longitud es más angosto a latitudes altas; cota conservadora.
        const lngDegRadius = degRadius / Math.max(0.1, Math.cos((nearLat * Math.PI) / 180))
        baseFilter.push(`origin_lng >= ${nearLng - lngDegRadius}`)
        baseFilter.push(`origin_lng <= ${nearLng + lngDegRadius}`)
      }

      const res = await pb.collection('races').getList<Race>(1, 50, {
        filter: baseFilter.join(' && '),
        sort: '-created',
        requestKey: null,
      })

      // Enriquecer con distancia haversine exacta
      const enriched: DiscoverRace[] = res.items.map(r => {
        const d = (nearLat != null && nearLng != null && r.origin_lat && r.origin_lng)
          ? haversine(nearLat, nearLng, r.origin_lat, r.origin_lng)
          : null
        return { ...r, distanceKm: d }
      })

      // Descartar los que el bounding-box incluyó pero el haversine excluye
      const filtered = (nearLat != null && nearLng != null)
        ? enriched.filter(r => r.distanceKm == null || r.distanceKm <= radiusKm)
        : enriched

      // Ordenar por cercanía si hay ubicación; mantener orden PB (−created) si no
      filtered.sort((a, b) => {
        if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm
        return 0
      })

      return filtered
    },
    // staleTime corto: los estados de carrera cambian frecuentemente
    staleTime: 30_000,
  })

  // Mapear el estado de RQ a la forma pública original
  const races = data ?? []
  const loading = isFetching
  const error = rqError ? (rqError as Error).message : null

  return { races, loading, error, refetch }
}
