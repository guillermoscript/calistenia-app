/**
 * OnboardingFlow — mobile port of the web onboarding flow.
 *
 * Branching:
 *   needsProfile=true  → 7 steps: Welcome(0) Basics(1) Goals(2) Health(3) Training(4) Program(5) Personalizing(6)
 *   needsProfile=false → 3 steps: Welcome(0) Program(1) Personalizing(2)
 *
 * Recovery: if user already has an active program and onboarding is not done,
 * markOnboardingDone immediately and go to tabs.
 */
import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import Animated, { FadeInRight } from 'react-native-reanimated'

import { pb } from '@calistenia/core/lib/pocketbase'
import { upsertUserHealth, useUserHealth } from '@calistenia/core/hooks/useUserHealth'
import { op } from '@calistenia/core/lib/analytics'
import { parseDecimal } from '@calistenia/core/lib/bmi'
import { markOnboardingDone } from '@calistenia/core/lib/onboarding-state'
import type { MatchUserInput } from '@calistenia/core/lib/matchPrograms'

import { useAuthUser } from '@/lib/use-auth-user'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { haptics } from '@/lib/haptics'

import { OnboardingProgress } from './OnboardingProgress'
import { StepWelcome } from './StepWelcome'
import { StepBasics, type BasicsValues } from './StepBasics'
import { StepGoals, type GoalsValues } from './StepGoals'
import { StepHealth } from './StepHealth'
import { StepTraining } from './StepTraining'
import { StepProgram } from './StepProgram'
import { StepPersonalizing } from './StepPersonalizing'
import type { HealthValues } from '@calistenia/core/types/onboarding'
import type { TrainingValues } from '@calistenia/core/types/onboarding'

const EMPTY_BASICS: BasicsValues = { weight: '', height: '', age: '', sex: '' }
const EMPTY_GOALS: GoalsValues = { primary_goal: '', goal_weight: '', waist: '', activity_level: '', pace: '' }
const EMPTY_HEALTH: HealthValues = { medical_conditions: [], injuries: [] }
const EMPTY_TRAINING: TrainingValues = {
  level: 'principiante', focus_areas: [], training_days: [], intensity: '', goal: '',
}

export function OnboardingFlow() {
  const router = useRouter()
  const { i18n } = useTranslation()
  const currentLang = i18n.language.startsWith('en') ? 'en' : 'es'
  const user = useAuthUser()
  const userId = user?.id
  const displayName: string =
    (user as { display_name?: string })?.display_name ??
    (user as { name?: string })?.name ??
    (user as { username?: string })?.username ??
    ''

  const { programs, activeProgram } = useWorkoutState()
  const { selectProgram } = useWorkoutActions()

  // Recovery: if user already has an active program and ended up in onboarding, skip it.
  useEffect(() => {
    if (activeProgram && userId) {
      markOnboardingDone(userId)
      router.replace('/(tabs)')
    }
  }, [activeProgram, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Frozen at mount: needsProfile drives step layout and must not change mid-flow.
  const [needsProfile] = useState(() => !user?.weight && !user?.height && !user?.level)

  const [step, setStep] = useState(0)
  const [basics, setBasics] = useState<BasicsValues>(EMPTY_BASICS)
  const [goals, setGoals] = useState<GoalsValues>(EMPTY_GOALS)
  const [health, setHealth] = useState<HealthValues>(EMPTY_HEALTH)
  const [training, setTraining] = useState<TrainingValues>(EMPTY_TRAINING)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingGoals, setSavingGoals] = useState(false)
  const [savingHealth, setSavingHealth] = useState(false)
  const [savingTraining, setSavingTraining] = useState(false)
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(activeProgram?.id ?? null)
  const [selecting, setSelecting] = useState(false)
  // Salud guardada (user_health): fallback para el matching de programas cuando
  // el flujo no pasó por el paso de salud (needsProfile=false).
  const { health: savedHealth } = useUserHealth(userId ?? null)

  // Step index layout (frozen via needsProfile)
  const profileStep = needsProfile ? 1 : -1
  const goalsStep = needsProfile ? 2 : -1
  const healthStep = needsProfile ? 3 : -1
  const trainingStep = needsProfile ? 4 : -1
  const programStep = needsProfile ? 5 : 1
  const personalizingStep = needsProfile ? 6 : 2
  const totalSteps = needsProfile ? 7 : 3

  const stepNameFor = (s: number): string => {
    if (s === 0) return 'welcome'
    if (s === profileStep) return 'profile'
    if (s === goalsStep) return 'goals'
    if (s === healthStep) return 'health'
    if (s === trainingStep) return 'training'
    if (s === programStep) return 'program'
    if (s === personalizingStep) return 'personalizing'
    return `step_${s}`
  }

  const goToStep = (s: number) => {
    haptics.light()
    op.track('onboarding_step_viewed', { step: s, step_name: stepNameFor(s) })
    setStep(s)
  }

  const handleSelectProgram = async (programId: string) => {
    setSelectedProgramId(programId)
    setSelecting(true)
    try {
      await selectProgram(programId)
    } finally {
      setSelecting(false)
    }
  }

  const handleSaveBasics = async () => {
    if (!userId) return
    setSavingProfile(true)
    try {
      await pb.collection('users').update(userId, {
        weight: parseDecimal(basics.weight),
        height: parseDecimal(basics.height),
        age: basics.age ? parseInt(basics.age, 10) : null,
        sex: basics.sex || null,
      })
    } catch (e) {
      console.warn('Failed to save onboarding basics:', e)
    }
    setSavingProfile(false)
    goToStep(goalsStep)
  }

  const handleSaveGoals = async () => {
    if (!userId) return
    setSavingGoals(true)
    const waist = parseDecimal(goals.waist)
    try {
      await pb.collection('users').update(userId, {
        primary_goal: goals.primary_goal || '',
        goal_weight: parseDecimal(goals.goal_weight),
        waist,
        activity_level: goals.activity_level || '',
        pace: goals.pace || '',
      })
    } catch (e) {
      console.warn('Failed to save onboarding goals:', e)
    }
    // La cintura también se registra como medición corporal con fecha (historial).
    if (waist) {
      try {
        await pb.collection('body_measurements').create({
          user: userId,
          date: new Date().toISOString().slice(0, 10),
          waist,
        })
      } catch (e) {
        console.warn('Failed to save waist measurement:', e)
      }
    }
    setSavingGoals(false)
    goToStep(healthStep)
  }

  // Salud → colección `user_health` (en `users` estos campos son PII ocultos
  // que no se pueden escribir con token de usuario; ver #247).
  const saveHealthAnd = async (next: HealthValues, advanceTo: number) => {
    if (!userId) return
    setSavingHealth(true)
    try {
      await upsertUserHealth(userId, {
        medical_conditions: next.medical_conditions,
        injuries: next.injuries,
      })
    } catch (e) {
      console.warn('Failed to save onboarding health:', e)
    }
    setSavingHealth(false)
    goToStep(advanceTo)
  }

  const handleSaveHealth = () => saveHealthAnd(health, trainingStep)

  const handleNoIssues = () => {
    const empty: HealthValues = { medical_conditions: [], injuries: [] }
    setHealth(empty)
    saveHealthAnd(empty, trainingStep)
  }

  const handleSaveTraining = async () => {
    if (!userId) return
    setSavingTraining(true)
    try {
      await pb.collection('users').update(userId, {
        level: training.level || 'principiante',
        focus_areas: training.focus_areas,
        training_days: training.training_days,
        intensity: training.intensity || '',
        goal: training.goal || '',
      })
    } catch (e) {
      console.warn('Failed to save onboarding training:', e)
    }
    setSavingTraining(false)
    goToStep(programStep)
  }

  const handleFinish = () => {
    if (userId) {
      markOnboardingDone(userId)
    }
    op.track('onboarding_completed', {
      level: training.level || 'unknown',
      primary_goal: goals.primary_goal || 'unknown',
      has_program: !!selectedProgramId,
      has_goal_weight: !!goals.goal_weight,
      activity_level: goals.activity_level || 'unknown',
      conditions_count: health.medical_conditions.length,
      injuries_count: health.injuries.length,
      focus_areas_count: training.focus_areas.length,
      training_days_count: training.training_days.length,
    })
    router.replace('/(tabs)')
  }

  const firstName = displayName?.split(/[\s@]/)[0] ?? ''
  const currentWeightNum = parseDecimal(basics.weight)
  const currentHeightNum = parseDecimal(basics.height)

  // Build MatchUserInput from current live user fields merged with in-progress values
  const matchUserInput: MatchUserInput = {
    level: training.level || (user as Record<string, unknown>)?.level as string | undefined,
    weight: currentWeightNum ?? (user as Record<string, unknown>)?.weight as number | undefined,
    goal_weight: parseDecimal(goals.goal_weight) ?? (user as Record<string, unknown>)?.goal_weight as number | undefined,
    focus_areas: training.focus_areas.length ? training.focus_areas : (user as Record<string, unknown>)?.focus_areas as string[] | undefined,
    training_days: training.training_days.length ? training.training_days : (user as Record<string, unknown>)?.training_days as string[] | undefined,
    injuries: health.injuries.length ? health.injuries : savedHealth.injuries,
    medical_conditions: health.medical_conditions.length ? health.medical_conditions : savedHealth.medical_conditions,
    primary_goal: goals.primary_goal || (user as Record<string, unknown>)?.primary_goal as string | undefined,
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1"
    >
      <ScrollView
        contentContainerClassName="flex-grow p-6"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Selector de idioma: visible durante todo el onboarding */}
        <View className="mb-3 flex-row justify-end gap-2">
          {([['es', 'ES'], ['en', 'EN']] as const).map(([code, label]) => (
            <Pressable
              key={code}
              onPress={() => {
                haptics.light()
                i18n.changeLanguage(code)
              }}
              className={
                currentLang === code
                  ? 'h-9 items-center justify-center rounded-md border border-lime/40 bg-lime/10 px-4'
                  : 'h-9 items-center justify-center rounded-md border border-border px-4'
              }
            >
              <Text
                className={
                  currentLang === code
                    ? 'font-mono text-xs tracking-wide text-lime'
                    : 'font-mono text-xs tracking-wide text-muted-foreground'
                }
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        <OnboardingProgress step={step} totalSteps={totalSteps} />

        <Animated.View key={step} entering={FadeInRight.duration(280)} className="flex-1">
          {step === 0 ? (
            <StepWelcome
              firstName={firstName}
              needsProfile={needsProfile}
              onStart={() => goToStep(needsProfile ? profileStep : programStep)}
              onSkipAll={handleFinish}
            />
          ) : null}

          {step === profileStep ? (
            <StepBasics
              values={basics}
              onChange={setBasics}
              saving={savingProfile}
              onBack={() => goToStep(0)}
              onContinue={handleSaveBasics}
              onSkip={() => goToStep(goalsStep)}
            />
          ) : null}

          {step === goalsStep ? (
            <StepGoals
              values={goals}
              onChange={setGoals}
              currentWeightKg={currentWeightNum}
              currentHeightCm={currentHeightNum}
              saving={savingGoals}
              onBack={() => goToStep(profileStep)}
              onContinue={handleSaveGoals}
              onSkip={() => goToStep(healthStep)}
            />
          ) : null}

          {step === healthStep ? (
            <StepHealth
              values={health}
              onChange={setHealth}
              saving={savingHealth}
              onBack={() => goToStep(goalsStep)}
              onContinue={handleSaveHealth}
              onSkipAsNone={handleNoIssues}
            />
          ) : null}

          {step === trainingStep ? (
            <StepTraining
              values={training}
              onChange={setTraining}
              saving={savingTraining}
              onBack={() => goToStep(healthStep)}
              onContinue={handleSaveTraining}
              onSkip={() => goToStep(programStep)}
            />
          ) : null}

          {step === programStep ? (
            <StepProgram
              programs={programs}
              selectedProgramId={selectedProgramId}
              selecting={selecting}
              userId={userId}
              user={matchUserInput}
              onSelectProgram={handleSelectProgram}
              onBack={() => goToStep(needsProfile ? trainingStep : 0)}
              onContinue={() => goToStep(personalizingStep)}
            />
          ) : null}

          {step === personalizingStep ? (
            <StepPersonalizing
              currentWeightKg={currentWeightNum}
              goalWeightKg={parseDecimal(goals.goal_weight)}
              pace={goals.pace}
              program={programs.find((p) => p.id === selectedProgramId) ?? null}
              onFinish={handleFinish}
            />
          ) : null}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
