// Port del SessionView de apps/web a RN. Misma arquitectura: este componente
// es dueño del estado local (stepIdx/phase/setsCount) y lo empuja al
// ActiveSessionContext via onProgressChange — nunca lo lee de vuelta.
import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { View, ScrollView, Pressable, Alert, AppState, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import Svg, { Circle } from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import { ChevronLeft, ChevronRight, X, Play, Pause, RotateCcw } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { requestNotifPermission, scheduleRestEnd, cancelScheduled } from '@/lib/notifications'
import type { PREvent } from '@calistenia/core/hooks/useProgress'
import type { Exercise, Workout, ExerciseLog, SetData } from '@calistenia/core/types'
import { getLocalQuote, type Quote } from '@calistenia/core/lib/quotes'

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

const haptic = {
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
}

const LIME = 'hsl(74 90% 45%)'
const MUTED = 'hsl(0 0% 55%)'

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

  // Notificación local programada para el fin del descanso (se ve si la app
  // está en background; en foreground el handler la silencia).
  useEffect(() => {
    const ns = nextStepRef.current
    scheduleRestEnd(
      Math.ceil((endAtRef.current - Date.now()) / 1000),
      t('notify.letsGo'),
      ns ? `${ns.exercise.name} — ${t('notify.setOf', { set: ns.setNumber, total: ns.totalSets })}` : t('notify.prepareForNext'),
    ).then(id => { notifIdRef.current = id })
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
          haptic.warning()
        }
        if (rem > 0 && rem <= 3 && prev === rem + 1) haptic.light()
        lastRemainingRef.current = rem
        setRemaining(rem)
      }
      if (rem <= 0 && !hasFinished.current) {
        hasFinished.current = true
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
    scheduleRestEnd(
      rem,
      t('notify.letsGo'),
      ns ? `${ns.exercise.name} — ${t('notify.setOf', { set: ns.setNumber, total: ns.totalSets })}` : t('notify.prepareForNext'),
    ).then(id => { notifIdRef.current = id })
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
      <Text className="text-[11px] uppercase tracking-[4px] text-muted-foreground">{t('session.resting')}</Text>

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
          <Text className={cn('text-[42px] font-bold tabular-nums', isUrgent ? 'text-destructive' : 'text-foreground')}>
            {mins}:{secs}
          </Text>
        </View>
      </View>

      {nextStep && (
        <View className="w-full max-w-[340px] rounded-xl border border-border bg-card px-4 py-3.5">
          <Text className="mb-2 text-[9px] uppercase tracking-[3px] text-muted-foreground">{t('notify.prepareForNext')}</Text>
          <Text className="mb-1 text-[15px] font-semibold text-foreground">{nextStep.exercise.name}</Text>
          <Text className="text-xs text-lime">
            {nextStep.exercise.reps}
            <Text className="text-[11px] text-muted-foreground">  · {t('session.set')} {nextStep.setNumber}/{nextStep.totalSets}</Text>
          </Text>
          <Text className="mt-1 text-xs text-muted-foreground">{nextStep.exercise.muscles}</Text>
        </View>
      )}

      <View className="flex-row gap-2">
        <Button variant="outline" size="sm" onPress={() => adjustTime(-15)}><Text className="text-xs">-15s</Text></Button>
        <Button variant="outline" size="sm" onPress={() => adjustTime(15)}><Text className="text-xs">+15s</Text></Button>
        <Button variant="outline" size="sm" onPress={() => adjustTime(30)}><Text className="text-xs">+30s</Text></Button>
      </View>

      <Button variant="outline" className="border-lime/25 bg-lime/10 px-8" onPress={handleSkip}>
        <Text className="text-xs tracking-[2px] text-lime">{t('session.skipRest')}</Text>
      </Button>
    </View>
  )
}

// ─── Timer simple para ejercicios isTimer ─────────────────────────────────────

function ExerciseTimer({ initialSeconds = 30 }: { initialSeconds?: number }) {
  const [remaining, setRemaining] = useState(initialSeconds)
  const [running, setRunning] = useState(false)
  const endAtRef = useRef<number>(0)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const rem = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000))
      setRemaining(rem)
      if (rem <= 0) {
        setRunning(false)
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
      <Text className={cn('text-4xl font-bold tabular-nums', remaining === 0 ? 'text-lime' : 'text-foreground')}>
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

  // "8-12" → "8"; "12/lado", "máx" se quedan tal cual
  const defaultReps = /^\d+-\d+$/.test(exercise.reps)
    ? exercise.reps.split('-')[0]
    : exercise.reps

  const doLog = (reps: string | number, note: string = '', weight?: number, rpe?: number): void => {
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
        <Text className="text-4xl font-bold uppercase leading-tight text-foreground">{exercise.name}</Text>
        <View className="mt-1.5 flex-row flex-wrap items-center gap-x-3 gap-y-1">
          <Text className="text-[13px] font-semibold text-lime">{exercise.reps}</Text>
          <Text className="text-[11px] text-muted-foreground">· {t('common.rest')} {exercise.rest}s</Text>
          <Text className="text-[10px] text-muted-foreground">{exercise.muscles}</Text>
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
        <Text className="ml-1 text-[10px] text-muted-foreground">{t('session.set').toUpperCase()} {setNumber}/{totalSets}</Text>
      </View>

      {/* Sobrecarga progresiva */}
      {lastLog && lastBestReps > 0 && setNumber === 1 && (
        <View className="mb-4 rounded-md border-l-[3px] border-amber-400/40 bg-amber-400/10 px-3.5 py-2.5">
          <Text className="text-xs text-amber-500">
            {lastBestReps} reps{lastBestWeight > 0 ? ` +${lastBestWeight}kg` : ''} → {lastBestWeight > 0 ? `+${(lastBestWeight + 2.5).toFixed(1)}kg / +1 rep` : `${lastBestReps + 1} reps`}
          </Text>
        </View>
      )}

      {/* Nota del ejercicio */}
      {exercise.note ? (
        <View className="mb-5 rounded-md border-l-[3px] border-lime/30 bg-muted/40 px-3.5 py-2.5">
          <Text className="text-[13px] italic leading-5 text-muted-foreground">{exercise.note}</Text>
        </View>
      ) : null}

      {/* Historial reciente */}
      {recentLogs.length > 0 && (
        <View className="mb-5">
          {recentLogs.map((log, i) => (
            <Text key={i} className="mb-0.5 text-xs text-muted-foreground/60" numberOfLines={1}>
              {log.date}  {log.sets?.map((s: SetData, j: number) =>
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
          <Text className="text-sm font-bold tracking-[1.5px] text-lime">+ {t('session.set').toUpperCase()} — {defaultReps}</Text>
        </Pressable>

        <View className="flex-row gap-2">
          <Pressable
            onPress={() => setEditOpen(v => !v)}
            className={cn(
              'min-h-[44px] flex-1 items-center justify-center rounded-md border',
              editOpen ? 'border-lime/40 bg-lime/10' : 'border-border',
            )}
          >
            <Text className={cn('text-[10px] tracking-wide', editOpen ? 'text-lime' : 'text-muted-foreground')}>
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
                <Text className="text-[11px] font-bold text-lime-foreground">{t('common.save').toUpperCase()}</Text>
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
      <Text className="text-center text-3xl font-bold uppercase text-foreground">{nextSection}</Text>
      <Button size="lg" className="min-w-[200px] bg-lime active:bg-lime/90" onPress={onContinue}>
        <Text className="font-bold text-lime-foreground">{t('warmupCooldown.transitions.continue').toUpperCase()}</Text>
      </Button>
      {onSkip && (
        <Button variant="outline" onPress={onSkip}>
          <Text className="text-xs text-muted-foreground">{t('warmupCooldown.skip.cooldown')}</Text>
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
  const { t } = useTranslation()
  const [note, setNote] = useState('')
  return (
    <View className="flex-1 items-center justify-center gap-6 px-5">
      <Text className="text-center text-4xl font-bold text-emerald-500">¡Último set listo!</Text>
      <Text className="text-[11px] tracking-[2px] text-muted-foreground">
        {workoutTitle.toUpperCase()} · {totalSetsLogged} SERIES · {durationMin} MIN
      </Text>

      <View className="w-full max-w-[420px] rounded-xl border border-border bg-card px-5 py-5">
        <Text className="mb-2.5 text-[10px] uppercase tracking-[2px] text-lime">{t('session.note')}</Text>
        <Input
          value={note}
          onChangeText={setNote}
          placeholder={t('session.optionalNote')}
          multiline
          numberOfLines={3}
          className="min-h-[72px] text-[13px]"
          textAlignVertical="top"
        />
        <View className="mt-3 flex-row gap-2.5">
          <Button className="bg-lime px-6 active:bg-lime/90" onPress={() => onSave(note.trim())}>
            <Text className="font-bold text-lime-foreground">{t('common.save').toUpperCase()}</Text>
          </Button>
          <Button variant="outline" onPress={() => onSave('')}>
            <Text className="text-[11px] text-muted-foreground">{t('warmupCooldown.skip.remaining').toUpperCase()}</Text>
          </Button>
        </View>
      </View>
    </View>
  )
}

// ─── Celebrate screen ─────────────────────────────────────────────────────────

function CelebrateScreen({ workoutTitle, totalSetsLogged, durationMin, onDone }: {
  workoutTitle: string
  totalSetsLogged: number
  durationMin: number
  onDone: () => void
}) {
  const { t } = useTranslation()
  const quote = useRef<Quote>(getLocalQuote()).current

  useEffect(() => { haptic.success() }, [])

  return (
    <Pressable onPress={onDone} className="flex-1 items-center justify-center gap-7 px-6">
      <View className="size-[88px] items-center justify-center rounded-full border border-border bg-muted">
        <Text className="text-[40px] text-lime">✓</Text>
      </View>

      <View className="items-center">
        <Text className="text-center text-4xl font-bold tracking-[2px] text-foreground">
          {t('notify.sessionComplete')}
        </Text>
        <Text className="mt-2 text-[11px] tracking-[2px] text-muted-foreground">
          {workoutTitle.toUpperCase()} · {totalSetsLogged} SERIES · {durationMin} MIN
        </Text>
      </View>

      {quote && (
        <View className="max-w-[380px] items-center">
          <Text className="mb-2.5 text-center text-base italic leading-6 text-foreground/70">"{quote.q}"</Text>
          <Text className="text-[11px] text-muted-foreground">— {quote.a}</Text>
        </View>
      )}

      <Button size="lg" className="min-w-[200px] bg-lime active:bg-lime/90" onPress={onDone}>
        <Text className="font-bold text-lime-foreground">{t('nav.dashboard').toUpperCase()}</Text>
      </Button>
    </Pressable>
  )
}

// ─── Main SessionView ─────────────────────────────────────────────────────────

type SessionPhase = 'exercise' | 'rest' | 'note' | 'celebrate' | 'section-transition'

interface SessionProgress {
  stepIdx: number
  phase: SessionPhase
  setsCount: number
}

interface SessionViewProps {
  workout: Workout
  workoutKey: string
  onLogSet: (exerciseId: string, workoutKey: string, data: { reps: string; note: string; weight?: number; rpe?: number }) => Promise<PREvent | null>
  onMarkDone: (workoutKey: string, note: string) => void
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
  const sessionStartTime = useRef<number>(startedAt || Date.now())

  // Empujar progreso al context (sobrevive navegar fuera y volver)
  useEffect(() => {
    onProgressChange?.({ stepIdx, phase, setsCount })
  }, [stepIdx, phase, setsCount]) // eslint-disable-line react-hooks/exhaustive-deps

  // Permiso de notificaciones al arrancar la sesión
  useEffect(() => { requestNotifPermission() }, [])

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

  const handleLogged = useCallback(async ({ reps, note, weight, rpe }: { reps: string; note: string; weight?: number; rpe?: number }) => {
    await onLogSet(currentStep.exercise.id, workoutKey, { reps, note, weight, rpe })
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
    onMarkDone(workoutKey, note)
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
              <Text className="text-[10px] tracking-[2px] text-muted-foreground" numberOfLines={1}>
                {phase === 'exercise' && currentStep ? currentStep.exercise.name.toUpperCase()
                  : phase === 'rest' ? t('session.resting').toUpperCase()
                  : phase === 'note' ? t('warmupCooldown.history.completed').toUpperCase()
                  : ''}
              </Text>
              <Text className="text-[9px] tabular-nums text-muted-foreground/60">
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
              <Text className="text-[10px] text-muted-foreground">{t('warmupCooldown.skip.warmup')}</Text>
            </Pressable>
          )}
          {isInCooldown && (
            <Pressable onPress={handleSkipCooldown} className="items-center border-b border-border py-1.5">
              <Text className="text-[10px] text-muted-foreground">{t('warmupCooldown.skip.remaining')}</Text>
            </Pressable>
          )}
        </View>
      )}

      {(phase === 'exercise' || phase === 'rest') && (
        <View className="flex-1">
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

          {/* Navegación prev/next ejercicio */}
          {(hasPrevExercise || hasNextExercise) && (
            <View className="absolute inset-x-1 top-1/2 -mt-5 flex-row justify-between" pointerEvents="box-none">
              {hasPrevExercise ? (
                <Pressable onPress={goToPrevExercise} className="size-10 items-center justify-center rounded-full bg-muted/70 active:opacity-70" accessibilityLabel="Anterior">
                  <ChevronLeft size={18} color={MUTED} />
                </Pressable>
              ) : <View />}
              {hasNextExercise ? (
                <Pressable onPress={goToNextExercise} className="size-10 items-center justify-center rounded-full bg-muted/70 active:opacity-70" accessibilityLabel="Siguiente">
                  <ChevronRight size={18} color={MUTED} />
                </Pressable>
              ) : <View />}
            </View>
          )}
        </View>
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
          onDone={onGoToDashboard}
        />
      )}
    </SafeAreaView>
  )
}
