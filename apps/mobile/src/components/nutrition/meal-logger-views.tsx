/**
 * Presentational sub-components for the MealLogger. Pure: they take data + callbacks
 * (and `t`) as props and render — no state machine knowledge.
 */
import { useEffect, useState } from 'react'
import { View, ScrollView, TextInput, Pressable } from 'react-native'
import { X, ChevronLeft, Search } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import type { FoodItem, NutritionEntry, DailyTotals, NutritionGoal, MealType, PortionUnit } from '@calistenia/core/types'
import { parsePortionAmountInput, resolveUnitWeight } from '@calistenia/core/lib/macro-calc'

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
            // active: estático (presente desde el render inicial) — si se añade
            // tras el primer render, css-interop "upgradea" View→Pressable y su
            // warning de dev hace stringify(props) que crashea al tocar el getter
            // de NavigationContext. Constante = sin upgrade, sin remount.
            'flex-1 items-center gap-0.5 py-2 rounded-lg active:bg-background/50',
            value === opt.id ? 'bg-background shadow-sm' : '',
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

// ── Meal timing (finish time + duration) ──────────────────────────────────────

function clampTimePart(v: string, max: number): string {
  const n = parseInt(v, 10)
  if (isNaN(n)) return ''
  return String(Math.min(max, Math.max(0, n))).padStart(2, '0')
}

export function MealTimingRow({
  hour,
  minute,
  duration,
  onHourChange,
  onMinuteChange,
  onDurationChange,
  t,
}: {
  hour: string
  minute: string
  duration: string
  onHourChange: (v: string) => void
  onMinuteChange: (v: string) => void
  onDurationChange: (v: string) => void
  t: Translate
}) {
  return (
    <View className="flex-row items-center gap-4 p-3 rounded-xl bg-muted/30 border border-border/50">
      {/* Finish time */}
      <View className="gap-1">
        <Text className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {t('nutrition.logger.finishedAt')}
        </Text>
        <View className="flex-row items-center">
          <TextInput
            value={hour}
            onChangeText={(v) => onHourChange(v.replace(/[^0-9]/g, ''))}
            onBlur={() => onHourChange(clampTimePart(hour, 23))}
            keyboardType="number-pad"
            maxLength={2}
            accessibilityLabel={t('nutrition.logger.finishedAt')}
            className="w-12 h-10 text-center rounded-lg bg-background text-foreground font-bebas"
            style={{ fontSize: 20 }}
          />
          <Text className="font-bebas text-xl text-muted-foreground mx-1">:</Text>
          <TextInput
            value={minute}
            onChangeText={(v) => onMinuteChange(v.replace(/[^0-9]/g, ''))}
            onBlur={() => onMinuteChange(clampTimePart(minute, 59))}
            keyboardType="number-pad"
            maxLength={2}
            className="w-12 h-10 text-center rounded-lg bg-background text-foreground font-bebas"
            style={{ fontSize: 20 }}
          />
        </View>
      </View>

      {/* Duration (optional) */}
      <View className="gap-1 flex-1">
        <Text className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {t('nutrition.logger.duration')}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <TextInput
            value={duration}
            onChangeText={(v) => onDurationChange(v.replace(/[^0-9]/g, '').slice(0, 3))}
            keyboardType="number-pad"
            maxLength={3}
            placeholder="—"
            placeholderTextColor="#52525b"
            className="w-16 h-10 text-center rounded-lg bg-background text-foreground font-bebas"
            style={{ fontSize: 20 }}
          />
          <Text className="font-mono text-[11px] text-muted-foreground">
            {t('nutrition.logger.durationUnit')}
          </Text>
        </View>
      </View>
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

// ── Portion editor (cantidad + unidad + presets) ───────────────────────────────

const PORTION_UNITS: { value: PortionUnit; label: string }[] = [
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
  { value: 'ml', label: 'ml' },
  { value: 'L', label: 'L' },
  { value: 'oz', label: 'oz' },
  { value: 'unidad', label: 'ud' },
]

const PORTION_PRESETS: Record<PortionUnit, number[]> = {
  g: [50, 100, 150, 200, 250],
  kg: [0.5, 1, 1.5, 2],
  ml: [100, 200, 250, 330, 500],
  L: [0.25, 0.5, 1, 1.5],
  oz: [2, 4, 6, 8],
  unidad: [1, 2, 3, 4, 5],
}

/** Cantidad para el input, sin ceros colgantes ("2.50" → "2.5"). */
const fmtAmount = (v: number) => String(Math.round((Number(v) || 0) * 100) / 100)

/**
 * Control primario de la card: el usuario edita la porción (cantidad + unidad
 * + g/ud cuando la unidad es `unidad`) y los macros se recalculan solos vía
 * `onPortionChange` → `calcMacros`. Puerto nativo del PortionInput de web,
 * sin slider (cantidad + presets bastan en móvil).
 */
function PortionEditor({
  food,
  index,
  onPortionChange,
  t,
}: {
  food: FoodItem
  index: number
  onPortionChange: (index: number, amount: number, unit: PortionUnit, unitWeight: number) => void
  t: Translate
}) {
  const [showUnits, setShowUnits] = useState(false)
  // Texto local de los inputs: deja teclear "2," o borrar sin que el valor
  // controlado pelee; se propaga el número parseado en cada cambio.
  const [amountText, setAmountText] = useState(() => fmtAmount(food.portionAmount))
  const [weightText, setWeightText] = useState(() => fmtAmount(food.unitWeightInGrams))

  const amount = Number(food.portionAmount) || 0
  const unitWeight = Number(food.unitWeightInGrams) || 0

  // Sincroniza el texto local cuando la porción cambia desde fuera (presets,
  // selección de alimento, carga para edición).
  useEffect(() => {
    if (parsePortionAmountInput(amountText) !== (Number(food.portionAmount) || 0)) {
      setAmountText(fmtAmount(food.portionAmount))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [food.portionAmount])

  useEffect(() => {
    if (parsePortionAmountInput(weightText) !== (Number(food.unitWeightInGrams) || 0)) {
      setWeightText(fmtAmount(food.unitWeightInGrams))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [food.unitWeightInGrams])

  const unitLabel = PORTION_UNITS.find((u) => u.value === food.portionUnit)?.label ?? food.portionUnit
  const presets = PORTION_PRESETS[food.portionUnit] ?? PORTION_PRESETS.g
  const totalGrams = amount * unitWeight

  return (
    <View className="px-3 pb-2 gap-1.5">
      {/* Fila principal: cantidad (control primario, a la izquierda) + unidad + g/ud */}
      <View className="flex-row items-center gap-2">
        <TextInput
          value={amountText}
          onChangeText={(v) => {
            const clean = v.replace(/[^0-9.,]/g, '')
            setAmountText(clean)
            onPortionChange(index, parsePortionAmountInput(clean), food.portionUnit, food.unitWeightInGrams)
          }}
          onBlur={() => setAmountText(fmtAmount(food.portionAmount))}
          keyboardType="decimal-pad"
          selectTextOnFocus
          accessibilityLabel={t('nutrition.logger.portionAmount')}
          className="w-20 h-10 text-center rounded-lg bg-background border border-border text-foreground font-bebas tabular-nums"
          style={{ fontSize: 18 }}
        />
        <Pressable
          onPress={() => setShowUnits((s) => !s)}
          accessibilityRole="button"
          accessibilityLabel={t('nutrition.logger.portionUnit')}
          className={cn(
            'h-10 min-w-[44px] px-3 items-center justify-center rounded-lg border active:bg-muted/50',
            showUnits ? 'border-lime-400/50 bg-lime-400/10' : 'border-border',
          )}
        >
          <Text className={cn('font-mono text-xs tracking-wide', showUnits ? 'text-lime-400' : 'text-muted-foreground')}>
            {unitLabel}
          </Text>
        </Pressable>
        {food.portionUnit === 'unidad' && (
          <View className="flex-row items-center gap-1">
            <TextInput
              value={weightText}
              onChangeText={(v) => {
                const clean = v.replace(/[^0-9.,]/g, '')
                setWeightText(clean)
                // Solo propaga pesos válidos: 0 mientras se teclea dejaría los macros en 0.
                const parsed = parsePortionAmountInput(clean)
                if (parsed > 0) onPortionChange(index, amount, food.portionUnit, parsed)
              }}
              onBlur={() => setWeightText(fmtAmount(food.unitWeightInGrams))}
              keyboardType="decimal-pad"
              selectTextOnFocus
              accessibilityLabel="g/ud"
              className="w-14 h-10 text-center rounded-lg bg-background border border-border text-foreground font-sans text-sm tabular-nums"
              style={{ fontSize: 13 }}
            />
            <Text className="font-mono text-[10px] text-muted-foreground">g/ud</Text>
          </View>
        )}
        {food.portionUnit === 'unidad' && totalGrams > 0 ? (
          <Text className="font-mono text-[10px] text-muted-foreground/60 ml-auto tabular-nums">
            ≈ {Math.round(totalGrams)}g
          </Text>
        ) : null}
      </View>

      {/* Selector de unidad (chips inline — sin overlay flotante, robusto en el Modal nativo) */}
      {showUnits && (
        <View className="flex-row gap-1.5 flex-wrap">
          {PORTION_UNITS.map((u) => (
            <Pressable
              key={u.value}
              onPress={() => {
                onPortionChange(index, amount, u.value, resolveUnitWeight(u.value, unitWeight))
                setShowUnits(false)
              }}
              className={cn(
                'px-3 rounded-lg border active:bg-muted/50',
                food.portionUnit === u.value ? 'border-lime-400/50 bg-lime-400/10' : 'border-border',
              )}
              style={{ minHeight: 36, justifyContent: 'center' }}
            >
              <Text
                className={cn(
                  'font-mono text-xs',
                  food.portionUnit === u.value ? 'text-lime-400' : 'text-muted-foreground',
                )}
              >
                {u.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Presets por unidad */}
      <View className="flex-row gap-1.5 flex-wrap">
        {presets.map((preset) => (
          <Pressable
            key={preset}
            onPress={() => onPortionChange(index, preset, food.portionUnit, food.unitWeightInGrams)}
            className={cn(
              'px-3 rounded-full border active:bg-muted/50',
              amount === preset ? 'border-lime-400 bg-lime-400/10' : 'border-border',
            )}
            style={{ minHeight: 32, justifyContent: 'center' }}
          >
            <Text
              className={cn(
                'font-mono text-[11px] tabular-nums',
                amount === preset ? 'text-lime-400' : 'text-muted-foreground',
              )}
            >
              {preset}
              {unitLabel}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Nota de porción de la IA — truncada (#336): datos viejos pueden traer citas largas */}
      {food.portionNote ? (
        <Text numberOfLines={2} className="font-sans text-[11px] text-muted-foreground/60 italic">
          {food.portionNote}
        </Text>
      ) : null}
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
  onPortionChange: (index: number, amount: number, unit: PortionUnit, unitWeight: number) => void
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
  onPortionChange,
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

      {/* Porción editable — control primario: cambiarla recalcula los macros */}
      <PortionEditor food={food} index={index} onPortionChange={onPortionChange} t={t} />

      {/* Macros row — resultado derivado; tappable como edición secundaria */}
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
