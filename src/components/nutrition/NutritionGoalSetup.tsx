import { useState, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import type { NutritionGoal, NutritionGoalType, ActivityLevel, Sex } from '../../types'

interface NutritionGoalSetupProps {
  onSave: (goals: NutritionGoal) => void
  calculateMacros: (weight: number, height: number, age: number, sex: string, activityLevel: string, goal: string, pace?: string) => {
    dailyCalories: number
    dailyProtein: number
    dailyCarbs: number
    dailyFat: number
  }
  /** Pre-fill from user profile */
  initialWeight?: number
  initialHeight?: number
  initialAge?: number
  initialSex?: Sex
  initialActivityLevel?: ActivityLevel
  initialGoal?: NutritionGoalType
  /** From onboarding Goals step — modulates calorie delta magnitude */
  initialPace?: 'gradual' | 'balanced' | 'aggressive'
}

const ACTIVITY_LEVELS: { id: ActivityLevel; labelKey: string; descKey: string }[] = [
  { id: 'sedentary', labelKey: 'nutrition.activity.sedentary', descKey: 'nutrition.activity.sedentaryDesc' },
  { id: 'light', labelKey: 'nutrition.activity.light', descKey: 'nutrition.activity.lightDesc' },
  { id: 'moderate', labelKey: 'nutrition.activity.moderate', descKey: 'nutrition.activity.moderateDesc' },
  { id: 'active', labelKey: 'nutrition.activity.active', descKey: 'nutrition.activity.activeDesc' },
  { id: 'very_active', labelKey: 'nutrition.activity.veryActive', descKey: 'nutrition.activity.veryActiveDesc' },
]

const GOALS: { id: NutritionGoalType; labelKey: string; icon: string; descKey: string }[] = [
  { id: 'muscle_gain', labelKey: 'nutrition.goal.muscleGain', icon: '💪', descKey: 'nutrition.goal.muscleGainDesc' },
  { id: 'fat_loss', labelKey: 'nutrition.goal.fatLoss', icon: '🔥', descKey: 'nutrition.goal.fatLossDesc' },
  { id: 'recomp', labelKey: 'nutrition.goal.recomp', icon: '⚖️', descKey: 'nutrition.goal.recompDesc' },
  { id: 'maintain', labelKey: 'nutrition.goal.maintain', icon: '✅', descKey: 'nutrition.goal.maintainDesc' },
]

export default function NutritionGoalSetup({
  onSave, calculateMacros,
  initialWeight, initialHeight, initialAge, initialSex,
  initialActivityLevel, initialGoal, initialPace,
}: NutritionGoalSetupProps) {
  const { t } = useTranslation()
  const formId = useId()
  const [step, setStep] = useState(0)

  // Body data — pre-fill from user profile if available
  const [weight, setWeight] = useState(initialWeight ? String(initialWeight) : '')
  const [height, setHeight] = useState(initialHeight ? String(initialHeight) : '')
  const [age, setAge] = useState(initialAge ? String(initialAge) : '')

  // Selections
  const [sex, setSex] = useState<Sex>(initialSex ?? 'male')
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(initialActivityLevel ?? 'moderate')
  const [goal, setGoal] = useState<NutritionGoalType>(initialGoal ?? 'muscle_gain')

  // Calculated / adjustable macros
  const [macros, setMacros] = useState({ dailyCalories: 0, dailyProtein: 0, dailyCarbs: 0, dailyFat: 0 })

  const canProceed = () => {
    if (step === 0) return weight !== '' && height !== '' && age !== ''
    return true
  }

  const handleNext = () => {
    if (step === 4) {
      // Calculate macros before showing review
      const result = calculateMacros(
        parseFloat(weight), parseFloat(height), parseInt(age), sex, activityLevel, goal, initialPace
      )
      setMacros(result)
    }
    setStep(s => s + 1)
  }

  const handleSave = () => {
    onSave({
      ...macros,
      goal,
      weight: parseFloat(weight),
      height: parseFloat(height),
      age: parseInt(age),
      sex,
      activityLevel,
    })
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">{t('nutrition.setup.subtitle')}</div>
      <div className="font-bebas text-4xl mb-6">{t('nutrition.setup.title')}</div>

      {/* Step indicator */}
      <div className="flex gap-1.5 mb-6" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={6} aria-label={t('nutrition.setup.step', { current: step + 1, total: 6 })}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i <= step ? 'bg-lime' : 'bg-muted'
            )}
          />
        ))}
      </div>

      {/* Step 0: Body data */}
      {step === 0 && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-3">{t('nutrition.setup.bodyData')}</div>
            <div>
              <label htmlFor={`${formId}-weight`} className="text-xs text-muted-foreground mb-1 block">{t('nutrition.setup.weight')}</label>
              <Input
                id={`${formId}-weight`}
                type="number"
                placeholder="70"
                value={weight}
                onChange={e => setWeight(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={`${formId}-height`} className="text-xs text-muted-foreground mb-1 block">{t('nutrition.setup.height')}</label>
              <Input
                id={`${formId}-height`}
                type="number"
                placeholder="175"
                value={height}
                onChange={e => setHeight(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={`${formId}-age`} className="text-xs text-muted-foreground mb-1 block">{t('nutrition.setup.age')}</label>
              <Input
                id={`${formId}-age`}
                type="number"
                placeholder="25"
                value={age}
                onChange={e => setAge(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Sex */}
      {step === 1 && (
        <Card>
          <CardContent className="p-5">
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-4">{t('nutrition.setup.sex')}</div>
            <div className="grid grid-cols-2 gap-3">
              {(['male', 'female'] as Sex[]).map(s => (
                <button
                  key={s}
                  onClick={() => setSex(s)}
                  className={cn(
                    'p-4 rounded-lg border text-center transition-all',
                    sex === s
                      ? 'border-lime bg-lime/10 text-lime'
                      : 'border-border bg-card hover:border-lime/40'
                  )}
                >
                  <div className="text-2xl mb-1">{s === 'male' ? '♂' : '♀'}</div>
                  <div className="text-sm font-medium">{s === 'male' ? t('nutrition.setup.male') : t('nutrition.setup.female')}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Activity level */}
      {step === 2 && (
        <Card>
          <CardContent className="p-5">
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-4">{t('nutrition.setup.activityLevel')}</div>
            <div className="space-y-2">
              {ACTIVITY_LEVELS.map(level => (
                <button
                  key={level.id}
                  onClick={() => setActivityLevel(level.id)}
                  className={cn(
                    'w-full p-3 rounded-lg border text-left transition-all',
                    activityLevel === level.id
                      ? 'border-lime bg-lime/10'
                      : 'border-border bg-card hover:border-lime/40'
                  )}
                >
                  <div className={cn('text-sm font-medium', activityLevel === level.id && 'text-lime')}>
                    {t(level.labelKey)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{t(level.descKey)}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Goal */}
      {step === 3 && (
        <Card>
          <CardContent className="p-5">
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-4">{t('nutrition.setup.objective')}</div>
            <div className="grid grid-cols-2 gap-3">
              {GOALS.map(g => (
                <button
                  key={g.id}
                  onClick={() => setGoal(g.id)}
                  className={cn(
                    'p-4 rounded-lg border text-left transition-all',
                    goal === g.id
                      ? 'border-lime bg-lime/10'
                      : 'border-border bg-card hover:border-lime/40'
                  )}
                >
                  <div className="text-2xl mb-1">{g.icon}</div>
                  <div className={cn('text-sm font-medium', goal === g.id && 'text-lime')}>{t(g.labelKey)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{t(g.descKey)}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Confirmation before calculation */}
      {step === 4 && (
        <Card>
          <CardContent className="p-5">
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-4">{t('nutrition.setup.dataSummary')}</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{t('nutrition.setup.weight')}</span><span>{weight} kg</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t('nutrition.setup.height')}</span><span>{height} cm</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t('nutrition.setup.age')}</span><span>{age} {t('nutrition.setup.years')}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t('nutrition.setup.sex')}</span><span>{sex === 'male' ? t('nutrition.setup.male') : t('nutrition.setup.female')}</span></div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('nutrition.setup.activity')}</span>
                <span>{t(ACTIVITY_LEVELS.find(l => l.id === activityLevel)?.labelKey || '')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('nutrition.setup.objective')}</span>
                <span>{t(GOALS.find(g => g.id === goal)?.labelKey || '')}</span>
              </div>
            </div>
            <div className="mt-4 text-xs text-muted-foreground">{t('nutrition.setup.pressNext')}</div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Review & adjust macros */}
      {step === 5 && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2">{t('nutrition.setup.calculatedMacros')}</div>
            <div className="text-xs text-muted-foreground mb-3">{t('nutrition.setup.adjustHint')}</div>
            <div>
              <label htmlFor={`${formId}-dailyCalories`} className="text-xs text-muted-foreground mb-1 block">{t('nutrition.setup.dailyCalories')}</label>
              <Input
                id={`${formId}-dailyCalories`}
                type="number"
                value={macros.dailyCalories}
                onChange={e => setMacros(m => ({ ...m, dailyCalories: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label htmlFor={`${formId}-dailyProtein`} className="text-xs text-muted-foreground mb-1 block">{t('nutrition.setup.proteinG')}</label>
              <Input
                id={`${formId}-dailyProtein`}
                type="number"
                value={macros.dailyProtein}
                onChange={e => setMacros(m => ({ ...m, dailyProtein: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label htmlFor={`${formId}-dailyCarbs`} className="text-xs text-muted-foreground mb-1 block">{t('nutrition.setup.carbsG')}</label>
              <Input
                id={`${formId}-dailyCarbs`}
                type="number"
                value={macros.dailyCarbs}
                onChange={e => setMacros(m => ({ ...m, dailyCarbs: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label htmlFor={`${formId}-dailyFat`} className="text-xs text-muted-foreground mb-1 block">{t('nutrition.setup.fatG')}</label>
              <Input
                id={`${formId}-dailyFat`}
                type="number"
                value={macros.dailyFat}
                onChange={e => setMacros(m => ({ ...m, dailyFat: parseInt(e.target.value) || 0 }))}
              />
            </div>

            {/* Summary card */}
            <div className="mt-4 p-3 bg-lime/5 border border-lime/20 rounded-lg">
              <div className="text-xs text-lime tracking-widest uppercase mb-2">{t('nutrition.setup.dailyDistribution')}</div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="font-bebas text-2xl text-lime">{macros.dailyCalories}</div>
                  <div className="text-[9px] text-muted-foreground uppercase">kcal</div>
                </div>
                <div>
                  <div className="font-bebas text-2xl text-sky-500">{macros.dailyProtein}</div>
                  <div className="text-[9px] text-muted-foreground uppercase">prot</div>
                </div>
                <div>
                  <div className="font-bebas text-2xl text-amber-400">{macros.dailyCarbs}</div>
                  <div className="text-[9px] text-muted-foreground uppercase">carbs</div>
                </div>
                <div>
                  <div className="font-bebas text-2xl text-pink-500">{macros.dailyFat}</div>
                  <div className="text-[9px] text-muted-foreground uppercase">{t('nutrition.fat').toLowerCase()}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex gap-3 mt-6">
        {step > 0 && (
          <Button
            variant="outline"
            onClick={() => setStep(s => s - 1)}
            className="flex-1 text-[10px] tracking-widest"
          >
            {t('nutrition.setup.previous')}
          </Button>
        )}
        {step < 5 ? (
          <Button
            onClick={handleNext}
            disabled={!canProceed()}
            className="flex-1 bg-lime hover:bg-lime/90 text-zinc-900 font-bebas text-lg tracking-wide"
          >
            {t('nutrition.setup.next')}
          </Button>
        ) : (
          <Button
            onClick={handleSave}
            className="flex-1 bg-lime hover:bg-lime/90 text-zinc-900 font-bebas text-lg tracking-wide"
          >
            {t('nutrition.setup.save')}
          </Button>
        )}
      </div>
    </div>
  )
}
