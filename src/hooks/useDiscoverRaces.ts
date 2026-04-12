import { useEffect, useState } from 'react'
import { pb } from '../lib/pocketbase'
import type { Race } from '../types/race'

export interface DiscoverFilter {
  search: string
  nearLat?: number | null
  nearLng?: number | null
  radiusKm?: number
}

export interface DiscoverRace extends Race {
  distanceKm: number | null  // distance from user, if nearLat/lng provided
}

// Rough km-per-degree at mid-latitudes. Sufficient for bounding-box prefilter;
// we compute a precise haversine for the in-range ones.
const KM_PER_DEG = 111

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function useDiscoverRaces(filter: DiscoverFilter): { races: DiscoverRace[]; loading: boolean; error: string | null } {
  const [races, setRaces] = useState<DiscoverRace[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { search, nearLat, nearLng, radiusKm = 50 } = filter

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const baseFilter: string[] = ['is_public = true', '(status = "waiting" || status = "countdown")']
    if (search.trim()) {
      baseFilter.push(`name ~ "${search.replace(/"/g, '')}"`)
    }

    // Bounding-box prefilter if we have a location
    if (nearLat != null && nearLng != null) {
      const degRadius = radiusKm / KM_PER_DEG
      baseFilter.push(`origin_lat >= ${nearLat - degRadius}`)
      baseFilter.push(`origin_lat <= ${nearLat + degRadius}`)
      // lng degrees are wider at equator, narrower at poles; use conservative bound
      const lngDegRadius = degRadius / Math.max(0.1, Math.cos((nearLat * Math.PI) / 180))
      baseFilter.push(`origin_lng >= ${nearLng - lngDegRadius}`)
      baseFilter.push(`origin_lng <= ${nearLng + lngDegRadius}`)
    }

    pb.collection('races').getList<Race>(1, 50, {
      filter: baseFilter.join(' && '),
      sort: '-created',
      requestKey: null,
    }).then(res => {
      if (cancelled) return
      const enriched = res.items.map(r => {
        const d = (nearLat != null && nearLng != null && r.origin_lat && r.origin_lng)
          ? haversine(nearLat, nearLng, r.origin_lat, r.origin_lng)
          : null
        return { ...r, distanceKm: d }
      })
      // Drop out-of-radius items missed by the box filter
      const filtered = (nearLat != null && nearLng != null)
        ? enriched.filter(r => r.distanceKm == null || r.distanceKm <= radiusKm)
        : enriched
      filtered.sort((a, b) => {
        if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm
        return 0
      })
      setRaces(filtered)
      setLoading(false)
    }).catch(err => {
      if (cancelled) return
      setError((err as Error).message)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [search, nearLat, nearLng, radiusKm])

  return { races, loading, error }
}
