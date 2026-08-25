/** Tendencia: 12 barras verticales de series por semana. La última en lima. */
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import type { WeeklyStat } from '@calistenia/core/lib/training-stats'

interface Props {
  weekly: WeeklyStat[]
}

function formatDDMM(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${d}/${m}`
}

export function WeeklyBars({ weekly }: Props) {
  const max = Math.max(...weekly.map((w) => w.sets), 1)

  return (
    <View>
      <View className="h-24 flex-row items-end gap-1">
        {weekly.map((w, i) => {
          const isLast = i === weekly.length - 1
          return (
            <View key={w.weekStart} className="h-full flex-1 items-center justify-end">
              <View
                className={cn('w-full rounded-t', isLast ? 'bg-lime' : 'bg-lime/20')}
                style={{ height: w.sets > 0 ? `${Math.max(4, Math.round((w.sets / max) * 100))}%` : 0 }}
              />
            </View>
          )
        })}
      </View>
      <View className="mt-1 flex-row">
        {weekly.map((w, i) => (
          <Text
            key={w.weekStart}
            className="flex-1 text-center font-mono text-[7px] text-muted-foreground"
            numberOfLines={1}
          >
            {i % 4 === 0 ? formatDDMM(w.weekStart) : ''}
          </Text>
        ))}
      </View>
    </View>
  )
}
