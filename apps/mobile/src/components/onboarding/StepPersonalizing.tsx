import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import type { ProgramMeta } from '@calistenia/core/types'
import type { Pace } from './StepGoals'

const PHASE_DURATION_MS = 2400
const MESSAGE_COUNT = 4

const PACE_KG_PER_WEEK: Record<Pace, number> = {
  gradual: 0.25,
  balanced: 0.5,
  aggressive: 1.0,
}

interface Props {
  currentWeightKg: number | null
  goalWeightKg: number | null
  pace: Pace | ''
  program: ProgramMeta | null
  onFinish: () => void
}

export function StepPersonalizing({ currentWeightKg, goalWeightKg, pace, program, onFinish }: Props) {
  const { t, i18n } = useTranslation()
  const [phase, setPhase] = useState<'loading' | 'preview'>('loading')
  const [msgIndex, setMsgIndex] = useState(0)
  const progressAnim = useRef(new Animated.Value(0)).current
  const spinAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    // Spinner rotation
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start()

    // Progress bar fill
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: PHASE_DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start()

    const interval = PHASE_DURATION_MS / MESSAGE_COUNT
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 1; i < MESSAGE_COUNT; i++) {
      timers.push(setTimeout(() => setMsgIndex(i), i * interval))
    }
    timers.push(setTimeout(() => setPhase('preview'), PHASE_DURATION_MS))
    return () => timers.forEach(clearTimeout)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const projection = useMemo(() => {
    if (!currentWeightKg || !goalWeightKg || !pace) return null
    const kgPerWeek = PACE_KG_PER_WEEK[pace]
    const delta = Math.abs(goalWeightKg - currentWeightKg)
    if (delta < 0.1) return null
    const weeks = Math.max(1, Math.ceil(delta / kgPerWeek))
    const lang = i18n.language.startsWith('en') ? 'en' : 'es'
    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() + weeks * 7)
    const months: Record<string, string[]> = {
      en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      es: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
    }
    const m = months[lang] ?? months['en']!
    const dateLabel = `${targetDate.getDate()} ${m[targetDate.getMonth()]} ${targetDate.getFullYear()}`
    return { weeks, dateLabel }
  }, [currentWeightKg, goalWeightKg, pace, i18n.language])

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  if (phase === 'loading') {
    return (
      <View className="items-center justify-center py-12">
        <Text className="font-bebas text-4xl text-lime mb-8 leading-none">
          {t('onboarding.personalizingTitle')}
        </Text>

        <View className="mb-8">
          <Animated.View
            style={{ transform: [{ rotate: spin }] }}
            className="w-16 h-16 rounded-full border-4 border-muted-foreground/15 border-t-lime"
          />
        </View>

        <View className="min-h-[2.5rem] items-center justify-center">
          <Text className="text-sm text-muted-foreground text-center">
            {t(`onboarding.personalizing.msg${msgIndex + 1}`)}
          </Text>
        </View>

        <View className="mt-6 w-48 h-1 rounded-full bg-muted-foreground/15 overflow-hidden">
          <Animated.View
            className="h-full bg-lime rounded-full"
            style={{
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            }}
          />
        </View>
      </View>
    )
  }

  return (
    <View>
      <View className="items-center mb-6">
        <Text className="font-bebas text-3xl mb-1">{t('onboarding.yourPlanTitle')}</Text>
        <Text className="text-sm text-muted-foreground text-center">{t('onboarding.yourPlanDesc')}</Text>
      </View>

      <View className="gap-3 mb-6">
        {/* Weight transition */}
        {currentWeightKg !== null ? (
          <Card>
            <CardContent className="p-4 flex-row items-center justify-between">
              <View>
                <Text className="text-[10px] text-muted-foreground tracking-[2px] uppercase">
                  {t('onboarding.timelineWeight')}
                </Text>
                <Text className="font-bebas text-2xl text-foreground leading-none">
                  {currentWeightKg} kg
                </Text>
              </View>
              {goalWeightKg !== null ? (
                <>
                  <Text className="text-muted-foreground/60">→</Text>
                  <View className="items-end">
                    <Text className="text-[10px] text-muted-foreground tracking-[2px] uppercase">
                      {t('onboarding.timelineGoal')}
                    </Text>
                    <Text className="font-bebas text-2xl text-lime leading-none">
                      {goalWeightKg} kg
                    </Text>
                  </View>
                </>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* Projection */}
        {projection !== null && pace ? (
          <Card>
            <CardContent className="p-4">
              <Text className="text-sm text-foreground font-sans-medium">
                {t('onboarding.timelineProjection', { date: projection.dateLabel })}
              </Text>
              <Text className="text-[11px] text-muted-foreground mt-0.5">
                {t('onboarding.timelineProjectionNote', {
                  pace: t(`onboarding.pace${pace.charAt(0).toUpperCase()}${pace.slice(1)}`).toLowerCase(),
                  weeks: projection.weeks,
                })}
              </Text>
            </CardContent>
          </Card>
        ) : null}

        {/* Program preview */}
        {program !== null ? (
          <Card>
            <CardContent className="p-4 flex-row items-center gap-3">
              <View className={cn(
                'w-10 h-10 rounded-lg items-center justify-center shrink-0',
                'bg-lime/10'
              )}>
                <Text className="font-bebas text-lg text-lime">
                  {program.name[0]?.toUpperCase() ?? '?'}
                </Text>
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-[10px] text-muted-foreground tracking-[2px] uppercase">
                  {t('onboarding.timelineProgram')}
                </Text>
                <Text className="text-sm font-sans-medium" numberOfLines={1}>
                  {program.name}
                </Text>
                <Text className="text-[10px] text-muted-foreground">
                  {t('onboarding.timelineWeeks', { weeks: program.duration_weeks })}
                </Text>
              </View>
            </CardContent>
          </Card>
        ) : null}
      </View>

      <Button
        onPress={onFinish}
        className="w-full h-12 bg-lime active:bg-lime/90"
      >
        <Text className="font-bebas text-xl tracking-wide text-lime-foreground">
          {t('onboarding.startTraining')}
        </Text>
      </Button>
    </View>
  )
}
