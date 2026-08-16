/**
 * ChangeGoalCard (#243 F4b, extraído en #470) — "Cambiar objetivo" con preview
 * del nuevo rango de macros antes de aplicar. Estado del picker (abierto /
 * objetivo elegido) local; el guardado lo hace el padre vía `onApply` /
 * `onAdjust`.
 */
import { useMemo, useState } from 'react'
import { View, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { previewNutritionGoal, type NutritionPace } from '@calistenia/core/lib/nutritionGoal'
import type { NutritionGoal, NutritionGoalType } from '@calistenia/core/types'

// Mismas etiquetas/iconos que el picker inline de la web.
export const GOAL_LABEL_KEYS: Record<NutritionGoalType, string> = {
  muscle_gain: 'nutrition.goal.muscleGain',
  fat_loss: 'nutrition.goal.fatLoss',
  recomp: 'nutrition.goal.recomp',
  maintain: 'nutrition.goal.maintain',
}
const GOAL_CHOICES: { id: NutritionGoalType; labelKey: string; icon: string }[] = [
  { id: 'muscle_gain', labelKey: GOAL_LABEL_KEYS.muscle_gain, icon: '💪' },
  { id: 'fat_loss', labelKey: GOAL_LABEL_KEYS.fat_loss, icon: '🔥' },
  { id: 'recomp', labelKey: GOAL_LABEL_KEYS.recomp, icon: '⚖️' },
  { id: 'maintain', labelKey: GOAL_LABEL_KEYS.maintain, icon: '✅' },
]

interface ChangeGoalCardProps {
  goals: NutritionGoal
  /** Ritmo del perfil (users.pace); afecta al preview del déficit/superávit. */
  pace?: NutritionPace
  /** "Ajustar": abre el wizard con este objetivo preseleccionado. */
  onAdjust: (goal: NutritionGoalType) => void
  /** "Aplicar": guarda el rango recomendado tal cual. */
  onApply: (goal: NutritionGoalType, preview: NutritionGoal) => Promise<void>
}

export default function ChangeGoalCard({ goals, pace, onAdjust, onApply }: ChangeGoalCardProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [selectedGoal, setSelectedGoal] = useState<NutritionGoalType | null>(null)

  const preview = useMemo(() => {
    if (!selectedGoal || selectedGoal === goals.goal) return null
    return previewNutritionGoal(
      { weight: goals.weight, height: goals.height, age: goals.age, sex: goals.sex, activityLevel: goals.activityLevel, pace },
      selectedGoal,
    )
  }, [selectedGoal, goals, pace])

  const close = () => { setOpen(false); setSelectedGoal(null) }

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        {!open ? (
          <View className="flex-row items-center justify-between gap-4">
            <View className="flex-1">
              <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                {t('nutrition.changeGoal.title')}
              </Text>
              <Text className="font-bebas text-2xl text-lime-400">
                {t(GOAL_LABEL_KEYS[goals.goal])}
              </Text>
            </View>
            <Button
              variant="outline"
              onPress={() => { haptics.light(); setSelectedGoal(null); setOpen(true) }}
              className="h-9 shrink-0"
            >
              <Text className="font-mono text-[10px] tracking-widest uppercase">{t('nutrition.changeGoal.cta')}</Text>
            </Button>
          </View>
        ) : (
          <View className="gap-4">
            <View className="flex-row items-center justify-between">
              <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t('nutrition.changeGoal.pickPrompt')}
              </Text>
              <Pressable onPress={close}>
                <Text className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
                  {t('common.cancel')}
                </Text>
              </Pressable>
            </View>

            <View className="flex-row flex-wrap gap-2.5">
              {GOAL_CHOICES.map(g => (
                <Pressable
                  key={g.id}
                  onPress={() => { haptics.selection(); setSelectedGoal(g.id) }}
                  className={cn(
                    'min-w-[45%] flex-1 items-center rounded-lg border p-3',
                    selectedGoal === g.id
                      ? 'border-lime-400 bg-lime-400/15'
                      : 'border-border bg-card',
                  )}
                >
                  <Text className="text-xl mb-1">{g.icon}</Text>
                  <Text className={cn(
                    'font-sans-medium text-xs',
                    selectedGoal === g.id ? 'text-lime-400' : 'text-foreground',
                  )}>
                    {t(g.labelKey)}
                  </Text>
                </Pressable>
              ))}
            </View>

            {selectedGoal && preview && (
              <>
                <View className="rounded-lg border border-lime-400/20 bg-lime-400/5 p-3 gap-3">
                  <Text className="font-mono text-[10px] uppercase tracking-widest text-lime-400">
                    {t('nutrition.changeGoal.newRange')}
                  </Text>
                  <View className="flex-row justify-around">
                    <View className="items-center">
                      <Text className="font-bebas text-2xl leading-none text-lime-400">{preview.dailyCalories}</Text>
                      <Text className="font-mono text-[9px] text-muted-foreground mt-0.5">KCAL</Text>
                    </View>
                    <View className="items-center">
                      <Text className="font-bebas text-2xl leading-none text-sky-400">{preview.dailyProtein}</Text>
                      <Text className="font-mono text-[9px] text-muted-foreground mt-0.5">PROT</Text>
                    </View>
                    <View className="items-center">
                      <Text className="font-bebas text-2xl leading-none text-amber-400">{preview.dailyCarbs}</Text>
                      <Text className="font-mono text-[9px] text-muted-foreground mt-0.5">CARBS</Text>
                    </View>
                    <View className="items-center">
                      <Text className="font-bebas text-2xl leading-none text-pink-400">{preview.dailyFat}</Text>
                      <Text className="font-mono text-[9px] text-muted-foreground mt-0.5">{t('nutrition.fat').toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground border-t border-lime-400/10 pt-2">
                    {t('nutrition.changeGoal.current')}: {goals.dailyCalories} kcal · {goals.dailyProtein}P · {goals.dailyCarbs}C · {goals.dailyFat}F
                  </Text>
                </View>

                <View className="flex-row gap-3">
                  <Button
                    variant="outline"
                    onPress={() => {
                      haptics.medium()
                      onAdjust(selectedGoal)
                      close()
                    }}
                    className="flex-1 h-10"
                  >
                    <Text className="font-mono text-[10px] tracking-widest uppercase">{t('nutrition.changeGoal.adjust')}</Text>
                  </Button>
                  <Button
                    onPress={async () => {
                      haptics.success()
                      await onApply(selectedGoal, preview)
                      close()
                    }}
                    className="flex-1 h-10 bg-lime-400"
                  >
                    <Text className="font-bebas text-lg tracking-wide text-zinc-900">{t('nutrition.changeGoal.apply')}</Text>
                  </Button>
                </View>
              </>
            )}
          </View>
        )}
      </CardContent>
    </Card>
  )
}
