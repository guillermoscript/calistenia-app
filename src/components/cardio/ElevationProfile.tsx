import { useMemo } from 'react'
import { haversineDistance } from '../../lib/geo'
import type { GpsPoint } from '../../types'

interface ElevationProfileProps {
  points: GpsPoint[]
  height?: number
  className?: string
}

/**
 * SVG elevation profile chart.
 * X = cumulative distance (km), Y = altitude (m).
 * Smoothed with a moving-average window to reduce GPS noise.
 */
export default function ElevationProfile({ points, height = 100, className = '' }: ElevationProfileProps) {
  const { pathData, areaData, minAlt, maxAlt, totalKm, samples } = useMemo(() => {
    // Filter points with altitude data
    const withAlt = points.filter(p => p.alt != null)
    if (withAlt.length < 3) return { pathData: '', areaData: '', minAlt: 0, maxAlt: 0, totalKm: 0, samples: [] }

    // Build distance-altitude pairs
    const raw: { dist: number; alt: number }[] = []
    let cumDist = 0
    raw.push({ dist: 0, alt: withAlt[0].alt! })
    for (let i = 1; i < withAlt.length; i++) {
      cumDist += haversineDistance(withAlt[i - 1].lat, withAlt[i - 1].lng, withAlt[i].lat, withAlt[i].lng) / 1000
      raw.push({ dist: cumDist, alt: withAlt[i].alt! })
    }

    const totalKm = cumDist

    // Downsample to ~80 points for a clean chart
    const targetSamples = Math.min(80, raw.length)
    const step = Math.max(1, Math.floor(raw.length / targetSamples))
    const sampled: { dist: number; alt: number }[] = []
    for (let i = 0; i < raw.length; i += step) {
      sampled.push(raw[i])
    }
    // Always include the last point
    if (sampled[sampled.length - 1] !== raw[raw.length - 1]) {
      sampled.push(raw[raw.length - 1])
    }

    // Smooth altitudes with 3-point moving average
    const smoothed = sampled.map((s, i) => {
      if (i === 0 || i === sampled.length - 1) return s
      const avg = (sampled[i - 1].alt + s.alt + sampled[i + 1].alt) / 3
      return { ...s, alt: avg }
    })

    let minAlt = Infinity
    let maxAlt = -Infinity
    for (const s of smoothed) {
      if (s.alt < minAlt) minAlt = s.alt
      if (s.alt > maxAlt) maxAlt = s.alt
    }

    // Add padding to range
    const range = maxAlt - minAlt || 1
    minAlt -= range * 0.1
    maxAlt += range * 0.1

    const w = 400
    const h = height
    const pad = { top: 4, bottom: 4, left: 0, right: 0 }
    const chartW = w - pad.left - pad.right
    const chartH = h - pad.top - pad.bottom
    const finalRange = maxAlt - minAlt

    const toX = (dist: number) => pad.left + (dist / totalKm) * chartW
    const toY = (alt: number) => pad.top + (1 - (alt - minAlt) / finalRange) * chartH

    const pathParts = smoothed.map((s, i) => `${i === 0 ? 'M' : 'L'}${toX(s.dist).toFixed(1)},${toY(s.alt).toFixed(1)}`)
    const pathData = pathParts.join(' ')

    // Area = path + close to bottom
    const areaData = `${pathData} L${toX(totalKm).toFixed(1)},${(h - pad.bottom).toFixed(1)} L${pad.left},${(h - pad.bottom).toFixed(1)} Z`

    return { pathData, areaData, minAlt, maxAlt, totalKm, samples: smoothed }
  }, [points, height])

  if (!pathData || samples.length < 3) return null

  const elevGain = Math.round(maxAlt - minAlt)

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Elevación</span>
        <div className="flex items-baseline gap-3">
          <span className="text-xs tabular-nums text-muted-foreground">
            {Math.round(minAlt)}–{Math.round(maxAlt)}m
          </span>
          {elevGain > 2 && (
            <span className="text-xs tabular-nums text-amber-400">
              +{elevGain}m
            </span>
          )}
        </div>
      </div>
      <svg
        viewBox={`0 0 400 ${height}`}
        className="w-full"
        style={{ height }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="elev-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--lime))" stopOpacity="0.25" />
            <stop offset="100%" stopColor="hsl(var(--lime))" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaData} fill="url(#elev-grad)" />
        <path d={pathData} fill="none" stroke="hsl(var(--lime))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] tabular-nums text-muted-foreground/60">0 km</span>
        <span className="text-[10px] tabular-nums text-muted-foreground/60">{totalKm.toFixed(1)} km</span>
      </div>
    </div>
  )
}
