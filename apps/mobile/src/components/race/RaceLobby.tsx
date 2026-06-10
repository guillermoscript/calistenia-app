/** Sala de espera de la carrera — port móvil del RaceLobby web. */
import { useState } from 'react'
import { View, Pressable, Share, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Share2, Crown } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { useRaceContext } from '@/contexts/RaceContext'
import { CARDIO_ACTIVITY } from '@calistenia/core/lib/style-tokens'

const WEB_ORIGIN = 'https://gym.guille.tech'

export default function RaceLobby({ displayName }: { displayName: string }) {
  const { t } = useTranslation()
  const { race, participants, me, isCreator, hasJoined, actions } = useRaceContext()
  const [busy, setBusy] = useState(false)

  if (!race) return null

  const target = race.mode === 'distance'
    ? `${race.target_distance_km} km`
    : `${Math.round(race.target_duration_seconds / 60)} min`

  const handleShare = () => {
    void Share.share({ message: `${race.name} — ${WEB_ORIGIN}/race/${race.id}` })
  }

  const handleJoin = async () => {
    setBusy(true)
    try { await actions.join(displayName) } catch { /* error mostrado por contexto */ }
    setBusy(false)
  }

  const handleStart = () => {
    Alert.alert(race.name, `${t('race.start')}?`, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('race.start'), onPress: () => void actions.startCountdown() },
    ])
  }

  const handleCancel = () => {
    Alert.alert(t('race.cancel'), race.name, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('race.cancel'), style: 'destructive', onPress: () => void actions.cancelRace() },
    ])
  }

  return (
    <View className="gap-5">
      {/* Cabecera */}
      <View className="items-center pt-4">
        <Text className="text-3xl">{CARDIO_ACTIVITY[race.activity_type]?.icon ?? '🏁'}</Text>
        <Text className="mt-2 text-center font-bebas text-4xl leading-none text-foreground">{race.name}</Text>
        <Text className="mt-1.5 font-mono text-xs text-lime">{target} · {t(`cardio.${race.activity_type}`)}</Text>
        <View className="mt-3 flex-row items-center gap-1.5 rounded-full bg-amber-400/10 px-3 py-1">
          <View className="size-2 rounded-full bg-amber-400" />
          <Text className="font-mono text-[10px] uppercase tracking-[2px] text-amber-400">
            {t('race.waitingForParticipants')}
          </Text>
        </View>
      </View>

      {/* Participantes */}
      <View className="gap-2">
        <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
          {t('race.participants')} ({participants.length})
        </Text>
        {participants.map((p) => (
          <View key={p.id} className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <View className="size-9 items-center justify-center rounded-full bg-muted">
              <Text className="font-bebas text-base text-foreground">{p.display_name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <Text className="flex-1 font-sans-medium text-foreground" numberOfLines={1}>
              {p.display_name}
              {race.creator === p.user ? '  👑' : ''}
            </Text>
            {p.user === me?.user && (
              <Text className="rounded bg-lime/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[1px] text-lime">YOU</Text>
            )}
            {p.status === 'ready' && (
              <Text className="rounded bg-emerald-400/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[1px] text-emerald-400">
                {t('race.ready')}
              </Text>
            )}
          </View>
        ))}
        {participants.length === 0 && (
          <View className="items-center rounded-xl border border-dashed border-border py-6">
            <Text className="text-sm text-muted-foreground">{t('race.waitingForParticipants')}</Text>
          </View>
        )}
      </View>

      {/* Acciones */}
      {!hasJoined ? (
        <Pressable
          onPress={handleJoin}
          disabled={busy}
          className={cn('h-14 items-center justify-center rounded-xl bg-lime active:bg-lime/90', busy && 'opacity-50')}
        >
          <Text className="font-bebas text-xl uppercase tracking-widest text-zinc-900">{t('race.join')}</Text>
        </Pressable>
      ) : me?.status !== 'ready' ? (
        <Pressable
          onPress={() => void actions.markReady()}
          className="h-12 items-center justify-center rounded-xl border border-lime/40 active:bg-lime/10"
        >
          <Text className="font-bebas text-lg uppercase tracking-widest text-lime">{t('race.ready')}</Text>
        </Pressable>
      ) : null}

      <Pressable onPress={handleShare} className="h-11 flex-row items-center justify-center gap-2 rounded-xl border border-border active:bg-muted/50">
        <Share2 size={15} color="#888899" />
        <Text className="font-bebas text-base uppercase tracking-widest text-muted-foreground">{t('race.share')}</Text>
      </Pressable>

      {isCreator && (
        <>
          <Pressable
            onPress={handleStart}
            disabled={participants.length === 0}
            className={cn(
              'h-14 items-center justify-center rounded-xl bg-emerald-500 active:bg-emerald-400',
              participants.length === 0 && 'opacity-40',
            )}
          >
            <Crown size={14} color="#fff" />
            <Text className="font-bebas text-xl uppercase tracking-widest text-white">{t('race.start')}</Text>
          </Pressable>
          <Pressable onPress={handleCancel} className="py-2">
            <Text className="text-center text-xs text-red-400">{t('race.cancel')}</Text>
          </Pressable>
        </>
      )}
    </View>
  )
}
