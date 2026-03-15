import { useState } from 'react'
import { cn } from '../../lib/utils'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import type { NutritionGoal, NutritionGoalType, ActivityLevel, Sex } from '../../types'

interface NutritionGoalSetupProps {
  onSave: (goals: NutritionGoal) => void
  calculateMacros: (weight: number, height: number, age: number, sex: string, activityLevel: string, goal: string) => {
    dailyCalories: number
    dailyProtein: number
    dailyCarbs: number
    dailyFat: number
  }
}

const ACTIVITY_LEVELS: { id: ActivityLevel; label: string; desc: string }[] = [
  { id: 'sedentary', label: 'Sedentario', desc: 'Trabajo de oficina, poco movimiento' },
  { id: 'light', label: 'Ligero', desc: '1-2 entrenamientos/semana' },
  { id: 'moderate', label: 'Moderado', desc: '3-4 entrenamientos/semana' },
  { id: 'active', label: 'Activo', desc: '5-6 entrenamientos/semana' },
  { id: 'very_active', label: 'Muy activo', desc: 'Entrenamientos diarios intensos' },
]

const GOALS: { id: NutritionGoalType; label: string; icon: string; desc: string }[] = [
  { id: 'muscle_gain', label: 'Ganar Musculo', icon: '💪', desc: 'Superavit calorico' },
  { id: 'fat_loss', label: 'Perder Grasa', icon: '🔥', desc: 'Deficit calorico' },
  { id: 'recomp', label: 'Recomposicion', icon: '⚖️', desc: 'Ganar musculo y perder grasa' },
  { id: 'maintain', label: 'Mantener', icon: '✅', desc: 'Mantener peso actual' },
]

export default function NutritionGoalSetup({ onSave, calculateMacros }: NutritionGoalSetupProps) {
  const [step, setStep] = useState(0)

  // Body data
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [age, setAge] = useState('')

  // Selections
  const [sex, setSex] = useState<Sex>('male')
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate')
  const [goal, setGoal] = useState<NutritionGoalType>('muscle_gain')

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
        parseFloat(weight), parseFloat(height), parseInt(age), sex, activityLevel, goal
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
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">Configuracion</div>
      <div className="font-bebas text-4xl mb-6">OBJETIVOS NUTRICIONALES</div>

      {/* Step indicator */}
      <div className="flex gap-1.5 mb-6">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i <= step ? 'bg-lime' : 'bg-zinc-800'
            )}
          />
        ))}
      </div>

      {/* Step 0: Body data */}
      {step === 0 && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-3">Datos Corporales</div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Peso (kg)</label>
              <Input
                type="number"
                placeholder="70"
                value={weight}
                onChange={e => setWeight(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Altura (cm)</label>
              <Input
                type="number"
                placeholder="175"
                value={height}
                onChange={e => setHeight(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Edad</label>
              <Input
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
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-4">Sexo</div>
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
                  <div className="text-sm font-medium">{s === 'male' ? 'Masculino' : 'Femenino'}</div>
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
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-4">Nivel de Actividad</div>
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
                    {level.label}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{level.desc}</div>
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
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-4">Objetivo</div>
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
                  <div className={cn('text-sm font-medium', goal === g.id && 'text-lime')}>{g.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{g.desc}</div>
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
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-4">Resumen de Datos</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Peso</span><span>{weight} kg</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Altura</span><span>{height} cm</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Edad</span><span>{age} anos</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Sexo</span><span>{sex === 'male' ? 'Masculino' : 'Femenino'}</span></div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Actividad</span>
                <span>{ACTIVITY_LEVELS.find(l => l.id === activityLevel)?.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Objetivo</span>
                <span>{GOALS.find(g => g.id === goal)?.label}</span>
              </div>
            </div>
            <div className="mt-4 text-xs text-muted-foreground">Presiona "Siguiente" para calcular tus macros</div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Review & adjust macros */}
      {step === 5 && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2">Macros Calculados</div>
            <div className="text-xs text-muted-foreground mb-3">Puedes ajustar los valores manualmente</div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Calorias diarias (kcal)</label>
              <Input
                type="number"
                value={macros.dailyCalories}
                onChange={e => setMacros(m => ({ ...m, dailyCalories: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Proteina (g)</label>
              <Input
                type="number"
                value={macros.dailyProtein}
                onChange={e => setMacros(m => ({ ...m, dailyProtein: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Carbohidratos (g)</label>
              <Input
                type="number"
                value={macros.dailyCarbs}
                onChange={e => setMacros(m => ({ ...m, dailyCarbs: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Grasa (g)</label>
              <Input
                type="number"
                value={macros.dailyFat}
                onChange={e => setMacros(m => ({ ...m, dailyFat: parseInt(e.target.value) || 0 }))}
              />
            </div>

            {/* Summary card */}
            <div className="mt-4 p-3 bg-lime/5 border border-lime/20 rounded-lg">
              <div className="text-xs text-lime tracking-widest uppercase mb-2">Distribucion Diaria</div>
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
                  <div className="text-[9px] text-muted-foreground uppercase">grasa</div>
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
            ANTERIOR
          </Button>
        )}
        {step < 5 ? (
          <Button
            onClick={handleNext}
            disabled={!canProceed()}
            className="flex-1 bg-lime hover:bg-lime/90 text-zinc-900 font-bebas text-lg tracking-wide"
          >
            SIGUIENTE
          </Button>
        ) : (
          <Button
            onClick={handleSave}
            className="flex-1 bg-lime hover:bg-lime/90 text-zinc-900 font-bebas text-lg tracking-wide"
          >
            GUARDAR OBJETIVOS
          </Button>
        )}
      </div>
    </div>
  )
}
