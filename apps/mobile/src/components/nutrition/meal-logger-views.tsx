/**
 * Presentational sub-components for the MealLogger. Pure: they take data + callbacks
 * (and `t`) as props and render — no state machine knowledge.
 */
import { View, ScrollView, TextInput, Pressable } from 'react-native'
import { X, ChevronLeft, Search } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import type { FoodItem, NutritionEntry, DailyTotals, NutritionGoal, MealType } from '@calistenia/core/types'

import { type EditingMacro, type MacroField, type MealTotals, MEAL_OPTIONS } from './meal-logger-shared'

type Translate = (key: string) => string

// ── Meal type selector (segmented) ────────────────────────────────────────────

export function MealTypeSelector({
  value,
  onChange,
  t,
}: {
  value: MealType
  onChange: (v: MealType) => void
  t: Translate
}) {
  return (
    <View className="flex-row gap-1.5 p-1 bg-muted/50 rounded-xl">
      {MEAL_OPTIONS.map((opt) => (
        <Pressable
          key={opt.id}
          onPress={() => onChange(opt.id)}
          className={cn(
            'flex-1 items-center gap-0.5 py-2 rounded-lg',
            value === opt.id ? 'bg-background shadow-sm' : 'active:bg-background/50',
          )}
        >
          <Text className="text-base leading-none">{opt.icon}</Text>
          <Text className="font-mono text-[10px] tracking-wide text-muted-foreground">
            {t(opt.labelKey)}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

// ── Input method card ──────────────────────────────────────────────────────────

export function InputMethodCard({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-col items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-border bg-muted/20 active:border-lime-400/40 active:bg-lime-400/5"
      style={{ width: '47%' }}
    >
      {icon}
      <Text className="font-mono text-[10px] tracking-wide text-muted-foreground">{label}</Text>
    </Pressable>
  )
}

// ── Repeat meal picker ─────────────────────────────────────────────────────────

interface RepeatMealViewProps {
  entries: NutritionEntry[]
  allEntries: NutritionEntry[]
  searchValue: string
  onSearchChange: (v: string) => void
  typeFilter: MealType | ''
  onTypeFilterChange: (v: MealType | '') => void
  onSelect: (entry: NutritionEntry) => void
  onBack: () => void
  t: Translate
}

export function RepeatMealView({
  entries,
  allEntries,
  searchValue,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  onSelect,
  onBack,
  t,
}: RepeatMealViewProps) {
  return (
    <View className="gap-3">
      {/* Header */}
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={onBack}
          className="size-9 items-center justify-center rounded-lg active:bg-muted"
        >
          <ChevronLeft size={20} color="#a1a1aa" />
        </Pressable>
        <Text className="font-bebas text-lg tracking-wide text-foreground">
          {t('nutrition.logger.recentMeals')}
        </Text>
      </View>

      {/* Search */}
      {allEntries.length > 0 && (
        <>
          <View className="flex-row items-center gap-2 px-3 py-2 rounded-xl border border-border bg-muted/30">
            <Search size={14} color="#71717a" />
            <TextInput
              value={searchValue}
              onChangeText={onSearchChange}
              placeholder={t('nutrition.logger.recentMeals')}
              placeholderTextColor="#52525b"
              className="flex-1 font-sans text-sm text-foreground"
              style={{ fontSize: 14 }}
            />
            {searchValue.length > 0 && (
              <Pressable onPress={() => onSearchChange('')} className="p-0.5">
                <X size={14} color="#71717a" />
              </Pressable>
            )}
          </View>

          {/* Type filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5 px-0.5">
            {(['', ...MEAL_OPTIONS.map((m) => m.id)] as const).map((type) => (
              <Pressable
                key={type || 'all'}
                onPress={() => onTypeFilterChange(type as MealType | '')}
                className={cn(
                  'px-2.5 py-1 rounded-full border',
                  typeFilter === type
                    ? 'bg-lime-400/15 border-lime-400/40'
                    : 'bg-muted/30 border-border active:border-lime-400/20',
                )}
                style={{ minHeight: 28, justifyContent: 'center' }}
              >
                <Text
                  className={cn(
                    'font-mono text-[11px]',
                    typeFilter === type ? 'text-lime-400' : 'text-muted-foreground',
                  )}
                >
                  {type ? t(MEAL_OPTIONS.find((m) => m.id === type)!.labelKey) : 'Todo'}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      {/* Entries list */}
      {entries.length === 0 ? (
        <View className="py-12 items-center gap-2">
          <Text className="text-3xl">🍽️</Text>
          <Text className="font-sans text-sm text-muted-foreground">
            {t('nutrition.logger.noRecentMeals')}
          </Text>
        </View>
      ) : (
        <View className="gap-2">
          {entries.map((entry, i) => (
            <Pressable
              key={entry.id || i}
              onPress={() => onSelect(entry)}
              className="p-3.5 bg-muted/30 border border-border rounded-xl active:border-lime-400/30 active:bg-lime-400/[0.03] gap-1.5"
            >
              <View className="flex-row items-center justify-between">
                <View className="px-2 py-0.5 rounded-full bg-muted">
                  <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {entry.mealType}
                  </Text>
                </View>
                <Text className="font-mono text-[10px] text-muted-foreground tabular-nums">
                  {new Date(entry.loggedAt).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                </Text>
              </View>
              <Text className="font-sans text-sm text-foreground" numberOfLines={1}>
                {entry.foods.map((f) => f.name).filter(Boolean).join(', ') || '—'}
              </Text>
              <View className="flex-row gap-3">
                <Text className="font-sans-medium text-xs text-foreground/80 tabular-nums">
                  {Math.round(entry.totalCalories)} kcal
                </Text>
                <Text className="font-sans text-xs text-sky-500 tabular-nums">
                  P {Math.round(entry.totalProtein)}g
                </Text>
                <Text className="font-sans text-xs text-amber-400 tabular-nums">
                  C {Math.round(entry.totalCarbs)}g
                </Text>
                <Text className="font-sans text-xs text-pink-500 tabular-nums">
                  G {Math.round(entry.totalFat)}g
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

// ── Food item card (editable) ──────────────────────────────────────────────────

const FOOD_CARD_MACROS = [
  { field: 'calories' as const, label: 'kcal', color: 'text-foreground', suffix: ' kcal', isInt: true },
  { field: 'protein' as const, label: 'P', color: 'text-sky-500', suffix: 'g P', isInt: false },
  { field: 'carbs' as const, label: 'C', color: 'text-amber-400', suffix: 'g C', isInt: false },
  { field: 'fat' as const, label: 'G', color: 'text-pink-500', suffix: 'g G', isInt: false },
] as const

interface FoodItemCardProps {
  food: FoodItem
  index: number
  editingMacro: EditingMacro
  editingMacroValue: string
  onEditingMacroChange: (v: EditingMacro) => void
  onEditingMacroValueChange: (v: string) => void
  onCommitMacro: (index: number, field: MacroField, raw: string) => void
  onUpdateFood: (index: number, field: keyof FoodItem, value: string | number) => void
  onRemove: (index: number) => void
  t: Translate
}

export function FoodItemCard({
  food,
  index,
  editingMacro,
  editingMacroValue,
  onEditingMacroChange,
  onEditingMacroValueChange,
  onCommitMacro,
  onUpdateFood,
  onRemove,
  t,
}: FoodItemCardProps) {
  return (
    <View className="rounded-xl border border-border bg-muted/20 overflow-hidden">
      {/* Food name + remove */}
      <View className="flex-row items-center gap-2 p-3 pb-2">
        <TextInput
          value={food.name}
          onChangeText={(v) => onUpdateFood(index, 'name', v)}
          placeholder="Nombre del alimento"
          placeholderTextColor="#52525b"
          className="flex-1 font-sans text-base text-foreground"
          style={{ fontSize: 15 }}
        />
        <Pressable
          onPress={() => onRemove(index)}
          className="size-9 items-center justify-center rounded-lg active:bg-red-400/10"
          accessibilityLabel={`${t('common.delete')} ${food.name}`}
        >
          <X size={14} color="#71717a" />
        </Pressable>
      </View>

      {/* Portion info (read-only display — portion editing is simplified for mobile) */}
      <View className="px-3 pb-2 flex-row items-center gap-1">
        <Text className="font-mono text-[11px] text-muted-foreground">
          {food.portionAmount}{food.portionUnit}
        </Text>
        {food.portionNote ? (
          <Text className="font-sans text-[11px] text-muted-foreground/60">· {food.portionNote}</Text>
        ) : null}
      </View>

      {/* Macros row — tappable to edit */}
      <View className="px-3 py-2 bg-muted/30 border-t border-border/50 flex-row items-center gap-1 flex-wrap">
        {FOOD_CARD_MACROS.map((macro) => {
          const isEditing = editingMacro?.index === index && editingMacro?.field === macro.field
          const rawVal = Number(food[macro.field]) || 0
          const displayVal = macro.isInt ? Math.round(rawVal) : Math.round(rawVal * 10) / 10

          if (isEditing) {
            return (
              <TextInput
                key={macro.field}
                value={editingMacroValue}
                onChangeText={onEditingMacroValueChange}
                onBlur={() => onCommitMacro(index, macro.field, editingMacroValue)}
                onSubmitEditing={() => onCommitMacro(index, macro.field, editingMacroValue)}
                keyboardType="decimal-pad"
                autoFocus
                selectTextOnFocus
                className={cn('w-16 h-8 text-base px-1 rounded-lg border border-lime-400/40 bg-background text-center tabular-nums', macro.color)}
                style={{ fontSize: 14 }}
              />
            )
          }

          return (
            <Pressable
              key={macro.field}
              onPress={() => {
                onEditingMacroChange({ index, field: macro.field })
                onEditingMacroValueChange(String(displayVal))
              }}
              className={cn('px-2 py-1.5 rounded-lg active:bg-muted/60', 'min-h-[36px] items-center justify-center')}
            >
              <Text className={cn('font-sans text-xs tabular-nums', macro.color)}>
                {displayVal}{macro.suffix}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

// ── Daily progress bar ─────────────────────────────────────────────────────────

export function DailyProgressBar({
  dailyTotals,
  mealTotals,
  goals,
  t,
}: {
  dailyTotals: DailyTotals
  mealTotals: MealTotals
  goals: NutritionGoal
  t: Translate
}) {
  const totalCal = dailyTotals.calories + mealTotals.calories
  const pct = goals.dailyCalories > 0 ? Math.min(totalCal / goals.dailyCalories, 1) : 0
  const over = totalCal > goals.dailyCalories

  return (
    <View className="p-3 rounded-xl bg-muted/30 border border-border/50 gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {t('nutrition.today') || 'Hoy'}
        </Text>
        <Text className={cn('font-bebas text-sm tabular-nums', over ? 'text-red-400' : 'text-foreground')}>
          {Math.round(totalCal)} / {Math.round(goals.dailyCalories)} kcal
        </Text>
      </View>
      <View className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
        <View
          className={cn('h-full rounded-full', over ? 'bg-red-400' : 'bg-lime-400')}
          style={{ width: `${pct * 100}%` }}
        />
      </View>
    </View>
  )
}

// ── Totals summary ─────────────────────────────────────────────────────────────

export function TotalsSummary({
  totals,
  t,
}: {
  totals: MealTotals
  t: Translate
}) {
  return (
    <View className="p-4 bg-muted/40 rounded-xl border border-border/50 gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Total</Text>
        <Text className="font-bebas text-2xl tabular-nums text-foreground">
          {Math.round(totals.calories)} kcal
        </Text>
      </View>
      <View className="flex-row gap-3">
        <MacroCell value={totals.protein} label={t('nutrition.protein')} color="text-sky-500" />
        <MacroCell value={totals.carbs} label={t('nutrition.carbs')} color="text-amber-400" />
        <MacroCell value={totals.fat} label={t('nutrition.fat')} color="text-pink-500" />
      </View>
    </View>
  )
}

// ── Macro cell ─────────────────────────────────────────────────────────────────

export function MacroCell({
  value,
  label,
  color,
}: {
  value: number
  label: string
  color: string
}) {
  return (
    <View className="flex-1 items-center p-2 bg-background/50 rounded-lg gap-0.5">
      <Text className={cn('font-bebas text-lg tabular-nums', color)}>{Math.round(value)}g</Text>
      <Text className="font-mono text-[9px] tracking-wide text-muted-foreground">{label}</Text>
    </View>
  )
}
