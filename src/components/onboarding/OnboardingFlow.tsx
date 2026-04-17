import { useState } from 'react'
import { pb } from '../../lib/pocketbase'
import { op } from '../../lib/analytics'
import type { ProgramMeta } from '../../types'
import { markOnboardingDone } from './state'
import { OnboardingProgress } from './OnboardingProgress'
import { StepWelcome } from './StepWelcome'
import { StepBasics, type BasicsValues } from './StepBasics'
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
  weight: '', height: '', age: '', sex: '', level: 'principiante', goal: '',
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
  const [savingProfile, setSavingProfile] = useState(false)
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(activeProgram?.id ?? null)
  const [selecting, setSelecting] = useState(false)

  // Step index layout (frozen via needsProfile):
  //   0=welcome, 1=basics (only if needsProfile), then program, then orientation
  const profileStep = needsProfile ? 1 : -1
  const programStep = needsProfile ? 2 : 1
  const orientationStep = needsProfile ? 3 : 2
  const totalSteps = needsProfile ? 4 : 3

  const STEP_NAMES = ['welcome', 'profile', 'program', 'orientation'] as const
  const goToStep = (s: number) => {
    const name = s === profileStep ? 'profile'
      : s === programStep ? 'program'
      : s === orientationStep ? 'orientation'
      : STEP_NAMES[s] || `step_${s}`
    op.track('onboarding_step_viewed', { step: s, step_name: name })
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
        level: basics.level || 'principiante',
        goal: basics.goal || '',
      })
    } catch (e) {
      console.warn('Failed to save onboarding profile:', e)
    }
    setSavingProfile(false)
    goToStep(programStep)
  }

  const handleFinish = () => {
    markOnboardingDone(userId)
    op.track('onboarding_completed', {
      level: basics.level || 'unknown',
      has_program: !!selectedProgramId,
    })
    onComplete()
  }

  const firstName = displayName?.split(/[\s@]/)[0] || ''

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
            onBack={() => goToStep(needsProfile ? profileStep : 0)}
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
