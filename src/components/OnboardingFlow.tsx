import { useState } from 'react'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { cn } from '../lib/utils'
import { pb } from '../lib/pocketbase'
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
  onSelectProgram: (programId: string) => Promise<void>
  onCreateProgram: () => void
  onComplete: () => void
}

const LEVELS = [
  { value: 'principiante', label: 'Principiante', desc: 'Nuevo en calistenia' },
  { value: 'intermedio', label: 'Intermedio', desc: '6+ meses entrenando' },
  { value: 'avanzado', label: 'Avanzado', desc: 'Muscle-ups, planche...' },
]

const SEX_OPTIONS = [
  { value: 'male', label: 'Hombre' },
  { value: 'female', label: 'Mujer' },
]

const SECTIONS = [
  {
    icon: '📊',
    label: 'Dashboard',
    desc: 'Tu vista principal — progreso general, racha, actividad del mes y objetivos personales.',
  },
  {
    icon: '🏋️',
    label: 'Entrenar',
    desc: 'Selecciona la fase y el día. Inicia la sesión guiada con descansos, sonidos y registro de series.',
  },
  {
    icon: '📋',
    label: 'Programas',
    desc: 'Explora programas existentes, duplica uno o crea el tuyo propio desde cero.',
  },
  {
    icon: '🍽️',
    label: 'Nutrición',
    desc: 'Registra comidas con foto y AI. Lleva tus macros y calorías del día.',
  },
  {
    icon: '📈',
    label: 'Progreso',
    desc: 'Historial de sesiones, gráficos de volumen y evolución de tus ejercicios clave.',
  },
]

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
  // Detect if profile data is missing (e.g. Google OAuth signup or skipped step)
  const needsProfile = !user?.weight && !user?.height && !user?.level

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
    setStep(programStep)
  }

  const handleFinish = () => {
    markOnboardingDone(userId)
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
            <div className="text-muted-foreground text-sm mb-8">Tu programa de entrenamiento personalizado</div>

            <Card className="mb-6 text-left">
              <CardContent className="p-6">
                <div className="text-lg font-medium mb-1">
                  {firstName ? `Hola, ${firstName}` : 'Bienvenido'}
                </div>
                <div className="text-sm text-muted-foreground leading-relaxed space-y-3">
                  <p>
                    Esta app te guía día a día por un programa de calistenia con fases progresivas.
                    Cada fase dura varias semanas y aumenta en dificultad.
                  </p>
                  <p>
                    {needsProfile
                      ? 'Primero vamos a conocerte un poco, luego elegirás tu programa.'
                      : 'Lo primero es elegir tu programa — puede ser uno existente o puedes crear el tuyo.'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Button
              onClick={() => setStep(needsProfile ? profileStep : programStep)}
              className="w-full h-12 font-bebas text-xl tracking-wide bg-[hsl(var(--lime))] hover:bg-[hsl(var(--lime))]/90 text-background"
            >
              EMPEZAR
            </Button>

            <button
              onClick={handleFinish}
              className="mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Ya conozco la app, saltar
            </button>
          </div>
        )}

        {/* Step 1: Profile (only if needed) */}
        {step === profileStep && (
          <div className="animate-[fadeUp_0.5s_ease]">
            <div className="text-center mb-6">
              <div className="font-bebas text-3xl mb-1">CUÉNTANOS DE TI</div>
              <div className="text-sm text-muted-foreground">
                Esto nos ayuda a personalizar tu experiencia. Todo es opcional.
              </div>
            </div>

            <Card className="mb-6">
              <CardContent className="p-5 flex flex-col gap-4">
                {/* Physical data */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ob-weight" className="text-[11px] text-muted-foreground tracking-wide uppercase">Peso (kg)</Label>
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
                    <Label htmlFor="ob-height" className="text-[11px] text-muted-foreground tracking-wide uppercase">Altura (cm)</Label>
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
                    <Label htmlFor="ob-age" className="text-[11px] text-muted-foreground tracking-wide uppercase">Edad</Label>
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
                  <Label className="text-[11px] text-muted-foreground tracking-wide uppercase">Sexo</Label>
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
                  <Label className="text-[11px] text-muted-foreground tracking-wide uppercase">Nivel</Label>
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
                  <Label htmlFor="ob-goal" className="text-[11px] text-muted-foreground tracking-wide uppercase">Objetivo</Label>
                  <textarea
                    id="ob-goal"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="Ej: 10 muscle-ups, bajar grasa corporal..."
                    rows={2}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep(0)}
                className="flex-1 h-11 font-mono text-xs tracking-wide"
              >
                ATRÁS
              </Button>
              <Button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="flex-1 h-11 font-bebas text-lg tracking-wide bg-[hsl(var(--lime))] hover:bg-[hsl(var(--lime))]/90 text-background"
              >
                {savingProfile ? 'GUARDANDO...' : 'CONTINUAR'}
              </Button>
            </div>

            <button
              onClick={() => setStep(programStep)}
              className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
            >
              Omitir por ahora
            </button>
          </div>
        )}

        {/* Step: Choose program */}
        {step === programStep && (
          <div className="animate-[fadeUp_0.5s_ease]">
            <div className="text-center mb-6">
              <div className="font-bebas text-3xl mb-1">ELIGE TU PROGRAMA</div>
              <div className="text-sm text-muted-foreground">
                Este será tu programa activo en el dashboard y en tus entrenamientos.
              </div>
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
                              RECOMENDADO
                            </Badge>
                          )}
                          {program.is_official && !program.is_featured && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-emerald-400 border-emerald-400/30">
                              OFICIAL
                            </Badge>
                          )}
                          {isOwn && !program.is_official && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-sky-500 border-sky-500/30">
                              TUYO
                            </Badge>
                          )}
                        </div>
                        {program.description && (
                          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {program.description}
                          </div>
                        )}
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {program.duration_weeks} semanas
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
                  <span className="text-sky-500 font-medium">+ Crear mi propio programa</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3 mt-6">
              <Button
                variant="outline"
                onClick={() => setStep(needsProfile ? profileStep : 0)}
                className="flex-1 h-11 font-mono text-xs tracking-wide"
              >
                ATRÁS
              </Button>
              <Button
                onClick={() => setStep(orientationStep)}
                disabled={!selectedProgramId || selecting}
                className="flex-1 h-11 font-bebas text-lg tracking-wide bg-[hsl(var(--lime))] hover:bg-[hsl(var(--lime))]/90 text-background disabled:opacity-40"
              >
                {selecting ? 'GUARDANDO...' : 'CONTINUAR'}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Quick orientation */}
        {step === orientationStep && (
          <div className="animate-[fadeUp_0.5s_ease]">
            <div className="text-center mb-6">
              <div className="font-bebas text-3xl mb-1">ASÍ FUNCIONA</div>
              <div className="text-sm text-muted-foreground">
                Las secciones principales de la app.
              </div>
            </div>

            <div className="space-y-2.5 mb-8">
              {SECTIONS.map((section) => (
                <Card key={section.label}>
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="text-xl shrink-0 mt-0.5">{section.icon}</div>
                    <div>
                      <div className="font-medium text-sm">{section.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {section.desc}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button
              onClick={handleFinish}
              className="w-full h-12 font-bebas text-xl tracking-wide bg-[hsl(var(--lime))] hover:bg-[hsl(var(--lime))]/90 text-background"
            >
              IR AL DASHBOARD
            </Button>

            <button
              onClick={() => setStep(programStep)}
              className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
            >
              Volver a elegir programa
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
