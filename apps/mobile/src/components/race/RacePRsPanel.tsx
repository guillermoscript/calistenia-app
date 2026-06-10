/** Records de races (wins, finishes, 1K/5K/10K) — port móvil del RacePRsPanel web. */
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { useRacePRs } from '@calistenia/core/hooks/useRacePRs'
import { formatDuration, formatPace } from '@calistenia/core/lib/geo'

export default function RacePRsPanel({ userId }: { userId: string | null }) {
  const { t } = useTranslation()
  const { prs, loading } = useRacePRs(userId)

  if (loading || (!prs.finishes && !prs.wins)) return null

  const cells: { label: string; value: number | null | undefined }[] = [
    { label: '1K', value: prs.best1k },
    { label: '5K', value: prs.best5k },
    { label: '10K', value: prs.best10k },
  ]

  return (
    <View className="rounded-xl border border-border bg-card p-3">
      <View className="mb-2.5 flex-row items-center justify-between">
        <Text className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
          {t('race.prsTitle')}
        </Text>
        <Text className="font-mono text-[9px] text-amber-400">
          👑 {prs.wins} {t('race.prsWins')} · {prs.finishes} {t('race.prsFinished')}
        </Text>
      </View>
      <View className="flex-row gap-2">
        {cells.map((c) => (
          <View
            key={c.label}
            className={cn('flex-1 items-center rounded-lg py-2.5', c.value ? 'bg-lime/10' : 'bg-muted/40')}
          >
            <Text className={cn('font-bebas text-lg leading-none', c.value ? 'text-lime' : 'text-muted-foreground')}>
              {c.value ? formatDuration(Math.round(c.value)) : '—'}
            </Text>
            <Text className="mt-0.5 font-mono text-[8px] uppercase tracking-[1px] text-muted-foreground">{c.label}</Text>
          </View>
        ))}
      </View>
      {(prs.fastestRace || prs.longestRace) && (
        <View className="mt-2.5 gap-1 border-t border-border pt-2.5">
          {prs.fastestRace && (
            <Text className="font-mono text-[10px] text-muted-foreground">
              {t('race.prsFastestPace')}: {formatPace((prs.fastestRace.durationSeconds / 60) / prs.fastestRace.distanceKm)} /km
            </Text>
          )}
          {prs.longestRace && (
            <Text className="font-mono text-[10px] text-muted-foreground">
              {t('race.prsLongest')}: {prs.longestRace.distanceKm.toFixed(2)} km
            </Text>
          )}
        </View>
      )}
    </View>
  )
}
