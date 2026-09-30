/**
 * «Esta semana» del inicio (#858): 7 celdas de lunes a domingo con su
 * `accessibilityLabel`, y debajo la racha semanal (solo si es > 0: una racha
 * rota no se enseña) o, en la primera semana, la meta «3 en 7 días».
 *
 * Una sola semana en toda la pantalla: `getWeekSummary` (#853), calendario y
 * días distintos con cualquier actividad.
 */
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Check, Flame } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { useThemeColors } from '@/lib/theme'
import type { HomeView } from '@/lib/use-home-state'
import type { HomeFirstWeek } from '@calistenia/core/lib/homeState'
import type { WeekCell } from '@calistenia/core/lib/weekSummary'

function cellLabelKey(cell: WeekCell): string {
  switch (cell.state) {
    case 'done': return 'home.week.cell.done'
    case 'in_progress': return 'home.week.cell.inProgress'
    case 'before_start': return 'home.week.cell.beforeStart'
    case 'today': return cell.trainable ? 'home.week.cell.today' : 'home.week.cell.todayRest'
    case 'planned': return 'home.week.cell.planned'
    default: return 'home.week.cell.rest'
  }
}

function Cell({ cell, lang }: { cell: WeekCell; lang: string }) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  // `narrow` da L M X J V S D en español (y M T W T F S S en inglés).
  const letter = new Date(`${cell.day}T12:00:00`).toLocaleDateString(lang, { weekday: 'narrow' }).toUpperCase()
  const name = t(`day.${cell.dayId}`)
  return (
    <View className="flex-1 items-center gap-1.5">
      <Text className={cn('font-mono text-[10px] uppercase tracking-[1px]', cell.isToday ? 'text-foreground' : 'text-muted-foreground')}>
        {letter}
      </Text>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={t(cellLabelKey(cell), { day: name })}
        className={cn(
          'size-10 items-center justify-center rounded-lg',
          cell.state === 'done' && 'border border-lime/40 bg-lime/10',
          cell.state === 'in_progress' && 'border-2 border-lime',
          cell.state === 'today' && 'border-2 border-foreground',
          cell.state === 'planned' && 'border border-border',
          (cell.state === 'rest' || cell.state === 'before_start') && 'border border-dashed border-border',
        )}
      >
        {cell.state === 'done' ? (
          <Check size={18} color={colors.lime} strokeWidth={2.5} />
        ) : cell.state === 'in_progress' ? (
          <View className="size-2 rounded-full bg-lime" />
        ) : cell.state === 'today' ? (
          <Text className="font-mono text-[10px] uppercase text-foreground">{t('home.week.todayShort')}</Text>
        ) : cell.state === 'planned' ? (
          <View className="size-[5px] rounded-full bg-muted-foreground" />
        ) : (
          <Text className="text-muted-foreground">–</Text>
        )}
      </View>
    </View>
  )
}

/** Meta «3 entrenos en 7 días» de la primera semana (tablero PrimeraSemana / Dia0). */
export function FirstWeekGoal({ goal, start }: { goal: HomeFirstWeek; start?: boolean }) {
  const { t } = useTranslation()
  const hint = goal.reached
    ? t('home.firstWeek.reached', { target: goal.target })
    : start
      ? t('home.firstWeek.hintStart', { target: goal.target })
      : t('home.firstWeek.hint', { target: goal.target, count: goal.daysRemaining })
  return (
    <View
      className="gap-2.5"
      accessible
      accessibilityLabel={`${t('home.firstWeek.title')}: ${t('home.firstWeek.progress', { done: goal.done, target: goal.target })}. ${hint}`}
    >
      <View className="flex-row items-baseline justify-between">
        <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">{t('home.firstWeek.title')}</Text>
        <Text className="font-bebas text-lg text-foreground">{`${Math.min(goal.done, goal.target)} / ${goal.target}`}</Text>
      </View>
      <View className="flex-row gap-1.5">
        {Array.from({ length: goal.target }, (_, i) => (
          <View key={i} className={cn('h-1.5 flex-1 rounded-full', i < goal.done ? 'bg-lime' : 'bg-border')} />
        ))}
      </View>
      <Text className="text-[13px] text-muted-foreground">{hint}</Text>
    </View>
  )
}

export default function WeekRow({ view }: { view: HomeView }) {
  const { t, i18n } = useTranslation()
  const colors = useThemeColors()
  const { week, weeklyGoal, streak, state } = view
  const firstWeek = state.modifiers.firstWeek
  const hasPlan = week.planned > 0
  const deload = state.kind === 'training_day' && state.deload

  return (
    <View className="gap-2.5" accessibilityLabel={t('home.week.title')}>
      <View className="flex-row items-baseline justify-between">
        <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">{t('home.week.title')}</Text>
        <Text className="font-bebas text-lg leading-none text-foreground">
          {hasPlan
            ? t('home.week.count', { done: week.done, count: weeklyGoal })
            : t('home.week.countNoPlan', { count: week.done })}
        </Text>
      </View>
      <View className="flex-row gap-1.5">
        {week.cells.map(cell => <Cell key={cell.day} cell={cell} lang={i18n.language} />)}
      </View>
      {firstWeek ? (
        <FirstWeekGoal goal={firstWeek} />
      ) : streak.current > 0 ? (
        <View className="flex-row items-center gap-2">
          <Flame size={14} color={colors.lime} />
          <Text className="flex-1 text-[13px] text-muted-foreground">
            <Text className="font-sans-medium text-[13px] text-foreground">{t('home.streak.weeks', { count: streak.current })}</Text>
            {' '}
            {deload
              ? `· ${t('home.streak.deloadCounts')}`
              : streak.thisWeek.remaining > 0
                ? `${t('home.streak.meetingGoal')} · ${t('home.streak.remaining', { count: streak.thisWeek.remaining })}`
                : t('home.streak.meetingGoal')}
          </Text>
        </View>
      ) : null}
    </View>
  )
}
