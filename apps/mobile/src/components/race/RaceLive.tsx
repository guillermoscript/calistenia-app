/**
 * Carrera en vivo — port móvil del RaceLive web: stats propias, barra de
 * progreso hacia el objetivo, mapa con participantes y leaderboard realtime.
 */
import { useEffect, useMemo, useRef } from 'react'
import { View, Pressable, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Map as MapLibreMap, Camera, GeoJSONSource, Layer } from '@maplibre/maplibre-react-native'
import { useColorScheme } from 'nativewind'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { useRaceContext } from '@/contexts/RaceContext'
import { msUntil } from '@/lib/race/raceClock'
import { haptics } from '@/lib/haptics'
import * as sounds from '@/lib/sounds'
import { formatPace, formatDuration } from '@calistenia/core/lib/geo'
import { sortRaceParticipants } from '@calistenia/core/lib/race-sort'

function cartoStyle(dark: boolean) {
  const variant = dark ? 'dark_all' : 'rastertiles/voyager'
  return {
    version: 8 as const,
    sources: {
      carto: {
        type: 'raster' as const,
        tiles: ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}@2x.png`),
        tileSize: 256,
        attribution: '© OpenStreetMap © CARTO',
      },
    },
    layers: [{ id: 'carto', type: 'raster' as const, source: 'carto' }],
  }
}

export default function RaceLive() {
  const { t } = useTranslation()
  const { colorScheme } = useColorScheme()
  const { race, participants, me, myStats, actions, lastError, clearError } = useRaceContext()

  const sorted = useMemo(() => sortRaceParticipants(participants, race), [participants, race])

  // Km completado → misma vibración que en cardio libre (null = aún sin
  // baseline, para no vibrar al rehidratar una carrera a mitad)
  const prevKmRef = useRef<number | null>(null)
  useEffect(() => {
    const km = Math.floor(myStats?.distance_km ?? 0)
    if (prevKmRef.current != null && km > prevKmRef.current) void haptics.success()
    prevKmRef.current = km
  }, [myStats?.distance_km])

  // Cruzo mi meta (auto-finish por objetivo o botón) → golpe fuerte + triple
  // beep: el corredor va mirando al frente, no a la pantalla
  const prevStatusRef = useRef(me?.status)
  useEffect(() => {
    if (me?.status === 'finished' && prevStatusRef.current && prevStatusRef.current !== 'finished') {
      sounds.playTimerComplete()
      void haptics.heavy()
    }
    prevStatusRef.current = me?.status
  }, [me?.status])

  // Últimos 10s de una carrera por tiempo → tick sonoro + haptic por segundo,
  // como el 3-2-1 de salida. Sin ticks en carreras muy cortas (<30s) para no
  // convertir media carrera en alarma.
  const isTimeMode = race?.mode === 'time'
  const remainingSec = isTimeMode && race?.starts_at
    ? Math.max(0, race.target_duration_seconds - (myStats?.duration_seconds ?? Math.max(0, -msUntil(race.starts_at)) / 1000))
    : 0
  const iFinished = me?.status === 'finished'
  const remainingCeil = Math.ceil(remainingSec)
  const inFinalCountdown = isTimeMode && !iFinished && remainingCeil > 0 && remainingCeil <= 10
    && (race?.target_duration_seconds ?? 0) >= 30
  useEffect(() => {
    if (!inFinalCountdown) return
    sounds.playCountdownTick()
    void haptics.light()
  }, [inFinalCountdown, remainingCeil])

  const { markersGeoJSON, center } = useMemo(() => {
    const features: GeoJSON.Feature[] = []
    let c: [number, number] | null = null
    for (const p of participants) {
      const lat = p.user === me?.user ? (myStats?.last_lat ?? p.last_lat) : p.last_lat
      const lng = p.user === me?.user ? (myStats?.last_lng ?? p.last_lng) : p.last_lng
      if (lat == null || lng == null || (lat === 0 && lng === 0)) continue
      const isMe = p.user === me?.user
      features.push({
        type: 'Feature',
        properties: { color: isMe ? '#a3e635' : '#38bdf8' },
        geometry: { type: 'Point', coordinates: [lng, lat] },
      })
      if (isMe) c = [lng, lat]
    }
    if (!c && features.length > 0) c = (features[0].geometry as GeoJSON.Point).coordinates as [number, number]
    return { markersGeoJSON: { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection, center: c }
  }, [participants, me?.user, myStats?.last_lat, myStats?.last_lng])

  if (!race) return null

  const target = isTimeMode ? race.target_duration_seconds : race.target_distance_km
  const progress = myStats && target > 0
    ? Math.min(1, (isTimeMode ? myStats.duration_seconds : myStats.distance_km) / target)
    : 0

  const handleLeave = () => {
    Alert.alert(t('race.leave'), race.name, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('race.leave'), style: 'destructive', onPress: () => void actions.leave() },
    ])
  }

  return (
    <View className="gap-4">
      {lastError && (
        <Pressable onPress={clearError} className="rounded-lg border border-red-500/20 bg-red-500/10 p-2.5">
          <Text className="text-xs text-red-400">
            {lastError.message === 'race.sessionExpired' ? t('race.sessionExpired') : lastError.message}
          </Text>
        </Pressable>
      )}

      {/* Mis stats */}
      <View className="flex-row gap-2">
        <View className="flex-1 items-center rounded-xl bg-muted/60 p-3">
          <Text className="font-bebas text-4xl leading-none text-lime">{(myStats?.distance_km ?? 0).toFixed(2)}</Text>
          <Text className="mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{t('race.km')}</Text>
        </View>
        <View className={cn('flex-1 items-center rounded-xl bg-muted/60 p-3', inFinalCountdown && 'bg-red-500/10')}>
          <Text className={cn('font-bebas text-4xl leading-none text-foreground', inFinalCountdown && 'text-red-500')}>
            {isTimeMode
              ? formatDuration(Math.round(remainingSec))
              : formatDuration(Math.floor(myStats?.duration_seconds ?? 0))}
          </Text>
          <Text className={cn('mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground', inFinalCountdown && 'text-red-500/70')}>
            {isTimeMode ? t('race.remaining') : t('race.elapsed')}
          </Text>
        </View>
        <View className="flex-1 items-center rounded-xl bg-muted/60 p-3">
          <Text className="font-bebas text-4xl leading-none text-sky-500">{formatPace(myStats?.avg_pace ?? 0)}</Text>
          <Text className="mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{t('race.pace')}</Text>
        </View>
      </View>

      {/* Progreso hacia objetivo */}
      <View className="h-2 overflow-hidden rounded-full bg-muted">
        <View className="h-2 rounded-full bg-lime" style={{ width: `${Math.round(progress * 100)}%` }} />
      </View>

      {/* Mapa con participantes */}
      {center && (
        <View className="h-[180px] overflow-hidden rounded-xl border border-border">
          <MapLibreMap mapStyle={cartoStyle(colorScheme === 'dark')} style={{ flex: 1 }}>
            <Camera
              initialViewState={{ center, zoom: 15 }}
              center={center}
              zoom={15}
              duration={800}
              easing="linear"
            />
            <GeoJSONSource id="race-participants" data={markersGeoJSON}>
              <Layer
                id="race-participants-circle"
                type="circle"
                paint={{
                  'circle-color': ['get', 'color'],
                  'circle-radius': 7,
                  'circle-stroke-color': '#ffffff',
                  'circle-stroke-width': 2,
                }}
              />
            </GeoJSONSource>
          </MapLibreMap>
        </View>
      )}

      {/* Leaderboard */}
      <View className="gap-1.5">
        <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">{t('race.liveBoard')}</Text>
        {sorted.map((p, i) => {
          const isMe = p.user === me?.user
          const dist = isMe && myStats && p.status !== 'finished' ? myStats.distance_km : p.distance_km
          return (
            <View
              key={p.id}
              className={cn(
                'flex-row items-center gap-3 rounded-xl border px-3.5 py-2.5',
                isMe ? 'border-lime/40 bg-lime/5' : 'border-border bg-card',
                p.status === 'dnf' && 'opacity-40',
              )}
            >
              <Text className="w-6 font-bebas text-lg text-muted-foreground">{p.status === 'finished' ? '🏁' : i + 1}</Text>
              <Text className={cn('flex-1 font-sans-medium', isMe ? 'text-lime' : 'text-foreground')} numberOfLines={1}>
                {p.display_name}
              </Text>
              {p.status === 'dnf' ? (
                <Text className="font-mono text-[10px] uppercase text-muted-foreground">{t('race.dnf')}</Text>
              ) : (
                <>
                  <Text className="font-mono text-[11px] text-sky-500">{formatPace(p.avg_pace)}</Text>
                  <Text className="w-16 text-right font-bebas text-lg text-foreground">{dist.toFixed(2)} km</Text>
                </>
              )}
            </View>
          )
        })}
      </View>

      {/* Acciones */}
      {!iFinished && (
        <Pressable
          onPress={() => void actions.finishRace()}
          className="h-12 items-center justify-center rounded-xl bg-red-500 active:bg-red-600"
        >
          <Text className="font-bebas text-lg uppercase tracking-widest text-white">{t('race.finish')}</Text>
        </Pressable>
      )}
      <Pressable onPress={handleLeave} className="py-1">
        <Text className="text-center text-xs text-muted-foreground">{t('race.leave')}</Text>
      </Pressable>
    </View>
  )
}
