/**
 * Editor de programas nativo (#223) — wizard de 4 pasos sobre el motor
 * compartido useProgramEditor de core (port de ProgramEditorPage web).
 * Ruta apilada file-based: /program-editor (con ?id= edita uno existente).
 */
import { useEffect, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Animated, { FadeInRight } from 'react-native-reanimated'
import { X } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { useAuthUser } from '@/lib/use-auth-user'
import { useWorkoutActions } from '@/contexts/WorkoutContext'
import { useProgramEditor, type EditorExercise } from '@calistenia/core/hooks/useProgramEditor'
import { op } from '@calistenia/core/lib/analytics'

import { STEP_LABEL_KEYS } from '@/components/program-editor/constants'
import { StepInfo } from '@/components/program-editor/StepInfo'
import { StepPhases } from '@/components/program-editor/StepPhases'
import { StepDays } from '@/components/program-editor/StepDays'
import { StepExercises } from '@/components/program-editor/StepExercises'
import { ExercisePickerSheet } from '@/components/program-editor/ExercisePickerSheet'

type Section = 'warmup' | 'main' | 'cooldown'

export default function ProgramEditorScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id: programId } = useLocalSearchParams<{ id?: string }>()
  const user = useAuthUser()
  const userId = user?.id
  const { refreshPrograms } = useWorkoutActions()

  const {
    state, setStep, updateInfo, redistributeWeeks, addPhase, removePhase, updatePhase,
    updateDay, addExercise, removeExercise, updateExercise, moveExercise,
    loadProgram, saveProgram, validate, resetEditor,
  } = useProgramEditor()

  const [selectedPhaseTab, setSelectedPhaseTab] = useState(0)
  const [selectedDayId, setSelectedDayId] = useState('lun')
  const [showCatalog, setShowCatalog] = useState(false)
  const [catalogSection, setCatalogSection] = useState<Section>('main')
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (programId) void loadProgram(programId)
    else resetEditor()
  }, [programId]) // eslint-disable-line react-hooks/exhaustive-deps

  // La fase seleccionada puede desaparecer al eliminar fases
  useEffect(() => {
    if (selectedPhaseTab >= state.phases.length) setSelectedPhaseTab(Math.max(0, state.phases.length - 1))
  }, [state.phases.length, selectedPhaseTab])

  const step = state.step

  const goToStep = (s: number) => {
    haptics.light()
    setValidationError(null)
    setStep(s)
  }

  const handleStepTap = (target: number) => {
    if (target === step) return
    if (target < step) { goToStep(target); return }
    // Avanzar valida los pasos intermedios (mismo criterio que web)
    for (let s = step; s < target; s++) {
      const err = validate(s)
      if (err) { setValidationError(err); return }
    }
    goToStep(target)
  }

  const handleNext = () => {
    const err = validate(step)
    if (err) { setValidationError(err); return }
    if (step < 4) goToStep(step + 1)
  }

  const handleBack = () => {
    if (step > 1) goToStep(step - 1)
  }

  const handleClose = () => {
    if (!state.isDirty) { router.back(); return }
    Alert.alert(t('programEditor.unsaved'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.close'), style: 'destructive', onPress: () => router.back() },
    ])
  }

  const handleSave = async () => {
    if (!userId) return
    const err = validate(step)
    if (err) { setValidationError(err); return }
    const savedId = await saveProgram(userId)
    if (savedId) {
      haptics.success()
      op.track('program_editor_saved', { program_id: savedId, is_new: !programId })
      await refreshPrograms()
      router.replace({ pathname: '/program/[id]', params: { id: savedId } })
    } else {
      Alert.alert(t('programEditor.saveError'))
    }
  }

  const handleAddFromCatalog = (ex: EditorExercise) => {
    addExercise(`${selectedPhaseTab}_${selectedDayId}`, { ...ex, section: catalogSection })
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      {/* Header spec-sheet */}
      <View className="flex-row items-start justify-between px-4 pb-3 pt-2">
        <View>
          <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
            {t('programEditor.editorTitle')}
          </Text>
          <Text className="font-bebas text-4xl leading-none text-foreground">
            {programId ? t('common.edit') : t('programEditor.newProgram')}
          </Text>
        </View>
        <View className="mt-1 flex-row items-center gap-2">
          {state.isDirty && (
            <Text className="font-mono text-[9px] uppercase tracking-wide text-amber-400">
              {t('programEditor.unsaved')}
            </Text>
          )}
          <Pressable onPress={handleClose} className="rounded-full bg-muted/60 p-2 active:opacity-70" hitSlop={6}>
            <X size={18} color="#888899" />
          </Pressable>
        </View>
      </View>

      {/* Indicador de pasos */}
      <View className="flex-row gap-1.5 px-4 pb-3">
        {STEP_LABEL_KEYS.map((key, idx) => {
          const s = idx + 1
          const isActive = s === step
          const isDone = s < step
          return (
            <Pressable
              key={key}
              onPress={() => handleStepTap(s)}
              className={cn(
                'flex-1 items-center rounded-lg border py-2 active:opacity-70',
                isActive ? 'border-lime/50 bg-lime/10' : isDone ? 'border-border bg-card' : 'border-border/50 bg-transparent',
              )}
            >
              <Text className={cn('font-mono text-[9px] uppercase tracking-wide', isActive ? 'text-lime' : isDone ? 'text-foreground' : 'text-muted-foreground/50')}>
                {s}. {t(key)}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {validationError && (
        <View className="mx-4 mb-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2">
          <Text className="text-xs text-red-400">{validationError}</Text>
        </View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerClassName="px-4 pb-6" keyboardShouldPersistTaps="handled">
          <Animated.View key={step} entering={FadeInRight.duration(280)}>
            {step === 1 && (
              <StepInfo info={state.info} updateInfo={updateInfo} redistributeWeeks={redistributeWeeks} />
            )}
            {step === 2 && (
              <StepPhases phases={state.phases} addPhase={addPhase} removePhase={removePhase} updatePhase={updatePhase} />
            )}
            {step === 3 && (
              <StepDays
                phases={state.phases}
                days={state.days}
                selectedPhaseTab={selectedPhaseTab}
                onSelectPhaseTab={setSelectedPhaseTab}
                updateDay={updateDay}
              />
            )}
            {step === 4 && (
              <StepExercises
                phases={state.phases}
                days={state.days}
                selectedPhaseTab={selectedPhaseTab}
                onSelectPhaseTab={setSelectedPhaseTab}
                selectedDayId={selectedDayId}
                onSelectDayId={setSelectedDayId}
                updateExercise={updateExercise}
                removeExercise={removeExercise}
                moveExercise={moveExercise}
                addExercise={addExercise}
                onOpenCatalog={section => { setCatalogSection(section); setShowCatalog(true) }}
              />
            )}
          </Animated.View>
        </ScrollView>

        {/* Nav inferior */}
        <View className="flex-row items-center gap-3 border-t border-border px-4 pb-2 pt-3">
          <Button variant="outline" disabled={step === 1} onPress={handleBack} className={cn(step === 1 && 'opacity-40')}>
            <Text className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              ← {t('common.back')}
            </Text>
          </Button>
          <Text className="flex-1 text-center font-mono text-[10px] uppercase tracking-wide text-muted-foreground/60">
            {t('programEditor.stepOf', { n: step, total: 4 })}
          </Text>
          {step < 4 ? (
            <Button variant="limeSolid" onPress={handleNext}>
              <Text className="font-mono text-xs uppercase tracking-widest text-background">
                {t('common.next')} →
              </Text>
            </Button>
          ) : (
            <Button variant="limeSolid" disabled={state.isSaving} onPress={() => void handleSave()}>
              <Text className="font-mono text-xs uppercase tracking-widest text-background">
                {state.isSaving ? t('common.processing') : t('common.save')}
              </Text>
            </Button>
          )}
        </View>
      </KeyboardAvoidingView>

      <ExercisePickerSheet
        visible={showCatalog}
        onClose={() => setShowCatalog(false)}
        onAdd={handleAddFromCatalog}
      />
    </SafeAreaView>
  )
}
