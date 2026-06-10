/**
 * Perfil de elevación de la ruta — área SVG con react-native-svg.
 * Eje X = distancia acumulada, eje Y = altitud (GpsPoint.alt).
 */
import { useMemo, useState } from 'react'
import { View } from 'react-native'
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg'
import { Text } from '@/components/ui/text'
import { haversineDistance } from '@calistenia/core/lib/geo'
import type { GpsPoint } from '@calistenia/core/types'

const MAX_SAMPLES = 120

export default function ElevationProfile({ points, height = 80 }: { points: GpsPoint[]; height?: number }) {
  const [width, setWidth] = useState(0)

  const profile = useMemo(() => {
    const withAlt = points.filter((p) => p.alt != null)
    if (withAlt.length < 3) return null

    // Distancia acumulada por punto (solo puntos con altitud)
    const dist: number[] = [0]
    for (let i = 1; i < withAlt.length; i++) {
      dist.push(dist[i - 1] + haversineDistance(withAlt[i - 1].lat, withAlt[i - 1].lng, withAlt[i].lat, withAlt[i].lng))
    }
    const total = dist[dist.length - 1]
    if (total <= 0) return null

    // Downsample a buckets uniformes por distancia
    const samples: { x: number; alt: number }[] = []
    const step = Math.max(1, Math.floor(withAlt.length / MAX_SAMPLES))
    for (let i = 0; i < withAlt.length; i += step) {
      samples.push({ x: dist[i] / total, alt: withAlt[i].alt! })
    }
    const lastIdx = withAlt.length - 1
    if (samples[samples.length - 1].x < 1) samples.push({ x: 1, alt: withAlt[lastIdx].alt! })

    const minAlt = Math.min(...samples.map((s) => s.alt))
    const maxAlt = Math.max(...samples.map((s) => s.alt))
    return { samples, minAlt, maxAlt }
  }, [points])

  if (!profile) return null
  const { samples, minAlt, maxAlt } = profile
  const range = Math.max(maxAlt - minAlt, 5) // mínimo 5m para no ampliar ruido plano

  const buildPaths = (w: number, h: number) => {
    const pad = 4
    const toX = (x: number) => pad + x * (w - pad * 2)
    const toY = (alt: number) => pad + (1 - (alt - minAlt) / range) * (h - pad * 2)
    let line = `M ${toX(samples[0].x)} ${toY(samples[0].alt)}`
    for (let i = 1; i < samples.length; i++) {
      line += ` L ${toX(samples[i].x)} ${toY(samples[i].alt)}`
    }
    const area = `${line} L ${toX(1)} ${h} L ${toX(0)} ${h} Z`
    return { line, area }
  }

  return (
    <View className="rounded-xl border border-border bg-card p-3" onLayout={(e) => setWidth(e.nativeEvent.layout.width - 24)}>
      <View className="mb-1 flex-row justify-between">
        <Text className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">{Math.round(maxAlt)}m</Text>
        <Text className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">{Math.round(minAlt)}m</Text>
      </View>
      {width > 0 && (() => {
        const { line, area } = buildPaths(width, height)
        return (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="elev" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#84cc16" stopOpacity="0.35" />
                <Stop offset="1" stopColor="#84cc16" stopOpacity="0.02" />
              </LinearGradient>
            </Defs>
            <Path d={area} fill="url(#elev)" />
            <Path d={line} stroke="#84cc16" strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          </Svg>
        )
      })()}
    </View>
  )
}
