import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { cn } from '../lib/utils'
import { pb } from '../lib/pocketbase'
import { op } from '../lib/analytics'
import type { ProgramMeta } from '../types'

const ONBOARDING_KEY_PREFIX = 'calistenia_onboarding_done'

function getOnboardingKey(userId?: string): string {
  return userId ? `${ONBOARDING_KEY_PREFIX}_${userId}` : ONBOARDING_KEY_PREFIX
}

export function isOnboardingDone(userId?: string): boolean {
  return localStorage.getItem(getOnboardingKey(userId)) === 'true'
}

export function markOnboardingDone(userId?: string): void {
  localStorage.setItem(getOnboardingKey(userId), 'true')
}

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

const DIFFICULTY_STYLES: Record<string, string> = {
  beginner: 'text-emerald-400 border-emerald-400/30',
  intermediate: 'text-amber-400 border-amber-400/30',
  advanced: 'text-red-400 border-red-400/30',
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
  const { t } = useTranslation()

  // Detect if profile data is missing (e.g. Google OAuth signup or skipped step)
  const needsProfile = !user?.weight && !user?.height && !user?.level

  const LEVELS = [
    { value: 'principiante', label: t('onboarding.beginner'), desc: t('onboarding.beginnerDesc') },
    { value: 'intermedio', label: t('onboarding.intermediate'), desc: t('onboarding.intermediateDesc') },
    { value: 'avanzado', label: t('onboarding.advanced'), desc: t('onboarding.advancedDesc') },
  ]

  const SEX_OPTIONS = [
    { value: 'male', label: t('onboarding.male') },
    { value: 'female', label: t('onboarding.female') },
  ]

  const HOW_IT_WORKS = [
    {
      step: 1,
      label: t('onboarding.step1Label'),
      desc: t('onboarding.step1Desc'),
      accent: 'text-[hsl(var(--lime))]',
      bg: 'bg-[hsl(var(--lime))]/10',
    },
    {
      step: 2,
      label: t('onboarding.step2Label'),
      desc: t('onboarding.step2Desc'),
      accent: 'text-sky-400',
      bg: 'bg-sky-400/10',
    },
    {
      step: 3,
      label: t('onboarding.step3Label'),
      desc: t('onboarding.step3Desc'),
      accent: 'text-amber-400',
      bg: 'bg-amber-400/10',
    },
  ]

  const EXTRAS = [
    { icon: '🍽️', label: t('onboarding.nutritionExtra'), desc: t('onboarding.nutritionExtraDesc') },
    { icon: '🏃', label: t('onboarding.cardioExtra'), desc: t('onboarding.cardioExtraDesc') },
    { icon: '👥', label: t('onboarding.socialExtra'), desc: t('onboarding.socialExtraDesc') },
  ]

  const [step, setStep] = useState(0)
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(activeProgram?.id ?? null)
  const [selecting, setSelecting] = useState(false)

  // Profile fields
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState('')
  const [level, setLevel] = useState('principiante')
  const [goal, setGoal] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  // Steps: 0=welcome, 1=profile (conditional), 2=program, 3=orientation
  const profileStep = needsProfile ? 1 : -1
  const programStep = needsProfile ? 2 : 1
  const orientationStep = needsProfile ? 3 : 2
  const totalSteps = needsProfile ? 4 : 3

  const STEP_NAMES = ['welcome', 'profile', 'program', 'orientation'] as const
  const goToStep = (s: number) => {
    const name = s === profileStep ? 'profile' : s === programStep ? 'program' : s === orientationStep ? 'orientation' : STEP_NAMES[s] || `step_${s}`
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

  const handleSaveProfile = async () => {
    if (!userId) return
    setSavingProfile(true)
    try {
      await pb.collection('users').update(userId, {
        weight: weight ? parseFloat(weight) : null,
        height: height ? parseFloat(height) : null,
        age: age ? parseInt(age, 10) : null,
        sex: sex || null,
        level: level || 'principiante',
        goal: goal || '',
      })
    } catch (e) {
      console.warn('Failed to save onboarding profile:', e)
    }
    setSavingProfile(false)
    goToStep(programStep)
  }

  const handleFinish = () => {
    markOnboardingDone(userId)
    op.track('onboarding_completed', { level: level || 'unknown', has_program: !!selectedProgramId })
    onComplete()
  }

  const firstName = displayName?.split(/[\s@]/)[0] || ''

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }`}</style>
      <div className="w-full max-w-lg">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === step ? 'w-8 bg-[hsl(var(--lime))]' : 'w-1.5 bg-muted-foreground/30'
              )}
            />
          ))}
        </div>

        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="text-center animate-[fadeUp_0.5s_ease]">
            <div className="font-bebas text-6xl md:text-7xl text-[hsl(var(--lime))] mb-2 leading-none">
              CALISTENIA
            </div>
            <div className="text-muted-foreground text-sm mb-6">
              {firstName ? t('onboarding.welcomeMsg', { name: firstName }) : t('onboarding.welcomeDefault')}
            </div>

            {/* Visual flow explanation */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {[
                { icon: '📋', label: t('onboarding.programLabel') },
                { icon: '→', label: '' },
                { icon: '📅', label: t('onboarding.dayLabel') },
                { icon: '→', label: '' },
                { icon: '💪', label: t('onboarding.exercises') },
                { icon: '→', label: '' },
                { icon: '📈', label: t('onboarding.progress') },
              ].map((item, i) => (
                <div key={i} className="flex flex-col items-center">
                  <span className={cn('text-lg', item.label ? '' : 'text-muted-foreground/40 text-sm')}>{item.icon}</span>
                  {item.label && <span className="text-[9px] text-muted-foreground mt-0.5">{item.label}</span>}
                </div>
              ))}
            </div>

            <Card className="mb-6 text-left">
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground leading-relaxed">
                  <p className="mb-2">
                    <strong className="text-foreground">{t('onboarding.howItWorks')}</strong> {t('onboarding.howItWorksDetail')}
                  </p>
                  <p className="text-xs">
                    {needsProfile
                      ? t('onboarding.needsProfileHint')
                      : t('onboarding.justChooseProgram')}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Button
              onClick={() => goToStep(needsProfile ? profileStep : programStep)}
              className="w-full h-12 font-bebas text-xl tracking-wide bg-[hsl(var(--lime))] hover:bg-[hsl(var(--lime))]/90 text-background"
            >
              {needsProfile ? t('onboarding.startBtn') : t('onboarding.chooseProgramBtn')}
            </Button>

            <button
              onClick={handleFinish}
              className="mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('onboarding.skipAll')}
            </button>
          </div>
        )}

        {/* Step 1: Profile (only if needed) */}
        {step === profileStep && (
          <div className="animate-[fadeUp_0.5s_ease]">
            <div className="text-center mb-6">
              <div className="font-bebas text-3xl mb-1">{t('onboarding.aboutYou')}</div>
              <div className="text-sm text-muted-foreground">
                {t('onboarding.aboutYouDesc')}
              </div>
            </div>

            <Card className="mb-6">
              <CardContent className="p-5 flex flex-col gap-4">
                {/* Physical data */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ob-weight" className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.weight')}</Label>
                    <Input
                      id="ob-weight"
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="75"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      className="h-10"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ob-height" className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.height')}</Label>
                    <Input
                      id="ob-height"
                      type="number"
                      min="0"
                      placeholder="175"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      className="h-10"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ob-age" className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.age')}</Label>
                    <Input
                      id="ob-age"
                      type="number"
                      min="13"
                      max="99"
                      placeholder="28"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      className="h-10"
                    />
                  </div>
                </div>

                {/* Sex */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.sex')}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {SEX_OPTIONS.map(s => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setSex(s.value)}
                        className={cn(
                          'h-10 rounded-md border text-sm transition-colors',
                          sex === s.value
                            ? 'border-[hsl(var(--lime))] bg-[hsl(var(--lime))]/10 text-[hsl(var(--lime))]'
                            : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Level */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.level')}</Label>
                  <div className="flex flex-col gap-2">
                    {LEVELS.map(l => (
                      <button
                        key={l.value}
                        type="button"
                        onClick={() => setLevel(l.value)}
                        className={cn(
                          'flex items-center gap-3 px-3.5 py-2.5 rounded-md border text-left transition-colors',
                          level === l.value
                            ? 'border-[hsl(var(--lime))] bg-[hsl(var(--lime))]/5'
                            : 'border-border hover:border-foreground/30'
                        )}
                      >
                        <div className={cn(
                          'w-3 h-3 rounded-full border-2 shrink-0',
                          level === l.value ? 'border-[hsl(var(--lime))] bg-[hsl(var(--lime))]' : 'border-muted-foreground/40'
                        )} />
                        <div>
                          <p className={cn('text-sm', level === l.value ? 'text-[hsl(var(--lime))]' : 'text-foreground')}>{l.label}</p>
                          <p className="text-xs text-muted-foreground">{l.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Goal */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ob-goal" className="text-[11px] text-muted-foreground tracking-wide uppercase">{t('onboarding.goal')}</Label>
                  <textarea
                    id="ob-goal"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder={t('onboarding.goalPlaceholder')}
                    rows={2}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => goToStep(0)}
                className="flex-1 h-11 font-mono text-xs tracking-wide"
              >
                {t('onboarding.back')}
              </Button>
              <Button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="flex-1 h-11 font-bebas text-lg tracking-wide bg-[hsl(var(--lime))] hover:bg-[hsl(var(--lime))]/90 text-background"
              >
                {savingProfile ? t('onboarding.saving') : t('onboarding.continueBtn')}
              </Button>
            </div>

            <button
              onClick={() => goToStep(programStep)}
              className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
            >
              {t('onboarding.skipForNow')}
            </button>
          </div>
        )}

        {/* Step: Choose program */}
        {step === programStep && (
          <div className="animate-[fadeUp_0.5s_ease]">
            <div className="text-center mb-4">
              <div className="font-bebas text-3xl mb-1">{t('onboarding.chooseProgramTitle')}</div>
              <div className="text-sm text-muted-foreground">
                {t('onboarding.chooseProgramDesc')}
              </div>
            </div>

            {/* Hint for official programs */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-400/5 border border-amber-400/20 mb-4">
              <span className="text-amber-400 text-sm">★</span>
              <span className="text-xs text-muted-foreground" dangerouslySetInnerHTML={{ __html: t('onboarding.recommendedHint') }} />
            </div>

            <div className="space-y-3 mb-6 max-h-[50vh] overflow-y-auto pr-1">
              {/* Show official programs first (featured at top), then rest */}
              {[...programs]
                .sort((a, b) => {
                  // Featured first, then official, then rest
                  if (a.is_featured && !b.is_featured) return -1
                  if (!a.is_featured && b.is_featured) return 1
                  if (a.is_official && !b.is_official) return -1
                  if (!a.is_official && b.is_official) return 1
                  return a.name.localeCompare(b.name)
                })
                .map((program) => {
                const isSelected = selectedProgramId === program.id
                const isOwn = program.created_by === userId
                return (
                  <Card
                    key={program.id}
                    className={cn(
                      'cursor-pointer transition-all duration-200 border-2',
                      isSelected
                        ? 'border-[hsl(var(--lime))] bg-[hsl(var(--lime))]/5'
                        : program.is_featured
                          ? 'border-amber-400/20 bg-amber-400/[0.03] hover:border-amber-400/40'
                          : 'border-transparent hover:border-muted-foreground/20'
                    )}
                    onClick={() => handleSelectProgram(program.id)}
                  >
                    <CardContent className="p-4 flex items-center gap-3">
                      <div
                        className={cn(
                          'size-10 rounded-lg flex items-center justify-center shrink-0 text-lg font-bebas',
                          isSelected
                            ? 'bg-[hsl(var(--lime))] text-background'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {isSelected ? '✓' : program.name[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn('font-medium text-sm', isSelected && 'text-[hsl(var(--lime))]')}>
                            {program.name}
                          </span>
                          {program.is_featured && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-amber-400 border-amber-400/30">
                              {t('onboarding.recommended')}
                            </Badge>
                          )}
                          {program.is_official && !program.is_featured && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-emerald-400 border-emerald-400/30">
                              {t('onboarding.official')}
                            </Badge>
                          )}
                          {isOwn && !program.is_official && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-sky-500 border-sky-500/30">
                              {t('onboarding.yours')}
                            </Badge>
                          )}
                          {!isOwn && !program.is_official && program.created_by_name && (
                            <span className="text-[9px] text-muted-foreground">
                              {t('onboarding.by', { name: program.created_by_name })}
                            </span>
                          )}
                        </div>
                        {program.description && (
                          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {program.description}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground">
                            {program.duration_weeks} {t('onboarding.weeks')}
                          </span>
                          {program.difficulty && (
                            <Badge variant="outline" className={cn('text-[8px] px-1.5 py-0', DIFFICULTY_STYLES[program.difficulty] || '')}>
                              {t(`difficulty.${program.difficulty}`).toUpperCase()}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* Create own option */}
            <Card
              className="cursor-pointer border-2 border-dashed border-muted-foreground/20 hover:border-sky-500/40 transition-all"
              onClick={() => {
                markOnboardingDone(userId)
                onCreateProgram()
              }}
            >
              <CardContent className="p-4 text-center">
                <div className="text-sm text-muted-foreground">
                  <span className="text-sky-500 font-medium">{t('onboarding.createOwn')}</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3 mt-6">
              <Button
                variant="outline"
                onClick={() => goToStep(needsProfile ? profileStep : 0)}
                className="flex-1 h-11 font-mono text-xs tracking-wide"
              >
                {t('onboarding.back')}
              </Button>
              <Button
                onClick={() => goToStep(orientationStep)}
                disabled={!selectedProgramId || selecting}
                className="flex-1 h-11 font-bebas text-lg tracking-wide bg-[hsl(var(--lime))] hover:bg-[hsl(var(--lime))]/90 text-background disabled:opacity-40"
              >
                {selecting ? t('onboarding.saving') : t('onboarding.continueBtn')}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Quick orientation */}
        {step === orientationStep && (
          <div className="animate-[fadeUp_0.5s_ease]">
            <div className="text-center mb-6">
              <div className="font-bebas text-3xl mb-1">{t('onboarding.howItWorksTitle')}</div>
              <div className="text-sm text-muted-foreground">
                {t('onboarding.dailyRoutine')}
              </div>
            </div>

            {/* Core flow — numbered steps */}
            <div className="space-y-3 mb-6">
              {HOW_IT_WORKS.map((item) => (
                <div key={item.step} className="flex items-start gap-3">
                  <div className={cn(
                    'size-8 rounded-full flex items-center justify-center shrink-0 font-bebas text-lg',
                    item.bg, item.accent,
                  )}>
                    {item.step}
                  </div>
                  <div className="pt-0.5">
                    <div className={cn('font-medium text-sm', item.accent)}>{item.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {item.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Extras */}
            <div className="border-t border-border pt-4 mb-6">
              <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase mb-3">{t('onboarding.alsoCanDo')}</div>
              <div className="grid grid-cols-3 gap-2">
                {EXTRAS.map((extra) => (
                  <div key={extra.label} className="text-center p-2.5 rounded-lg bg-card border border-border">
                    <div className="text-lg mb-1">{extra.icon}</div>
                    <div className="text-[11px] font-medium">{extra.label}</div>
                    <div className="text-[9px] text-muted-foreground mt-0.5 leading-snug">{extra.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <Button
              onClick={handleFinish}
              className="w-full h-12 font-bebas text-xl tracking-wide bg-[hsl(var(--lime))] hover:bg-[hsl(var(--lime))]/90 text-background"
            >
              {t('onboarding.goTrain')}
            </Button>

            <button
              onClick={() => goToStep(programStep)}
              className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
            >
              {t('onboarding.backToProgram')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
