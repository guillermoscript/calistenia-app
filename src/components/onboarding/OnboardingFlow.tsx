import { useState } from 'react'
import { pb } from '../../lib/pocketbase'
import { op } from '../../lib/analytics'
import type { ProgramMeta } from '../../types'
import { markOnboardingDone } from './state'
import { OnboardingProgress } from './OnboardingProgress'
import { StepWelcome } from './StepWelcome'
import { StepBasics, type BasicsValues } from './StepBasics'
import { StepGoals, type GoalsValues } from './StepGoals'
import { StepHealth, type HealthValues } from './StepHealth'
import { StepTraining, type TrainingValues } from './StepTraining'
import { StepProgram } from './StepProgram'
import { StepOrientation } from './StepOrientation'

interface OnboardingFlowProps {
  displayName: string
  programs: ProgramMeta[]
  activeProgram: ProgramMeta | null
  userId?: string
  user?: any
  onSelectProgram: (programId: string) => Promise<boolean>
  onCreateProgram: () => void
  onComplete: () => void
}

const EMPTY_BASICS: BasicsValues = {
  weight: '', height: '', age: '', sex: '',
}

const EMPTY_GOALS: GoalsValues = {
  goal_weight: '', activity_level: '', pace: '',
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
}: OnboardingFlowProps) {
  // Detect if profile data is missing (e.g. Google OAuth signup or skipped step).
  // Freeze at mount: otherwise saving the profile mid-flow re-numbers the steps
  // and skips program selection (orientationStep collides with the current step).
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

  // Step index layout (frozen via needsProfile):
  //   0=welcome, 1=basics, 2=goals, 3=health, 4=training (only if needsProfile),
  //   then program, then orientation
  const profileStep = needsProfile ? 1 : -1
  const goalsStep = needsProfile ? 2 : -1
  const healthStep = needsProfile ? 3 : -1
  const trainingStep = needsProfile ? 4 : -1
  const programStep = needsProfile ? 5 : 1
  const orientationStep = needsProfile ? 6 : 2
  const totalSteps = needsProfile ? 7 : 3

  const stepNameFor = (s: number): string => {
    if (s === 0) return 'welcome'
    if (s === profileStep) return 'profile'
    if (s === goalsStep) return 'goals'
    if (s === healthStep) return 'health'
    if (s === trainingStep) return 'training'
    if (s === programStep) return 'program'
    if (s === orientationStep) return 'orientation'
    return `step_${s}`
  }

  const goToStep = (s: number) => {
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
    if (!userId) return
    setSavingProfile(true)
    try {
      await pb.collection('users').update(userId, {
        weight: basics.weight ? parseFloat(basics.weight) : null,
        height: basics.height ? parseFloat(basics.height) : null,
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
    try {
      await pb.collection('users').update(userId, {
        goal_weight: goals.goal_weight ? parseFloat(goals.goal_weight) : null,
        activity_level: goals.activity_level || '',
        pace: goals.pace || '',
      })
    } catch (e) {
      console.warn('Failed to save onboarding goals:', e)
    }
    setSavingGoals(false)
    goToStep(healthStep)
  }

  const saveHealthAnd = async (next: HealthValues, advanceTo: number) => {
    if (!userId) return
    setSavingHealth(true)
    try {
      await pb.collection('users').update(userId, {
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
    markOnboardingDone(userId)
    op.track('onboarding_completed', {
      level: training.level || 'unknown',
      has_program: !!selectedProgramId,
      has_goal_weight: !!goals.goal_weight,
      activity_level: goals.activity_level || 'unknown',
      conditions_count: health.medical_conditions.length,
      injuries_count: health.injuries.length,
      focus_areas_count: training.focus_areas.length,
      training_days_count: training.training_days.length,
    })
    onComplete()
  }

  const firstName = displayName?.split(/[\s@]/)[0] || ''
  const currentWeightNum = basics.weight ? parseFloat(basics.weight) : null
  const currentHeightNum = basics.height ? parseFloat(basics.height) : null

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }`}</style>
      <div className="w-full max-w-lg">
        <OnboardingProgress step={step} totalSteps={totalSteps} />

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
            onSelectProgram={handleSelectProgram}
            onCreateProgram={() => {
              markOnboardingDone(userId)
              onCreateProgram()
            }}
            onBack={() => goToStep(needsProfile ? trainingStep : 0)}
            onContinue={() => goToStep(orientationStep)}
          />
        )}

        {step === orientationStep && (
          <StepOrientation
            onFinish={handleFinish}
            onBack={() => goToStep(programStep)}
          />
        )}
      </div>
    </div>
  )
}
