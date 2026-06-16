/** Weekly AI meal plan — mobile port of web WeeklyMealPlan. */
import { useState, useCallback } from 'react'
import { View, Pressable, ScrollView, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import type {
  WeeklyMealPlan as WeeklyMealPlanType,
  WeeklyPlanDay,
  NutritionGoal,
  DailyTotals,
  WeeklyPlannedMeal,
} from '@calistenia/core/types'

interface WeeklyMealPlanProps {
  activePlan: WeeklyMealPlanType | null
  planDays: WeeklyPlanDay[]
  isLoading: boolean
  goals: NutritionGoal
  getDailyTotals: (date: string) => DailyTotals
  onGenerate: () => Promise<void>
  onRegenerateDay: (planDayId: string) => Promise<void>
  onLogMeal: (planDayId: string, mealId: string) => Promise<void>
  onDeleteMeal: (planDayId: string, mealId: string) => Promise<void>
  onArchive: () => Promise<void>
  onRefresh: () => Promise<void>
}

const DAY_NAMES_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function getTodayDayIndex(): number {
  const dow = new Date().getDay() // 0=Sun
  return dow === 0 ? 6 : dow - 1  // 0=Mon
}

function formatWeekRange(planDays: WeeklyPlanDay[]): string {
  if (!planDays.length) return ''
  const first = planDays[0]?.date?.slice(0, 10) ?? ''
  const last = planDays[planDays.length - 1]?.date?.slice(0, 10) ?? ''
  if (!first) return ''
  try {
    const f = new Date(first).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    const l = new Date(last).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    return `${f} — ${l}`
  } catch {
    return first
  }
}

const MEAL_TYPE_COLORS: Record<string, { text: string; bg: string }> = {
  desayuno: { text: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/30' },
  almuerzo: { text: 'text-sky-500',   bg: 'bg-sky-500/10 border-sky-500/30' },
  cena:     { text: 'text-pink-500',  bg: 'bg-pink-500/10 border-pink-500/30' },
  snack:    { text: 'text-lime-400',  bg: 'bg-lime-400/10 border-lime-400/30' },
}

interface MealCardProps {
  meal: WeeklyPlannedMeal
  dayId: string
  onLog: (dayId: string, mealId: string) => Promise<void>
  onDelete: (dayId: string, mealId: string) => Promise<void>
}

function MealCard({ meal, dayId, onLog, onDelete }: MealCardProps) {
  const { t } = useTranslation()
  const [logging, setLogging] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const colors = MEAL_TYPE_COLORS[meal.meal_type] || MEAL_TYPE_COLORS.snack

  return (
    <View
      className={cn(
        'rounded-xl border border-border bg-card px-4 py-3 gap-2',
        meal.logged && 'opacity-60',
      )}
    >
      {/* Top: type + calories */}
      <View className="flex-row items-center justify-between">
        <View className={cn('rounded border px-2 py-0.5', colors.bg)}>
          <Text className={cn('font-mono text-[9px] uppercase tracking-widest', colors.text)}>
            {meal.meal_type}
          </Text>
        </View>
        <Text className="font-bebas text-lg leading-none text-foreground">
          {meal.calories} kcal
        </Text>
      </View>

      {/* Label / description */}
      <Text className="font-sans-medium text-sm text-foreground" numberOfLines={2}>
        {meal.label}
      </Text>
      {!!meal.description && (
        <Text className="font-sans text-xs text-muted-foreground leading-relaxed" numberOfLines={3}>
          {meal.description}
        </Text>
      )}

      {/* Macros */}
      <View className="flex-row gap-3 pt-1">
        <Text className="font-mono text-[11px] text-sky-500">{meal.protein}g P</Text>
        <Text className="font-mono text-[11px] text-amber-400">{meal.carbs}g C</Text>
        <Text className="font-mono text-[11px] text-pink-500">{meal.fat}g G</Text>
      </View>

      {/* Actions */}
      <View className="flex-row gap-2 pt-1 border-t border-border">
        {!meal.logged ? (
          <Pressable
            onPress={async () => {
              setLogging(true)
              try { await onLog(dayId, meal.id) } finally { setLogging(false) }
            }}
            disabled={logging || deleting}
            className="flex-1 items-center justify-center rounded-lg border border-lime-400/30 py-2 active:bg-lime-400/10"
          >
            {logging ? (
              <ActivityIndicator size="small" color="#a3e635" />
            ) : (
              <Text className="font-mono text-[10px] uppercase tracking-widest text-lime-400">
                {t('nutrition.weeklyPlan.logMeal', 'Registrar')}
              </Text>
            )}
          </Pressable>
        ) : (
          <View className="flex-1 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 py-2">
            <Text className="font-mono text-[10px] uppercase tracking-widest text-emerald-400">
              ✓ {t('nutrition.weeklyPlan.logged', 'Registrado')}
            </Text>
          </View>
        )}

        <Pressable
          onPress={async () => {
            setDeleting(true)
            try { await onDelete(dayId, meal.id) } finally { setDeleting(false) }
          }}
          disabled={logging || deleting}
          className="items-center justify-center rounded-lg border border-border px-3 py-2 active:bg-red-500/10"
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#f87171" />
          ) : (
            <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              ✕
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  )
}

function SectionHeader() {
  const { t } = useTranslation()
  return (
    <View className="flex-row items-center justify-between">
      <View className="gap-0.5">
        <Text className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">IA</Text>
        <Text className="font-bebas text-2xl leading-none text-foreground">
          {t('nutrition.weeklyPlan.title', 'PLAN SEMANAL')}
        </Text>
      </View>
    </View>
  )
}

export default function WeeklyMealPlan({
  activePlan,
  planDays,
  isLoading,
  goals,
  getDailyTotals,
  onGenerate,
  onRegenerateDay,
  onLogMeal,
  onDeleteMeal,
  onArchive,
  onRefresh,
}: WeeklyMealPlanProps) {
  const { t } = useTranslation()
  const todayIndex = getTodayDayIndex()
  const [selectedDayIndex, setSelectedDayIndex] = useState(todayIndex)
  const [generating, setGenerating] = useState(false)
  const [regeneratingDay, setRegeneratingDay] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    try { await onGenerate() } finally { setGenerating(false) }
  }, [onGenerate])

  const handleRegenerateDay = useCallback(async (dayId: string) => {
    setRegeneratingDay(true)
    try { await onRegenerateDay(dayId) } finally { setRegeneratingDay(false) }
  }, [onRegenerateDay])

  const handleArchive = useCallback(async () => {
    setArchiving(true)
    try { await onArchive() } finally { setArchiving(false) }
  }, [onArchive])


  // Loading state
  if (isLoading) {
    return (
      <View className="gap-3">
        <SectionHeader />
        {[0, 1, 2].map((i) => (
          <View key={i} className="h-16 rounded-xl bg-muted/60" style={{ opacity: 1 - i * 0.2 }} />
        ))}
      </View>
    )
  }

  // No active plan
  if (!activePlan) {
    return (
      <View className="gap-3">
        <SectionHeader />
        <View className="rounded-xl border border-dashed border-lime-400/20 bg-card p-5 items-center gap-3">
          <Text className="text-2xl">📋</Text>
          <Text className="font-sans-medium text-sm text-foreground text-center">
            {t('nutrition.weeklyPlan.noActivePlan', 'Sin plan activo')}
          </Text>
          <Text className="font-sans text-xs text-muted-foreground text-center leading-relaxed">
            {t('nutrition.weeklyPlan.noActivePlanDesc', 'Genera un plan semanal con IA personalizado a tus objetivos.')}
          </Text>
          <Pressable
            onPress={handleGenerate}
            disabled={generating}
            className={cn(
              // active: estático — evita el upgrade View→Pressable de css-interop.
              'rounded-lg border border-lime-400/30 px-4 py-2 active:bg-lime-400/10',
              generating ? 'opacity-50' : '',
            )}
          >
            {generating ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color="#a3e635" />
                <Text className="font-bebas tracking-widest text-lime-400">
                  {t('nutrition.weeklyPlan.generating', 'Generando...')}
                </Text>
              </View>
            ) : (
              <Text className="font-bebas tracking-widest text-lime-400">
                {t('nutrition.weeklyPlan.generate', 'Generar plan semanal')}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    )
  }

  const selectedDay = planDays.find((d) => d.day_index === selectedDayIndex)
  const weekRange = formatWeekRange(planDays)

  return (
    <View className="gap-3">
      {/* Header + archive */}
      <View className="flex-row items-start justify-between">
        <View className="gap-0.5 flex-1">
          <Text className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">IA</Text>
          <Text className="font-bebas text-2xl leading-none text-foreground">
            {t('nutrition.weeklyPlan.title', 'PLAN SEMANAL')}
          </Text>
          {!!weekRange && (
            <Text className="font-mono text-[10px] text-muted-foreground mt-0.5">{weekRange}</Text>
          )}
        </View>

        <View className="flex-row gap-2 items-center mt-1">
          <Pressable
            onPress={handleGenerate}
            disabled={generating}
            className="rounded-lg bg-lime-400 px-3 py-1.5 active:bg-lime-300"
          >
            {generating ? (
              <ActivityIndicator size="small" color="#18181b" />
            ) : (
              <Text className="font-bebas text-sm tracking-widest text-zinc-900">
                {t('nutrition.weeklyPlan.regenerate', 'Regenerar')}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={handleArchive}
            disabled={archiving}
            className="rounded-lg border border-border px-3 py-1.5 active:bg-muted/40"
          >
            {archiving ? (
              <ActivityIndicator size="small" color="#71717a" />
            ) : (
              <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t('nutrition.weeklyPlan.archive', 'Archivar')}
              </Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* Day tabs — horizontal scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="flex-row gap-2 px-0.5"
      >
        {DAY_NAMES_SHORT.map((name, idx) => {
          const day = planDays.find((d) => d.day_index === idx)
          const isSelected = idx === selectedDayIndex
          const isToday = idx === todayIndex
          const hasMeals = (day?.meals?.length ?? 0) > 0
          const loggedCount = day?.meals?.filter((m) => m.logged).length ?? 0
          const totalCount = day?.meals?.length ?? 0

          return (
            <Pressable
              key={idx}
              onPress={() => setSelectedDayIndex(idx)}
              className={cn(
                'items-center rounded-xl px-3 py-2 gap-0.5 min-w-[52px]',
                isSelected
                  ? 'bg-lime-400'
                  : 'border border-border bg-card active:bg-muted/40',
              )}
            >
              <Text
                className={cn(
                  'font-mono text-[10px] uppercase tracking-wide',
                  isSelected ? 'text-zinc-900' : isToday ? 'text-lime-400' : 'text-muted-foreground',
                )}
              >
                {name}
              </Text>
              {hasMeals && (
                <Text
                  className={cn(
                    'font-mono text-[8px]',
                    isSelected ? 'text-zinc-900' : 'text-muted-foreground',
                  )}
                >
                  {loggedCount}/{totalCount}
                </Text>
              )}
            </Pressable>
          )
        })}
      </ScrollView>

      {/* Selected day content */}
      {selectedDay ? (
        <View className="gap-2.5">
          {/* Day totals bar */}
          {(() => {
            const date = selectedDay.date?.slice(0, 10) ?? ''
            const totals = date ? getDailyTotals(date) : null
            if (!totals) return null
            return (
              <View className="rounded-xl border border-border bg-card px-4 py-2.5">
                <Text className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground mb-1.5">
                  {t('nutrition.weeklyPlan.loggedToday', 'Registrado hoy')}
                </Text>
                <View className="flex-row gap-4">
                  <Text className="font-bebas text-base text-foreground">{Math.round(totals.calories)} kcal</Text>
                  <Text className="font-mono text-[11px] text-sky-500">{Math.round(totals.protein)}g P</Text>
                  <Text className="font-mono text-[11px] text-amber-400">{Math.round(totals.carbs)}g C</Text>
                  <Text className="font-mono text-[11px] text-pink-500">{Math.round(totals.fat)}g G</Text>
                </View>
              </View>
            )
          })()}

          {/* Meals list */}
          {selectedDay.meals.length > 0 ? (
            selectedDay.meals.map((meal) => (
              <MealCard
                key={meal.id}
                meal={meal}
                dayId={selectedDay.id}
                onLog={onLogMeal}
                onDelete={onDeleteMeal}
              />
            ))
          ) : (
            <View className="rounded-xl border border-border bg-card p-5 items-center">
              <Text className="font-sans text-sm text-muted-foreground text-center">
                {t('nutrition.weeklyPlan.noDayData', 'Sin comidas para este día')}
              </Text>
            </View>
          )}

          {/* Regenerate day button */}
          <Pressable
            onPress={() => handleRegenerateDay(selectedDay.id)}
            disabled={regeneratingDay}
            className={cn(
              'rounded-xl border border-border py-3 items-center justify-center active:bg-muted/40',
              regeneratingDay && 'opacity-50',
            )}
          >
            {regeneratingDay ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color="#71717a" />
                <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {t('nutrition.weeklyPlan.regeneratingDay', 'Regenerando...')}
                </Text>
              </View>
            ) : (
              <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t('nutrition.weeklyPlan.regenerateDay', 'Regenerar día')}
              </Text>
            )}
          </Pressable>
        </View>
      ) : (
        <View className="rounded-xl border border-border bg-card p-5 items-center">
          <Text className="font-sans text-sm text-muted-foreground text-center">
            {t('nutrition.weeklyPlan.noDayData', 'Sin comidas para este día')}
          </Text>
        </View>
      )}
    </View>
  )
}
