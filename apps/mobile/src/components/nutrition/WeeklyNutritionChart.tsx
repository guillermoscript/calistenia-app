/** Weekly calorie bar chart — 7-day history vs goal. */
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'

interface DayData {
  date: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

interface WeeklyNutritionChartProps {
  history: DayData[]
  calorieGoal: number
}

const CHART_HEIGHT = 96 // h-24 in px

function getDayLabel(dateStr: string, isToday: boolean, t: (key: string, fallback: string) => string): string {
  if (isToday) return t('common.today', 'Hoy')
  try {
    return new Date(dateStr).toLocaleDateString('es-ES', { weekday: 'short' })
  } catch {
    return '—'
  }
}

function isToday(dateStr: string): boolean {
  const today = new Date().toISOString().slice(0, 10)
  return dateStr.slice(0, 10) === today
}

export default function WeeklyNutritionChart({ history, calorieGoal }: WeeklyNutritionChartProps) {
  const { t } = useTranslation()
  const maxCalories = calorieGoal * 1.2
  // Goal line position from bottom (as % of chart height)
  const goalLinePct = Math.min(calorieGoal / maxCalories, 1)
  const goalLineBottom = goalLinePct * CHART_HEIGHT

  return (
    <View className="rounded-xl border border-border bg-card px-4 py-3 gap-3">
      {/* Section header */}
      <Text className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        {t('nutrition.weeklyChart.title', 'Historial semanal')}
      </Text>

      {/* Chart area */}
      <View style={{ height: CHART_HEIGHT + 36 }}>
        {/* Bars + goal line container */}
        <View style={{ height: CHART_HEIGHT, position: 'relative' }}>
          {/* Goal line (dashed) */}
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: goalLineBottom,
              height: 1,
              borderStyle: 'dashed',
              borderColor: '#a3e635',
              borderTopWidth: 1,
              opacity: 0.5,
            }}
          />

          {/* Bars row */}
          <View className="absolute inset-0 flex-row items-end gap-1.5 px-0.5">
            {history.map((day, i) => {
              const today = isToday(day.date)
              const over = calorieGoal > 0 && day.calories > calorieGoal
              const barHeight =
                calorieGoal > 0
                  ? Math.round(Math.min(day.calories / maxCalories, 1) * CHART_HEIGHT)
                  : 4
              const barColor = over ? '#f87171' : '#a3e635' // red-400 : lime-400
              const dayLabel = getDayLabel(day.date, today, t)

              return (
                <View key={i} className="flex-1 items-center justify-end" style={{ height: CHART_HEIGHT }}>
                  {/* Background track */}
                  <View
                    className="w-full rounded-t overflow-hidden"
                    style={{ height: CHART_HEIGHT, backgroundColor: 'rgba(63,63,70,0.4)' }}
                  >
                    {/* Filled bar — anchored to bottom */}
                    <View style={{ flex: 1 }} />
                    <View
                      style={{
                        width: '100%',
                        height: barHeight,
                        backgroundColor: today ? barColor : barColor + 'cc',
                        borderRadius: 4,
                      }}
                    />
                  </View>
                </View>
              )
            })}
          </View>
        </View>

        {/* Day labels + calorie amounts */}
        <View className="flex-row gap-1.5 px-0.5 mt-1.5">
          {history.map((day, i) => {
            const today = isToday(day.date)
            const dayLabel = getDayLabel(day.date, today, t)
            return (
              <View key={i} className="flex-1 items-center gap-0.5">
                <Text
                  className={
                    today
                      ? 'font-mono text-[9px] uppercase tracking-wide text-lime-400'
                      : 'font-mono text-[9px] uppercase tracking-wide text-muted-foreground'
                  }
                  numberOfLines={1}
                >
                  {dayLabel}
                </Text>
                <Text
                  className="font-mono text-[8px] text-muted-foreground"
                  numberOfLines={1}
                >
                  {day.calories > 0 ? String(Math.round(day.calories)) : '—'}
                </Text>
              </View>
            )
          })}
        </View>
      </View>

      {/* Legend */}
      <View className="flex-row items-center gap-3">
        <View className="flex-row items-center gap-1">
          <View className="w-3 h-0.5 bg-lime-400 opacity-50" style={{ borderStyle: 'dashed' }} />
          <Text className="font-mono text-[8px] uppercase tracking-wide text-muted-foreground">
            {t('nutrition.weeklyChart.goal', 'Meta')} {Math.round(calorieGoal)} kcal
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <View className="w-2 h-2 rounded-sm bg-red-400" />
          <Text className="font-mono text-[8px] uppercase tracking-wide text-muted-foreground">
            {t('nutrition.weeklyChart.over', 'Excedido')}
          </Text>
        </View>
      </View>
    </View>
  )
}
