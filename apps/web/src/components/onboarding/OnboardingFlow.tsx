import { useState, useEffect } from 'react'
import type { AuthUser } from '@calistenia/core/types'
import { useTranslation } from 'react-i18next'
import * as Sentry from '@sentry/react'
import { useUserHealth } from '@calistenia/core/hooks/useUserHealth'
import { useOnboardingSubmit } from '@calistenia/core/hooks/useOnboardingSubmit'
import { useWorkoutReminders } from '@calistenia/core/hooks/useWorkoutReminders'
import { CANONICAL_ANALYTICS_EVENTS, op, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import { parseDecimal } from '@calistenia/core/lib/bmi'
import { getOrLoadCatalogIndex } from '@calistenia/core/lib/catalogIndex'
import { estimateFirstWorkoutMinutes, markFirstWorkoutPending, normalizeFirstWorkoutLevel } from '@calistenia/core/lib/first-workout'
import { markOnboardingDone } from '@calistenia/core/lib/onboarding-state'
import {
  DEFAULT_TRAINING_TIME_PRESET,
  findTrainingTimePreset,
  formatReminderTime,
  reminderDaysFromTraining,
  type TrainingTimePresetId,
} from '@calistenia/core/lib/onboarding-reminder'
import type { ProgramMeta } from '@calistenia/core/types'
import { requestNotificationPermission, subscribeToPush, getNotificationSupport } from '../../lib/push-subscription'
import { OnboardingProgress } from './OnboardingProgress'
import { StepWelcome } from './StepWelcome'
import { StepBasics, type BasicsValues } from './StepBasics'
import { StepGoals, type GoalsValues } from './StepGoals'
import { StepHealth, type HealthValues } from './StepHealth'
import { StepTraining, type TrainingValues } from './StepTraining'
import { StepProgram } from './StepProgram'
import { StepReminder } from './StepReminder'
import { StepPersonalizing } from './StepPersonalizing'

interface OnboardingFlowProps {
  displayName: string
  programs: ProgramMeta[]
  activeProgram: ProgramMeta | null
  userId?: string
  user?: AuthUser
  onSelectProgram: (programId: string) => Promise<boolean>
  onCreateProgram: () => void
  onComplete: () => void
  /** Cierra el onboarding navegando a la primera medición corporal (#227). */
  onFirstMeasurement?: () => void
  /** Cierra el onboarding directo al primer entreno del día 0 (#694). */
  onStartFirstWorkout?: () => void
}

const EMPTY_BASICS: BasicsValues = {
  weight: '', height: '', age: '', sex: '',
}

const EMPTY_GOALS: GoalsValues = {
  primary_goal: '', goal_weight: '', waist: '', activity_level: '', pace: '',
}

const EMPTY_HEALTH: HealthValues = {
  medical_conditions: [], injuries: [],
}

const EMPTY_TRAINING: TrainingValues = {
  level: 'principiante', focus_areas: [], training_days: [], intensity: '', goal: '',
}

export default function OnboardingFlow({
  displayName,
  programs,
  activeProgram,
  userId,
  user,
  onSelectProgram,
  onCreateProgram,
  onComplete,
  onFirstMeasurement,
  onStartFirstWorkout,
}: OnboardingFlowProps) {
  // Detect if profile data is missing (e.g. Google OAuth signup or skipped step).
  // Freeze at mount: otherwise saving the profile mid-flow re-numbers the steps
  // and skips program selection (personalizingStep collides with the current step).
  const [needsProfile] = useState(() => !user?.weight && !user?.height && !user?.level)

  const [step, setStep] = useState(0)
  const [basics, setBasics] = useState<BasicsValues>(EMPTY_BASICS)
  const [goals, setGoals] = useState<GoalsValues>(EMPTY_GOALS)
  const [health, setHealth] = useState<HealthValues>(EMPTY_HEALTH)
  const [training, setTraining] = useState<TrainingValues>(EMPTY_TRAINING)
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(activeProgram?.id ?? null)
  const [selecting, setSelecting] = useState(false)
  const [reminderPreset, setReminderPreset] = useState<TrainingTimePresetId>(DEFAULT_TRAINING_TIME_PRESET)
  const [savingReminder, setSavingReminder] = useState(false)
  // Escrituras del onboarding a PocketBase, compartidas con móvil (#472).
  // Si un guardado falla devuelven false y NO se avanza de paso (#222).
  const {
    savingProfile, savingGoals, savingHealth, savingTraining,
    saveError, setSaveError,
    saveBasics, saveGoals, saveHealth, saveTraining,
  } = useOnboardingSubmit({
    userId,
    captureException: (e, stepName) =>
      Sentry.captureException(e, { tags: { flow: 'onboarding_save', step: stepName } }),
  })
  // Salud guardada (user_health): fallback para el matching de programas cuando
  // el flujo no pasó por el paso de salud (needsProfile=false).
  const { health: savedHealth } = useUserHealth(userId ?? null)
  // #695: si ya existe un recordatorio de entrenamiento activo (p.ej. lo creó
  // en un onboarding anterior interrumpido) no lo volvemos a pedir.
  const { reminders: workoutReminders, saveReminder } = useWorkoutReminders(userId ?? null)
  const hasWorkoutReminder = workoutReminders.some(r => r.reminderType === 'workout' && r.enabled)

  // Step index layout (frozen via needsProfile):
  //   0=welcome, 1=basics, 2=goals, 3=health, 4=training (only if needsProfile),
  //   then program, then reminder, then personalizing
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

  // `onboarding_step_viewed` solo se emite al AVANZAR, así que el primer paso
  // no lo emitía nadie y no se sabía cuánta gente llega a ver el onboarding
  // (#636 §4). Sin esto, `onboarding_completed` no tiene denominador.
  useEffect(() => {
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.onboardingStarted, {
      surface: 'onboarding', source: 'onboarding_web',
      total_steps: totalSteps,
      needs_profile: needsProfile,
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- una vez por onboarding

  // Precalienta el índice del catálogo (web lo carga perezoso, #486): así ya
  // está listo cuando `handleFinish('first_workout')` construya la sesión.
  useEffect(() => {
    getOrLoadCatalogIndex()
  }, [])

  const goToStep = (s: number) => {
    setSaveError(false)
    op.track('onboarding_step_viewed', { step: s, step_name: stepNameFor(s) })
    setStep(s)
  }

  const handleSelectProgram = async (programId: string) => {
    setSelectedProgramId(programId)
    setSelecting(true)
    try {
      await onSelectProgram(programId)
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

  // #695: guarda el recordatorio por defecto («¿a qué hora sueles entrenar?»)
  // con la entrega ya delegada al dispatcher del servidor. Pedir permiso de
  // notificaciones puede acabar denegado — igual guardamos el recordatorio: el
  // issue pide no insistir, no bloquear el guardado.
  const handleSaveReminder = async () => {
    setSavingReminder(true)
    setSaveError(false)
    try {
      const support = getNotificationSupport()
      let permission: 'granted' | 'denied' | 'unsupported' = 'unsupported'
      if (support.notifications) {
        const granted = await requestNotificationPermission()
        permission = granted ? 'granted' : 'denied'
        if (granted && userId) subscribeToPush(userId).catch(() => {})
      }

      const chosenPreset = findTrainingTimePreset(reminderPreset)
      const days = reminderDaysFromTraining(training.training_days)
      await saveReminder(chosenPreset.hour, chosenPreset.minute, days, 'workout')

      op.track('onboarding_reminder_set', {
        preset: chosenPreset.id,
        time: formatReminderTime(chosenPreset.hour, chosenPreset.minute),
        days_count: days.length,
        permission,
      })
      goToStep(personalizingStep)
    } catch {
      setSaveError(true)
    } finally {
      setSavingReminder(false)
    }
  }

  const handleSkipReminder = () => {
    op.track('onboarding_reminder_skipped', { preset: reminderPreset })
    goToStep(personalizingStep)
  }

  const handleFinish = (destination: 'home' | 'measurements' | 'first_workout' = 'home') => {
    if (userId) markOnboardingDone(userId)
    op.track('onboarding_completed', {
      first_measurement_cta: destination === 'measurements',
      destination,
      level: training.level || 'unknown',
      primary_goal: goals.primary_goal || 'unknown',
      has_program: !!selectedProgramId,
      has_goal_weight: !!goals.goal_weight,
      activity_level: goals.activity_level || 'unknown',
      conditions_count: health.medical_conditions.length,
      injuries_count: health.injuries.length,
      focus_areas_count: training.focus_areas.length,
      training_days_count: training.training_days.length,
      has_reminder: hasWorkoutReminder,
    })
    if (destination === 'measurements' && onFirstMeasurement) {
      onFirstMeasurement()
    } else if (destination === 'first_workout' && onStartFirstWorkout) {
      if (userId) markFirstWorkoutPending(userId, training.level || user?.level, 'onboarding')
      onStartFirstWorkout()
    } else {
      onComplete()
    }
  }

  const { t, i18n } = useTranslation()
  const currentLang = i18n.language.startsWith('en') ? 'en' : 'es'

  const firstName = displayName?.split(/[\s@]/)[0] || ''
  const currentWeightNum = parseDecimal(basics.weight)
  const currentHeightNum = parseDecimal(basics.height)

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }`}</style>
      <div className="w-full max-w-lg">
        {/* Selector de idioma: visible durante todo el onboarding */}
        <div className="flex justify-end gap-1 mb-3">
          {([['es', 'ES'], ['en', 'EN']] as const).map(([code, label]) => (
            <button
              key={code}
              type="button"
              onClick={() => i18n.changeLanguage(code)}
              aria-pressed={currentLang === code}
              className={`h-8 px-3 rounded-md border font-mono text-xs tracking-wide transition-colors ${
                currentLang === code
                  ? 'border-lime/40 bg-lime/10 text-lime'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <OnboardingProgress step={step} totalSteps={totalSteps} />

        {saveError && (
          <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 font-mono text-xs tracking-wide text-red-400">
            {t('onboarding.saveError')}
          </div>
        )}

        {step === 0 && (
          <StepWelcome
            firstName={firstName}
            needsProfile={needsProfile}
            onStart={() => goToStep(needsProfile ? profileStep : programStep)}
            onSkipAll={handleFinish}
          />
        )}

        {step === profileStep && (
          <StepBasics
            values={basics}
            onChange={setBasics}
            saving={savingProfile}
            onBack={() => goToStep(0)}
            onContinue={handleSaveBasics}
            onSkip={() => goToStep(goalsStep)}
          />
        )}

        {step === goalsStep && (
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
        )}

        {step === healthStep && (
          <StepHealth
            values={health}
            onChange={setHealth}
            saving={savingHealth}
            onBack={() => goToStep(goalsStep)}
            onContinue={handleSaveHealth}
            onSkipAsNone={handleNoIssues}
          />
        )}

        {step === trainingStep && (
          <StepTraining
            values={training}
            onChange={setTraining}
            saving={savingTraining}
            onBack={() => goToStep(healthStep)}
            onContinue={handleSaveTraining}
            onSkip={() => goToStep(programStep)}
          />
        )}

        {step === programStep && (
          <StepProgram
            programs={programs}
            selectedProgramId={selectedProgramId}
            selecting={selecting}
            userId={userId}
            user={{
              level: user?.level,
              weight: user?.weight,
              goal_weight: user?.goal_weight,
              primary_goal: goals.primary_goal || user?.primary_goal,
              focus_areas: user?.focus_areas,
              training_days: user?.training_days,
              injuries: health.injuries.length ? health.injuries : savedHealth.injuries,
              medical_conditions: health.medical_conditions.length ? health.medical_conditions : savedHealth.medical_conditions,
            }}
            onSelectProgram={handleSelectProgram}
            onCreateProgram={() => {
              if (userId) markOnboardingDone(userId)
              onCreateProgram()
            }}
            onBack={() => goToStep(needsProfile ? trainingStep : 0)}
            onContinue={() => goToStep(hasWorkoutReminder ? personalizingStep : reminderStep)}
          />
        )}

        {step === reminderStep && (
          <StepReminder
            preset={reminderPreset}
            onChange={setReminderPreset}
            saving={savingReminder}
            onBack={() => goToStep(programStep)}
            onContinue={handleSaveReminder}
            onSkip={handleSkipReminder}
          />
        )}

        {step === personalizingStep && (
          <StepPersonalizing
            currentWeightKg={currentWeightNum}
            goalWeightKg={parseDecimal(goals.goal_weight)}
            pace={goals.pace}
            program={programs.find(p => p.id === selectedProgramId) ?? null}
            onFinish={() => handleFinish()}
            onFirstMeasurement={onFirstMeasurement ? () => handleFinish('measurements') : undefined}
            onStartFirstWorkout={onStartFirstWorkout ? () => handleFinish('first_workout') : undefined}
            firstWorkoutMinutes={estimateFirstWorkoutMinutes(normalizeFirstWorkoutLevel(training.level || user?.level))}
          />
        )}
      </div>
    </div>
  )
}
