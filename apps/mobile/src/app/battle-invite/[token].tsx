/**
 * Aterrizaje de un enlace de invitación a una batalla.
 *
 * Tres caminos:
 *  - Sin sesión → se guarda el token y se manda al registro; al volver, `_layout`
 *    lo recupera y entra solo. Por eso los tokens viven 24 h y no minutos.
 *  - Con sesión → se muestra qué es la batalla (solo recuentos, nunca quién está
 *    dentro) y se une al pulsar.
 *  - Token inválido, caducado o sala cerrada → mensaje claro y sin pistas: los tres
 *    casos se ven igual desde fuera para que un token adivinado no sea un oráculo.
 */
import { useCallback, useEffect, useState } from 'react'
import { View, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Swords } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { pb } from '@calistenia/core/lib/pocketbase'
import { captureBattleInviteToken } from '@calistenia/core/lib/battleInviteHandoff'
import { previewBattleInvite, joinBattle, newIdempotencyKey } from '@calistenia/core/lib/battleApi'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import type { BattleInvitePreview } from '@calistenia/core/types/battle'

export default function BattleInviteScreen() {
  const { token: rawToken } = useLocalSearchParams<{ token?: string | string[] }>()
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken
  const { t } = useTranslation()
  const router = useRouter()

  const [preview, setPreview] = useState<BattleInvitePreview | null>(null)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return

    if (!pb.authStore.isValid) {
      // El token sobrevive al registro igual que el código de referido.
      captureBattleInviteToken(token)
      router.replace({ pathname: '/login', params: { mode: 'signup' } })
      return
    }

    let cancelled = false
    previewBattleInvite(token)
      .then((result) => { if (!cancelled) setPreview(result) })
      .catch((e) => { if (!cancelled) setError((e as Error).message) })
    return () => { cancelled = true }
  }, [token, router])

  const handleJoin = useCallback(async () => {
    if (!token) return
    setJoining(true)
    setError(null)
    try {
      const snapshot = await joinBattle(token, newIdempotencyKey())
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.battleJoined, {
        surface: 'battle', source: 'battle_invite', battle_id: snapshot.battle.id,
        participant_count: snapshot.participants.length, result: 'joined',
      })
      void haptics.success()
      router.replace(`/battle/${snapshot.battle.id}`)
    } catch (e) {
      setError((e as Error).message)
      void haptics.error()
      setJoining(false)
    }
  }, [token, router])

  if (!token) return null

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center gap-5 px-6">
        <Swords size={32} color="#a3e635" />
        <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
          {t('battle.kicker')}
        </Text>

        {!preview && !error && <ActivityIndicator color="#a3e635" />}

        {preview?.ok && preview.battle && (
          <>
            <Text className="text-center font-bebas text-4xl leading-none text-foreground">
              {t('battle.invitedTitle')}
            </Text>
            <Text className="text-center text-sm text-muted-foreground">
              {preview.battle.rounds} {t('battle.rounds')} · {preview.battle.exercise_count} {t('battle.exercises')}
            </Text>
            <Text className="font-mono text-[11px] uppercase tracking-[2px] text-lime">
              {preview.battle.participant_count} {t('battle.participants')}
            </Text>

            <Pressable
              onPress={() => void handleJoin()}
              disabled={joining}
              className={cn(
                'mt-4 h-14 w-full items-center justify-center rounded-xl bg-lime active:bg-lime/90',
                joining && 'opacity-50',
              )}
            >
              {joining
                ? <ActivityIndicator color="#18181b" />
                : (
                  <Text className="font-bebas text-xl uppercase tracking-widest text-zinc-900">
                    {t('battle.joinBattle')}
                  </Text>
                )}
            </Pressable>
          </>
        )}

        {preview && !preview.ok && (
          <>
            <Text className="text-center font-bebas text-3xl leading-none text-muted-foreground">
              {preview.reason === 'expired' ? t('battle.inviteExpired') : t('battle.inviteUnavailable')}
            </Text>
            <Text className="text-center text-sm text-muted-foreground">
              {t('battle.inviteUnavailableHint')}
            </Text>
          </>
        )}

        {error && <Text className="text-center text-xs text-red-400">{error}</Text>}

        <Pressable onPress={() => router.replace('/(tabs)')} className="pt-2">
          <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
            {t('common.close')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}
