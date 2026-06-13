/** Water intake tracker widget — port of web WaterTracker. */
import { View, Pressable, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Droplets } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'

interface WaterTrackerProps {
  todayTotal: number        // ml consumed
  goal: number              // ml goal
  onAdd?: (ml: number) => void  // undefined = past date / read-only
  onSetGoal?: (ml: number) => void
  adding?: boolean
}

const QUICK_ADD = [250, 500] as const

export default function WaterTracker({
  todayTotal,
  goal,
  onAdd,
  adding = false,
}: WaterTrackerProps) {
  const { t } = useTranslation()
  const pct = goal > 0 ? Math.min(todayTotal / goal, 1) : 0
  const reached = todayTotal >= goal
  const liters = (todayTotal / 1000).toFixed(1)

  return (
    <View className="rounded-xl bg-card border border-border px-4 py-3 gap-3">
      {/* Header row */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Droplets size={16} className="text-sky-400" color="#38bdf8" />
          <Text className="font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground">
            {t('nutrition.water', 'Agua')}
          </Text>
        </View>

        <View className="flex-row items-center gap-2">
          {reached && (
            <View className="rounded-full bg-sky-400/15 px-2 py-0.5">
              <Text className="font-mono text-[9px] uppercase tracking-widest text-sky-400">
                {t('nutrition.goalReached', 'Meta')} ✓
              </Text>
            </View>
          )}
          <Text className="font-bebas text-xl leading-none text-sky-400">
            {liters}
            <Text className="font-mono text-[10px] text-muted-foreground"> L</Text>
          </Text>
          <Text className="font-mono text-[9px] text-muted-foreground">
            / {(goal / 1000).toFixed(1)} L
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View className="h-2 overflow-hidden rounded-full bg-muted/60">
        <View
          className={cn(
            'h-full rounded-full transition-all',
            reached ? 'bg-sky-400' : 'bg-sky-500',
          )}
          style={{ width: `${pct * 100}%` }}
        />
      </View>

      {/* Quick-add buttons — only shown when editable */}
      {onAdd && (
        <View className="flex-row gap-2">
          {QUICK_ADD.map((ml) => (
            <Pressable
              key={ml}
              onPress={() => !adding && onAdd(ml)}
              disabled={adding}
              className={cn(
                'flex-1 items-center justify-center rounded-lg border border-border py-2',
                'active:bg-sky-400/10',
                adding && 'opacity-50',
              )}
            >
              {adding ? (
                <ActivityIndicator size="small" color="#38bdf8" />
              ) : (
                <Text className="font-mono text-[10px] uppercase tracking-widest text-sky-400">
                  +{ml} ml
                </Text>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}
