import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { cn } from '../lib/utils'
import { useTranslation } from 'react-i18next'
import { useProgramEditor, type EditorExercise } from '@calistenia/core/hooks/useProgramEditor'
import ExerciseCatalogPicker from '../components/ExerciseCatalogPicker'
import { useWorkoutActions } from '../contexts/WorkoutContext'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { STEP_LABEL_KEYS } from '../components/program-editor/constants'
import { StepInfo } from '../components/program-editor/StepInfo'
import { StepPhases } from '../components/program-editor/StepPhases'
import { StepDays } from '../components/program-editor/StepDays'
import { StepExercises } from '../components/program-editor/StepExercises'

interface ProgramEditorPageProps {
  userId: string
  userRole?: import('@calistenia/core/types').UserRole
}

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
  const [catalogSection, setCatalogSection] = useState<'warmup' | 'main' | 'cooldown'>('main')
  const [validationError, setValidationError] = useState<string | null>(null)

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

  const handleAddFromCatalog = (ex: EditorExercise) => {
    addExercise(currentDayKey, { ...ex, section: catalogSection })
  }

  const openCatalogForSection = (section: 'warmup' | 'main' | 'cooldown') => {
    setCatalogSection(section)
    setShowCatalog(true)
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
          {STEP_LABEL_KEYS.map((labelKey, i) => {
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
                <span className="hidden sm:inline">{t(labelKey)}</span>
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
          {state.step === 1 && (
            <StepInfo
              info={state.info}
              updateInfo={updateInfo}
              redistributeWeeks={redistributeWeeks}
              canPublishOfficial={canPublishOfficial}
            />
          )}
          {state.step === 2 && (
            <StepPhases
              phases={state.phases}
              addPhase={addPhase}
              removePhase={removePhase}
              updatePhase={updatePhase}
            />
          )}
          {state.step === 3 && (
            <StepDays
              phases={state.phases}
              days={state.days}
              selectedPhaseTab={selectedPhaseTab}
              onSelectPhaseTab={setSelectedPhaseTab}
              updateDay={updateDay}
            />
          )}
          {state.step === 4 && (
            <StepExercises
              phases={state.phases}
              days={state.days}
              selectedPhaseTab={selectedPhaseTab}
              onSelectPhaseTab={setSelectedPhaseTab}
              selectedDayId={selectedDayId}
              onSelectDayId={setSelectedDayId}
              addExercise={addExercise}
              updateExercise={updateExercise}
              removeExercise={removeExercise}
              moveExercise={moveExercise}
              onOpenCatalog={openCatalogForSection}
            />
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
