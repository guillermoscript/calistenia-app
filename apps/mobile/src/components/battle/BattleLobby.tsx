/** Sala de espera de una batalla: invitar, marcar preparado y arrancar. */
import { useEffect, useRef, useState } from 'react'
import { View, Pressable, Share, Alert, Platform } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Share2, Crown, Check } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { useBattleContext } from '@/contexts/BattleContext'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import { battleExerciseName, findBattlePreset } from '@calistenia/core/data/battle-presets'

const WEB_ORIGIN = 'https://gym.guille.tech'

export default function BattleLobby() {
  const { t, i18n } = useTranslation()
  const { snapshot, isCreator, busy, can, actions } = useBattleContext()
  const [sharing, setSharing] = useState(false)

  // Alguien entra a la sala → toque ligero: se espera sin mirar la pantalla.
  const prevCountRef = useRef<number | null>(null)
  const count = snapshot?.participants.length ?? 0
  useEffect(() => {
    if (prevCountRef.current != null && count > prevCountRef.current) void haptics.light()
    prevCountRef.current = count
  }, [count])

  if (!snapshot) return null

  const { battle, participants, me } = snapshot
  const preset = findBattlePreset(battle.config.workout_template_id)
  const readyCount = participants.filter((p) => p.status === 'ready').length

  const handleShare = async () => {
    setSharing(true)
    try {
      // Un token nuevo por cada compartición: es de un solo uso, así que un enlace
      // que se escape de la conversación puede gastar como mucho una plaza.
      const invite = await actions.invite()
      const result = await Share.share({
        message: `${t('battle.inviteMessage')} ${WEB_ORIGIN}/battle-invite/${invite.token}`,
      })
      if (result.action !== Share.sharedAction) return
      // El token JAMÁS viaja en analytics: solo el id de la batalla.
      // En Android `Share.share` siempre devuelve `sharedAction`, también al
      // descartar la hoja; solo iOS confirma el envío.
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.battleShared, {
        surface: 'battle', source: 'battle_lobby', battle_id: battle.id,
        share_type: 'invite_link', participant_count: participants.length, result: 'shared',
        share_confirmed: Platform.OS === 'ios',
      })
    } catch { /* el contexto ya expone el error */ } finally {
      setSharing(false)
    }
  }

  const handleStart = () => {
    Alert.alert(preset?.name.es ?? t('battle.title'), `${t('battle.start')}?`, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('battle.start'),
        onPress: () => {
          void actions.start().then(() => {
            trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.battleStarted, {
              surface: 'battle', source: 'battle_lobby', battle_id: battle.id,
              participant_count: participants.length, result: 'started',
            })
            void haptics.medium()
          }).catch(() => { /* mostrado por el contexto */ })
        },
      },
    ])
  }

  const handleCancel = () => {
    Alert.alert(t('battle.cancel'), t('battle.cancelConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('battle.cancel'), style: 'destructive', onPress: () => void actions.cancel().catch(() => {}) },
    ])
  }

  const handleLeave = () => {
    Alert.alert(t('battle.leave'), isCreator ? t('battle.leaveCreatorConfirm') : t('battle.leaveConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('battle.leave'), style: 'destructive', onPress: () => void actions.leave().catch(() => {}) },
    ])
  }

  return (
    <View className="gap-5">
      {/* Cabecera */}
      <View className="items-center pt-4">
        <Text className="text-center font-bebas text-4xl leading-none text-foreground">
          {preset?.name.es ?? t('battle.title')}
        </Text>
        <Text className="mt-1.5 font-mono text-xs text-lime">
          {battle.config.rounds} {t('battle.rounds')} · {battle.config.exercises.length} {t('battle.exercises')}
        </Text>
        <View className="mt-3 flex-row items-center gap-1.5 rounded-full bg-amber-400/10 px-3 py-1">
          <View className="size-2 rounded-full bg-amber-400" />
          <Text className="font-mono text-[10px] uppercase tracking-[2px] text-amber-400">
            {battle.status === 'ready' ? t('battle.allReady') : t('battle.waitingForParticipants')}
          </Text>
        </View>
      </View>

      {/* Circuito */}
      <View className="gap-2">
        <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
          {t('battle.circuit')}
        </Text>
        {battle.config.exercises.map((exercise) => (
          <View
            key={exercise.exercise_id}
            className="flex-row items-center justify-between border-b border-border py-2.5"
          >
            <Text className="font-sans-medium text-foreground">
              {battleExerciseName(battle.config.workout_template_id, exercise.exercise_id, i18n.language)}
            </Text>
            <Text className="font-mono text-xs text-muted-foreground">
              {exercise.target.value}{exercise.target.kind === 'seconds' ? 's' : ` ${t('battle.reps')}`}
            </Text>
          </View>
        ))}
      </View>

      {/* Participantes */}
      <View className="gap-2">
        <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
          {t('battle.participants')} ({participants.length}) · {readyCount} {t('battle.ready')}
        </Text>
        {participants.map((p) => (
          <View key={p.id} className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <View className="size-9 items-center justify-center rounded-full bg-muted">
              <Text className="font-bebas text-base text-foreground">
                {(p.display_name || '?').slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <Text className="flex-1 font-sans-medium text-foreground" numberOfLines={1}>
              {p.display_name || t('battle.someone')}
              {battle.creator === p.user ? '  👑' : ''}
            </Text>
            {p.user === me?.user && (
              <Text className="rounded bg-lime/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[1px] text-lime">
                {t('battle.you')}
              </Text>
            )}
            {p.status === 'ready' && (
              <Text className="rounded bg-emerald-400/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[1px] text-emerald-400">
                {t('battle.ready')}
              </Text>
            )}
          </View>
        ))}
      </View>

      {/* Acciones */}
      {can.ready && (
        <Pressable
          onPress={() => void actions.setReady(true).then(() => haptics.medium()).catch(() => {})}
          disabled={busy}
          className={cn(
            'h-14 items-center justify-center rounded-xl bg-lime active:bg-lime/90',
            busy && 'opacity-50',
          )}
        >
          <Text className="font-bebas text-xl uppercase tracking-widest text-zinc-900">
            {t('battle.imReady')}
          </Text>
        </Pressable>
      )}

      {can.unready && (
        <Pressable
          onPress={() => void actions.setReady(false).catch(() => {})}
          disabled={busy}
          className="h-12 flex-row items-center justify-center gap-2 rounded-xl border border-emerald-400/40 active:bg-emerald-400/10"
        >
          <Check size={15} color="#34d399" />
          <Text className="font-bebas text-lg uppercase tracking-widest text-emerald-400">
            {t('battle.cancelReady')}
          </Text>
        </Pressable>
      )}

      {can.invite && (
        <Pressable
          onPress={handleShare}
          disabled={sharing || busy}
          className={cn(
            'h-11 flex-row items-center justify-center gap-2 rounded-xl border border-border active:bg-muted/50',
            (sharing || busy) && 'opacity-50',
          )}
        >
          <Share2 size={15} color="#888899" />
          <Text className="font-bebas text-base uppercase tracking-widest text-muted-foreground">
            {t('battle.invite')}
          </Text>
        </Pressable>
      )}

      {isCreator && (
        <>
          <Pressable
            onPress={handleStart}
            disabled={!can.start || busy}
            className={cn(
              'h-14 flex-row items-center justify-center gap-2 rounded-xl bg-emerald-500 active:bg-emerald-400',
              (!can.start || busy) && 'opacity-40',
            )}
          >
            <Crown size={14} color="#fff" />
            <Text className="font-bebas text-xl uppercase tracking-widest text-white">
              {t('battle.start')}
            </Text>
          </Pressable>
          {!can.start && (
            <Text className="-mt-2 text-center font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground">
              {t('battle.needTwoReady')}
            </Text>
          )}
        </>
      )}

      <View className="flex-row justify-center gap-6 pt-1">
        {can.leave && (
          <Pressable onPress={handleLeave} className="py-2">
            <Text className="text-xs text-muted-foreground">{t('battle.leave')}</Text>
          </Pressable>
        )}
        {can.cancel && (
          <Pressable onPress={handleCancel} className="py-2">
            <Text className="text-xs text-red-400">{t('battle.cancel')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}
