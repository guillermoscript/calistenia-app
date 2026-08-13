/**
 * Historial de batallas: qué hiciste, contra quién y cómo quedaste (#398).
 *
 * Hasta ahora una batalla solo existía mientras pasaba: se veía el resultado una vez y
 * desaparecía. Sin esto no hay forma de saber si mejoras en ellas, que es lo que separa
 * una batalla de un truco de fiesta.
 *
 * La clasificación NO se vuelve a pedir al servidor: viene congelada en la propia
 * batalla (`final_standings`), así que la comparativa se abre en el sitio sin una
 * petición por fila.
 */
import { useState } from 'react'
import { View, FlatList, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Swords } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { useAuthUser } from '@/lib/use-auth-user'
import { useBattleHistory, type BattleHistoryEntry } from '@calistenia/core/hooks/useBattleHistory'
import { relativeDate } from '@calistenia/core/lib/dateUtils'
import type { BattleOutcome } from '@calistenia/core/lib/battle'

const OUTCOME_KEY: Record<BattleOutcome, string> = {
  won: 'battle.outcomeWon',
  lost: 'battle.outcomeLost',
  left: 'battle.outcomeLeft',
  unknown: 'battle.outcomeUnknown',
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <View className="flex-1 border border-border px-3 py-3">
      <Text className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
        {label}
      </Text>
      <Text className="mt-1 font-bebas text-3xl leading-none text-foreground">{value}</Text>
    </View>
  )
}

function HistoryRow({ entry, meId }: { entry: BattleHistoryEntry; meId: string | null }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { battle, outcome, rank, standings } = entry

  // Una batalla cancelada o caducada no tiene `finished_at`; la última actividad es
  // cuando realmente terminó.
  const when = battle.finished_at || battle.last_activity_at || battle.created

  return (
    <Pressable
      onPress={() => setOpen((v) => !v)}
      className="border-b border-border py-3 active:bg-muted/30"
    >
      <View className="flex-row items-center gap-3">
        <View className="flex-1">
          <Text className="font-sans-medium text-foreground" numberOfLines={1}>
            {battle.config.rounds} {t('battle.rounds')} · {battle.config.exercises.length}{' '}
            {t('battle.exercises')}
          </Text>
          <Text className="mt-0.5 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
            {relativeDate(when.slice(0, 10))}
            {rank !== null && standings.length > 0
              ? `  ·  ${t('battle.rankOf', { rank, total: standings.length })}`
              : ''}
          </Text>
        </View>
        <Text
          className={cn(
            'font-mono text-[10px] uppercase tracking-[2px]',
            outcome === 'won' ? 'text-lime' : 'text-muted-foreground',
          )}
        >
          {t(OUTCOME_KEY[outcome])}
        </Text>
      </View>

      {open && (
        <View className="mt-3 border-t border-border pt-2">
          {standings.length === 0 ? (
            <Text className="py-2 text-xs text-muted-foreground">{t('battle.noStoredResult')}</Text>
          ) : (
            standings.map((standing) => (
              <View
                key={standing.participant_id}
                className={cn(
                  'flex-row items-center gap-3 py-1.5',
                  standing.user === meId && 'bg-lime/5',
                )}
              >
                <Text
                  className={cn(
                    'w-5 font-bebas text-base',
                    standing.rank === 1 ? 'text-lime' : 'text-muted-foreground',
                  )}
                >
                  {standing.rank}
                </Text>
                <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
                  {standing.display_name || t('battle.someone')}
                  {standing.status === 'left' ? `  ${t('battle.leftTag')}` : ''}
                </Text>
                <Text className="font-mono text-[11px] text-muted-foreground">
                  {standing.score.completed_rounds}
                  <Text className="text-[9px]">{t('battle.roundsShort')}</Text>
                  {'  '}
                  {standing.score.completed_reps}
                  <Text className="text-[9px]">{t('battle.repsShort')}</Text>
                </Text>
              </View>
            ))
          )}
        </View>
      )}
    </Pressable>
  )
}

export default function BattleHistoryScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const { entries, record } = useBattleHistory(user?.id ?? null)

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <FlatList
        data={entries}
        keyExtractor={(entry) => entry.battle.id}
        contentContainerClassName="px-4 pb-8 gap-0"
        ListHeaderComponent={
          <View className="gap-4 pb-3 pt-2">
            <View className="flex-row items-center gap-3">
              <Pressable onPress={() => router.back()} className="-ml-2 p-2 active:opacity-60">
                <ChevronLeft size={22} color="#888899" />
              </Pressable>
              <View className="flex-1">
                <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                  {t('battle.historyKicker')}
                </Text>
                <Text className="font-bebas text-4xl leading-none text-foreground">
                  {t('battle.historyTitle')}
                </Text>
              </View>
            </View>

            <View className="flex-row gap-2">
              <StatBlock label={t('battle.recordFought')} value={record.fought} />
              <StatBlock label={t('battle.recordWon')} value={record.won} />
              <StatBlock label={t('battle.recordStreak')} value={record.streak} />
            </View>

            {entries.length > 0 && (
              <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                {t('battle.compare')}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          <View className="py-6">
            <EmptyState
              icon={Swords}
              title={t('battle.historyEmpty')}
              body={t('battle.historyEmptyDesc')}
              ctaLabel={t('battle.newBattle')}
              onCtaPress={() => router.push('/battle-create')}
            />
          </View>
        }
        renderItem={({ item }) => <HistoryRow entry={item} meId={user?.id ?? null} />}
      />
    </SafeAreaView>
  )
}
