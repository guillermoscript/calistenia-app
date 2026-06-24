/**
 * NutritionDashboard — gauges de calorías/macros + timeline de comidas del día.
 * Port móvil de apps/web/src/components/nutrition/NutritionDashboard.tsx
 */
import { memo, useCallback, useState, useMemo } from 'react'
import { View, ScrollView, Pressable, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Copy, Trash2, Pencil, ChevronDown, ChevronUp } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { todayStr, localHour } from '@calistenia/core/lib/dateUtils'
import { getMealTimeLabel } from '@calistenia/core/lib/meal-time'
import type { NutritionEntry, DailyTotals, QualityScore } from '@calistenia/core/types'
import MacroRing from './MacroRing'
import MacroBar from './MacroBar'

// ─── Types ──────────────────────────────────────────────────────────────────

interface NutritionDashboardProps {
  dailyTotals: DailyTotals
  goals: {
    dailyCalories: number
    dailyProtein: number
    dailyCarbs: number
    dailyFat: number
  }
  entries: NutritionEntry[]
  onDeleteEntry?: (id: string) => void
  onDuplicateEntry?: (entry: NutritionEntry) => Promise<void>
  onEditEntry?: (entry: NutritionEntry) => void
  selectedDate?: string
  /** Calorie-weighted daily quality letter, computed once by the parent. */
  dailyQualityScore?: QualityScore
  /** Calorías activas quemadas (reloj/Health Connect) que amplían el budget del día. */
  activeCalories?: number
}

// ─── Meal color tokens (NativeWind safe — no dynamic class generation) ───────

const MEAL_LABEL_COLOR: Record<string, string> = {
  desayuno: 'text-amber-400',
  almuerzo: 'text-sky-400',
  cena:     'text-indigo-400',
  snack:    'text-emerald-400',
}

const MEAL_DOT_BG: Record<string, string> = {
  desayuno: 'bg-amber-400',
  almuerzo: 'bg-sky-400',
  cena:     'bg-indigo-400',
  snack:    'bg-emerald-400',
}

const MEAL_BADGE_CLASS: Record<string, string> = {
  desayuno: 'bg-amber-400/15 border-amber-400/30',
  almuerzo: 'bg-sky-400/15 border-sky-400/30',
  cena:     'bg-indigo-400/15 border-indigo-400/30',
  snack:    'bg-emerald-400/15 border-emerald-400/30',
}

const SCORE_BG: Record<QualityScore, string> = {
  A: 'bg-emerald-500',
  B: 'bg-lime-500',
  C: 'bg-yellow-500',
  D: 'bg-orange-500',
  E: 'bg-red-500',
}

const SCORE_TEXT: Record<QualityScore, string> = {
  A: 'text-white',
  B: 'text-white',
  C: 'text-black',
  D: 'text-white',
  E: 'text-white',
}

// ─── Quality score badge ──────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: QualityScore }) {
  return (
    <View
      className={cn(
        'h-5 w-5 items-center justify-center rounded-full',
        SCORE_BG[score]
      )}
    >
      <Text className={cn('font-mono text-[10px]', SCORE_TEXT[score])}>
        {score}
      </Text>
    </View>
  )
}

// ─── Single meal entry card ───────────────────────────────────────────────────

interface MealCardProps {
  entry: NutritionEntry
  entryId: string
  expanded: boolean
  showDelete: boolean
  showDuplicate: boolean
  showEdit: boolean
  onToggle: (id: string) => void
  onDelete: (entry: NutritionEntry) => void
  onDuplicate: (entry: NutritionEntry) => void
  onEdit: (entry: NutritionEntry) => void
}

// Memoized + entry-arg callbacks: rows only re-render when their own entry /
// expanded / visibility flags change, not on every parent render (e.g. when a
// sibling row expands or unrelated screen state updates).
const MealCard = memo(function MealCard({
  entry,
  entryId,
  expanded,
  showDelete,
  showDuplicate,
  showEdit,
  onToggle,
  onDelete,
  onDuplicate,
  onEdit,
}: MealCardProps) {
  const { t } = useTranslation()

  const mealLabelColor = MEAL_LABEL_COLOR[entry.mealType] ?? 'text-muted-foreground'
  const mealDotBg = MEAL_DOT_BG[entry.mealType] ?? 'bg-muted-foreground'
  const mealBadge = MEAL_BADGE_CLASS[entry.mealType] ?? 'bg-muted/20 border-border'

  // Food names summary (deduplicate with count)
  const foodSummary = useMemo(() => {
    const counts = new Map<string, number>()
    for (const f of entry.foods) {
      if (!f.name) continue
      counts.set(f.name, (counts.get(f.name) || 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([name, count]) => (count > 1 ? `${name} x${count}` : name))
      .join(', ')
  }, [entry.foods])

  // Grouped foods for expanded view
  const groupedFoods = useMemo(() => {
    const grouped: { food: typeof entry.foods[0]; count: number }[] = []
    for (const food of entry.foods) {
      const existing = grouped.find(g => g.food.name === food.name && food.name)
      if (existing) {
        existing.count++
      } else {
        grouped.push({ food, count: 1 })
      }
    }
    return grouped
  }, [entry.foods])

  const isAI = entry.source?.startsWith('ai_')
  // Use the shared helper: treats "00:00" as the unset sentinel and falls back
  // to loggedAt (a real UTC timestamp), so legacy rows never display 00:00.
  const mealTime = getMealTimeLabel(entry)

  return (
    <View className="mb-3 rounded-xl border border-border bg-card overflow-hidden">
      {/* Main row */}
      <Pressable onPress={() => onToggle(entryId)} className="active:opacity-80">
        <View className="px-4 pt-4 pb-3">
          {/* Top row: type badge + time + calories */}
          <View className="flex-row items-center gap-2 mb-2">
            {/* Meal type dot + label */}
            <View className={cn('flex-row items-center gap-1.5 rounded-md border px-2 py-0.5', mealBadge)}>
              <View className={cn('h-1.5 w-1.5 rounded-full', mealDotBg)} />
              <Text className={cn('font-mono text-[9px] tracking-[2px]', mealLabelColor)}>
                {entry.mealType.toUpperCase()}
              </Text>
            </View>

            {/* AI badge */}
            {isAI && (
              <View className="rounded border border-violet-500/30 bg-violet-500/15 px-1.5 py-0.5">
                <Text className="font-mono text-[8px] tracking-wider text-violet-400">
                  {t('nutrition.aiBadge', { defaultValue: 'IA' })}
                </Text>
              </View>
            )}

            {/* Quality score */}
            {entry.qualityScore && <ScoreBadge score={entry.qualityScore} />}

            {/* Finish time + optional duration */}
            <View className="flex-row items-center gap-1.5 ml-auto">
              {entry.durationMin ? (
                <Text className="font-mono text-[9px] text-muted-foreground/70">
                  {entry.durationMin} {t('nutrition.logger.durationUnit', { defaultValue: 'min' })}
                </Text>
              ) : null}
              <Text className="font-mono text-[10px] text-muted-foreground">
                {mealTime}
              </Text>
            </View>

            {/* Calories */}
            <Text className="font-bebas text-xl leading-none text-foreground ml-2">
              {Math.round(entry.totalCalories)}
              <Text className="font-mono text-xs text-muted-foreground"> kcal</Text>
            </Text>
          </View>

          {/* Food names */}
          {foodSummary.length > 0 && (
            <Text
              className="font-sans text-xs text-muted-foreground mb-2"
              numberOfLines={expanded ? undefined : 1}
            >
              {foodSummary}
            </Text>
          )}

          {/* Macros row */}
          <View className="flex-row gap-4">
            <Text className="font-mono text-[10px] text-sky-400">
              {Math.round(entry.totalProtein)}g{' '}
              <Text className="text-muted-foreground">
                {t('nutrition.protein', { defaultValue: 'P' }).charAt(0).toUpperCase()}
              </Text>
            </Text>
            <Text className="font-mono text-[10px] text-amber-400">
              {Math.round(entry.totalCarbs)}g{' '}
              <Text className="text-muted-foreground">
                {t('nutrition.carbs', { defaultValue: 'C' }).charAt(0).toUpperCase()}
              </Text>
            </Text>
            <Text className="font-mono text-[10px] text-pink-400">
              {Math.round(entry.totalFat)}g{' '}
              <Text className="text-muted-foreground">
                {t('nutrition.fat', { defaultValue: 'G' }).charAt(0).toUpperCase()}
              </Text>
            </Text>

            {/* Expand indicator */}
            <View className="flex-1 items-end">
              {expanded ? (
                <ChevronUp size={14} color="#888899" />
              ) : (
                <ChevronDown size={14} color="#888899" />
              )}
            </View>
          </View>
        </View>
      </Pressable>

      {/* Expanded: per-food breakdown */}
      {expanded && (
        <View className="border-t border-border/50 px-4 py-3 gap-2">
          {groupedFoods.map((g, fi) => (
            <View key={fi} className="flex-row items-center gap-2">
              <Text className="flex-1 font-sans text-xs text-foreground/80" numberOfLines={1}>
                {g.food.name || '—'}
                {g.count > 1 && (
                  <Text className="text-lime-400 font-sans-medium"> x{g.count}</Text>
                )}
              </Text>
              <Text className="font-mono text-[10px] text-muted-foreground">
                {g.food.portionAmount ?? ''}{g.food.portionUnit ?? ''}
              </Text>
              <Text className="font-mono text-[10px] text-muted-foreground w-16 text-right">
                {Math.round(g.food.calories * g.count)} kcal
              </Text>
            </View>
          ))}

          {/* Action buttons */}
          {(showDelete || showDuplicate || showEdit) && (
            <View className="flex-row justify-end gap-1 pt-1 mt-1 border-t border-border/30">
              {showEdit && (
                <Pressable
                  onPress={() => onEdit(entry)}
                  className="flex-row items-center gap-1.5 rounded-lg px-3 py-1.5 active:bg-sky-400/10"
                >
                  <Pencil size={13} color="#38bdf8" />
                  <Text className="font-mono text-[10px] text-sky-400 tracking-wider">
                    {t('common.edit', { defaultValue: 'Editar' }).toUpperCase()}
                  </Text>
                </Pressable>
              )}
              {showDuplicate && (
                <Pressable
                  onPress={() => onDuplicate(entry)}
                  className="flex-row items-center gap-1.5 rounded-lg px-3 py-1.5 active:bg-lime-400/10"
                >
                  <Copy size={13} color="#a3e635" />
                  <Text className="font-mono text-[10px] text-lime-400 tracking-wider">
                    {t('nutrition.duplicate', { defaultValue: 'Duplicar' }).toUpperCase()}
                  </Text>
                </Pressable>
              )}
              {showDelete && (
                <Pressable
                  onPress={() => onDelete(entry)}
                  className="flex-row items-center gap-1.5 rounded-lg px-3 py-1.5 active:bg-red-500/10"
                >
                  <Trash2 size={13} color="#f87171" />
                  <Text className="font-mono text-[10px] text-red-400 tracking-wider">
                    {t('common.delete', { defaultValue: 'Eliminar' }).toUpperCase()}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  )
})

// ─── Main component ──────────────────────────────────────────────────────────

function NutritionDashboard({
  dailyTotals,
  goals,
  entries,
  onDeleteEntry,
  onDuplicateEntry,
  onEditEntry,
  selectedDate,
  dailyQualityScore,
  activeCalories = 0,
}: NutritionDashboardProps) {
  const { t } = useTranslation()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const isToday = !selectedDate || selectedDate === todayStr()
  // Calorías activas del reloj amplían el budget del día (modelo "comes lo que
  // quemas"). El target visual del anillo sube con ellas.
  const burn = Math.max(0, Math.round(activeCalories))
  const effectiveTarget = goals.dailyCalories + burn

  // Stable callbacks so memoized MealCards only re-render when their own props change.
  const handleToggle = useCallback((id: string) => {
    setExpandedId(prev => (prev === id ? null : id))
  }, [])

  const handleDelete = useCallback((entry: NutritionEntry) => {
    if (!onDeleteEntry || !entry.id) return
    Alert.alert(
      t('nutrition.deleteMeal', { defaultValue: 'Eliminar comida' }),
      t('nutrition.deleteMealConfirm', { defaultValue: '¿Eliminar este registro de comida?' }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancelar' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Eliminar' }),
          style: 'destructive',
          onPress: () => onDeleteEntry(entry.id!),
        },
      ]
    )
  }, [onDeleteEntry, t])

  const handleDuplicate = useCallback((entry: NutritionEntry) => {
    onDuplicateEntry?.(entry)
  }, [onDuplicateEntry])

  const handleEdit = useCallback((entry: NutritionEntry) => {
    onEditEntry?.(entry)
  }, [onEditEntry])

  // Contextual empty-state message
  const emptyMessage = isToday
    ? (() => {
        const hour = localHour()
        if (hour < 10) return t('nutrition.whatBreakfast', { defaultValue: '¿Qué desayunaste hoy?' })
        if (hour < 15) return t('nutrition.didYouLunch', { defaultValue: '¿Ya almorzaste?' })
        return t('nutrition.whatDidYouEat', { defaultValue: '¿Qué comiste hoy?' })
      })()
    : t('nutrition.noRecordsToday', { defaultValue: 'Sin registros este día' })

  return (
    <View className="gap-5">
      {/* ── Summary card: calorie ring + macro bars ────────────────────── */}
      <Card>
        <CardContent className="py-5 gap-4">
          {/* Calorie ring centered above the bars */}
          <View className="items-center">
            <MacroRing
              consumed={dailyTotals.calories}
              target={effectiveTarget}
              dailyScore={dailyQualityScore}
            />
            {burn > 0 && (
              <Text className="mt-2 font-mono text-[11px] tracking-wide text-lime-400">
                🔥 +{burn} kcal {t('nutrition.fromActivity', { defaultValue: 'por actividad' })}
              </Text>
            )}
          </View>

          {/* Macro bars */}
          <View className="gap-3">
            <MacroBar
              label={t('nutrition.protein', { defaultValue: 'Proteína' })}
              current={dailyTotals.protein}
              target={goals.dailyProtein}
              color="bg-sky-400"
            />
            <MacroBar
              label={t('nutrition.carbs', { defaultValue: 'Carbos' })}
              current={dailyTotals.carbs}
              target={goals.dailyCarbs}
              color="bg-amber-400"
            />
            <MacroBar
              label={t('nutrition.fat', { defaultValue: 'Grasa' })}
              current={dailyTotals.fat}
              target={goals.dailyFat}
              color="bg-pink-400"
            />
          </View>
        </CardContent>
      </Card>

      {/* ── Meal entries ──────────────────────────────────────────────────── */}
      <View>
        {/* Section label */}
        <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground mb-3">
          {isToday
            ? t('nutrition.mealsToday', { defaultValue: 'Comidas de hoy' })
            : t('nutrition.mealsOfDay', { defaultValue: 'Comidas del día' })}
        </Text>

        {entries.length === 0 ? (
          /* Empty state */
          <View className="py-10 items-center gap-2">
            <Text className="font-sans text-sm text-muted-foreground text-center">
              {emptyMessage}
            </Text>
            {isToday && (
              <Text className="font-sans text-xs text-muted-foreground/60 text-center">
                {t('nutrition.useButtonToLog', { defaultValue: 'Usa el botón + para registrar' })}
              </Text>
            )}
          </View>
        ) : (
          /* Meal list */
          <View>
            {entries.map((entry, idx) => {
              const entryId = entry.id ?? `entry-${idx}`
              return (
                <MealCard
                  key={entryId}
                  entry={entry}
                  entryId={entryId}
                  expanded={expandedId === entryId}
                  showDelete={!!onDeleteEntry && !!entry.id}
                  // Quick-add always lands on TODAY (logged_at is server-stamped),
                  // so duplicating a past-day meal would silently misfile it. Only
                  // offer Duplicate while viewing today.
                  showDuplicate={!!onDuplicateEntry && !!entry.id && isToday}
                  showEdit={!!onEditEntry && !!entry.id}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  onEdit={handleEdit}
                />
              )
            })}
          </View>
        )}
      </View>
    </View>
  )
}

export default memo(NutritionDashboard)
