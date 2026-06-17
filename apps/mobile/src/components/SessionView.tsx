// Port del SessionView de apps/web a RN. Misma arquitectura: este componente
// es dueño del estado local (stepIdx/phase/setsCount) y lo empuja al
// ActiveSessionContext via onProgressChange — nunca lo lee de vuelta.
import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import { View, ScrollView, Pressable, Alert, AppState, Linking, Dimensions, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  runOnJS,
  Easing,
  useReducedMotion,
  FadeIn,
  FadeInDown,
  ZoomIn,
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import Svg, { Circle } from 'react-native-svg'
import { ChevronLeft, ChevronRight, X, Play, Pause, RotateCcw } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { requestNotifPermission, scheduleRestEnd, cancelScheduled } from '@/lib/notifications'
import { useLiveSession } from '@/lib/use-live-session'
import { updateLiveRest, liveSessionHandlesRest } from '@/lib/live-session'
import * as sounds from '@/lib/sounds'
import { haptics as haptic } from '@/lib/haptics'
import type { PREvent } from '@calistenia/core/hooks/useProgress'
import type { Exercise, Workout, ExerciseLog, SetData, ExerciseTiming } from '@calistenia/core/types'
import { ExerciseTimingTracker, formatTimingClock, prepareTimingBreakdown, type ExerciseTimingState } from '@calistenia/core/lib/exerciseTiming'
import { getCelebrationTagline } from '@calistenia/core/lib/celebration'
import { getLocalQuote, type Quote } from '@calistenia/core/lib/quotes'
import Confetti from '@/components/Confetti'
import { getUserAvatarUrl } from '@calistenia/core/lib/pocketbase'
import { useAuthUser } from '@/lib/use-auth-user'
import { shareImage, shareWorkoutSession } from '@/lib/share'
import WorkoutShareCard from '@/components/share/WorkoutShareCard'
import ShareCardCapture, { type ShareCardCaptureHandle } from '@/components/share/ShareCardCapture'
import PRCelebration from '@/components/share/PRCelebration'

interface Step {
  exercise: Exercise
  setNumber: number
  totalSets: number
  section: 'warmup' | 'main' | 'cooldown'
}

function buildSteps(exercises: Exercise[]): Step[] {
  const steps: Step[] = []
  exercises.forEach(ex => {
    const total = ex.sets === 'múltiples' ? 3 : (parseInt(String(ex.sets)) || 1)
    for (let s = 1; s <= total; s++) {
      steps.push({ exercise: ex, setNumber: s, totalSets: total, section: ex.section || 'main' })
    }
  })
  return steps
}

const LIME = 'hsl(74 90% 45%)'
const MUTED = 'hsl(0 0% 55%)'
const SCREEN_WIDTH = Dimensions.get('window').width

// ─── Rest screen ──────────────────────────────────────────────────────────────

interface RestScreenProps {
  seconds: number
  exerciseId?: string
  nextStep: Step | null
  onSkip: () => void
  savedRest?: number
  onAdjust?: (exerciseId: string, seconds: number) => void
}

function RestScreen({ seconds: defaultSeconds, exerciseId, nextStep, onSkip, savedRest, onAdjust }: RestScreenProps) {
  const { t } = useTranslation()
  const initialSeconds = savedRest || defaultSeconds
  const endAtRef = useRef<number>(Date.now() + initialSeconds * 1000)
  const [remaining, setRemaining] = useState<number>(initialSeconds)
  const [totalSecs, setTotalSecs] = useState<number>(initialSeconds)
  const hasPlayedWarning = useRef<boolean>(false)
  const hasFinished = useRef<boolean>(false)
  const lastRemainingRef = useRef<number>(initialSeconds)
  const notifIdRef = useRef<string | null>(null)
  const onSkipRef = useRef(onSkip)
  onSkipRef.current = onSkip
  const nextStepRef = useRef(nextStep)
  nextStepRef.current = nextStep

  useEffect(() => { sounds.playRestStart() }, [])

  // Notificación local programada para el fin del descanso (se ve si la app
  // está en background; en foreground el handler la silencia).
  useEffect(() => {
    const ns = nextStepRef.current
    // En Android nativo el cronómetro de la notificación persistente ya avisa
    // del fin del descanso — la puntual sería redundante
    if (!liveSessionHandlesRest()) {
      scheduleRestEnd(
        Math.ceil((endAtRef.current - Date.now()) / 1000),
        t('notify.letsGo'),
        ns ? `${ns.exercise.name} — ${t('notify.setOf', { set: ns.setNumber, total: ns.totalSets })}` : t('notify.prepareForNext'),
      ).then(id => { notifIdRef.current = id })
    }
    updateLiveRest(endAtRef.current)
    return () => { cancelScheduled(notifIdRef.current) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown por timestamp — sobrevive backgrounding (se re-sincroniza al volver)
  useEffect(() => {
    const tick = () => {
      const rem = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000))
      const prev = lastRemainingRef.current
      if (rem !== prev) {
        if (prev > 10 && rem <= 10 && rem > 0 && !hasPlayedWarning.current) {
          hasPlayedWarning.current = true
          sounds.playWarning()
          haptic.warning()
        }
        if (rem > 0 && rem <= 3 && prev === rem + 1) {
          sounds.playCountdownTick()
          haptic.light()
        }
        lastRemainingRef.current = rem
        setRemaining(rem)
      }
      if (rem <= 0 && !hasFinished.current) {
        hasFinished.current = true
        sounds.playGetReady()
        haptic.success()
        onSkipRef.current()
      }
    }

    const id = setInterval(tick, 250)
    const sub = AppState.addEventListener('change', state => { if (state === 'active') tick() })
    return () => {
      clearInterval(id)
      sub.remove()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const adjustTime = (delta: number) => {
    const newTotal = Math.max(10, totalSecs + delta)
    setTotalSecs(newTotal)
    endAtRef.current += delta * 1000
    const rem = Math.max(1, Math.ceil((endAtRef.current - Date.now()) / 1000))
    lastRemainingRef.current = rem
    setRemaining(rem)
    // Reprogramar la notificación con el nuevo fin
    cancelScheduled(notifIdRef.current)
    const ns = nextStepRef.current
    if (!liveSessionHandlesRest()) {
      scheduleRestEnd(
        rem,
        t('notify.letsGo'),
        ns ? `${ns.exercise.name} — ${t('notify.setOf', { set: ns.setNumber, total: ns.totalSets })}` : t('notify.prepareForNext'),
      ).then(id => { notifIdRef.current = id })
    }
    updateLiveRest(endAtRef.current)
    if (exerciseId && onAdjust) onAdjust(exerciseId, newTotal)
  }

  const handleSkip = () => {
    cancelScheduled(notifIdRef.current)
    onSkip()
  }

  const mins = Math.floor(remaining / 60)
  const secs = String(remaining % 60).padStart(2, '0')
  const pct = totalSecs > 0 ? remaining / totalSecs : 0
  const ringR = 62
  const ringSize = 148
  const ringStroke = 7
  const circumference = 2 * Math.PI * ringR
  const strokeOffset = circumference * (1 - pct)
  const isUrgent = remaining > 0 && remaining < 10

  return (
    <View className="flex-1 items-center justify-center gap-7 px-6">
      <Text className="font-mono text-[11px] uppercase tracking-[4px] text-muted-foreground">{t('session.resting')}</Text>

      <View style={{ width: ringSize, height: ringSize }}>
        <Svg width={ringSize} height={ringSize} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={ringSize / 2} cy={ringSize / 2} r={ringR} fill="none"
            stroke={MUTED} strokeOpacity={0.25} strokeWidth={ringStroke} />
          <Circle
            cx={ringSize / 2} cy={ringSize / 2} r={ringR} fill="none"
            stroke={isUrgent ? 'hsl(0 84% 60%)' : LIME}
            strokeWidth={ringStroke}
            strokeDasharray={`${circumference}`}
            strokeDashoffset={strokeOffset}
            strokeLinecap="round"
          />
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          <Text className={cn('font-bebas text-[46px] tracking-[2px] tabular-nums leading-none', isUrgent ? 'text-destructive' : 'text-foreground')}>
            {mins}:{secs}
          </Text>
        </View>
      </View>

      {nextStep && (
        <View className="w-full max-w-[340px] rounded-xl border border-border bg-card px-4 py-3.5">
          <Text className="mb-2 font-mono text-[9px] uppercase tracking-[3px] text-muted-foreground">{t('notify.prepareForNext')}</Text>
          <Text className="mb-1 font-sans-medium text-[15px] text-foreground">{nextStep.exercise.name}</Text>
          <Text className="font-mono text-xs text-lime">
            {nextStep.exercise.reps}
            <Text className="font-mono text-[11px] text-muted-foreground">  · {t('session.set')} {nextStep.setNumber}/{nextStep.totalSets}</Text>
          </Text>
          <Text className="mt-1 font-mono text-[10px] tracking-wide text-muted-foreground">{nextStep.exercise.muscles}</Text>
        </View>
      )}

      <View className="flex-row gap-2">
        <Button variant="outline" size="sm" onPress={() => adjustTime(-15)}><Text className="font-mono text-[11px] text-muted-foreground">-15s</Text></Button>
        <Button variant="outline" size="sm" onPress={() => adjustTime(15)}><Text className="font-mono text-[11px] text-muted-foreground">+15s</Text></Button>
        <Button variant="outline" size="sm" onPress={() => adjustTime(30)}><Text className="font-mono text-[11px] text-muted-foreground">+30s</Text></Button>
      </View>

      <Button variant="outline" className="border-lime/25 bg-lime/10 px-8" onPress={handleSkip}>
        <Text className="font-mono text-[11px] tracking-[2px] text-lime">{t('session.skipRest')}</Text>
      </Button>
    </View>
  )
}

// ─── Timer simple para ejercicios isTimer ─────────────────────────────────────

function ExerciseTimer({ initialSeconds = 30 }: { initialSeconds?: number }) {
  const [remaining, setRemaining] = useState(initialSeconds)
  const [running, setRunning] = useState(false)
  const endAtRef = useRef<number>(0)

  const lastRemRef = useRef<number>(initialSeconds)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const rem = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000))
      const prev = lastRemRef.current
      if (rem !== prev) {
        if (prev > 10 && rem <= 10 && rem > 0) sounds.playWarning()
        if (rem > 0 && rem <= 3 && prev === rem + 1) sounds.playCountdownTick()
        lastRemRef.current = rem
      }
      setRemaining(rem)
      if (rem <= 0) {
        setRunning(false)
        sounds.playTimerComplete()
        haptic.success()
      }
    }, 250)
    return () => clearInterval(id)
  }, [running])

  const toggle = () => {
    if (running) {
      setRunning(false)
    } else {
      endAtRef.current = Date.now() + (remaining > 0 ? remaining : initialSeconds) * 1000
      if (remaining <= 0) setRemaining(initialSeconds)
      setRunning(true)
    }
  }
  const reset = () => {
    setRunning(false)
    setRemaining(initialSeconds)
  }

  const mins = Math.floor(remaining / 60)
  const secs = String(remaining % 60).padStart(2, '0')

  return (
    <View className="flex-row items-center justify-center gap-4 py-3">
      <Text className={cn('font-bebas text-[44px] leading-none tracking-[2px] tabular-nums', remaining === 0 ? 'text-lime' : 'text-foreground')}>
        {mins}:{secs}
      </Text>
      <Pressable onPress={toggle} className="size-12 items-center justify-center rounded-full bg-lime/15" accessibilityLabel={running ? 'Pausar' : 'Iniciar'}>
        {running ? <Pause size={20} color={LIME} /> : <Play size={20} color={LIME} fill={LIME} />}
      </Pressable>
      <Pressable onPress={reset} className="size-12 items-center justify-center rounded-full bg-muted" accessibilityLabel="Reiniciar">
        <RotateCcw size={18} color={MUTED} />
      </Pressable>
    </View>
  )
}

// ─── Exercise screen ──────────────────────────────────────────────────────────

// "8-12" → "8"; "12/lado", "máx" se quedan tal cual
function quickReps(reps: string): string {
  return /^\d+-\d+$/.test(reps) ? reps.split('-')[0] : reps
}

interface ExerciseScreenProps {
  step: Step
  onLogged: (data: { reps: string; note: string; weight?: number; rpe?: number }) => void
  logs?: ExerciseLog[]
}

const ExerciseScreen = memo(function ExerciseScreen({ step, onLogged, logs = [] }: ExerciseScreenProps) {
  const { t } = useTranslation()
  const [editOpen, setEditOpen] = useState(false)
  const [customReps, setCustomReps] = useState('')
  const [customNote, setCustomNote] = useState('')
  const [customWeight, setCustomWeight] = useState('')
  const [customRpe, setCustomRpe] = useState('')

  const { exercise, setNumber, totalSets } = step
  const recentLogs = logs.slice(0, 2)

  // Pista de sobrecarga progresiva
  const lastLog = logs[0]
  const lastBestReps = lastLog?.sets?.reduce((max: number, s: SetData) => {
    const n = parseInt(s.reps); return (!isNaN(n) && n > max) ? n : max
  }, 0) || 0
  const lastBestWeight = lastLog?.sets?.reduce((max: number, s: SetData) => (s.weight || 0) > max ? (s.weight || 0) : max, 0) || 0

  const defaultReps = quickReps(exercise.reps)

  const doLog = (reps: string | number, note: string = '', weight?: number, rpe?: number): void => {
    sounds.playSetComplete()
    haptic.medium()
    onLogged({ reps: String(reps), note, weight, rpe })
  }

  const handleQuick = () => doLog(defaultReps)
  const handleForm = () => {
    if (!customReps) return
    const w = customWeight ? parseFloat(customWeight) : undefined
    const r = customRpe ? parseInt(customRpe) : undefined
    doLog(customReps, customNote, w, r)
    setCustomReps(''); setCustomNote(''); setCustomWeight(''); setCustomRpe(''); setEditOpen(false)
  }

  const openYoutube = () => {
    const query = exercise.youtube?.trim() || exercise.name
    Linking.openURL(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`).catch(() => {})
  }

  return (
    <ScrollView className="flex-1" contentContainerClassName="flex-grow px-5 pb-6 pt-4">
      {/* Nombre + meta */}
      <View className="mb-2">
        <Text className="font-bebas text-[40px] leading-none tracking-[2px] text-foreground">{exercise.name}</Text>
        <View className="mt-2 flex-row flex-wrap items-center gap-x-3 gap-y-1">
          <Text className="font-mono text-[13px] tracking-wide text-lime">{exercise.reps}</Text>
          <Text className="font-mono text-[11px] text-muted-foreground">· {t('common.rest')} {exercise.rest}s</Text>
          <Text className="font-mono text-[10px] tracking-wide text-muted-foreground">{exercise.muscles}</Text>
        </View>
      </View>

      {/* Dots de series */}
      <View className="mb-5 flex-row items-center gap-2">
        {Array.from({ length: totalSets }).map((_, i) => (
          <View key={i} className={cn(
            'h-1.5 w-7 rounded',
            i < setNumber - 1 ? 'bg-lime' : i === setNumber - 1 ? 'bg-lime/40' : 'bg-border',
          )} />
        ))}
        <Text className="ml-1 font-mono text-[10px] text-muted-foreground">{t('session.set').toUpperCase()} {setNumber}/{totalSets}</Text>
      </View>

      {/* Sobrecarga progresiva */}
      {lastLog && lastBestReps > 0 && setNumber === 1 && (
        <View className="mb-4 rounded-md border-l-[3px] border-amber-400/30 bg-amber-400/5 px-3.5 py-2.5">
          <Text className="text-[12px] text-amber-400/80">
            {t('exercise.lastTime')} <Text className="font-sans-bold text-[12px] text-amber-400">{lastBestReps}</Text> reps
            {lastBestWeight > 0 ? <Text className="text-[12px] text-amber-400/80"> +<Text className="font-sans-bold text-[12px] text-amber-400">{lastBestWeight}</Text>kg</Text> : null}
            {' — '}
            {lastBestWeight > 0 ? `intenta +${(lastBestWeight + 2.5).toFixed(1)}kg o +1 rep` : `intenta ${lastBestReps + 1} reps`}
          </Text>
        </View>
      )}

      {/* Nota del ejercicio */}
      {exercise.note ? (
        <View className="mb-5 rounded-md border-l-[3px] border-lime/20 bg-muted/30 px-3.5 py-2.5">
          <Text className="font-sans-italic text-[13px] leading-5 text-muted-foreground">{exercise.note}</Text>
        </View>
      ) : null}

      {/* Historial reciente */}
      {recentLogs.length > 0 && (
        <View className="mb-5">
          <Text className="mb-1.5 font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground/50">Últimas sesiones</Text>
          {recentLogs.map((log, i) => (
            <Text key={i} className="mb-0.5 text-xs text-muted-foreground/60" numberOfLines={1}>
              <Text className="font-mono text-xs text-muted-foreground/30">{log.date}</Text>
              {'  '}
              {log.sets?.map((s: SetData, j: number) =>
                `${j + 1}: ${s.reps}${s.weight ? ` +${s.weight}kg` : ''}`
              ).join('  ')}
            </Text>
          ))}
        </View>
      )}

      {/* Timer para ejercicios de tiempo */}
      {exercise.isTimer && <ExerciseTimer initialSeconds={exercise.timerSeconds || 30} />}

      <View className="flex-1" />

      {/* ── Acciones ── */}
      <View className="gap-2.5">
        <Pressable
          onPress={handleQuick}
          className="items-center rounded-lg bg-lime/15 py-[18px] active:bg-lime/25"
          accessibilityLabel={`${t('session.set')} ${defaultReps}`}
        >
          <Text className="font-mono-bold text-sm tracking-[1.5px] text-lime">+ {t('session.set').toUpperCase()} — {defaultReps}</Text>
        </Pressable>

        <View className="flex-row gap-2">
          <Pressable
            onPress={() => setEditOpen(v => !v)}
            className={cn(
              'min-h-[44px] flex-1 items-center justify-center rounded-md border',
              editOpen ? 'border-lime/40 bg-lime/10' : 'border-border',
            )}
          >
            <Text className={cn('font-mono text-[10px] tracking-wide', editOpen ? 'text-lime' : 'text-muted-foreground')}>
              {t('session.editBtn')}
            </Text>
          </Pressable>
          <Pressable
            onPress={openYoutube}
            className="min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-red-500/20 bg-red-500/5"
            accessibilityLabel="YouTube"
          >
            <Text className="text-sm text-red-500">▶</Text>
          </Pressable>
        </View>

        {editOpen && (
          <View className="rounded-lg border border-lime/20 bg-lime/5 px-3.5 py-3">
            <Text className="mb-2.5 font-mono text-[9px] uppercase tracking-[2px] text-lime">Registrar serie personalizada</Text>
            <View className="flex-row gap-2">
              <Input
                value={customReps}
                onChangeText={setCustomReps}
                placeholder={`Reps (${exercise.reps})`}
                className="h-10 flex-1 text-xs"
                maxLength={20}
              />
              <Input
                value={customWeight}
                onChangeText={setCustomWeight}
                placeholder={t('session.weightPlaceholder')}
                keyboardType="decimal-pad"
                className="h-10 w-[84px] text-xs"
              />
              <Input
                value={customRpe}
                onChangeText={setCustomRpe}
                placeholder="RPE"
                keyboardType="number-pad"
                maxLength={2}
                className="h-10 w-[56px] text-xs"
              />
            </View>
            <View className="mt-2 flex-row gap-2">
              <Input
                value={customNote}
                onChangeText={setCustomNote}
                placeholder={t('session.optionalNote')}
                className="h-10 flex-1 text-xs"
                maxLength={200}
              />
              <Button onPress={handleForm} disabled={!customReps} size="sm" className="h-10 bg-lime px-5 active:bg-lime/90">
                <Text className="font-mono-bold text-[11px] text-lime-foreground">{t('common.save').toUpperCase()}</Text>
              </Button>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  )
})

// ─── Section transition ───────────────────────────────────────────────────────

function SectionTransitionScreen({ type, onContinue, onSkip }: {
  type: 'warmup-to-main' | 'main-to-cooldown'
  onContinue: () => void
  onSkip?: () => void
}) {
  const { t } = useTranslation()
  const doneMsg = type === 'warmup-to-main'
    ? t('warmupCooldown.transitions.warmupComplete')
    : t('warmupCooldown.transitions.mainComplete')
  const nextSection = type === 'warmup-to-main'
    ? t('warmupCooldown.sections.main')
    : t('warmupCooldown.sections.cooldown')

  return (
    <View className="flex-1 items-center justify-center gap-6 px-8">
      <Text className="text-center text-lg text-muted-foreground">{doneMsg}</Text>
      <Text className="text-center font-bebas text-4xl leading-none tracking-[2px] text-foreground">{nextSection}</Text>
      <Button size="lg" className="min-w-[200px] bg-lime active:bg-lime/90" onPress={onContinue}>
        <Text className="font-bebas text-xl tracking-[2px] text-lime-foreground">{t('warmupCooldown.transitions.continue').toUpperCase()}</Text>
      </Button>
      {onSkip && (
        <Button variant="outline" onPress={onSkip}>
          <Text className="font-mono text-[11px] tracking-wide text-muted-foreground">{t('warmupCooldown.skip.cooldown')}</Text>
        </Button>
      )}
    </View>
  )
}

// ─── Note screen ──────────────────────────────────────────────────────────────

function NoteScreen({ workoutTitle, totalSetsLogged, durationMin, onSave }: {
  workoutTitle: string
  totalSetsLogged: number
  durationMin: number
  onSave: (note: string) => void
}) {
  const [note, setNote] = useState('')
  const reduced = useReducedMotion()
  // Copy en español hardcodeado, igual que el NoteScreen de la web
  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow items-center gap-6 px-5 pb-10 pt-12"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <Animated.Text
        entering={reduced ? undefined : FadeInDown.duration(450)}
        className="text-center font-bebas text-5xl leading-none tracking-[2px] text-emerald-500"
      >
        ¡Último set listo!
      </Animated.Text>
      <Text className="font-mono text-[11px] tracking-[2px] text-muted-foreground">
        {workoutTitle.trim() ? `${workoutTitle.toUpperCase()} · ` : ''}{totalSetsLogged} SERIES · {durationMin} MIN
      </Text>

      <Animated.View entering={reduced ? undefined : FadeInDown.delay(140).duration(450)} className="w-full max-w-[420px] shrink-0 rounded-xl border border-border bg-card px-6 py-5">
        <Text className="mb-2.5 font-mono text-[10px] uppercase tracking-[2px] text-lime">Nota de sesión</Text>
        <Text className="mb-3 text-[13px] text-muted-foreground">¿Cómo fue? ¿Algo que destacar?</Text>
        <Input
          value={note}
          onChangeText={setNote}
          accessibilityLabel="Nota de sesión"
          placeholder="Ej: Dominadas mucho mejor hoy, llegué a 8 seguidas."
          multiline
          numberOfLines={3}
          className="min-h-[72px] text-[13px]"
          textAlignVertical="top"
        />
        <View className="mt-3 flex-row items-stretch gap-2.5">
          <Button className="h-12 flex-1 bg-lime active:bg-lime/90" onPress={() => { haptic.medium(); onSave(note.trim()) }}>
            <Text className="font-bebas text-lg tracking-wide text-lime-foreground">GUARDAR</Text>
          </Button>
          <Button variant="outline" className="h-12 px-5" onPress={() => onSave('')}>
            <Text className="font-mono text-[11px] tracking-wide text-muted-foreground">SALTAR</Text>
          </Button>
        </View>
      </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

// ─── Celebrate screen ─────────────────────────────────────────────────────────

// One row of the end-of-session breakdown. The fill grows 0 → its share of the
// longest exercise on mount for a bit of energy; with reduce-motion it just
// snaps to its final width.
function TimingBar({ name, pct, seconds, isMax, delay, animate }: {
  name: string
  pct: number
  seconds: number
  isMax: boolean
  delay: number
  animate: boolean
}) {
  const width = useSharedValue(animate ? 0 : pct)
  useEffect(() => {
    if (animate) width.value = withDelay(delay, withTiming(pct, { duration: 650, easing: Easing.out(Easing.cubic) }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }))
  return (
    <View className="flex-row items-center gap-2.5">
      <View className="relative flex-1 overflow-hidden rounded-md">
        <Animated.View
          className={cn('absolute inset-y-0 left-0 rounded-md', isMax ? 'bg-lime/20' : 'bg-muted')}
          style={fillStyle}
        />
        <Text className="px-2.5 py-1 font-sans text-[12px] text-foreground/80" numberOfLines={1}>{name}</Text>
      </View>
      <Text className={cn('shrink-0 font-mono text-[11px] tabular-nums', isMax ? 'text-lime' : 'text-muted-foreground')}>
        {formatTimingClock(seconds)}
      </Text>
    </View>
  )
}

function CelebrateScreen({ workoutTitle, totalSetsLogged, durationMin, exercises, workoutKey, timings, onDone }: {
  workoutTitle: string
  totalSetsLogged: number
  durationMin: number
  exercises: Exercise[]
  workoutKey: string
  timings: ExerciseTiming[]
  onDone: () => void
}) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const { width: screenW, height: screenH } = useWindowDimensions()
  const quote = useRef<Quote>(getLocalQuote()).current
  const user = useAuthUser()
  const timingBreakdown = useMemo(() => prepareTimingBreakdown(timings, 6), [timings])
  const tagline = useRef<string>(getCelebrationTagline({
    durationMin,
    totalSets: totalSetsLogged,
    exerciseCount: exercises.length,
    hour: new Date().getHours(),
  })).current
  const captureRef = useRef<ShareCardCaptureHandle>(null)
  const today = useRef<string>(new Date().toISOString().slice(0, 10)).current
  const [sharing, setSharing] = useState(false)

  const userName = (user?.display_name as string) || (user?.name as string) || 'Atleta'
  const avatarUrl = user ? getUserAvatarUrl(user, '200x200') : null
  const referralCode = (user?.referral_code as string) || null

  useEffect(() => {
    sounds.playSessionComplete()
    haptic.success()
  }, [])

  const handleShare = useCallback(async () => {
    if (sharing) return
    setSharing(true)
    try {
      // Fonts are loaded by _layout boot; small RAF guards against a blank capture.
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      const uri = await captureRef.current?.capture()
      if (uri) {
        const { message } = shareWorkoutSession({
          userName,
          workoutTitle,
          totalSets: totalSetsLogged,
          durationMin,
          date: today,
          workoutKey,
          referralCode,
        })
        await shareImage(uri, { message, title: 'Compartir sesión' })
      }
    } catch {
      // User cancelled the share sheet or capture failed — no-op.
    } finally {
      setSharing(false)
    }
  }, [sharing, userName, workoutTitle, totalSetsLogged, durationMin, today, workoutKey, referralCode])

  return (
    <View className="flex-1">
      <Confetti />
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow px-6 py-10"
        showsVerticalScrollIndicator={false}
      >
    <Pressable onPress={onDone} className="grow items-center justify-center gap-7">
      <Animated.View
        entering={reduced ? undefined : ZoomIn.duration(450).springify().damping(11)}
        className="size-[88px] items-center justify-center rounded-full border border-border bg-muted"
      >
        <Text className="text-[40px] text-lime">✓</Text>
      </Animated.View>

      <Animated.View entering={reduced ? undefined : FadeInDown.delay(120).duration(450)} className="items-center">
        <Text className="text-center font-bebas text-5xl leading-none tracking-[3px] text-foreground">
          {t('notify.sessionComplete')}
        </Text>
        <Text className="mt-2.5 font-mono text-[11px] tracking-[2px] text-muted-foreground">
          {workoutTitle.toUpperCase()} · {totalSetsLogged} SERIES · {durationMin} MIN
        </Text>
        <Text className="mt-2 text-center font-sans-medium text-[13px] text-lime">{tagline}</Text>
      </Animated.View>

      {timingBreakdown.rows.length > 0 && (
        <Animated.View entering={reduced ? undefined : FadeInDown.delay(240).duration(450)} className="w-full max-w-[360px] gap-1.5">
          <Text className="mb-1 font-mono text-[9px] uppercase tracking-[3px] text-muted-foreground">Tiempo por ejercicio</Text>
          {timingBreakdown.rows.map((row, i) => (
            <TimingBar
              key={row.exerciseId}
              name={row.exerciseName}
              pct={Math.max(row.pct, 8)}
              seconds={row.seconds}
              isMax={row.isMax}
              delay={350 + i * 80}
              animate={!reduced}
            />
          ))}
          {timingBreakdown.overflowCount > 0 && (
            <Text className="font-mono text-[10px] text-muted-foreground/50">+{timingBreakdown.overflowCount} más</Text>
          )}
        </Animated.View>
      )}

      {quote && (
        <Animated.View entering={reduced ? undefined : FadeInDown.delay(420).duration(450)} className="max-w-[380px] items-center">
          <Text className="mb-2.5 text-center font-sans-italic text-base leading-6 text-foreground/70">"{quote.q}"</Text>
          <Text className="font-mono text-[11px] tracking-wide text-muted-foreground">— {quote.a}</Text>
        </Animated.View>
      )}

      <Animated.View entering={reduced ? undefined : FadeInDown.delay(540).duration(450)} className="w-full max-w-[280px] gap-2.5">
        <Button size="lg" className="w-full bg-lime active:bg-lime/90" onPress={() => { haptic.medium(); onDone() }}>
          <Text className="font-bebas text-xl tracking-[2px] text-lime-foreground">{t('nav.dashboard').toUpperCase()}</Text>
        </Button>
        <Button variant="outline" size="lg" className="w-full" disabled={sharing} onPress={handleShare}>
          <Text className="font-bebas text-lg tracking-[2px] text-foreground">{sharing ? 'GENERANDO…' : 'COMPARTIR'}</Text>
        </Button>
      </Animated.View>

      <Animated.Text
        entering={reduced ? undefined : FadeIn.delay(800).duration(400)}
        className="font-mono text-[11px] tracking-wide text-muted-foreground/50"
      >
        o toca en cualquier lugar
      </Animated.Text>

      {/* Off-screen share card (captured to PNG on demand). Sized to the device
          screen for a full-bleed story image. */}
      <ShareCardCapture ref={captureRef} width={screenW} height={screenH}>
        <WorkoutShareCard
          workoutTitle={workoutTitle}
          totalSets={totalSetsLogged}
          durationMin={durationMin}
          date={today}
          exercises={exercises}
          timings={timings}
          quote={quote ? { q: quote.q, a: quote.a } : null}
          userName={userName}
          avatarUrl={avatarUrl}
          referralCode={referralCode}
          width={screenW}
          height={screenH}
        />
      </ShareCardCapture>
    </Pressable>
      </ScrollView>
    </View>
  )
}

// ─── Main SessionView ─────────────────────────────────────────────────────────

type SessionPhase = 'exercise' | 'rest' | 'note' | 'celebrate' | 'section-transition'

interface SessionProgress {
  stepIdx: number
  phase: SessionPhase
  setsCount: number
  timing?: ExerciseTimingState
}

interface SessionViewProps {
  workout: Workout
  workoutKey: string
  onLogSet: (exerciseId: string, workoutKey: string, data: { reps: string; note: string; weight?: number; rpe?: number }) => Promise<PREvent | null>
  onMarkDone: (workoutKey: string, note: string, timing?: { durationSeconds?: number; exerciseTimings?: ExerciseTiming[] }) => void
  onGoToDashboard: () => void
  onExitSession: () => void
  onBack: () => void
  getExerciseLogs: (exerciseId: string) => ExerciseLog[]
  getRestForExercise?: (exerciseId: string, defaultRest: number) => number
  setRestForExercise?: (exerciseId: string, seconds: number) => Promise<void>
  initialProgress?: SessionProgress
  onProgressChange?: (update: Partial<SessionProgress>) => void
  startedAt?: number
  onSkipWarmup?: () => void
  onSkipCooldown?: () => void
  onSectionStartTimeChange?: (time: number | null) => void
}

export default function SessionView({
  workout,
  workoutKey,
  onLogSet,
  onMarkDone,
  onGoToDashboard,
  onExitSession,
  onBack,
  getExerciseLogs,
  getRestForExercise,
  setRestForExercise,
  initialProgress,
  onProgressChange,
  startedAt,
  onSkipWarmup,
  onSkipCooldown,
  onSectionStartTimeChange,
}: SessionViewProps) {
  const { t } = useTranslation()
  const steps = useRef<Step[]>(buildSteps(workout.exercises)).current

  const [stepIdx, setStepIdx] = useState<number>(initialProgress?.stepIdx ?? 0)
  const [phase, setPhase] = useState<SessionPhase>(initialProgress?.phase ?? 'exercise')
  const [setsCount, setSetsCount] = useState<number>(initialProgress?.setsCount ?? 0)
  const [transitionType, setTransitionType] = useState<'warmup-to-main' | 'main-to-cooldown'>('warmup-to-main')
  const pendingStepIdx = useRef<number | null>(null)
  const [prCelebration, setPrCelebration] = useState<{ event: PREvent; exerciseName: string } | null>(null)
  const sessionUser = useAuthUser()
  const sessionStartTime = useRef<number>(startedAt || Date.now())

  // ── Timing tracker (ref-based, no per-second renders) ────────────────────
  const timingTracker = useRef(new ExerciseTimingTracker(initialProgress?.timing ?? null))
  const [finalTimings, setFinalTimings] = useState<ExerciseTiming[] | null>(null)
  // Ref mirror para que el guard one-shot y handleNoteSaved nunca lean estado obsoleto.
  const finalTimingsRef = useRef<ExerciseTiming[] | null>(null)

  // Registrar qué ejercicio está activo (wall-clock, sin re-renders extra).
  // Debe ir ANTES del efecto de persistencia para que el snapshot empujado al
  // context incluya el intervalo recién abierto (si no, resume tras crash lo pierde).
  // Guard en === 'exercise' (no solo !== note/celebrate) evita que navegar
  // prev/next en descanso reasigne el tiempo de descanso al ejercicio equivocado.
  useEffect(() => {
    if (phase !== 'exercise') return
    const ex = steps[stepIdx]?.exercise
    if (ex) timingTracker.current.enterExercise({ id: ex.id, name: ex.name })
  }, [stepIdx, phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Empujar progreso al context (sobrevive navegar fuera y volver), incluyendo estado del tracker
  useEffect(() => {
    onProgressChange?.({ stepIdx, phase, setsCount, timing: timingTracker.current.getState() })
  }, [stepIdx, phase, setsCount]) // eslint-disable-line react-hooks/exhaustive-deps

  // Permiso de notificaciones al arrancar la sesión
  useEffect(() => { requestNotifPermission() }, [])

  // Finalizar timings exactamente una vez al llegar a la pantalla de nota
  useEffect(() => {
    if (phase === 'note' && finalTimingsRef.current === null) {
      const result = timingTracker.current.finalize()
      finalTimingsRef.current = result
      setFinalTimings(result)
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentStep = steps[stepIdx]
  const nextStep = steps[stepIdx + 1] || null
  const isLastStep = stepIdx === steps.length - 1

  // Límites de ejercicio para navegación prev/next
  const exerciseBoundaries = useRef<number[]>(
    steps.reduce<number[]>((acc, s, i) => {
      if (i === 0 || s.exercise.id !== steps[i - 1].exercise.id) acc.push(i)
      return acc
    }, [])
  ).current

  const currentExerciseIndex = exerciseBoundaries.findIndex((bIdx, i) => {
    const nextBoundary = exerciseBoundaries[i + 1] ?? steps.length
    return stepIdx >= bIdx && stepIdx < nextBoundary
  })
  const hasPrevExercise = currentExerciseIndex > 0
  const hasNextExercise = currentExerciseIndex < exerciseBoundaries.length - 1

  const goToPrevExercise = useCallback(() => {
    if (currentExerciseIndex <= 0) return
    setStepIdx(exerciseBoundaries[currentExerciseIndex - 1])
    setPhase('exercise')
  }, [currentExerciseIndex, exerciseBoundaries])

  const goToNextExercise = useCallback(() => {
    if (currentExerciseIndex >= exerciseBoundaries.length - 1) return
    setStepIdx(exerciseBoundaries[currentExerciseIndex + 1])
    setPhase('exercise')
  }, [currentExerciseIndex, exerciseBoundaries])

  // ── Swipe-to-navigate ────────────────────────────────────────────────────────
  const translateX = useSharedValue(0)
  const canSwipeLeft = useSharedValue(hasNextExercise)
  const canSwipeRight = useSharedValue(hasPrevExercise)
  const swipeDirectionRef = useRef<'next' | 'prev' | null>(null)
  const prevSwipeStepRef = useRef(stepIdx)

  useEffect(() => {
    canSwipeLeft.value = hasNextExercise
    canSwipeRight.value = hasPrevExercise
  }, [hasNextExercise, hasPrevExercise, canSwipeLeft, canSwipeRight])

  useEffect(() => {
    if (stepIdx === prevSwipeStepRef.current) return
    prevSwipeStepRef.current = stepIdx
    const dir = swipeDirectionRef.current
    swipeDirectionRef.current = null
    if (!dir) return
    // translateX was already snapped to the entry side in the worklet callback
    translateX.value = withSpring(0, { damping: 20, stiffness: 220 })
  }, [stepIdx, translateX])

  const handleSwipeToNext = useCallback(() => {
    swipeDirectionRef.current = 'next'
    goToNextExercise()
  }, [goToNextExercise])

  const handleSwipeToPrev = useCallback(() => {
    swipeDirectionRef.current = 'prev'
    goToPrevExercise()
  }, [goToPrevExercise])

  const swipeGesture = useMemo(() =>
    Gesture.Pan()
      .activeOffsetX([-25, 25])
      .failOffsetY([-15, 15])
      .onUpdate((e) => {
        if (e.translationX < 0 && !canSwipeLeft.value) return
        if (e.translationX > 0 && !canSwipeRight.value) return
        translateX.value = e.translationX * 0.25
      })
      .onEnd((e) => {
        const THRESHOLD = 65
        if (e.translationX < -THRESHOLD && canSwipeLeft.value) {
          runOnJS(haptic.selection)()
          translateX.value = withTiming(-SCREEN_WIDTH, { duration: 180 }, () => {
            translateX.value = SCREEN_WIDTH
            runOnJS(handleSwipeToNext)()
          })
        } else if (e.translationX > THRESHOLD && canSwipeRight.value) {
          runOnJS(haptic.selection)()
          translateX.value = withTiming(SCREEN_WIDTH, { duration: 180 }, () => {
            translateX.value = -SCREEN_WIDTH
            runOnJS(handleSwipeToPrev)()
          })
        } else {
          translateX.value = withSpring(0, { damping: 15, stiffness: 200 })
        }
      }),
    [canSwipeLeft, canSwipeRight, handleSwipeToNext, handleSwipeToPrev, translateX]
  )

  const exerciseAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))
  // ────────────────────────────────────────────────────────────────────────────

  const handleLogged = useCallback(async ({ reps, note, weight, rpe }: { reps: string; note: string; weight?: number; rpe?: number }) => {
    const prEvent = await onLogSet(currentStep.exercise.id, workoutKey, { reps, note, weight, rpe })
    if (prEvent) {
      setPrCelebration({ event: prEvent, exerciseName: currentStep.exercise.name })
    }
    setSetsCount(c => c + 1)

    if (isLastStep) {
      setPhase('note')
      return
    }

    // Transición de sección (warmup→main o main→cooldown)
    const currentSection = currentStep.section
    const nextSection = nextStep?.section || 'main'
    if (currentSection !== nextSection) {
      setTransitionType(currentSection === 'warmup' ? 'warmup-to-main' : 'main-to-cooldown')
      pendingStepIdx.current = stepIdx + 1
      setPhase('section-transition')
      return
    }

    // Superset: sin descanso entre ejercicios del mismo grupo
    const currentGroup = currentStep.exercise.supersetGroup
    const nextExGroup = nextStep?.exercise.supersetGroup
    if (currentGroup && nextExGroup && currentGroup === nextExGroup) {
      setStepIdx(i => i + 1)
      setPhase('exercise')
    } else {
      setPhase('rest')
    }
  }, [currentStep, isLastStep, nextStep, onLogSet, workoutKey, stepIdx])

  const handleRestDone = useCallback(() => {
    setStepIdx(i => i + 1)
    setPhase('exercise')
  }, [])

  const handleSectionContinue = useCallback(() => {
    if (pendingStepIdx.current !== null) {
      setStepIdx(pendingStepIdx.current)
      pendingStepIdx.current = null
    }
    onSectionStartTimeChange?.(Date.now())
    setPhase('exercise')
  }, [onSectionStartTimeChange])

  const handleSkipWarmup = useCallback(() => {
    const firstMainIdx = steps.findIndex(s => (s.section || 'main') !== 'warmup')
    if (firstMainIdx >= 0) {
      setStepIdx(firstMainIdx)
      setPhase('exercise')
    }
    onSkipWarmup?.()
  }, [onSkipWarmup, steps])

  const handleSkipCooldown = useCallback(() => {
    setPhase('note')
    onSkipCooldown?.()
  }, [onSkipCooldown])

  const stepSection = currentStep?.section || 'main'
  const isInWarmup = stepSection === 'warmup' && phase === 'exercise'
  const isInCooldown = stepSection === 'cooldown' && (phase === 'exercise' || phase === 'rest')

  const handleNoteSaved = useCallback((note: string) => {
    const durationSeconds = Math.round((Date.now() - sessionStartTime.current) / 1000)
    // Finalize defensivo si la pantalla de nota se alcanzó antes de que el
    // efecto de finalize commitease; el tracker es idempotente.
    const timings = finalTimingsRef.current ?? timingTracker.current.finalize()
    onMarkDone(workoutKey, note, { durationSeconds, exerciseTimings: timings })
    setPhase('celebrate')
  }, [onMarkDone, workoutKey])

  const confirmDiscard = useCallback(() => {
    Alert.alert(
      t('session.discardTitle'),
      setsCount > 0 ? t('session.discardWithSets', { count: setsCount }) : t('session.discardEmpty'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('session.discardButton'), style: 'destructive', onPress: onExitSession },
      ],
    )
  }, [t, setsCount, onExitSession])

  const durationMin = Math.round((Date.now() - sessionStartTime.current) / 60000)

  // Botón de la notificación: misma semántica que el botón rápido de la UI
  const handleLiveAdvance = useCallback(() => {
    if (phase === 'exercise' && currentStep) {
      void handleLogged({ reps: quickReps(currentStep.exercise.reps), note: '' })
    } else if (phase === 'rest') {
      handleRestDone()
    } else if (phase === 'section-transition') {
      handleSectionContinue()
    }
  }, [phase, currentStep, handleLogged, handleRestDone, handleSectionContinue])

  // Live Activity / notificación persistente — observa, no muta
  useLiveSession({
    workoutTitle: workout.title,
    phase,
    exerciseName: phase === 'section-transition'
      ? (transitionType === 'warmup-to-main' ? t('warmupCooldown.sections.main') : t('warmupCooldown.sections.cooldown'))
      : currentStep?.exercise.name ?? '',
    setNumber: currentStep?.setNumber ?? 0,
    totalSets: currentStep?.totalSets ?? 0,
    onAdvance: handleLiveAdvance,
  })

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* ── Top bar ── */}
      {phase !== 'celebrate' && (
        <View>
          <View className="h-[52px] flex-row items-center justify-between px-2">
            <Pressable onPress={onBack} hitSlop={8} className="min-h-[44px] min-w-[44px] items-center justify-center" accessibilityLabel={t('common.back')}>
              <ChevronLeft size={22} color={MUTED} />
            </Pressable>

            <View className="flex-1 items-center px-2">
              <Text className="font-mono text-[10px] tracking-[2px] text-muted-foreground" numberOfLines={1}>
                {phase === 'exercise' && currentStep ? currentStep.exercise.name.toUpperCase()
                  : phase === 'rest' ? t('session.resting').toUpperCase()
                  : phase === 'note' ? t('warmupCooldown.history.completed').toUpperCase()
                  : ''}
              </Text>
              <Text className="font-mono text-[9px] tabular-nums text-muted-foreground/60">
                {phase === 'note' ? exerciseBoundaries.length : currentExerciseIndex + 1}/{exerciseBoundaries.length} · {phase === 'note' ? steps.length : stepIdx + 1}/{steps.length}
              </Text>
            </View>

            <Pressable onPress={confirmDiscard} hitSlop={8} className="min-h-[44px] min-w-[44px] items-center justify-center" accessibilityLabel={t('session.discardTitle')}>
              <X size={20} color={MUTED} />
            </Pressable>
          </View>

          {/* Barra de progreso */}
          <View className="h-[3px] bg-muted">
            <View
              className="h-full rounded-r-full bg-lime"
              style={{ width: `${((phase === 'note' ? steps.length : stepIdx + 1) / steps.length) * 100}%` }}
            />
          </View>

          {/* Saltar sección */}
          {isInWarmup && (
            <Pressable onPress={handleSkipWarmup} className="items-center border-b border-border py-1.5">
              <Text className="font-mono text-[10px] tracking-wide text-muted-foreground">{t('warmupCooldown.skip.warmup')}</Text>
            </Pressable>
          )}
          {isInCooldown && (
            <Pressable onPress={handleSkipCooldown} className="items-center border-b border-border py-1.5">
              <Text className="font-mono text-[10px] tracking-wide text-muted-foreground">{t('warmupCooldown.skip.remaining')}</Text>
            </Pressable>
          )}
        </View>
      )}

      {(phase === 'exercise' || phase === 'rest') && (
        <GestureDetector gesture={swipeGesture}>
          <Animated.View className="flex-1" style={exerciseAnimStyle}>
            {phase === 'exercise' && currentStep ? (
              <ExerciseScreen
                key={stepIdx}
                step={currentStep}
                onLogged={handleLogged}
                logs={getExerciseLogs(currentStep.exercise.id)}
              />
            ) : (
              <RestScreen
                key={`rest-${stepIdx}`}
                seconds={currentStep?.exercise.rest || 90}
                exerciseId={currentStep?.exercise.id}
                nextStep={nextStep}
                onSkip={handleRestDone}
                savedRest={currentStep && getRestForExercise ? getRestForExercise(currentStep.exercise.id, currentStep.exercise.rest || 90) : undefined}
                onAdjust={setRestForExercise ? (id, secs) => { setRestForExercise(id, secs) } : undefined}
              />
            )}

            {/* Swipe hint dots — visible when adjacent exercises exist */}
            {(hasPrevExercise || hasNextExercise) && (
              <View className="absolute bottom-4 inset-x-0 flex-row items-center justify-center gap-1.5" pointerEvents="none">
                {hasPrevExercise && <View className="size-1 rounded-full bg-muted-foreground/30" />}
                <View className="h-1 w-3 rounded-full bg-lime/50" />
                {hasNextExercise && <View className="size-1 rounded-full bg-muted-foreground/30" />}
              </View>
            )}

            {/* Tap targets at edges for accessibility */}
            {(hasPrevExercise || hasNextExercise) && (
              <View className="absolute inset-x-1 top-1/2 -mt-5 flex-row justify-between" pointerEvents="box-none">
                {hasPrevExercise ? (
                  <Pressable onPress={goToPrevExercise} className="size-10 items-center justify-center rounded-full bg-muted/50 active:opacity-70" accessibilityLabel="Anterior">
                    <ChevronLeft size={16} color={MUTED} />
                  </Pressable>
                ) : <View />}
                {hasNextExercise ? (
                  <Pressable onPress={goToNextExercise} className="size-10 items-center justify-center rounded-full bg-muted/50 active:opacity-70" accessibilityLabel="Siguiente">
                    <ChevronRight size={16} color={MUTED} />
                  </Pressable>
                ) : <View />}
              </View>
            )}
          </Animated.View>
        </GestureDetector>
      )}

      {phase === 'section-transition' && (
        <SectionTransitionScreen
          type={transitionType}
          onContinue={handleSectionContinue}
          onSkip={transitionType === 'main-to-cooldown' ? handleSkipCooldown : undefined}
        />
      )}

      {phase === 'note' && (
        <NoteScreen
          workoutTitle={workout.title}
          totalSetsLogged={setsCount}
          durationMin={durationMin}
          onSave={handleNoteSaved}
        />
      )}

      {phase === 'celebrate' && (
        <CelebrateScreen
          workoutTitle={workout.title}
          totalSetsLogged={setsCount}
          durationMin={durationMin}
          exercises={workout.exercises}
          workoutKey={workoutKey}
          timings={finalTimings ?? []}
          onDone={onGoToDashboard}
        />
      )}

      {prCelebration && (
        <PRCelebration
          prEvent={prCelebration.event}
          exerciseName={prCelebration.exerciseName}
          userName={(sessionUser?.display_name as string) || (sessionUser?.name as string) || 'Atleta'}
          avatarUrl={sessionUser ? getUserAvatarUrl(sessionUser, '200x200') : null}
          referralCode={(sessionUser?.referral_code as string) || null}
          onDismiss={() => setPrCelebration(null)}
        />
      )}
    </SafeAreaView>
  )
}
