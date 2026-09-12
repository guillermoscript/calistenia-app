/** Selector segmentado de periodo — mismo estilo que el toggle semana/mes de CardioStats. */
import { View, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { STATS_PERIODS, type StatsPeriod } from '@calistenia/core/lib/training-stats'

interface Props {
  period: StatsPeriod
  onChange: (period: StatsPeriod) => void
}

export function PeriodSelector({ period, onChange }: Props) {
  const { t } = useTranslation()
  return (
    <View className="flex-row gap-1 self-start rounded-lg bg-muted/50 p-1">
      {STATS_PERIODS.map((p) => (
        <Pressable
          key={p}
          onPress={() => { haptics.selection(); onChange(p) }}
          className={cn('rounded-md px-3 py-1.5', period === p && 'bg-background')}
        >
          <Text
            className={cn(
              'font-mono text-[10px] uppercase tracking-[1.5px]',
              period === p ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {t(`stats.period.${p}`)}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}
