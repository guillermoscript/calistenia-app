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
import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import Animated, { FadeInRight } from 'react-native-reanimated'

import { useUserHealth } from '@calistenia/core/hooks/useUserHealth'
import { useOnboardingSubmit } from '@calistenia/core/hooks/useOnboardingSubmit'
import { useWorkoutReminders } from '@calistenia/core/hooks/useWorkoutReminders'
import { CANONICAL_ANALYTICS_EVENTS, op, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import { parseDecimal } from '@calistenia/core/lib/bmi'
import { markOnboardingDone } from '@calistenia/core/lib/onboarding-state'
import { estimateFirstWorkoutMinutes, normalizeFirstWorkoutLevel } from '@calistenia/core/lib/first-workout'
import { pb } from '@calistenia/core/lib/pocketbase'
import {
  DEFAULT_TRAINING_TIME_PRESET,
  findTrainingTimePreset,
  formatReminderTime,
  reminderDaysFromTraining,
  type TrainingTimePresetId,
} from '@calistenia/core/lib/onboarding-reminder'
import type { MatchUserInput } from '@calistenia/core/lib/matchPrograms'
import {
  DISCOVERY_SOURCE_NOT_ANSWERED,
  trackDiscoverySourceAnswered,
  type DiscoverySourceId,
} from '@calistenia/core/lib/discovery-source'

import { Sentry } from '@/lib/instrument'
import { useAuthUser } from '@/lib/use-auth-user'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { haptics } from '@/lib/haptics'
import { useStartFirstWorkout } from '@/lib/start-first-workout'
import { ensureReminderPermission, getReminderPermission } from '@/lib/reminder-scheduler'
import { registerPushTokenAsync } from '@/lib/push-registration'

import { OnboardingProgress } from './OnboardingProgress'
import { StepWelcome } from './StepWelcome'
import { StepBasics, type BasicsValues } from './StepBasics'
import { StepGoals, type GoalsValues } from './StepGoals'
import { StepHealth } from './StepHealth'
import { StepTraining } from './StepTraining'
import { StepProgram } from './StepProgram'
import { StepReminder } from './StepReminder'
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
  const { t, i18n } = useTranslation()
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
  const startFirstWorkout = useStartFirstWorkout()

  const [step, setStep] = useState(0)

  // Recovery: si el usuario ya tiene programa activo y aterrizó en onboarding, sáltalo.
  // Solo aplica en el paso 0: WorkoutContext resuelve el programa de forma
  // asíncrona (y también se vuelve truthy al elegir programa en StepProgram),
  // así que sin este guard expulsaría al usuario a mitad del flujo (#222).
  useEffect(() => {
    if (step === 0 && activeProgram && userId) {
      markOnboardingDone(userId)
      router.replace('/(tabs)')
    }
  }, [activeProgram, userId, step]) // eslint-disable-line react-hooks/exhaustive-deps

  // Frozen at mount: needsProfile drives step layout and must not change mid-flow.
  const [needsProfile] = useState(() => !user?.weight && !user?.height && !user?.level)

  const [basics, setBasics] = useState<BasicsValues>(EMPTY_BASICS)
  const [goals, setGoals] = useState<GoalsValues>(EMPTY_GOALS)
  const [health, setHealth] = useState<HealthValues>(EMPTY_HEALTH)
  const [training, setTraining] = useState<TrainingValues>(EMPTY_TRAINING)
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(activeProgram?.id ?? null)
  const [selecting, setSelecting] = useState(false)
  // Escrituras del onboarding a PocketBase, compartidas con web (#472).
  // Si un guardado falla devuelven false y NO se avanza de paso (#222).
  const {
    savingProfile, savingGoals, savingHealth, savingTraining,
    saveError, setSaveError,
    saveBasics, saveGoals, saveHealth, saveTraining,
  } = useOnboardingSubmit({
    userId,
    captureException: (e, stepName) =>
      Sentry.captureException(e, { tags: { flow: 'onboarding_save', step: stepName } }),
    onSaveError: () => haptics.error(),
  })
  // Salud guardada (user_health): fallback para el matching de programas cuando
  // el flujo no pasó por el paso de salud (needsProfile=false).
  const { health: savedHealth } = useUserHealth(userId ?? null)
  // Recordatorio de entreno por defecto (#695): comparte hook con la pantalla
  // de Ajustes > Recordatorios.
  const { reminders, saveReminder } = useWorkoutReminders(userId ?? null)
  const [reminderPreset, setReminderPreset] = useState<TrainingTimePresetId>(DEFAULT_TRAINING_TIME_PRESET)
  const [savingReminder, setSavingReminder] = useState(false)
  const [reminderPermissionDenied, setReminderPermissionDenied] = useState(false)
  // «¿Cómo conociste la app?» (#586). Se emite UNA vez, al salir de la
  // bienvenida; volver atrás y salir de nuevo no lo repite.
  const [discoverySource, setDiscoverySource] = useState<DiscoverySourceId | null>(null)
  const discoveryTracked = useRef(false)

  // Step index layout (frozen via needsProfile)
  const profileStep = needsProfile ? 1 : -1
  const goalsStep = needsProfile ? 2 : -1
  const healthStep = needsProfile ? 3 : -1
  const trainingStep = needsProfile ? 4 : -1
  const programStep = needsProfile ? 5 : 1
  const reminderStep = needsProfile ? 6 : 2
  const personalizingStep = needsProfile ? 7 : 3
  const totalSteps = needsProfile ? 8 : 4

  const stepNameFor = (s: number): string => {
    if (s === 0) return 'welcome'
    if (s === profileStep) return 'profile'
    if (s === goalsStep) return 'goals'
    if (s === healthStep) return 'health'
    if (s === trainingStep) return 'training'
    if (s === programStep) return 'program'
    if (s === reminderStep) return 'reminder'
    if (s === personalizingStep) return 'personalizing'
    return `step_${s}`
  }

  // Al llegar al paso del recordatorio, si ya hay permiso denegado a nivel OS
  // (p. ej. lo rechazó antes en Ajustes), avisamos de una vez en vez de que
  // lo descubra al tocar «Activar recordatorio».
  useEffect(() => {
    if (step !== reminderStep) return
    let cancelled = false
    getReminderPermission().then((status) => {
      if (!cancelled) setReminderPermissionDenied(status === 'denied')
    })
    return () => { cancelled = true }
  }, [step, reminderStep])

  // `onboarding_step_viewed` solo se emite al AVANZAR, así que el primer paso
  // no lo emitía nadie y no se sabía cuánta gente llega a ver el onboarding
  // (#636 §4). Sin esto, `onboarding_completed` no tiene denominador.
  useEffect(() => {
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.onboardingStarted, {
      surface: 'onboarding', source: 'onboarding_mobile',
      total_steps: totalSteps,
      needs_profile: needsProfile,
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- una vez por onboarding

  const goToStep = (s: number) => {
    haptics.light()
    setSaveError(false)
    op.track('onboarding_step_viewed', { step: s, step_name: stepNameFor(s) })
    setStep(s)
  }

  const leaveWelcome = () => {
    if (discoverySource && !discoveryTracked.current) {
      discoveryTracked.current = true
      trackDiscoverySourceAnswered(discoverySource, 'onboarding_mobile')
    }
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
    if (await saveBasics(basics)) goToStep(goalsStep)
  }

  const handleSaveGoals = async () => {
    // `basics` va con las metas para sembrar el objetivo de nutrición: es el
    // primer momento con peso/altura/edad/sexo Y actividad/objetivo/ritmo.
    if (await saveGoals(goals, basics)) goToStep(healthStep)
  }

  const saveHealthAnd = async (next: HealthValues, advanceTo: number) => {
    if (await saveHealth(next)) goToStep(advanceTo)
  }

  const handleSaveHealth = () => saveHealthAnd(health, trainingStep)

  const handleNoIssues = () => {
    const empty: HealthValues = { medical_conditions: [], injuries: [] }
    setHealth(empty)
    saveHealthAnd(empty, trainingStep)
  }

  const handleSaveTraining = async () => {
    if (await saveTraining(training)) goToStep(programStep)
  }

  // El recordatorio queda guardado SIEMPRE (offline-first, `saveReminder`
  // escribe a local antes de intentar PB y nunca lanza), permiso concedido o
  // no: negarlo solo cambia si sonará, no si el recordatorio existe (#695).
  const handleSaveReminder = async () => {
    setSavingReminder(true)
    setSaveError(false)
    try {
      const presetMeta = findTrainingTimePreset(reminderPreset)
      const granted = await ensureReminderPermission()
      setReminderPermissionDenied(!granted)
      if (granted && userId) {
        registerPushTokenAsync(pb, userId).catch((e) => {
          Sentry.captureException(e, { tags: { feature: 'onboarding_reminder', op: 'register_push_token' } })
        })
      }
      const days = reminderDaysFromTraining(training.training_days)
      await saveReminder(presetMeta.hour, presetMeta.minute, days, 'workout')
      op.track('onboarding_reminder_set', {
        preset: reminderPreset,
        time: formatReminderTime(presetMeta.hour, presetMeta.minute),
        days_count: days.length,
        permission: granted ? 'granted' : 'denied',
      })
      goToStep(personalizingStep)
    } catch (e) {
      Sentry.captureException(e, { tags: { flow: 'onboarding_save', step: 'reminder' } })
      setSaveError(true)
      haptics.error()
    } finally {
      setSavingReminder(false)
    }
  }

  const handleSkipReminder = () => {
    op.track('onboarding_reminder_skipped', { preset: reminderPreset })
    goToStep(personalizingStep)
  }

  const handleFinish = (destination: 'home' | 'measurements' | 'first_workout' = 'home') => {
    if (userId) {
      markOnboardingDone(userId)
    }
    op.track('onboarding_completed', {
      destination,
      first_measurement_cta: destination === 'measurements',
      level: training.level || 'unknown',
      primary_goal: goals.primary_goal || 'unknown',
      has_program: !!selectedProgramId,
      has_goal_weight: !!goals.goal_weight,
      activity_level: goals.activity_level || 'unknown',
      conditions_count: health.medical_conditions.length,
      injuries_count: health.injuries.length,
      focus_areas_count: training.focus_areas.length,
      training_days_count: training.training_days.length,
      has_reminder: reminders.some((r) => r.reminderType === 'workout' && r.enabled),
      discovery_source: discoverySource ?? DISCOVERY_SOURCE_NOT_ANSWERED,
    })
    if (destination === 'first_workout') {
      // startFirstWorkout navega por su cuenta a /session — no hace falta
      // (ni conviene) también reemplazar por /(tabs) aquí (#694).
      startFirstWorkout(training.level || (user as Record<string, unknown>)?.level as string | undefined, 'onboarding')
      return
    }
    router.replace('/(tabs)')
    // Deep-link a la primera medición corporal (#227): la pantalla stacked se
    // apila sobre las tabs para que "atrás" caiga en la app normal.
    if (destination === 'measurements') router.push('/body-measurements' as never)
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

        {saveError ? (
          <View className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2">
            <Text className="font-mono text-[11px] tracking-wide text-red-400">
              {t('onboarding.saveError')}
            </Text>
          </View>
        ) : null}

        <Animated.View key={step} entering={FadeInRight.duration(280)} className="flex-1">
          {step === 0 ? (
            <StepWelcome
              firstName={firstName}
              needsProfile={needsProfile}
              discoverySource={discoverySource}
              onDiscoverySourceChange={setDiscoverySource}
              onStart={() => { leaveWelcome(); goToStep(needsProfile ? profileStep : programStep) }}
              onSkipAll={() => { leaveWelcome(); handleFinish() }}
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
              onCreateProgram={() => {
                // Igual que web (App.tsx): cerrar onboarding y abrir el editor (#224)
                if (userId) markOnboardingDone(userId)
                op.track('onboarding_create_own_program')
                router.replace('/program-editor')
              }}
              onBack={() => goToStep(needsProfile ? trainingStep : 0)}
              onContinue={() => {
                // Si ya tiene un recordatorio de entreno activo (perfil existente,
                // o volvió atrás tras guardarlo), el paso no aporta nada: saltarlo.
                const hasWorkoutReminder = reminders.some(
                  (r) => r.reminderType === 'workout' && r.enabled,
                )
                goToStep(hasWorkoutReminder ? personalizingStep : reminderStep)
              }}
            />
          ) : null}

          {step === reminderStep ? (
            <StepReminder
              preset={reminderPreset}
              onChange={setReminderPreset}
              onBack={() => goToStep(programStep)}
              onContinue={handleSaveReminder}
              onSkip={handleSkipReminder}
              saving={savingReminder}
              permissionDenied={reminderPermissionDenied}
            />
          ) : null}

          {step === personalizingStep ? (
            <StepPersonalizing
              currentWeightKg={currentWeightNum}
              goalWeightKg={parseDecimal(goals.goal_weight)}
              pace={goals.pace}
              program={programs.find((p) => p.id === selectedProgramId) ?? null}
              onFinish={() => handleFinish()}
              onFirstMeasurement={() => handleFinish('measurements')}
              onStartFirstWorkout={() => handleFinish('first_workout')}
              firstWorkoutMinutes={estimateFirstWorkoutMinutes(
                normalizeFirstWorkoutLevel(training.level || (user as Record<string, unknown>)?.level as string | undefined),
              )}
            />
          ) : null}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
