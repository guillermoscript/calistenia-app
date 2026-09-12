/** Lista de récords por ejercicio — chip lima "Nuevo" cuando cae dentro del periodo. */
import { memo, useCallback, useState } from 'react'
import { View, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { relativeDate } from '@calistenia/core/lib/dateUtils'
import type { RecordStat } from '@calistenia/core/lib/training-stats'

interface Props {
  records: RecordStat[]
}

const PAGE_SIZE = 20

export function RecordsList({ records }: Props) {
  const { t } = useTranslation()
  const [showAll, setShowAll] = useState(false)
  const handleShowAll = useCallback(() => setShowAll(true), [])

  if (records.length === 0) return null
  const rows = showAll ? records : records.slice(0, PAGE_SIZE)

  return (
    <View>
      {rows.map((r, i) => (
        <RecordRow key={r.key} record={r} isLast={i === rows.length - 1} t={t} />
      ))}
      {!showAll && records.length > PAGE_SIZE ? (
        <Pressable onPress={handleShowAll} className="items-center py-2.5">
          <Text className="font-mono text-[10px] uppercase tracking-wide text-lime">{t('stats.showAll')}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const RecordRow = memo(function RecordRow({
  record,
  isLast,
  t,
}: {
  record: RecordStat
  isLast: boolean
  t: TFunction
}) {
  const { best } = record
  const valueLabel =
    best.kind === 'reps'
      ? t('stats.bestReps', { reps: best.reps })
      : best.kind === 'time'
        ? t('stats.bestTime', { seconds: best.seconds })
        : t('stats.bestWeight', { weight: best.weight, reps: best.reps, e1rm: best.e1rm })

  return (
    <View
      className={cn(
        'flex-row items-center justify-between gap-2 py-2.5',
        !isLast && 'border-b border-border/30',
      )}
    >
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-1.5">
          <Text className="font-sans-medium text-sm text-foreground" numberOfLines={1}>
            {record.name}
          </Text>
          {record.isNew ? (
            <View className="rounded-full bg-lime/15 px-1.5 py-0.5">
              <Text className="font-mono text-[8px] uppercase tracking-wide text-lime">{t('stats.new')}</Text>
            </View>
          ) : null}
        </View>
        <Text className="font-mono text-[10px] text-muted-foreground" numberOfLines={1}>
          {valueLabel}
        </Text>
      </View>
      <Text className="font-mono text-[9px] text-muted-foreground">{relativeDate(best.date)}</Text>
    </View>
  )
})
