/**
 * Resultado de la batalla.
 *
 * Pantalla mínima a propósito: la de resultados completa es #357. Esta cierra el
 * bucle del MVP — clasificación estable para todos los que participaron, incluidos los
 * que se fueron — y sirve de destino para los estados terminales (`finished`,
 * `expired`, `cancelled`).
 */
import { useEffect, useRef } from 'react'
import { View, Pressable, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { useBattleContext } from '@/contexts/BattleContext'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'

export default function BattleResults() {
  const { t } = useTranslation()
  const router = useRouter()
  const { snapshot, standings, phase, isCreator } = useBattleContext()

  // Un solo `battle_completed` por batalla, no uno por cliente: lo emite el dispositivo
  // del creador cuando ve el estado terminal, igual que hace el flujo de carreras.
  const emittedRef = useRef(false)
  useEffect(() => {
    if (phase !== 'finished' || !isCreator || emittedRef.current || !snapshot) return
    emittedRef.current = true
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.battleCompleted, {
      surface: 'battle', source: 'battle_results', battle_id: snapshot.battle.id,
      participant_count: snapshot.participants.length, result: 'completed',
    })
  }, [phase, isCreator, snapshot])

  const heading = phase === 'cancelled'
    ? t('battle.cancelledTitle')
    : phase === 'expired'
      ? t('battle.expiredTitle')
      : t('battle.finishedTitle')

  return (
    <View className="flex-1 gap-5 pt-4">
      <View className="items-center">
        <Text className="text-center font-bebas text-4xl leading-none text-foreground">{heading}</Text>
        {phase === 'expired' && (
          <Text className="mt-2 text-center text-sm text-muted-foreground">{t('battle.expiredHint')}</Text>
        )}
      </View>

      {phase === 'finished' && (
        <ScrollView className="flex-1">
          <Text className="mb-2 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
            {t('battle.finalStandings')}
          </Text>
          {standings.map((entry) => (
            <View
              key={entry.participant_id}
              className={cn(
                'flex-row items-center gap-3 border-b border-border py-3',
                entry.rank === 1 && 'bg-lime/5',
              )}
            >
              <Text
                className={cn(
                  'w-7 font-bebas text-2xl',
                  entry.rank === 1 ? 'text-lime' : 'text-muted-foreground',
                )}
              >
                {entry.rank}
              </Text>
              <Text className="flex-1 font-sans-medium text-foreground" numberOfLines={1}>
                {entry.display_name || t('battle.someone')}
                {entry.status === 'left' ? `  ${t('battle.leftTag')}` : ''}
              </Text>
              <Text className="font-mono text-xs text-muted-foreground">
                {entry.score.completed_rounds}
                <Text className="text-[10px]">{t('battle.roundsShort')}</Text>
                {'  '}
                {entry.score.completed_reps}
                <Text className="text-[10px]">{t('battle.repsShort')}</Text>
              </Text>
            </View>
          ))}
        </ScrollView>
      )}

      <Pressable
        onPress={() => router.replace('/(tabs)')}
        className="h-14 items-center justify-center rounded-xl border border-border active:bg-muted/50"
      >
        <Text className="font-bebas text-lg uppercase tracking-widest text-muted-foreground">
          {t('common.close')}
        </Text>
      </Pressable>
    </View>
  )
}
