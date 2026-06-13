import { useMemo } from 'react'
import { useCountUp } from '@/lib/use-count-up'
import { View, FlatList } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { relativeDate, todayStr } from '@calistenia/core/lib/dateUtils'
import type { SessionDone } from '@calistenia/core/types'

export default function HistoryScreen() {
  const { t } = useTranslation()
  const { progress, settings } = useWorkoutState()
  const { getWorkout, getTotalSessions, getLongestStreak, getWeeklyDoneCount, getMonthActivity } = useWorkoutActions()

  const sessions = useMemo(() => {
    return Object.entries(progress)
      .filter(([k, v]) => k.startsWith('done_') && (v as SessionDone).done)
      .map(([, v]) => v as SessionDone)
      .sort((a, b) => {
        const byDate = b.date.localeCompare(a.date)
        return byDate !== 0 ? byDate : (b.completedAt ?? 0) - (a.completedAt ?? 0)
      })
  }, [progress])

  const monthActivity = useMemo(() => getMonthActivity(), [getMonthActivity])
  const today = todayStr()

  const titleFor = (s: SessionDone): string => {
    // workoutKey "p1_lun" → título del workout; sesiones libres → etiqueta genérica
    if (s.workoutKey.startsWith('free_') || s.workoutKey.startsWith('manual_')) {
      return t('progress.freeSession')
    }
    const m = /^p(\d+)_(\w+)$/.exec(s.workoutKey)
    if (m) {
      const w = getWorkout(parseInt(m[1]), m[2])
      if (w?.title) return w.title
      return `${t('workout.phaseLabel', { phase: m[1] })} · ${t(`day.${m[2]}`, { defaultValue: m[2] })}`
    }
    return s.workoutKey
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <FlatList
        data={sessions}
        keyExtractor={(s, i) => `${s.date}_${s.workoutKey}_${i}`}
        contentContainerClassName="px-4 pb-8 gap-2"
        ListHeaderComponent={
          <View className="gap-4 pb-3 pt-2">
            <Text className="font-bebas text-4xl leading-none text-foreground">{t('progress.title')}</Text>

            {/* Stats */}
            <View className="flex-row gap-3">
              <StatCard label={t('progress.recentSessions')} value={getTotalSessions()} />
              <StatCard label={t('common.week')} value={`${getWeeklyDoneCount()}/${settings.weeklyGoal || 5}`} />
              <StatCard label="Racha" value={getLongestStreak()} />
            </View>

            {/* Actividad del mes */}
            <Card>
              <CardContent className="py-4">
                <Text className="mb-2.5 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                  {t('common.month')}
                </Text>
                <View className="flex-row flex-wrap gap-1.5">
                  {Object.entries(monthActivity).map(([date, active]) => (
                    <View
                      key={date}
                      className={cn(
                        'size-6 items-center justify-center rounded',
                        active ? 'bg-lime/80' : 'bg-muted',
                        date === today && 'border border-lime',
                      )}
                    >
                      <Text className={cn('text-[8px]', active ? 'text-lime-foreground' : 'text-muted-foreground/60')}>
                        {parseInt(date.slice(8))}
                      </Text>
                    </View>
                  ))}
                </View>
              </CardContent>
            </Card>

            {sessions.length > 0 && (
              <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                {t('progress.recentSessions')}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          <View className="items-center gap-1 py-8">
            <Text className="font-semibold text-foreground">{t('progress.noData')}</Text>
            <Text className="text-center text-sm text-muted-foreground">{t('progress.noDataDesc')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <View className="size-8 items-center justify-center rounded-full bg-lime/15">
              <Check size={15} color="hsl(74 90% 45%)" />
            </View>
            <View className="flex-1">
              <Text className="font-sans-medium text-foreground" numberOfLines={1}>{titleFor(item)}</Text>
              <Text className="text-xs text-muted-foreground">
                <Text className="font-mono text-[11px] text-muted-foreground/70">{relativeDate(item.date)}</Text>
                {item.note ? ` · ${item.note}` : ''}
              </Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  )
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  const numeric = typeof value === 'number' ? value : null
  const count = useCountUp(numeric ?? 0)
  const display = numeric !== null ? String(count) : value
  return (
    <Card className="flex-1">
      <CardContent className="items-center py-3.5">
        <Text className="font-bebas text-2xl leading-none text-foreground">{display}</Text>
        <Text className="mt-1.5 text-center font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground" numberOfLines={1}>{label}</Text>
      </CardContent>
    </Card>
  )
}
