/**
 * Constructor de circuitos — port nativo de apps/web/src/components/circuit/CircuitBuilder.tsx.
 * Misma lógica de estado/handleStart/summary; APIs web cambiadas por nativas
 * (Pressable steppers, ReorderControls, catálogo nativo, haptics).
 *
 * Se renderiza dentro del ScrollView de la pantalla padre — NO envolver en
 * SafeAreaView ni en otro scroll.
 */
import { useState, useCallback, useMemo } from 'react'
import { View, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Minus, Plus, Play } from 'lucide-react-native'
import { useLocalize } from '@calistenia/core/hooks/useLocalize'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ReorderControls } from '@/components/free-session/ReorderControls'
import { cn } from '@/lib/utils'
import { COLORS } from '@/lib/theme'
import { haptics } from '@/lib/haptics'
import { CATALOG } from '@/lib/catalog'
import type { CircuitDefinition, CircuitExercise } from '@calistenia/core/types'

// ── Props ──────────────────────────────────────────────────────────────────────

interface CircuitBuilderProps {
  initialPreset?: Partial<CircuitDefinition>
  onStart: (circuit: CircuitDefinition) => void
}

// ── Number Stepper ─────────────────────────────────────────────────────────────

function NumberStepper({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  suffix,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
}) {
  const atMin = value <= min
  const atMax = value >= max

  const dec = () => {
    if (atMin) return
    haptics.light()
    onChange(Math.max(min, value - step))
  }
  const inc = () => {
    if (atMax) return
    haptics.light()
    onChange(Math.min(max, value + step))
  }

  return (
    <View className="flex-row items-center justify-between gap-2 py-1.5">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <View className="flex-row items-center gap-1.5">
        <Pressable
          onPress={dec}
          disabled={atMin}
          className={cn(
            'h-8 w-8 items-center justify-center rounded-lg bg-muted/50 active:bg-muted',
            atMin && 'opacity-30',
          )}
        >
          <Minus size={16} color={COLORS.mutedIcon} />
        </Pressable>
        <Text className="w-14 text-center font-mono text-sm text-foreground">
          {value}{suffix ? ` ${suffix}` : ''}
        </Text>
        <Pressable
          onPress={inc}
          disabled={atMax}
          className={cn(
            'h-8 w-8 items-center justify-center rounded-lg bg-muted/50 active:bg-muted',
            atMax && 'opacity-30',
          )}
        >
          <Plus size={16} color={COLORS.mutedIcon} />
        </Pressable>
      </View>
    </View>
  )
}

// ── Exercise Card ──────────────────────────────────────────────────────────────

function ExerciseCard({
  exercise,
  index,
  total,
  mode,
  name,
  t,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  exercise: CircuitExercise
  index: number
  total: number
  mode: 'circuit' | 'timed'
  name: string
  t: (key: string) => string
  onUpdate: (ex: CircuitExercise) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const [showOverride, setShowOverride] = useState(
    !!(exercise.workSecondsOverride || exercise.restSecondsOverride),
  )

  const toggleOverride = () => {
    haptics.selection()
    const next = !showOverride
    setShowOverride(next)
    if (!next) {
      onUpdate({
        ...exercise,
        workSecondsOverride: undefined,
        restSecondsOverride: undefined,
      })
    }
  }

  return (
    <View className="flex-row items-start gap-2 rounded-xl border border-border bg-muted/30 p-3">
      {/* Contenido */}
      <View className="min-w-0 flex-1">
        <View className="mb-1 flex-row items-center justify-between">
          <Text className="flex-1 font-sans-medium text-sm text-foreground" numberOfLines={1}>
            {name}
          </Text>
          <ReorderControls
            index={index}
            count={total}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onRemove={onRemove}
          />
        </View>

        {mode === 'circuit' && (
          <Input
            className="text-sm"
            placeholder={t('circuit.repsPlaceholder')}
            placeholderTextColor={COLORS.placeholder}
            value={exercise.reps ?? ''}
            onChangeText={(text) => onUpdate({ ...exercise, reps: text })}
          />
        )}

        {mode === 'timed' && (
          <View>
            <Pressable
              onPress={toggleOverride}
              className="flex-row items-center gap-2 py-1 active:opacity-70"
            >
              <View
                className={cn(
                  'h-4 w-4 items-center justify-center rounded border',
                  showOverride ? 'border-lime bg-lime/20' : 'border-border bg-transparent',
                )}
              >
                {showOverride && <View className="h-2 w-2 rounded-sm bg-lime" />}
              </View>
              <Text className="text-xs text-muted-foreground">{t('circuit.overrideTimers')}</Text>
            </Pressable>
            {showOverride && (
              <View className="mt-1.5">
                <NumberStepper
                  label={t('circuit.workTime')}
                  value={exercise.workSecondsOverride ?? 40}
                  onChange={(v) => onUpdate({ ...exercise, workSecondsOverride: v })}
                  min={5}
                  max={120}
                  step={5}
                  suffix="s"
                />
                <NumberStepper
                  label={t('circuit.restTime')}
                  value={exercise.restSecondsOverride ?? 20}
                  onChange={(v) => onUpdate({ ...exercise, restSecondsOverride: v })}
                  min={0}
                  max={60}
                  step={5}
                  suffix="s"
                />
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  )
}

// ── CircuitBuilder ─────────────────────────────────────────────────────────────

export default function CircuitBuilder({ initialPreset, onStart }: CircuitBuilderProps) {
  const { t } = useTranslation()
  const l = useLocalize()

  // Estado desde el preset inicial
  const [mode, setMode] = useState<'circuit' | 'timed'>(initialPreset?.mode ?? 'circuit')
  const [rounds, setRounds] = useState(initialPreset?.rounds ?? 3)
  const [restBetweenExercises, setRestBetweenExercises] = useState(initialPreset?.restBetweenExercises ?? 0)
  const [restBetweenRounds, setRestBetweenRounds] = useState(initialPreset?.restBetweenRounds ?? 60)
  const [workSeconds, setWorkSeconds] = useState(initialPreset?.workSeconds ?? 40)
  const [restSeconds, setRestSeconds] = useState(initialPreset?.restSeconds ?? 20)
  const [exercises, setExercises] = useState<CircuitExercise[]>(initialPreset?.exercises ?? [])

  // ── Búsqueda de ejercicios ───────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')

  const filteredCatalog = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return []
    const q = searchQuery.toLowerCase()
    return CATALOG.filter(
      (ex) =>
        l(ex.name).toLowerCase().includes(q) || l(ex.muscles).toLowerCase().includes(q),
    ).slice(0, 6)
  }, [searchQuery, l])

  // ── Mutaciones de la lista de ejercicios ──────────────────────────────────

  const addExerciseFromCatalog = useCallback(
    (item: (typeof CATALOG)[number]) => {
      haptics.light()
      setExercises((prev) => [
        ...prev,
        {
          exerciseId: item.id,
          name: item.name,
          reps: mode === 'circuit' ? item.reps || '10' : undefined,
        },
      ])
      setSearchQuery('')
    },
    [mode],
  )

  const addCustomExercise = useCallback(() => {
    const name = searchQuery.trim()
    if (!name) return
    haptics.light()
    const id = name.toLowerCase().replace(/\s+/g, '_')
    setExercises((prev) => [
      ...prev,
      { exerciseId: id, name: { es: name, en: name }, reps: mode === 'circuit' ? '10' : undefined },
    ])
    setSearchQuery('')
  }, [searchQuery, mode])

  const updateExercise = useCallback((index: number, ex: CircuitExercise) => {
    setExercises((prev) => prev.map((e, i) => (i === index ? ex : e)))
  }, [])

  const removeExercise = useCallback((index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const moveExercise = useCallback((from: number, to: number) => {
    setExercises((prev) => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }, [])

  // ── Texto resumen ──────────────────────────────────────────────────────────

  const estimateMinutes = () => {
    if (exercises.length === 0) return 0
    if (mode === 'timed') {
      const perRound = exercises.length * (workSeconds + restSeconds) + restBetweenRounds
      return Math.round((perRound * rounds) / 60)
    }
    return null // la duración en modo circuito no es predecible
  }

  const summaryText = () => {
    const count = exercises.length
    if (count === 0) return t('circuit.addExercisesPrompt')
    const base = `${rounds} ${t('circuit.rounds')} × ${count} ${t('circuit.exercises')}`
    const mins = estimateMinutes()
    if (mins !== null && mins > 0) return `${base} ~ ${mins} min`
    return base
  }

  // ── Handler de inicio ──────────────────────────────────────────────────────

  const handleStart = () => {
    haptics.medium()
    const circuit: CircuitDefinition = {
      id: `circuit_${Date.now()}`,
      name: { es: 'Circuito personalizado', en: 'Custom circuit' },
      mode,
      exercises,
      rounds,
      restBetweenExercises: mode === 'circuit' ? restBetweenExercises : 0,
      restBetweenRounds,
      ...(mode === 'timed' ? { workSeconds, restSeconds } : {}),
    }
    onStart(circuit)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View className="gap-5">
      {/* Selector de modo */}
      <View className="flex-row rounded-xl bg-muted/40 p-1">
        {(['circuit', 'timed'] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => {
              haptics.selection()
              setMode(m)
            }}
            className={cn(
              'flex-1 items-center rounded-lg py-2 active:opacity-80',
              mode === m && 'border border-lime/30 bg-lime/20',
            )}
          >
            <Text
              className={cn(
                'font-mono text-[11px] uppercase tracking-wide',
                mode === m ? 'text-lime' : 'text-muted-foreground',
              )}
            >
              {t(`circuit.mode_${m}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Configuración */}
      <View className="rounded-xl border border-border bg-muted/20 p-3">
        <NumberStepper
          label={t('circuit.rounds')}
          value={rounds}
          onChange={setRounds}
          min={1}
          max={20}
        />
        {mode === 'circuit' && (
          <NumberStepper
            label={t('circuit.restBetweenExercises')}
            value={restBetweenExercises}
            onChange={setRestBetweenExercises}
            min={0}
            max={120}
            step={5}
            suffix="s"
          />
        )}
        <NumberStepper
          label={t('circuit.restBetweenRounds')}
          value={restBetweenRounds}
          onChange={setRestBetweenRounds}
          min={0}
          max={180}
          step={15}
          suffix="s"
        />
        {mode === 'timed' && (
          <>
            <NumberStepper
              label={t('circuit.workTime')}
              value={workSeconds}
              onChange={setWorkSeconds}
              min={10}
              max={120}
              step={5}
              suffix="s"
            />
            <NumberStepper
              label={t('circuit.restTime')}
              value={restSeconds}
              onChange={setRestSeconds}
              min={0}
              max={60}
              step={5}
              suffix="s"
            />
          </>
        )}
      </View>

      {/* Lista de ejercicios */}
      <View className="gap-2">
        <Text className="font-sans-medium text-sm text-muted-foreground">
          {t('circuit.exerciseList')}
        </Text>
        {exercises.length === 0 && (
          <Text className="py-4 text-center text-xs text-muted-foreground">
            {t('circuit.noExercisesYet')}
          </Text>
        )}
        {exercises.map((ex, i) => (
          <ExerciseCard
            key={`${ex.exerciseId}-${i}`}
            exercise={ex}
            index={i}
            total={exercises.length}
            mode={mode}
            name={l(ex.name)}
            t={t}
            onUpdate={(updated) => updateExercise(i, updated)}
            onRemove={() => removeExercise(i)}
            onMoveUp={() => moveExercise(i, i - 1)}
            onMoveDown={() => moveExercise(i, i + 1)}
          />
        ))}
      </View>

      {/* Añadir ejercicio — buscador con catálogo */}
      <View>
        <View className="flex-row gap-2">
          <Input
            className="flex-1 text-sm"
            placeholder={t('circuit.exerciseNamePlaceholder')}
            placeholderTextColor={COLORS.placeholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={addCustomExercise}
            returnKeyType="done"
          />
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={!searchQuery.trim()}
            onPress={addCustomExercise}
          >
            <Text>{t('circuit.add')}</Text>
          </Button>
        </View>

        {/* Resultados del catálogo */}
        {filteredCatalog.length > 0 && (
          <View className="mt-1 overflow-hidden rounded-xl border border-border bg-card">
            {filteredCatalog.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => addExerciseFromCatalog(item)}
                className="flex-row items-baseline border-b border-border/50 px-3 py-2.5 active:bg-muted/50"
              >
                <Text className="font-sans-medium text-sm text-foreground" numberOfLines={1}>
                  {l(item.name)}
                </Text>
                <Text className="ml-2 text-[11px] text-muted-foreground" numberOfLines={1}>
                  {l(item.muscles)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Botón de inicio */}
      <View className="pt-1">
        <Button
          className="w-full"
          size="lg"
          disabled={exercises.length === 0}
          onPress={handleStart}
        >
          <Play size={16} color={COLORS.lime} fill={COLORS.lime} />
          <Text>{t('circuit.start')}</Text>
        </Button>
        <Text className="mt-1.5 text-center font-mono text-xs text-muted-foreground">
          {summaryText()}
        </Text>
      </View>
    </View>
  )
}
