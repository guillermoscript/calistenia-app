/** Resultados de carrera — podio + ranking + guardar como entrenamiento. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Trophy } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { useRaceContext } from '@/contexts/RaceContext'
import { useAuthUser } from '@/lib/use-auth-user'
import { haptics } from '@/lib/haptics'
import * as sounds from '@/lib/sounds'
import { pb } from '@calistenia/core/lib/pocketbase'
import { formatPace, formatDuration } from '@calistenia/core/lib/geo'
import { estimateCalories } from '@calistenia/core/lib/calories'
import type { RaceParticipant } from '@calistenia/core/types/race'

function sortResults(participants: RaceParticipant[]): RaceParticipant[] {
  return [...participants].sort((a, b) => {
    const rank = (p: RaceParticipant) => (p.status === 'finished' ? 0 : 1)
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    if (a.status === 'finished' && b.status === 'finished') {
      return (a.finished_at || '').localeCompare(b.finished_at || '')
    }
    return b.distance_km - a.distance_km
  })
}

export default function RaceResults({ celebrate = false }: { celebrate?: boolean }) {
  const { t } = useTranslation()
  const { race, participants, me } = useRaceContext()
  const user = useAuthUser()
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const sorted = useMemo(() => sortResults(participants), [participants])
  const winner = sorted[0]?.status === 'finished' ? sorted[0] : null

  // Gané y vengo de correrla (no de abrir una carrera vieja) → fanfarria una vez
  const celebratedRef = useRef(false)
  const iWon = !!winner && winner.user === me?.user
  useEffect(() => {
    if (!celebrate || !iWon || celebratedRef.current) return
    celebratedRef.current = true
    sounds.playSessionComplete()
    void haptics.success()
  }, [celebrate, iWon])

  if (!race) return null

  const saveAsWorkout = async () => {
    if (!me || !user?.id || saving) return
    setSaving(true)
    try {
      const track = me.gps_track ?? []
      const startMs = race.starts_at ? new Date(race.starts_at).getTime() : Date.now()
      await pb.collection('cardio_sessions').create({
        user: user.id,
        activity_type: race.activity_type,
        gps_points: track.map((p) => ({ lat: p.lat, lng: p.lng, timestamp: startMs + p.t })),
        distance_km: me.distance_km,
        duration_seconds: me.duration_seconds,
        avg_pace: me.avg_pace,
        elevation_gain: 0,
        started_at: race.starts_at,
        finished_at: me.finished_at || race.finished_at || new Date().toISOString(),
        note: `Race: ${race.name}`,
        calories_burned: estimateCalories(race.activity_type, me.duration_seconds),
      })
      setSaved(true)
      void haptics.success()
    } catch {
      void haptics.error()
    }
    setSaving(false)
  }

  return (
    <View className="gap-5">
      <View className="items-center pt-4">
        <Trophy size={32} color="#fbbf24" />
        <Text className="mt-2 text-center font-bebas text-4xl leading-none text-foreground">{race.name}</Text>
        <Text className="mt-1.5 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
          {t('race.results')}
        </Text>
      </View>

      {/* Podio */}
      {winner && (
        <View className="items-center rounded-xl border border-amber-400/30 bg-amber-400/5 p-5">
          <Text className="font-mono text-[9px] uppercase tracking-[3px] text-amber-400">{t('race.winner')}</Text>
          <Text className="mt-1 font-bebas text-3xl text-foreground">{winner.display_name}</Text>
          <Text className="mt-1 font-mono text-xs text-muted-foreground">
            {winner.distance_km.toFixed(2)} km · {formatDuration(winner.duration_seconds)} · {formatPace(winner.avg_pace)} /km
          </Text>
        </View>
      )}

      {/* Ranking */}
      <View className="gap-1.5">
        {sorted.map((p, i) => {
          const isMe = p.user === me?.user
          return (
            <View
              key={p.id}
              className={cn(
                'flex-row items-center gap-3 rounded-xl border px-3.5 py-2.5',
                isMe ? 'border-lime/40 bg-lime/5' : 'border-border bg-card',
                p.status !== 'finished' && 'opacity-50',
              )}
            >
              <Text className="w-6 font-bebas text-lg text-muted-foreground">{i + 1}</Text>
              <View className="flex-1">
                <Text className={cn('font-sans-medium', isMe ? 'text-lime' : 'text-foreground')} numberOfLines={1}>
                  {p.display_name}
                </Text>
                <Text className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  {p.status === 'finished'
                    ? `${formatDuration(p.duration_seconds)} · ${formatPace(p.avg_pace)} /km`
                    : t('race.dnf')}
                </Text>
              </View>
              <Text className="font-bebas text-xl text-foreground">{p.distance_km.toFixed(2)} km</Text>
            </View>
          )
        })}
      </View>

      {/* Guardar como entrenamiento */}
      {me?.status === 'finished' && (
        <Pressable
          onPress={saveAsWorkout}
          disabled={saved || saving}
          className={cn(
            'h-12 items-center justify-center rounded-xl border border-lime/40 active:bg-lime/10',
            (saved || saving) && 'opacity-60',
          )}
        >
          <Text className="font-bebas text-lg uppercase tracking-widest text-lime">
            {saved ? t('race.saved') : t('race.saveAsWorkout')}
          </Text>
        </Pressable>
      )}
    </View>
  )
}
