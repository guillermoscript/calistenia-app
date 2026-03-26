import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { cn } from '../lib/utils'
import { useTranslation } from 'react-i18next'
import { CARDIO_ACTIVITY } from '../lib/style-tokens'
import { useProgramEditor, type EditorExercise, type EditorPhase } from '../hooks/useProgramEditor'
import type { CardioActivityType } from '../types'
import ExerciseCatalogPicker from '../components/ExerciseCatalogPicker'
import { useWorkoutActions } from '../contexts/WorkoutContext'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'

interface ProgramEditorPageProps {
  userId: string
  userRole?: import('../types').UserRole
}

const STEP_LABELS = ['Info', 'Fases', 'Días', 'Ejercicios']

const COLOR_SWATCHES = [
  { name: 'lime',    color: '#c8f542', bg: 'rgba(200,245,66,0.08)' },
  { name: 'sky',     color: '#42c8f5', bg: 'rgba(66,200,245,0.08)' },
  { name: 'pink',    color: '#f542c8', bg: 'rgba(245,66,200,0.08)' },
  { name: 'amber',   color: '#f5c842', bg: 'rgba(245,200,66,0.08)' },
  { name: 'red',     color: '#f54242', bg: 'rgba(245,66,66,0.08)' },
  { name: 'emerald', color: '#34d399', bg: 'rgba(52,211,153,0.08)' },
]

const DAY_TYPE_OPTIONS = [
  { value: 'push',   label: 'Push' },
  { value: 'pull',   label: 'Pull' },
  { value: 'legs',   label: 'Legs' },
  { value: 'core',   label: 'Core' },
  { value: 'lumbar', label: 'Lumbar' },
  { value: 'full',   label: 'Full' },
  { value: 'rest',   label: 'Descanso' },
  { value: 'cardio', label: 'Cardio' },
]

const CARDIO_TYPE_OPTIONS: { value: CardioActivityType; labelKey: string; icon: string }[] = [
  { value: 'running', labelKey: 'cardio.running', icon: CARDIO_ACTIVITY.running.icon },
  { value: 'walking', labelKey: 'cardio.walking', icon: CARDIO_ACTIVITY.walking.icon },
  { value: 'cycling', labelKey: 'cardio.cycling', icon: CARDIO_ACTIVITY.cycling.icon },
]

const PRIORITY_OPTIONS: { value: 'high' | 'med' | 'low'; i18nKey: string; color: string }[] = [
  { value: 'high', i18nKey: 'priority.high',  color: 'text-red-400' },
  { value: 'med',  i18nKey: 'priority.med', color: 'text-amber-400' },
  { value: 'low',  i18nKey: 'priority.low',  color: 'text-emerald-400' },
]

const DAY_IDS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']

export default function ProgramEditorPage({ userId, userRole = 'user' }: ProgramEditorPageProps) {
  const { t } = useTranslation()
  const canPublishOfficial = userRole === 'editor' || userRole === 'admin'
  const navigate = useNavigate()
  const { id: programId } = useParams<{ id: string }>()

  const {
    state, setStep, updateInfo, redistributeWeeks, addPhase, removePhase, updatePhase,
    updateDay, addExercise, removeExercise, updateExercise, moveExercise,
    loadProgram, saveProgram, validate, resetEditor,
  } = useProgramEditor()

  const { refreshPrograms } = useWorkoutActions()

  const [selectedPhaseTab, setSelectedPhaseTab] = useState(0)
  const [selectedDayId, setSelectedDayId] = useState('lun')
  const [showCatalog, setShowCatalog] = useState(false)
  const [expandedExercise, setExpandedExercise] = useState<number | null>(null)

  useEffect(() => {
    if (programId) {
      loadProgram(programId)
    } else {
      resetEditor()
    }
  }, [programId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    navigate('/programs')
  }

  const [validationError, setValidationError] = useState<string | null>(null)

  const handleNext = () => {
    const err = validate(state.step)
    if (err) {
      setValidationError(err)
      return
    }
    setValidationError(null)
    if (state.step < 4) setStep(state.step + 1)
  }

  const handleBack = () => {
    if (state.step > 1) {
      setValidationError(null)
      setStep(state.step - 1)
    }
  }

  const handleSave = async () => {
    const err = validate(state.step)
    if (err) return
    const savedId = await saveProgram(userId)
    if (savedId) {
      await refreshPrograms()
      toast.success(t('programEditor.saved'))
      navigate('/programs')
    } else {
      toast.error(state.error || t('programEditor.saveError'))
    }
  }

  const currentDayKey = `${selectedPhaseTab}_${selectedDayId}`
  const currentDay = state.days[currentDayKey]

  const handleAddFromCatalog = (ex: EditorExercise) => {
    addExercise(currentDayKey, ex)
  }

  const handleAddCustom = () => {
    const newEx: EditorExercise = {
      exerciseId: `custom_${Date.now()}`,
      name: '',
      sets: 3,
      reps: '10',
      rest: 60,
      muscles: '',
      note: '',
      youtube: '',
      priority: 'med',
      isTimer: false,
      timerSeconds: 0,
    }
    addExercise(currentDayKey, newEx)
    setExpandedExercise(currentDay ? currentDay.exercises.length : 0)
  }

  return (
    <div className="flex flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-background/95 backdrop-blur px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={handleClose} className="text-muted-foreground hover:text-foreground h-8 px-2">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-4">
                <polyline points="10,3 5,8 10,13" />
              </svg>
            </Button>
            <div>
              <div className="font-mono text-[9px] text-muted-foreground tracking-[3px]">{t('programEditor.editorTitle')}</div>
              <div className="font-bebas text-xl leading-none">{state.info.name || t('programEditor.newProgram')}</div>
            </div>
          </div>
          {state.isDirty && (
            <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-400/30">
              {t('programEditor.unsaved')}
            </Badge>
          )}
        </div>
      </div>

      {/* Step indicator */}
      <div className="shrink-0 px-4 py-3 border-b border-border">
        <div className="max-w-4xl mx-auto flex items-center gap-2 justify-center">
          {STEP_LABELS.map((label, i) => {
            const stepNum = i + 1
            const isActive = state.step === stepNum
            const isDone = state.step > stepNum
            const isFuture = state.step < stepNum
            return (
              <button
                key={stepNum}
                onClick={() => {
                  if (isActive) return
                  if (isDone) {
                    setValidationError(null)
                    setStep(stepNum)
                  } else if (isFuture) {
                    // Validate all steps up to current before jumping forward
                    for (let s = state.step; s < stepNum; s++) {
                      const err = validate(s)
                      if (err) {
                        setValidationError(err)
                        return
                      }
                    }
                    setValidationError(null)
                    setStep(stepNum)
                  }
                }}
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] tracking-wide transition-all cursor-pointer',
                  isActive
                    ? 'bg-[hsl(var(--lime))] text-black font-medium'
                    : isDone
                      ? 'bg-[hsl(var(--lime))]/10 text-[hsl(var(--lime))] hover:bg-[hsl(var(--lime))]/20'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                )}
              >
                <span className="font-mono text-[10px]">{isDone ? '✓' : stepNum}</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Error display */}
      {(state.error || validationError) && (
        <div className="shrink-0 px-4 py-2 bg-red-500/10 border-b border-red-500/20" role="alert">
          <div className="max-w-4xl mx-auto text-sm text-red-400">{state.error || validationError}</div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-4xl mx-auto">

          {/* Step 1: Info */}
          {state.step === 1 && (
            <div className="space-y-6">
              <Card>
                <CardContent className="p-5 md:p-6 space-y-4">
                  <div className="font-bebas text-2xl tracking-wide">{t('programEditor.programInfo')}</div>

                  <div>
                    <label className="text-[11px] text-muted-foreground tracking-widest uppercase block mb-1.5">{t('programEditor.nameLabel')}</label>
                    <Input
                      value={state.info.name}
                      onChange={e => updateInfo({ name: e.target.value })}
                      placeholder={t('programEditor.namePlaceholder')}
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-muted-foreground tracking-widest uppercase block mb-1.5">{t('programEditor.descLabel')}</label>
                    <Textarea
                      value={state.info.description}
                      onChange={e => updateInfo({ description: e.target.value })}
                      placeholder={t('programEditor.descPlaceholder')}
                      rows={3}
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-muted-foreground tracking-widest uppercase block mb-1.5">{t('programEditor.durationLabel')}</label>
                    <Input
                      type="number"
                      min={1}
                      max={104}
                      value={state.info.durationWeeks}
                      onChange={e => updateInfo({ durationWeeks: parseInt(e.target.value) || 1 })}
                      onBlur={redistributeWeeks}
                      className="text-sm w-32"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-muted-foreground tracking-widest uppercase block mb-1.5">{t('programEditor.difficultyLabel')}</label>
                    <div className="flex gap-2">
                      {(['beginner', 'intermediate', 'advanced'] as const).map(d => (
                        <button
                          key={d}
                          onClick={() => updateInfo({ difficulty: d })}
                          className={cn(
                            'px-4 py-2 rounded-lg text-[11px] font-mono tracking-widest border transition-all uppercase',
                            state.info.difficulty === d
                              ? d === 'beginner' ? 'bg-emerald-400/10 border-emerald-400/30 text-emerald-400'
                                : d === 'intermediate' ? 'bg-amber-400/10 border-amber-400/30 text-amber-400'
                                : 'bg-red-400/10 border-red-400/30 text-red-400'
                              : 'border-border text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {t(`difficulty.${d}`)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {canPublishOfficial && (
                    <div className="pt-2 border-t border-border">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={state.info.isOfficial}
                          onChange={e => updateInfo({ isOfficial: e.target.checked })}
                          className="size-4 rounded accent-[hsl(var(--lime))]"
                        />
                        <div>
                          <div className="text-sm font-medium">{t('programEditor.publishOfficial')}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {t('programEditor.publishDesc')}
                          </div>
                        </div>
                      </label>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 2: Phases */}
          {state.step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-bebas text-2xl tracking-wide">FASES DEL PROGRAMA</div>
                {state.phases.length < 8 && (
                  <Button
                    onClick={addPhase}
                    size="sm"
                    className="h-8 text-[10px] tracking-wide bg-[hsl(var(--lime))] text-black hover:bg-[hsl(var(--lime))]/90"
                  >
                    + AGREGAR FASE
                  </Button>
                )}
              </div>

              {state.phases.map((phase, pi) => (
                <Card key={pi} className="border-l-[3px]" style={{ borderLeftColor: phase.color }}>
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-mono text-[10px] text-muted-foreground tracking-[2px]">FASE {pi + 1}</div>
                      {state.phases.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removePhase(pi)}
                          className="h-7 px-2 text-[10px] text-muted-foreground hover:text-red-400"
                        >
                          ELIMINAR
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-muted-foreground tracking-widest uppercase block mb-1">Nombre</label>
                        <Input
                          value={phase.name}
                          onChange={e => updatePhase(pi, { name: e.target.value })}
                          placeholder="Ej: Base & Activación"
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground tracking-widest uppercase block mb-1">Semanas</label>
                        <Input
                          value={phase.weeks}
                          onChange={e => updatePhase(pi, { weeks: e.target.value })}
                          placeholder="Ej: 1-6"
                          className="text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-muted-foreground tracking-widest uppercase block mb-1.5">Color</label>
                      <div className="flex gap-2">
                        {COLOR_SWATCHES.map(swatch => (
                          <button
                            key={swatch.name}
                            onClick={() => updatePhase(pi, { color: swatch.color, bgColor: swatch.bg })}
                            className={cn(
                              'size-7 rounded-full border-2 transition-all',
                              phase.color === swatch.color ? 'border-foreground scale-110' : 'border-transparent'
                            )}
                            style={{ backgroundColor: swatch.color }}
                          />
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Step 3: Days */}
          {state.step === 3 && (
            <div className="space-y-4">
              <div className="font-bebas text-2xl tracking-wide mb-2">DÍAS POR FASE</div>

              {/* Phase tabs */}
              <div className="flex gap-1.5 flex-wrap mb-4">
                {state.phases.map((phase, pi) => (
                  <Button
                    key={pi}
                    variant={selectedPhaseTab === pi ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedPhaseTab(pi)}
                    className={cn(
                      'h-8 text-[10px] tracking-wide',
                      selectedPhaseTab === pi && 'text-black'
                    )}
                    style={selectedPhaseTab === pi ? { backgroundColor: phase.color } : undefined}
                  >
                    F{pi + 1}: {phase.name}
                  </Button>
                ))}
              </div>

              {/* Day cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DAY_IDS.map(dayId => {
                  const dayKey = `${selectedPhaseTab}_${dayId}`
                  const day = state.days[dayKey]
                  if (!day) return null

                  return (
                    <Card key={dayId}>
                      <CardContent className="p-4 space-y-2.5">
                        <div className="flex items-center gap-2">
                          <div className="size-2 rounded-full" style={{ backgroundColor: day.color }} />
                          <div className="font-bebas text-lg tracking-wide">{day.dayName}</div>
                          <Badge variant="outline" className="text-[9px] ml-auto">
                            {day.type.toUpperCase()}
                          </Badge>
                        </div>

                        <div>
                          <label className="text-[9px] text-muted-foreground tracking-widest uppercase block mb-1">Enfoque</label>
                          <Input
                            value={day.focus}
                            onChange={e => updateDay(dayKey, { focus: e.target.value })}
                            placeholder="Ej: Empuje + Core"
                            className="text-sm h-8"
                          />
                        </div>

                        <div>
                          <label className="text-[9px] text-muted-foreground tracking-widest uppercase block mb-1">Tipo</label>
                          <select
                            value={day.type}
                            onChange={e => updateDay(dayKey, { type: e.target.value })}
                            className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm"
                          >
                            {DAY_TYPE_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>

                        {day.type === 'cardio' && (
                          <div className="space-y-2 p-3 bg-emerald-400/5 border border-emerald-400/20 rounded-lg">
                            <div className="text-[9px] text-emerald-400 tracking-widest uppercase mb-1">Configuracion Cardio</div>
                            <div>
                              <label className="text-[9px] text-muted-foreground tracking-widest uppercase block mb-1">Actividad</label>
                              <div className="flex gap-1.5">
                                {CARDIO_TYPE_OPTIONS.map(opt => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => updateDay(dayKey, { cardioActivityType: opt.value } as any)}
                                    className={cn(
                                      'flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] border transition-all',
                                      (day as any).cardioActivityType === opt.value
                                        ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-400'
                                        : 'border-border text-muted-foreground hover:text-foreground'
                                    )}
                                  >
                                    <span>{opt.icon}</span>
                                    <span>{t(opt.labelKey)}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[9px] text-muted-foreground tracking-widest uppercase block mb-1">Distancia (km)</label>
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.5}
                                  value={(day as any).cardioTargetDistanceKm || ''}
                                  onChange={e => updateDay(dayKey, { cardioTargetDistanceKm: parseFloat(e.target.value) || undefined } as any)}
                                  placeholder="Ej: 5"
                                  className="text-sm h-8"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] text-muted-foreground tracking-widest uppercase block mb-1">Duracion (min)</label>
                                <Input
                                  type="number"
                                  min={0}
                                  value={(day as any).cardioTargetDurationMin || ''}
                                  onChange={e => updateDay(dayKey, { cardioTargetDurationMin: parseInt(e.target.value) || undefined } as any)}
                                  placeholder="Ej: 30"
                                  className="text-sm h-8"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

          {/* Step 4: Exercises */}
          {state.step === 4 && (
            <div className="space-y-4">
              <div className="font-bebas text-2xl tracking-wide mb-2">EJERCICIOS</div>

              {/* Phase tabs */}
              <div className="flex gap-1.5 flex-wrap">
                {state.phases.map((phase, pi) => (
                  <Button
                    key={pi}
                    variant={selectedPhaseTab === pi ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedPhaseTab(pi)}
                    className={cn(
                      'h-7 text-[10px] tracking-wide',
                      selectedPhaseTab === pi && 'text-black'
                    )}
                    style={selectedPhaseTab === pi ? { backgroundColor: phase.color } : undefined}
                  >
                    F{pi + 1}
                  </Button>
                ))}
              </div>

              {/* Day selector */}
              <div className="flex gap-1 flex-wrap">
                {DAY_IDS.map(dayId => {
                  const dayKey = `${selectedPhaseTab}_${dayId}`
                  const day = state.days[dayKey]
                  const isActive = selectedDayId === dayId
                  const exerciseCount = day?.exercises?.length || 0

                  return (
                    <Button
                      key={dayId}
                      variant={isActive ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedDayId(dayId)}
                      className={cn(
                        'h-8 px-2.5 text-[10px] tracking-wide',
                        isActive && 'bg-[hsl(var(--lime))] text-black hover:bg-[hsl(var(--lime))]/90'
                      )}
                    >
                      {dayId.toUpperCase()}
                      {exerciseCount > 0 && (
                        <span className={cn('ml-1 text-[9px]', isActive ? 'text-black/60' : 'text-muted-foreground')}>
                          ({exerciseCount})
                        </span>
                      )}
                    </Button>
                  )
                })}
              </div>

              {/* Day info */}
              {currentDay && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{currentDay.dayName}</span>
                  {' · '}{currentDay.focus}
                  {' · '}<Badge variant="outline" className="text-[9px]">{currentDay.type.toUpperCase()}</Badge>
                </div>
              )}

              {/* Cardio day summary */}
              {currentDay?.type === 'cardio' && (
                <Card className="border-emerald-400/30 bg-emerald-400/5">
                  <CardContent className="p-5 text-center">
                    <div className="text-3xl mb-2">{CARDIO_ACTIVITY[(currentDay as any).cardioActivityType || 'running']?.icon || '🏃'}</div>
                    <div className="font-bebas text-xl text-emerald-400 tracking-wide mb-1">DIA DE CARDIO</div>
                    <div className="text-sm text-muted-foreground mb-3">
                      {t(`cardio.${(currentDay as any).cardioActivityType || 'running'}`)}
                    </div>
                    <div className="flex justify-center gap-4 text-[11px]">
                      {(currentDay as any).cardioTargetDistanceKm && (
                        <div className="text-emerald-400">
                          <span className="font-bold">{(currentDay as any).cardioTargetDistanceKm}</span> km
                        </div>
                      )}
                      {(currentDay as any).cardioTargetDurationMin && (
                        <div className="text-emerald-400">
                          <span className="font-bold">{(currentDay as any).cardioTargetDurationMin}</span> min
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-3">
                      Configura los detalles en el paso 3 (Dias)
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Exercise list */}
              {currentDay?.type !== 'cardio' && <div className="space-y-2">
                {currentDay?.exercises.map((ex, ei) => {
                  const isExpanded = expandedExercise === ei
                  return (
                    <Card key={ei} className="overflow-hidden">
                      <CardContent className="p-0">
                        {/* Exercise header */}
                        <div className="flex items-center gap-2 px-3 py-2.5">
                          {/* Move buttons */}
                          <div className="flex flex-col gap-0.5">
                            <button
                              onClick={() => moveExercise(currentDayKey, ei, 'up')}
                              disabled={ei === 0}
                              aria-label={`Mover ${ex.name || 'ejercicio'} arriba`}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-20 text-[10px]"
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => moveExercise(currentDayKey, ei, 'down')}
                              disabled={ei === currentDay.exercises.length - 1}
                              aria-label={`Mover ${ex.name || 'ejercicio'} abajo`}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-20 text-[10px]"
                            >
                              ▼
                            </button>
                          </div>

                          {/* Name */}
                          <div className="flex-1 min-w-0">
                            <Input
                              value={ex.name}
                              onChange={e => updateExercise(currentDayKey, ei, { name: e.target.value })}
                              placeholder="Nombre del ejercicio"
                              className="text-sm h-7 border-none bg-transparent px-1 focus-visible:ring-0 focus-visible:ring-offset-0"
                            />
                          </div>

                          {/* Inline sets x reps x rest */}
                          <div className="flex items-center gap-1 shrink-0">
                            <Input
                              value={ex.sets}
                              onChange={e => {
                                const v = e.target.value
                                const n = parseInt(v)
                                updateExercise(currentDayKey, ei, { sets: isNaN(n) ? v : n })
                              }}
                              className="w-10 h-7 text-[11px] text-center px-1"
                              placeholder="S"
                            />
                            <span className="text-muted-foreground text-[10px]">x</span>
                            <Input
                              value={ex.reps}
                              onChange={e => updateExercise(currentDayKey, ei, { reps: e.target.value })}
                              className="w-16 h-7 text-[11px] text-center px-1"
                              placeholder="Reps"
                            />
                            <span className="text-muted-foreground text-[10px]">.</span>
                            <Input
                              value={ex.rest}
                              onChange={e => updateExercise(currentDayKey, ei, { rest: parseInt(e.target.value) || 0 })}
                              className="w-12 h-7 text-[11px] text-center px-1"
                              placeholder="Rest"
                            />
                            <span className="text-muted-foreground text-[9px]">s</span>
                          </div>

                          {/* Priority */}
                          <select
                            value={ex.priority}
                            onChange={e => updateExercise(currentDayKey, ei, { priority: e.target.value as 'high' | 'med' | 'low' })}
                            className="h-7 rounded border border-input bg-background px-1 text-[10px]"
                          >
                            {PRIORITY_OPTIONS.map(p => (
                              <option key={p.value} value={p.value}>{t(p.i18nKey)}</option>
                            ))}
                          </select>

                          {/* Expand / Remove */}
                          <button
                            onClick={() => setExpandedExercise(isExpanded ? null : ei)}
                            className="text-muted-foreground hover:text-foreground text-xs px-1"
                          >
                            {isExpanded ? '▾' : '▸'}
                          </button>
                          <button
                            onClick={() => removeExercise(currentDayKey, ei)}
                            aria-label={`Eliminar ${ex.name || 'ejercicio'}`}
                            className="text-muted-foreground hover:text-red-400 text-xs px-1"
                          >
                            ✕
                          </button>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-1 border-t border-border space-y-2.5 bg-muted/30">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <div>
                                <label className="text-[9px] text-muted-foreground tracking-widest uppercase block mb-1">Músculos</label>
                                <Input
                                  value={ex.muscles}
                                  onChange={e => updateExercise(currentDayKey, ei, { muscles: e.target.value })}
                                  placeholder="Ej: Pecho, hombros, tríceps"
                                  className="text-sm h-8"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] text-muted-foreground tracking-widest uppercase block mb-1">YouTube</label>
                                <Input
                                  value={ex.youtube}
                                  onChange={e => updateExercise(currentDayKey, ei, { youtube: e.target.value })}
                                  placeholder="URL o búsqueda"
                                  className="text-sm h-8"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-[9px] text-muted-foreground tracking-widest uppercase block mb-1">Nota</label>
                              <Textarea
                                value={ex.note}
                                onChange={e => updateExercise(currentDayKey, ei, { note: e.target.value })}
                                placeholder="Instrucciones, tips..."
                                rows={2}
                                className="text-sm"
                              />
                            </div>
                            <div className="flex items-center gap-4">
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={ex.isTimer}
                                  onChange={e => updateExercise(currentDayKey, ei, { isTimer: e.target.checked })}
                                  className="rounded"
                                />
                                <span className="text-[11px] text-muted-foreground">Es timer</span>
                              </label>
                              {ex.isTimer && (
                                <div className="flex items-center gap-1.5">
                                  <label className="text-[9px] text-muted-foreground">Segundos:</label>
                                  <Input
                                    type="number"
                                    min={1}
                                    value={ex.timerSeconds}
                                    onChange={e => updateExercise(currentDayKey, ei, { timerSeconds: parseInt(e.target.value) || 0 })}
                                    className="w-16 h-7 text-sm"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}

                {/* Empty state */}
                {(!currentDay || currentDay.exercises.length === 0) && (
                  <div className="py-8 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                    No hay ejercicios para este día. Agrega del catálogo o crea uno custom.
                  </div>
                )}
              </div>}

              {/* Add buttons */}
              {currentDay?.type !== 'cardio' && <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={() => setShowCatalog(true)}
                  size="sm"
                  className="h-8 text-[10px] tracking-wide bg-[hsl(var(--lime))] text-black hover:bg-[hsl(var(--lime))]/90"
                >
                  + AGREGAR DEL CATÁLOGO
                </Button>
                <Button
                  onClick={handleAddCustom}
                  variant="outline"
                  size="sm"
                  className="h-8 text-[10px] tracking-wide"
                >
                  + EJERCICIO CUSTOM
                </Button>
              </div>}
            </div>
          )}
        </div>
      </div>

      {/* Bottom nav */}
      <div className="shrink-0 border-t border-border bg-background/95 backdrop-blur px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={state.step === 1}
            className="font-mono text-[11px] tracking-wide"
          >
            ← ATRÁS
          </Button>

          <div className="text-[10px] text-muted-foreground">
            Paso {state.step} de 4
          </div>

          {state.step < 4 ? (
            <Button
              onClick={handleNext}
              className="font-mono text-[11px] tracking-wide bg-[hsl(var(--lime))] text-black hover:bg-[hsl(var(--lime))]/90"
            >
              SIGUIENTE →
            </Button>
          ) : (
            <Button
              onClick={handleSave}
              disabled={state.isSaving}
              className="font-bebas text-lg tracking-wide bg-[hsl(var(--lime))] text-black hover:bg-[hsl(var(--lime))]/90"
            >
              {state.isSaving ? 'GUARDANDO...' : 'GUARDAR'}
            </Button>
          )}
        </div>
      </div>

      {/* Catalog picker */}
      {showCatalog && (
        <ExerciseCatalogPicker
          onAdd={handleAddFromCatalog}
          onClose={() => setShowCatalog(false)}
        />
      )}
    </div>
  )
}
