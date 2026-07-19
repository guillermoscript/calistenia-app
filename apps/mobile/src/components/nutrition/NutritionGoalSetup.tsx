/**
 * NutritionGoalSetup — wizard de 4 pasos para configurar metas nutricionales.
 * Port móvil de apps/web/src/components/nutrition/NutritionGoalSetup.tsx
 */
import { useState } from 'react'
import { View, ScrollView, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { NutritionGoal, NutritionGoalType, ActivityLevel, Sex } from '@calistenia/core/types'

// ─── Types ──────────────────────────────────────────────────────────────────

interface NutritionGoalSetupProps {
  onSave: (goals: NutritionGoal) => Promise<void>
  /** Provided only in edit-mode (goals already exist) — shows a "Cancelar" escape hatch. */
  onCancel?: () => void
  calculateMacros: (
    weight: number,
    height: number,
    age: number,
    sex: string,
    activityLevel: string,
    goal: string,
    pace?: string
  ) => { dailyCalories: number; dailyProtein: number; dailyCarbs: number; dailyFat: number }
  initialWeight?: number
  initialHeight?: number
  initialAge?: number
  initialSex?: 'male' | 'female'
  initialActivityLevel?: string
  initialGoal?: string
  initialPace?: string
}

// ─── Static data ─────────────────────────────────────────────────────────────

const ACTIVITY_LEVELS: { id: ActivityLevel; label: string }[] = [
  { id: 'sedentary',  label: 'Sedentario' },
  { id: 'light',      label: 'Ligero' },
  { id: 'moderate',   label: 'Moderado' },
  { id: 'active',     label: 'Activo' },
  { id: 'very_active', label: 'Muy activo' },
]

const GOALS: { id: NutritionGoalType; label: string }[] = [
  { id: 'muscle_gain', label: 'Ganar músculo' },
  { id: 'fat_loss',    label: 'Perder grasa' },
  { id: 'recomp',      label: 'Recomposición' },
  { id: 'maintain',    label: 'Mantener' },
]

const PACES: { id: string; label: string }[] = [
  { id: 'gradual',    label: 'Gradual' },
  { id: 'balanced',   label: 'Equilibrado' },
  { id: 'aggressive', label: 'Agresivo' },
]

const TOTAL_STEPS = 4

// ─── Selector chip ───────────────────────────────────────────────────────────

function SelectorChip({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'flex-1 items-center justify-center rounded-lg border px-3 py-3',
        selected
          ? 'border-lime-400 bg-lime-400/15'
          : 'border-border bg-card'
      )}
    >
      <Text
        className={cn(
          'font-mono text-xs tracking-wider',
          selected ? 'text-lime-400' : 'text-muted-foreground'
        )}
      >
        {label.toUpperCase()}
      </Text>
    </Pressable>
  )
}

// ─── Progress bar ────────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: number }) {
  return (
    <View className="flex-row gap-1.5 mb-6">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View
          key={i}
          className={cn(
            'flex-1 h-1 rounded-full',
            i < step ? 'bg-lime-400' : 'bg-muted'
          )}
        />
      ))}
    </View>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function NutritionGoalSetup({
  onSave,
  onCancel,
  calculateMacros,
  initialWeight,
  initialHeight,
  initialAge,
  initialSex,
  initialActivityLevel,
  initialGoal,
  initialPace,
}: NutritionGoalSetupProps) {
  const { t } = useTranslation()

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  // Step 0: body data
  const [weight, setWeight] = useState(initialWeight ? String(initialWeight) : '')
  const [height, setHeight] = useState(initialHeight ? String(initialHeight) : '')
  const [age, setAge] = useState(initialAge ? String(initialAge) : '')

  // Step 0 also: sex
  const [sex, setSex] = useState<Sex>(initialSex ?? 'male')

  // Step 1: activity
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(
    (initialActivityLevel as ActivityLevel) ?? 'moderate'
  )

  // Step 2: goal + pace
  const [goal, setGoal] = useState<NutritionGoalType>(
    (initialGoal as NutritionGoalType) ?? 'muscle_gain'
  )
  const [pace, setPace] = useState<string>(initialPace ?? 'balanced')

  // Step 3: calculated macros (editable)
  const [macros, setMacros] = useState({
    dailyCalories: 0,
    dailyProtein: 0,
    dailyCarbs: 0,
    dailyFat: 0,
  })

  const canProceed = () => {
    if (step === 0) return weight !== '' && height !== '' && age !== ''
    return true
  }

  const handleNext = () => {
    if (step === 2) {
      // Calculate macros before showing review step
      const result = calculateMacros(
        parseFloat(weight),
        parseFloat(height),
        parseInt(age, 10),
        sex,
        activityLevel,
        goal,
        pace
      )
      setMacros(result)
    }
    setStep(s => s + 1)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        ...macros,
        goal,
        weight: parseFloat(weight),
        height: parseFloat(height),
        age: parseInt(age, 10),
        sex,
        activityLevel,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <View className="flex-1">
      {/* Header */}
      <View className="px-4 pt-4 pb-2">
        <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground mb-1">
          CONFIGURACIÓN
        </Text>
        <Text className="font-bebas text-4xl leading-none text-foreground">
          {t('nutrition.setup.title', { defaultValue: 'OBJETIVOS NUTRICIONALES' })}
        </Text>
      </View>

      <View className="px-4">
        <StepIndicator step={step} />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-6 gap-4"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Step counter */}
        <Text className="font-mono text-[10px] text-muted-foreground tracking-widest">
          {step + 1} / {TOTAL_STEPS}
        </Text>

        {/* ── STEP 0: Datos corporales + sexo ─────────────────────────────── */}
        {step === 0 && (
          <Card>
            <CardContent className="py-5 gap-4">
              <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                {t('nutrition.setup.bodyData', { defaultValue: 'DATOS CORPORALES' })}
              </Text>

              {/* Weight */}
              <View className="gap-1">
                <Text className="font-mono text-xs text-muted-foreground tracking-wider">
                  {t('nutrition.setup.weight', { defaultValue: 'Peso (kg)' }).toUpperCase()}
                </Text>
                <Input
                  keyboardType="numeric"
                  placeholder="70"
                  value={weight}
                  onChangeText={setWeight}
                  returnKeyType="next"
                />
              </View>

              {/* Height */}
              <View className="gap-1">
                <Text className="font-mono text-xs text-muted-foreground tracking-wider">
                  {t('nutrition.setup.height', { defaultValue: 'Altura (cm)' }).toUpperCase()}
                </Text>
                <Input
                  keyboardType="numeric"
                  placeholder="175"
                  value={height}
                  onChangeText={setHeight}
                  returnKeyType="next"
                />
              </View>

              {/* Age */}
              <View className="gap-1">
                <Text className="font-mono text-xs text-muted-foreground tracking-wider">
                  {t('nutrition.setup.age', { defaultValue: 'Edad' }).toUpperCase()}
                </Text>
                <Input
                  keyboardType="numeric"
                  placeholder="25"
                  value={age}
                  onChangeText={setAge}
                  returnKeyType="done"
                />
              </View>

              {/* Sex */}
              <View className="gap-2">
                <Text className="font-mono text-xs text-muted-foreground tracking-wider">
                  {t('nutrition.setup.sex', { defaultValue: 'Sexo' }).toUpperCase()}
                </Text>
                <View className="flex-row gap-3">
                  {(['male', 'female'] as Sex[]).map(s => (
                    <Pressable
                      key={s}
                      onPress={() => setSex(s)}
                      className={cn(
                        'flex-1 items-center justify-center rounded-lg border py-4 gap-1',
                        sex === s
                          ? 'border-lime-400 bg-lime-400/15'
                          : 'border-border bg-card'
                      )}
                    >
                      <Text className="text-2xl">{s === 'male' ? '♂' : '♀'}</Text>
                      <Text
                        className={cn(
                          'font-sans-medium text-sm',
                          sex === s ? 'text-lime-400' : 'text-foreground'
                        )}
                      >
                        {s === 'male'
                          ? t('nutrition.setup.male', { defaultValue: 'Masculino' })
                          : t('nutrition.setup.female', { defaultValue: 'Femenino' })}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </CardContent>
          </Card>
        )}

        {/* ── STEP 1: Actividad ────────────────────────────────────────────── */}
        {step === 1 && (
          <Card>
            <CardContent className="py-5 gap-3">
              <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                {t('nutrition.setup.activityLevel', { defaultValue: 'Nivel de Actividad' }).toUpperCase()}
              </Text>

              {ACTIVITY_LEVELS.map(level => (
                <Pressable
                  key={level.id}
                  onPress={() => setActivityLevel(level.id)}
                  className={cn(
                    'rounded-lg border px-4 py-3',
                    activityLevel === level.id
                      ? 'border-lime-400 bg-lime-400/15'
                      : 'border-border bg-card'
                  )}
                >
                  <Text
                    className={cn(
                      'font-sans-medium text-sm',
                      activityLevel === level.id ? 'text-lime-400' : 'text-foreground'
                    )}
                  >
                    {level.label}
                  </Text>
                </Pressable>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── STEP 2: Objetivo + ritmo ─────────────────────────────────────── */}
        {step === 2 && (
          <>
            <Card>
              <CardContent className="py-5 gap-3">
                <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                  {t('nutrition.setup.objective', { defaultValue: 'Objetivo' }).toUpperCase()}
                </Text>

                <View className="flex-row flex-wrap gap-2">
                  {GOALS.map(g => (
                    <Pressable
                      key={g.id}
                      onPress={() => setGoal(g.id)}
                      className={cn(
                        'rounded-lg border px-4 py-3',
                        goal === g.id
                          ? 'border-lime-400 bg-lime-400/15'
                          : 'border-border bg-card',
                        'min-w-[45%] flex-1'
                      )}
                    >
                      <Text
                        className={cn(
                          'font-sans-medium text-sm',
                          goal === g.id ? 'text-lime-400' : 'text-foreground'
                        )}
                      >
                        {g.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </CardContent>
            </Card>

            {/* Pace — only shown for fat_loss / muscle_gain */}
            {(goal === 'fat_loss' || goal === 'muscle_gain') && (
              <Card>
                <CardContent className="py-5 gap-3">
                  <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                    RITMO
                  </Text>
                  <View className="flex-row gap-2">
                    {PACES.map(p => (
                      <SelectorChip
                        key={p.id}
                        label={p.label}
                        selected={pace === p.id}
                        onPress={() => setPace(p.id)}
                      />
                    ))}
                  </View>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* ── STEP 3: Resumen con macros calculados ────────────────────────── */}
        {step === 3 && (
          <>
            {/* Summary of selections */}
            <Card>
              <CardContent className="py-5 gap-2">
                <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground mb-1">
                  RESUMEN
                </Text>

                {[
                  { label: t('nutrition.setup.weight', { defaultValue: 'Peso' }), value: `${weight} kg` },
                  { label: t('nutrition.setup.height', { defaultValue: 'Altura' }), value: `${height} cm` },
                  { label: t('nutrition.setup.age', { defaultValue: 'Edad' }), value: `${age} años` },
                  {
                    label: t('nutrition.setup.sex', { defaultValue: 'Sexo' }),
                    value: sex === 'male'
                      ? t('nutrition.setup.male', { defaultValue: 'Masculino' })
                      : t('nutrition.setup.female', { defaultValue: 'Femenino' }),
                  },
                  {
                    label: t('nutrition.setup.activityLevel', { defaultValue: 'Actividad' }),
                    value: ACTIVITY_LEVELS.find(l => l.id === activityLevel)?.label ?? activityLevel,
                  },
                  {
                    label: t('nutrition.setup.objective', { defaultValue: 'Objetivo' }),
                    value: GOALS.find(g => g.id === goal)?.label ?? goal,
                  },
                ].map(row => (
                  <View key={row.label} className="flex-row justify-between items-center py-1">
                    <Text className="font-sans text-sm text-muted-foreground">{row.label}</Text>
                    <Text className="font-sans-medium text-sm text-foreground">{row.value}</Text>
                  </View>
                ))}
              </CardContent>
            </Card>

            {/* Calculated macros — editable */}
            <Card>
              <CardContent className="py-5 gap-4">
                <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                  MACROS CALCULADOS
                </Text>

                {/* Visual summary ring */}
                <View className="rounded-lg bg-lime-400/10 border border-lime-400/20 p-4">
                  <View className="flex-row justify-around">
                    {[
                      { value: macros.dailyCalories, label: 'KCAL', color: 'text-lime-400' },
                      { value: macros.dailyProtein,  label: t('nutrition.protein', { defaultValue: 'Proteína' }).substring(0, 4).toUpperCase(), color: 'text-sky-400' },
                      { value: macros.dailyCarbs,    label: t('nutrition.carbs', { defaultValue: 'Carbos' }).substring(0, 4).toUpperCase(), color: 'text-amber-400' },
                      { value: macros.dailyFat,      label: t('nutrition.fat', { defaultValue: 'Grasa' }).substring(0, 4).toUpperCase(), color: 'text-pink-400' },
                    ].map(m => (
                      <View key={m.label} className="items-center">
                        <Text className={cn('font-bebas text-3xl leading-none', m.color)}>
                          {m.value}
                        </Text>
                        <Text className="font-mono text-[9px] text-muted-foreground mt-0.5">
                          {m.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Editable fields */}
                <View className="gap-3">
                  {([
                    { field: 'dailyCalories', label: t('nutrition.calories', { defaultValue: 'Calorías' }).toUpperCase() },
                    { field: 'dailyProtein', label: `${t('nutrition.protein', { defaultValue: 'Proteína' }).toUpperCase()} (g)` },
                    { field: 'dailyCarbs', label: `${t('nutrition.carbs', { defaultValue: 'Carbos' }).toUpperCase()} (g)` },
                    { field: 'dailyFat', label: `${t('nutrition.fat', { defaultValue: 'Grasa' }).toUpperCase()} (g)` },
                  ] as const).map(({ field, label }) => (
                    <View key={field} className="gap-1">
                      <Text className="font-mono text-xs text-muted-foreground tracking-wider">
                        {label}
                      </Text>
                      <Input
                        keyboardType="number-pad"
                        value={macros[field] ? String(macros[field]) : ''}
                        placeholder="0"
                        onChangeText={v =>
                          setMacros(m => ({ ...m, [field]: Number(v.replace(/[^0-9]/g, '')) || 0 }))
                        }
                      />
                    </View>
                  ))}
                </View>
              </CardContent>
            </Card>
          </>
        )}
      </ScrollView>

      {/* Navigation buttons */}
      <View className="flex-row gap-3 px-4 pb-6 pt-3 border-t border-border">
        {onCancel && (
          <Button
            variant="outline"
            onPress={onCancel}
            className="flex-1"
          >
            <Text>{t('common.cancel', { defaultValue: 'Cancelar' })}</Text>
          </Button>
        )}
        {step > 0 && (
          <Button
            variant="outline"
            onPress={() => setStep(s => s - 1)}
            className="flex-1"
          >
            <Text>{t('common.back', { defaultValue: 'Atrás' })}</Text>
          </Button>
        )}

        {step < TOTAL_STEPS - 1 ? (
          <Button
            onPress={handleNext}
            disabled={!canProceed()}
            className="flex-1 bg-lime-400"
          >
            <Text className="font-bebas text-lg tracking-wide text-zinc-900">
              {t('common.next', { defaultValue: 'Siguiente' })}
            </Text>
          </Button>
        ) : (
          <Button
            onPress={handleSave}
            disabled={saving}
            className="flex-1 bg-lime-400"
          >
            <Text className="font-bebas text-lg tracking-wide text-zinc-900">
              {saving ? '...' : t('common.save', { defaultValue: 'Guardar' })}
            </Text>
          </Button>
        )}
      </View>
    </View>
  )
}
