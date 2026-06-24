/**
 * Runner de circuito a pantalla completa — port nativo del CircuitView web
 * (apps/web/src/components/circuit/CircuitView.tsx). Ruta apilada de Expo Router.
 * Lee el circuito activo + estado de useCircuitSession; la fuente de la verdad
 * (avances de fase, persistencia, guardado en PB) vive en el contexto.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Pressable, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useKeepAwake } from 'expo-keep-awake'
import { useTranslation } from 'react-i18next'
import { X, Pause } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Confetti from '@/components/Confetti'
import CountdownRing from '@/components/circuit/CountdownRing'
import { useCircuitSession } from '@/contexts/CircuitSessionContext'
import { COLORS } from '@/lib/theme'
import { haptics } from '@/lib/haptics'
import * as sounds from '@/lib/sounds'
import { useLocalize } from '@calistenia/core/hooks/useLocalize'
import { getLocalQuote } from '@calistenia/core/lib/quotes'

// ── Format elapsed time ───────────────────────────────────────────────────────

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function CircuitScreen() {
  const { t } = useTranslation()
  const l = useLocalize()
  const router = useRouter()
  useKeepAwake()

  const {
    circuit,
    progress,
    startedAt,
    isPaused,
    advanceExercise,
    advanceFromGetReady,
    advanceToNextPhase,
    pause,
    resume,
    completeCircuit,
    abandonCircuit,
  } = useCircuitSession()

  const [elapsed, setElapsed] = useState(0)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const quote = useMemo(() => getLocalQuote(), [])

  // ── Sin circuito activo → volver a tabs ───────────────────────────────────

  useEffect(() => {
    if (!circuit) router.replace('/(tabs)')
  }, [circuit, router])

  // ── Elapsed timer ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!startedAt) return
    setElapsed(Math.floor((Date.now() - startedAt) / 1000))

    if (isPaused || progress.phase === 'celebrate') return

    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)

    return () => clearInterval(id)
  }, [startedAt, isPaused, progress.phase])

  // ── Sonidos por fase (uno por useEffect, como en web) ─────────────────────

  useEffect(() => {
    if (progress.phase === 'celebrate') {
      sounds.playSessionComplete()
      haptics.success()
    }
  }, [progress.phase])

  useEffect(() => {
    if (progress.phase === 'getReady') {
      sounds.playGetReady()
      haptics.heavy()
    }
  }, [progress.phase])

  useEffect(() => {
    if (progress.phase === 'roundRest') {
      sounds.playGetReady()
      haptics.medium()
    }
  }, [progress.phase])

  // ── Current / next exercise ───────────────────────────────────────────────

  const currentExercise = circuit?.exercises[progress.currentExerciseIndex]
  const nextExerciseIndex = progress.currentExerciseIndex + 1
  const nextExercise = circuit
    ? nextExerciseIndex < circuit.exercises.length
      ? circuit.exercises[nextExerciseIndex]
      : progress.currentRound + 1 < circuit.rounds
        ? circuit.exercises[0]
        : null
    : null

  // ── Completion handler ────────────────────────────────────────────────────

  const handleComplete = useCallback(async () => {
    setSaving(true)
    try {
      await completeCircuit(note || undefined)
      router.replace('/(tabs)')
    } finally {
      setSaving(false)
    }
  }, [completeCircuit, note, router])

  // ── Exit handler (Alert nativo robusto, no modal web) ─────────────────────

  const handleExit = useCallback(() => {
    Alert.alert(t('circuit.exitConfirm'), t('circuit.exitMessage'), [
      { text: t('circuit.exitCancel'), style: 'cancel' },
      {
        text: t('circuit.exitButton'),
        style: 'destructive',
        onPress: () => {
          abandonCircuit()
          router.replace('/(tabs)')
        },
      },
    ])
  }, [abandonCircuit, router, t])

  // ── Rest / work durations (idénticas a web) ───────────────────────────────

  const getRestDuration = () => {
    if (progress.phase === 'roundRest') return circuit?.restBetweenRounds ?? 30
    if (circuit?.mode === 'timed') {
      return currentExercise?.restSecondsOverride ?? circuit.restSeconds ?? 30
    }
    return circuit?.restBetweenExercises ?? 30
  }

  const getWorkDuration = () => {
    return currentExercise?.workSecondsOverride ?? circuit?.workSeconds ?? 30
  }

  // El effect de arriba navega fuera; mientras tanto no renderizamos nada.
  if (!circuit) return null

  // ── Celebrate phase ───────────────────────────────────────────────────────

  if (progress.phase === 'celebrate') {
    const elapsedMin = Math.floor(elapsed / 60)
    const elapsedSec = elapsed % 60

    return (
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
        <Confetti />
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerClassName="flex-grow items-center justify-center px-6 py-8 gap-6"
            keyboardShouldPersistTaps="handled"
          >
            {/* Check mark */}
            <View className="h-[88px] w-[88px] items-center justify-center rounded-full border border-border bg-muted">
              <Text className="text-[40px] leading-none text-lime">✓</Text>
            </View>

            {/* Título + stats */}
            <View className="items-center">
              <Text className="mb-2 text-center font-bebas text-5xl leading-none tracking-[3px] text-foreground">
                {t('circuit.circuitComplete')}
              </Text>
              <Text className="text-center font-mono text-[11px] tracking-[2px] text-muted-foreground">
                {l(circuit.name).toUpperCase()}
                {'  ·  '}
                {t('circuit.roundsCompleted', { completed: circuit.rounds, total: circuit.rounds })}
                {'  ·  '}
                {t('circuit.totalExercises', { count: progress.completedExercises })}
                {'  ·  '}
                {t('circuit.duration', { minutes: elapsedMin, seconds: elapsedSec })}
              </Text>
            </View>

            {/* Quote */}
            {quote && (
              <View className="max-w-[320px]">
                <Text className="mb-1.5 text-center text-base italic leading-relaxed text-foreground/70">
                  &ldquo;{quote.q}&rdquo;
                </Text>
                <Text className="text-center font-mono text-[11px] tracking-wide text-muted-foreground">
                  — {quote.a}
                </Text>
              </View>
            )}

            {/* Note */}
            <View className="w-full max-w-[360px]">
              <View className="mb-4 h-px bg-border" />
              <Text className="mb-1.5 font-mono text-[10px] tracking-[2px] text-muted-foreground">
                {t('circuit.noteLabel').toUpperCase()}
              </Text>
              <Input
                value={note}
                onChangeText={setNote}
                placeholder={t('circuit.notePlaceholder')}
                placeholderTextColor={COLORS.placeholder}
                maxLength={500}
                multiline
                className="h-auto min-h-[80px] py-3 text-sm"
                style={{ textAlignVertical: 'top' }}
              />
              <View className="mt-4 h-px bg-border" />
            </View>

            {/* Finish */}
            <Button
              onPress={handleComplete}
              disabled={saving}
              className="min-w-[200px] bg-lime px-9 active:bg-lime/90"
            >
              <Text className="font-bebas text-xl tracking-[2px] text-lime-foreground">
                {saving ? '...' : t('circuit.finish')}
              </Text>
            </Button>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  // ── Active workout phases ─────────────────────────────────────────────────

  const isGetReady = progress.phase === 'getReady'
  const isRest = progress.phase === 'rest' || progress.phase === 'roundRest'
  const isWork = progress.phase === 'work'
  const isExercise = progress.phase === 'exercise'

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      {/* ── Header bar ──────────────────────────────────────────────────── */}
      <View className="flex-row items-center justify-between border-b border-border bg-card/80 px-4 py-3">
        <View className="min-w-0 flex-1">
          <Text className="font-bebas text-lg tracking-[1px] text-foreground" numberOfLines={1}>
            {l(circuit.name)}
          </Text>
          <Text className="font-mono text-[10px] tracking-[1px] text-muted-foreground">
            {t('circuit.roundOf', { current: progress.currentRound + 1, total: circuit.rounds })}
          </Text>
        </View>

        <View className="flex-row items-center gap-3">
          {/* Elapsed */}
          <View className="items-end">
            <Text className="font-mono text-[10px] tracking-[1px] text-muted-foreground">
              {t('circuit.elapsed').toUpperCase()}
            </Text>
            <Text className="font-bebas text-lg leading-none tabular-nums text-foreground">
              {formatElapsed(elapsed)}
            </Text>
          </View>

          {/* Pause */}
          <Pressable
            onPress={pause}
            accessibilityLabel={t('circuit.paused')}
            className="h-11 w-11 items-center justify-center rounded-md border border-border active:bg-muted/50"
          >
            <Pause size={18} color={COLORS.mutedIcon} />
          </Pressable>

          {/* Close */}
          <Pressable
            onPress={handleExit}
            accessibilityLabel={t('circuit.exitConfirm')}
            className="h-11 w-11 items-center justify-center rounded-md border border-destructive/30 active:bg-destructive/10"
          >
            <X size={18} color={COLORS.destructive} />
          </Pressable>
        </View>
      </View>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow items-center justify-center px-6 py-6 gap-5"
      >
        {/* Get Ready (ambos modos) */}
        {isGetReady && currentExercise && (
          <View className="w-full max-w-md items-center gap-5">
            <Text className="text-center font-bebas text-4xl leading-tight tracking-[2px] text-foreground">
              {l(currentExercise.name)}
            </Text>

            <CountdownRing
              key="get-ready"
              seconds={5}
              totalSeconds={5}
              isPaused={isPaused}
              label={t('circuit.getReady')}
              labelColor={COLORS.lime}
              onComplete={advanceFromGetReady}
            />

            <Text className="font-mono text-[11px] tracking-[2px] text-muted-foreground">
              {t('circuit.exercisePosition', { current: 1, total: circuit.exercises.length })}
            </Text>
          </View>
        )}

        {/* Circuit mode: exercise phase */}
        {isExercise && currentExercise && (
          <View className="w-full max-w-md items-center gap-5">
            <View className="items-center">
              <Text className="text-center font-bebas text-5xl leading-tight tracking-[2px] text-foreground">
                {l(currentExercise.name)}
              </Text>
              {currentExercise.reps && (
                <Text className="mt-1 font-mono text-lg text-lime">{currentExercise.reps}</Text>
              )}
            </View>

            <Text className="font-mono text-[11px] tracking-[2px] text-muted-foreground">
              {t('circuit.exercisePosition', {
                current: progress.currentExerciseIndex + 1,
                total: circuit.exercises.length,
              })}
            </Text>

            {nextExercise && (
              <Text className="mt-3 font-mono text-[11px] tracking-[1px] text-muted-foreground/60">
                {t('circuit.nextUp', { name: l(nextExercise.name) })}
              </Text>
            )}

            <Button
              onPress={() => {
                haptics.light()
                advanceExercise()
              }}
              className="h-14 w-full max-w-[320px] bg-lime active:bg-lime/90"
            >
              <Text className="font-bebas text-2xl tracking-[2px] text-lime-foreground">
                {t('circuit.done')} ✓
              </Text>
            </Button>

            <Pressable
              onPress={() => {
                haptics.light()
                advanceExercise()
              }}
              hitSlop={10}
              className="active:opacity-60"
            >
              <Text className="font-mono text-[11px] tracking-[1px] text-muted-foreground/60">
                {t('circuit.skip')}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Timed mode: work phase */}
        {isWork && currentExercise && (
          <View className="w-full max-w-md items-center gap-5">
            <Text className="text-center font-bebas text-4xl leading-tight tracking-[2px] text-foreground">
              {l(currentExercise.name)}
            </Text>

            <CountdownRing
              key={`work-${progress.currentRound}-${progress.currentExerciseIndex}`}
              seconds={getWorkDuration()}
              totalSeconds={getWorkDuration()}
              isPaused={isPaused}
              label={t('circuit.work')}
              labelColor={COLORS.lime}
              onComplete={advanceExercise}
            />

            <Text className="font-mono text-[11px] tracking-[2px] text-muted-foreground">
              {t('circuit.exercisePosition', {
                current: progress.currentExerciseIndex + 1,
                total: circuit.exercises.length,
              })}
            </Text>

            {nextExercise && (
              <Text className="mt-3 font-mono text-[11px] tracking-[1px] text-muted-foreground/60">
                {t('circuit.nextUp', { name: l(nextExercise.name) })}
              </Text>
            )}
          </View>
        )}

        {/* Rest phase (ambos modos) */}
        {isRest && (
          <View className="w-full max-w-md items-center gap-5">
            {progress.phase === 'roundRest' && (
              <Text className="mb-2 font-bebas text-2xl tracking-[2px] text-lime">
                {t('circuit.roundComplete', { round: progress.currentRound + 1 })}
              </Text>
            )}

            <CountdownRing
              key={`rest-${progress.currentRound}-${progress.currentExerciseIndex}-${progress.phase}`}
              seconds={getRestDuration()}
              totalSeconds={getRestDuration()}
              isPaused={isPaused}
              label={t('circuit.rest')}
              labelColor={COLORS.destructive}
              onComplete={advanceToNextPhase}
            />

            {nextExercise && (
              <Text className="font-mono text-[11px] tracking-[1px] text-muted-foreground">
                {t('circuit.nextUp', { name: l(nextExercise.name) })}
              </Text>
            )}

            <Pressable
              onPress={() => {
                haptics.light()
                advanceToNextPhase()
              }}
              hitSlop={10}
              className="active:opacity-60"
            >
              <Text className="font-mono text-[11px] tracking-[1px] text-muted-foreground/60">
                {t('circuit.skip')}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* ── Pause overlay (tap en cualquier sitio para reanudar) ─────────── */}
      {isPaused && (
        <Pressable
          onPress={resume}
          className="absolute inset-0 z-50 items-center justify-center gap-5 bg-background/90"
        >
          <Text className="font-bebas text-[48px] tracking-[4px] text-foreground">
            {t('circuit.paused')}
          </Text>
          <Button
            onPress={resume}
            className="min-w-[160px] bg-lime px-8 active:bg-lime/90"
          >
            <Text className="font-bebas text-xl tracking-[2px] text-lime-foreground">
              {t('circuit.resume')}
            </Text>
          </Button>
          <Text className="mt-4 font-mono text-[10px] tracking-[1px] text-muted-foreground/40">
            {t('circuit.tapToResume')}
          </Text>
        </Pressable>
      )}
    </SafeAreaView>
  )
}
