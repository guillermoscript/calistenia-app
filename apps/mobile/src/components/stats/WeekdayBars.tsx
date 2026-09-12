/** 7 mini-barras — un entreno cuenta al día que se hizo; la mayor en lima. */
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'

interface Props {
  weekdays: number[]
}

export function WeekdayBars({ weekdays }: Props) {
  const { t } = useTranslation()
  const initials = t('stats.weekdayInitials').split(',')
  const max = Math.max(...weekdays, 1)
  const hasData = weekdays.some((v) => v > 0)
  const maxIdx = weekdays.reduce((best, v, i) => (v > weekdays[best] ? i : best), 0)

  return (
    <View>
      <Text className="mb-2 font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
        {t('stats.weekdays')}
      </Text>
      <View className="h-16 flex-row items-end gap-1.5">
        {weekdays.map((v, i) => {
          const isMax = hasData && i === maxIdx
          return (
            <View key={i} className="h-full flex-1 items-center justify-end">
              <View
                className={cn('w-full rounded-t', isMax ? 'bg-lime' : 'bg-lime/20')}
                style={{ height: v > 0 ? `${Math.max(8, Math.round((v / max) * 100))}%` : 0 }}
              />
            </View>
          )
        })}
      </View>
      <View className="mt-1 flex-row gap-1.5">
        {initials.map((label, i) => (
          <Text
            key={i}
            className={cn(
              'flex-1 text-center font-mono text-[8px]',
              hasData && i === maxIdx ? 'text-lime' : 'text-muted-foreground',
            )}
            numberOfLines={1}
          >
            {label}
          </Text>
        ))}
      </View>
    </View>
  )
}
