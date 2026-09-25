import { useState, useEffect, useRef } from 'react'
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
import { OnboardingProgress } from './OnboardingProgress'
import { StepWelcome } from './StepWelcome'
import {
  DISCOVERY_SOURCE_NOT_ANSWERED,
  trackDiscoverySourceAnswered,
  type DiscoverySourceId,
} from '@calistenia/core/lib/discovery-source'
import { rememberDiscoverySource } from '@calistenia/core/lib/discovery-survey'
import type { GoalsValues, TrainingValues } from '@calistenia/core/types/onboarding'
import { StepBasics, type BasicsValues } from './StepBasics'
import { StepEssentials } from './StepEssentials'
import { StepHealth, type HealthValues } from './StepHealth'
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
  // «¿Cómo conociste la app?» (#586). Se emite UNA vez, al salir de la
  // bienvenida; volver atrás y salir de nuevo no lo repite.
  const [discoverySource, setDiscoverySource] = useState<DiscoverySourceId | null>(null)
  const discoveryTracked = useRef(false)
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
  //   0=welcome, 1=basics, 2=essentials (only if needsProfile), 3=health,
  //   then program, then reminder, then personalizing
  // #820: goals + training used to be two separate steps; essentials merges
  // them into one (primary_goal + level), the rest of their fields moved to
  // "completa tu perfil" (ProfilePage), reachable after the first workout.
  const profileStep = needsProfile ? 1 : -1
  const essentialsStep = needsProfile ? 2 : -1
  const healthStep = needsProfile ? 3 : -1
  const programStep = needsProfile ? 4 : 1
  const reminderStep = needsProfile ? 5 : 2
  const personalizingStep = needsProfile ? 6 : 3
  const totalSteps = needsProfile ? 7 : 4

  const stepNameFor = (s: number): string => {
    if (s === 0) return 'welcome'
    if (s === profileStep) return 'profile'
    if (s === essentialsStep) return 'essentials'
    if (s === healthStep) return 'health'
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

  const leaveWelcome = () => {
    if (discoverySource && !discoveryTracked.current) {
      discoveryTracked.current = true
      trackDiscoverySourceAnswered(discoverySource, 'onboarding_web')
      // La encuesta de descubrimiento no vuelve a preguntar lo que ya se contestó aquí.
      if (userId) rememberDiscoverySource(userId, discoverySource)
    }
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

  // Paso siguiente al de programa: se salta el recordatorio si ya hay uno
  // activo (perfil existente, o volvió atrás tras guardarlo).
  const nextAfterProgram = hasWorkoutReminder ? personalizingStep : reminderStep

  // Atajo «elígelo por mí» (#820): selecciona el recomendado y avanza en un
  // solo toque, sin obligar a mirar la lista completa de programas.
  const handlePickForMe = async (programId: string) => {
    await handleSelectProgram(programId)
    goToStep(nextAfterProgram)
  }

  const handleSaveBasics = async () => {
    if (await saveBasics(basics)) goToStep(essentialsStep)
  }

  // #820: guarda objetivo + nivel de un tirón (antes eran dos pasos, "goals" y
  // "training"). `basics` va con las metas para sembrar el objetivo de
  // nutrición si el usuario pasó por básicos; el resto de campos finos de
  // ambos pasos viejos (peso objetivo, actividad, ritmo, áreas de foco, días,
  // intensidad, objetivo libre) ya no se piden aquí y quedan editables desde
  // el perfil, así que se guardan vacíos hasta que el usuario los rellene ahí.
  const handleSaveEssentials = async () => {
    if (!(await saveGoals(goals, basics))) return
    if (await saveTraining(training)) goToStep(healthStep)
  }

  const saveHealthAnd = async (next: HealthValues, advanceTo: number) => {
    if (await saveHealth(next)) goToStep(advanceTo)
  }

  const handleSaveHealth = () => saveHealthAnd(health, programStep)

  const handleNoIssues = () => {
    const empty: HealthValues = { medical_conditions: [], injuries: [] }
    setHealth(empty)
    saveHealthAnd(empty, programStep)
  }

  // #695: guarda el recordatorio por defecto («¿a qué hora sueles entrenar?»)
  // con la entrega ya delegada al dispatcher del servidor. Desde #815 este
  // paso ya NO pide el permiso de notificaciones del navegador: eso vive
  // únicamente en la celebración del primer entreno (`PushPermissionCard`),
  // para que `shouldShowPushPrompt` siga viendo el permiso como
  // `undetermined` cuando el usuario llega ahí.
  const handleSaveReminder = async () => {
    setSavingReminder(true)
    setSaveError(false)
    try {
      const chosenPreset = findTrainingTimePreset(reminderPreset)
      const days = reminderDaysFromTraining(training.training_days)
      await saveReminder(chosenPreset.hour, chosenPreset.minute, days, 'workout')

      op.track('onboarding_reminder_set', {
        preset: chosenPreset.id,
        time: formatReminderTime(chosenPreset.hour, chosenPreset.minute),
        days_count: days.length,
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
      discovery_source: discoverySource ?? DISCOVERY_SOURCE_NOT_ANSWERED,
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
            discoverySource={discoverySource}
            onDiscoverySourceChange={setDiscoverySource}
            onStart={() => { leaveWelcome(); goToStep(needsProfile ? profileStep : programStep) }}
            onSkipAll={() => { leaveWelcome(); handleFinish() }}
          />
        )}

        {step === profileStep && (
          <StepBasics
            values={basics}
            onChange={setBasics}
            saving={savingProfile}
            onBack={() => goToStep(0)}
            onContinue={handleSaveBasics}
            onSkip={() => goToStep(essentialsStep)}
          />
        )}

        {step === essentialsStep && (
          <StepEssentials
            primaryGoal={goals.primary_goal}
            onPrimaryGoalChange={(primary_goal) => setGoals({ ...goals, primary_goal })}
            level={training.level}
            onLevelChange={(level) => setTraining({ ...training, level })}
            saving={savingGoals || savingTraining}
            onBack={() => goToStep(profileStep)}
            onContinue={handleSaveEssentials}
            onSkip={() => goToStep(healthStep)}
          />
        )}

        {step === healthStep && (
          <StepHealth
            values={health}
            onChange={setHealth}
            saving={savingHealth}
            onBack={() => goToStep(essentialsStep)}
            onContinue={handleSaveHealth}
            onSkipAsNone={handleNoIssues}
          />
        )}

        {step === programStep && (
          <StepProgram
            programs={programs}
            selectedProgramId={selectedProgramId}
            selecting={selecting}
            userId={userId}
            user={{
              level: training.level || user?.level,
              weight: user?.weight,
              goal_weight: user?.goal_weight,
              primary_goal: goals.primary_goal || user?.primary_goal,
              // Del estado del formulario y no de `users` (#717): el sexo es
              // PII y vive en `nutrition_goals` (#676). Quien no pasó por el
              // paso de básicos recibe el programa genérico de su celda.
              sex: basics.sex || undefined,
              focus_areas: user?.focus_areas,
              training_days: user?.training_days,
              injuries: health.injuries.length ? health.injuries : savedHealth.injuries,
              medical_conditions: health.medical_conditions.length ? health.medical_conditions : savedHealth.medical_conditions,
            }}
            onSelectProgram={handleSelectProgram}
            onPickForMe={handlePickForMe}
            onCreateProgram={() => {
              if (userId) markOnboardingDone(userId)
              onCreateProgram()
            }}
            onBack={() => goToStep(needsProfile ? healthStep : 0)}
            onContinue={() => goToStep(nextAfterProgram)}
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
