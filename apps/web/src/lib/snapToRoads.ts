/**
 * Snap GPS traces to actual roads using the OSRM Match API (free, no key required).
 * Returns GeoJSON coordinates that follow the road network.
 *
 * - Walking/Running → "foot" profile
 * - Cycling → "cycling" profile (not available on public OSRM — falls back to "driving")
 * - OSRM public server limits: ~100 coordinates per request
 * - We downsample dense traces, snap, then return the snapped geometry
 */

interface LatLng {
  lat: number
  lng: number
}

// In-memory cache keyed by a hash of the first/last points + count
const cache = new Map<string, [number, number][]>()

function cacheKey(points: LatLng[]): string {
  if (points.length === 0) return ''
  const first = points[0]
  const last = points[points.length - 1]
  return `${first.lat.toFixed(5)},${first.lng.toFixed(5)}-${last.lat.toFixed(5)},${last.lng.toFixed(5)}-${points.length}`
}

/**
 * Downsample an array of points to at most `maxPoints` while keeping first and last.
 * Uses uniform interval sampling.
 */
function downsample(points: LatLng[], maxPoints: number): LatLng[] {
  if (points.length <= maxPoints) return points
  const result: LatLng[] = [points[0]]
  const step = (points.length - 1) / (maxPoints - 1)
  for (let i = 1; i < maxPoints - 1; i++) {
    result.push(points[Math.round(i * step)])
  }
  result.push(points[points.length - 1])
  return result
}

/**
 * Call OSRM Match API to snap GPS points to road network.
 * Returns snapped coordinates as [lat, lng] tuples.
 * Falls back to raw coordinates on error.
 */
export async function snapToRoads(
  points: LatLng[],
  profile: 'foot' | 'cycling' = 'foot',
): Promise<[number, number][]> {
  // Need at least 2 points
  if (points.length < 2) {
    return points.map(p => [p.lat, p.lng])
  }

  // Check cache
  const key = cacheKey(points) + `-${profile}`
  const cached = cache.get(key)
  if (cached) return cached

  // OSRM public server supports: car, bike, foot
  // "cycling" profile is not on public OSRM, use "bike" or fall back to "driving"
  const osrmProfile = profile === 'cycling' ? 'driving' : 'foot'

  // Downsample to max 100 coordinates (OSRM limit)
  const sampled = downsample(points, 100)

  // OSRM expects coordinates as "lng,lat" (note: longitude first!)
  const coordStr = sampled.map(p => `${p.lng},${p.lat}`).join(';')

  // Radiuses: how far from each point the road can be (in meters)
  const radiuses = sampled.map(() => '25').join(';')

  const url = `https://router.project-osrm.org/match/v1/${osrmProfile}/${coordStr}?overview=full&geometries=geojson&radiuses=${radiuses}`

  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`OSRM ${res.status}`)

    const data = await res.json()

    if (data.code !== 'Ok' || !data.matchings || data.matchings.length === 0) {
      throw new Error('No match found')
    }

    // OSRM may return multiple matchings — concatenate all geometries
    const allCoords: [number, number][] = []
    for (const matching of data.matchings) {
      const geojsonCoords: [number, number][] = matching.geometry.coordinates
      // GeoJSON is [lng, lat] — convert to [lat, lng] for Leaflet
      for (const [lng, lat] of geojsonCoords) {
        allCoords.push([lat, lng])
      }
    }

    // Cache the result
    cache.set(key, allCoords)
    // Keep cache small
    if (cache.size > 50) {
      const firstKey = cache.keys().next().value
      if (firstKey) cache.delete(firstKey)
    }

    return allCoords
  } catch {
    // Fallback: return raw GPS points
    const raw = points.map(p => [p.lat, p.lng] as [number, number])
    return raw
  }
}
